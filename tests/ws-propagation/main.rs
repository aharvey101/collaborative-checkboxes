//! WebSocket propagation test for SpacetimeDB
//!
//! Opens two WebSocket connections to SpacetimeDB:
//!   - Sender: sends batch_update_checkboxes reducer calls
//!   - Receiver: subscribes to checkbox_chunk and measures how quickly updates arrive
//!
//! This tests the raw SpacetimeDB propagation speed without any browser/WASM overhead.

use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use spacetimedb_client_api_messages::websocket::{
    common::QuerySetId,
    v2::{
        CallReducer, CallReducerFlags, ClientMessage, ServerMessage, Subscribe,
        SubscribeApplied, TableUpdateRows,
    },
};
use spacetimedb_lib::bsatn;
use std::time::{Duration, Instant};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};

const SPACETIMEDB_URL: &str = "ws://127.0.0.1:3000/v1/database/checkboxes/subscribe";
const WS_PROTOCOL: &str = "v2.bsatn.spacetimedb";

// Compression tags
const COMPRESSION_NONE: u8 = 0;
const COMPRESSION_BROTLI: u8 = 1;
const COMPRESSION_GZIP: u8 = 2;

/// Encode batch_update_checkboxes reducer args (BSATN format)
fn encode_batch_update_args(updates: &[(i64, u32, u8, u8, u8, bool)]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(4 + updates.len() * 16);
    buf.extend_from_slice(&(updates.len() as u32).to_le_bytes());
    for (chunk_id, cell_offset, r, g, b, checked) in updates {
        buf.extend_from_slice(&chunk_id.to_le_bytes());
        buf.extend_from_slice(&cell_offset.to_le_bytes());
        buf.push(*r);
        buf.push(*g);
        buf.push(*b);
        buf.push(if *checked { 1 } else { 0 });
    }
    buf
}

/// Chunk coords to ID (same as frontend/backend)
fn chunk_coords_to_id(x: i32, y: i32) -> i64 {
    ((x as i64) << 32) | ((y as u32) as i64)
}

/// Decompress a server message
fn decompress_message(data: &[u8]) -> Vec<u8> {
    if data.is_empty() {
        return Vec::new();
    }
    let tag = data[0];
    let payload = &data[1..];
    match tag {
        COMPRESSION_NONE => payload.to_vec(),
        COMPRESSION_BROTLI => {
            let mut decompressed = Vec::new();
            let mut reader = brotli::Decompressor::new(payload, 4096);
            std::io::Read::read_to_end(&mut reader, &mut decompressed).expect("brotli decompress");
            decompressed
        }
        COMPRESSION_GZIP => {
            use flate2::read::GzDecoder;
            let mut decompressed = Vec::new();
            let mut reader = GzDecoder::new(payload);
            std::io::Read::read_to_end(&mut reader, &mut decompressed).expect("gzip decompress");
            decompressed
        }
        _ => {
            eprintln!("Unknown compression tag: {}", tag);
            payload.to_vec()
        }
    }
}

/// Parse a server message from raw bytes
fn parse_server_message(data: &[u8]) -> Option<ServerMessage> {
    let decompressed = decompress_message(data);
    bsatn::from_slice(&decompressed).ok()
}

#[tokio::main]
async fn main() {
    println!("=== SpacetimeDB WebSocket Propagation Test ===\n");

    // Use chunk (99, 99) as test chunk to avoid interfering with real data
    let test_chunk_id = chunk_coords_to_id(99, 99);
    println!("Using test chunk ID: {} (coords 99,99)", test_chunk_id);

    // --- Connect receiver ---
    println!("\nConnecting receiver...");
    let request = tokio_tungstenite::tungstenite::http::Request::builder()
        .uri(SPACETIMEDB_URL)
        .header("Sec-WebSocket-Protocol", WS_PROTOCOL)
        .header("Host", "127.0.0.1:3000")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", tokio_tungstenite::tungstenite::handshake::client::generate_key())
        .body(())
        .unwrap();

    let (mut rx_ws, _) = connect_async(request).await.expect("Receiver failed to connect");
    println!("Receiver connected");

    // Wait for InitialConnection
    while let Some(Ok(msg)) = rx_ws.next().await {
        if let Message::Binary(data) = msg {
            if let Some(ServerMessage::InitialConnection(init)) = parse_server_message(&data) {
                println!("Receiver identity: {:?}", init.identity);
                break;
            }
        }
    }

    // Subscribe receiver
    let subscribe = ClientMessage::Subscribe(Subscribe {
        request_id: 1,
        query_set_id: QuerySetId::new(1),
        query_strings: vec!["SELECT * FROM checkbox_chunk".into()].into_boxed_slice(),
    });
    let sub_bytes = bsatn::to_vec(&subscribe).unwrap();
    rx_ws.send(Message::Binary(sub_bytes.into())).await.unwrap();
    println!("Receiver subscribed");

    // Wait for SubscribeApplied
    while let Some(Ok(msg)) = rx_ws.next().await {
        if let Message::Binary(data) = msg {
            if let Some(ServerMessage::SubscribeApplied(_)) = parse_server_message(&data) {
                println!("Receiver subscription applied");
                break;
            }
        }
    }

    // --- Connect sender ---
    println!("\nConnecting sender...");
    let request2 = tokio_tungstenite::tungstenite::http::Request::builder()
        .uri(SPACETIMEDB_URL)
        .header("Sec-WebSocket-Protocol", WS_PROTOCOL)
        .header("Host", "127.0.0.1:3000")
        .header("Connection", "Upgrade")
        .header("Upgrade", "websocket")
        .header("Sec-WebSocket-Version", "13")
        .header("Sec-WebSocket-Key", tokio_tungstenite::tungstenite::handshake::client::generate_key())
        .body(())
        .unwrap();

    let (mut tx_ws, _) = connect_async(request2).await.expect("Sender failed to connect");
    println!("Sender connected");

    // Wait for sender InitialConnection
    while let Some(Ok(msg)) = tx_ws.next().await {
        if let Message::Binary(data) = msg {
            if let Some(ServerMessage::InitialConnection(init)) = parse_server_message(&data) {
                println!("Sender identity: {:?}", init.identity);
                break;
            }
        }
    }

    // --- Test: Send batch updates and measure propagation ---
    println!("\n--- Test 1: Single batch of 1000 updates ---");
    {
        let updates: Vec<(i64, u32, u8, u8, u8, bool)> = (0..1000)
            .map(|i| (test_chunk_id, i as u32, 0, 255, 0, true))
            .collect();

        let args = encode_batch_update_args(&updates);
        let call = ClientMessage::CallReducer(CallReducer {
            request_id: 10,
            flags: CallReducerFlags::Default,
            reducer: "batch_update_checkboxes".into(),
            args: Bytes::from(args),
        });

        let send_time = Instant::now();
        let call_bytes = bsatn::to_vec(&call).unwrap();
        tx_ws.send(Message::Binary(call_bytes.into())).await.unwrap();
        println!("Sent 1000 updates at t=0");

        // Wait for receiver to get the TransactionUpdate
        let timeout = tokio::time::sleep(Duration::from_secs(10));
        tokio::pin!(timeout);

        let mut received = false;
        loop {
            tokio::select! {
                msg = rx_ws.next() => {
                    if let Some(Ok(Message::Binary(data))) = msg {
                        if let Some(server_msg) = parse_server_message(&data) {
                            match server_msg {
                                ServerMessage::TransactionUpdate(tx) => {
                                    let elapsed = send_time.elapsed();
                                    let mut chunk_found = false;
                                    for qs in &tx.query_sets {
                                        for table in &qs.tables {
                                            if table.table_name.as_ref() == "checkbox_chunk" {
                                                chunk_found = true;
                                            }
                                        }
                                    }
                                    if chunk_found {
                                        println!("Receiver got chunk update in {:.1}ms", elapsed.as_secs_f64() * 1000.0);
                                        received = true;
                                        break;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                _ = &mut timeout => {
                    println!("TIMEOUT: No update received in 10s");
                    break;
                }
            }
        }

        if received {
            println!("PASS: Batch of 1000 propagated successfully");
        } else {
            println!("FAIL: Batch of 1000 did not propagate");
        }
    }

    // --- Test 2: Rapid-fire batches (simulating Doom frames) ---
    println!("\n--- Test 2: 10 rapid batches of 5000 updates (Doom-like) ---");
    {
        let mut received_count = 0;
        let start = Instant::now();

        for batch in 0..10 {
            let updates: Vec<(i64, u32, u8, u8, u8, bool)> = (0..5000)
                .map(|i| {
                    let offset = (batch * 5000 + i) % 1_000_000;
                    (test_chunk_id, offset as u32, 0, 255, 0, true)
                })
                .collect();

            let args = encode_batch_update_args(&updates);
            let call = ClientMessage::CallReducer(CallReducer {
                request_id: 100 + batch,
                flags: CallReducerFlags::Default,
                reducer: "batch_update_checkboxes".into(),
                args: Bytes::from(args),
            });

            let call_bytes = bsatn::to_vec(&call).unwrap();
            tx_ws.send(Message::Binary(call_bytes.into())).await.unwrap();
        }
        let send_elapsed = start.elapsed();
        println!("Sent all 10 batches in {:.1}ms", send_elapsed.as_secs_f64() * 1000.0);

        // Collect receiver updates for 15 seconds
        let timeout = tokio::time::sleep(Duration::from_secs(15));
        tokio::pin!(timeout);

        loop {
            tokio::select! {
                msg = rx_ws.next() => {
                    if let Some(Ok(Message::Binary(data))) = msg {
                        if let Some(server_msg) = parse_server_message(&data) {
                            if let ServerMessage::TransactionUpdate(tx) = server_msg {
                                for qs in &tx.query_sets {
                                    for table in &qs.tables {
                                        if table.table_name.as_ref() == "checkbox_chunk" {
                                            for rows in &table.rows {
                                                if let TableUpdateRows::PersistentTable(pt) = rows {
                                                    {
                                                        received_count += 1;
                                                        let elapsed = start.elapsed();
                                                        println!("  Receiver got update #{} at {:.1}ms",
                                                            received_count, elapsed.as_secs_f64() * 1000.0);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                _ = &mut timeout => {
                    break;
                }
            }

            if received_count >= 10 {
                break;
            }
        }

        let total_elapsed = start.elapsed();
        println!("\nReceived {}/10 updates in {:.1}ms", received_count, total_elapsed.as_secs_f64() * 1000.0);
        if received_count >= 10 {
            println!("PASS: All Doom-like batches propagated");
        } else {
            println!("FAIL: Only {}/10 batches propagated", received_count);
        }
    }

    // Cleanup
    let _ = tx_ws.close(None).await;
    let _ = rx_ws.close(None).await;

    println!("\n=== Test complete ===");
}
