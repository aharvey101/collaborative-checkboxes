//! Worker-side SpacetimeDB client
//!
//! Handles WebSocket connection, BSATN encoding, and reconnection logic

use super::protocol::WorkerToMain;
use bytes::Bytes;
use spacetimedb_client_api_messages::websocket::{
    common::QuerySetId,
    v2::{
        CallReducer, CallReducerFlags, ClientMessage, InitialConnection, QueryRows,
        ReducerOutcome, ReducerResult, ServerMessage, Subscribe, SubscribeApplied,
        SubscriptionError, TableUpdate, TableUpdateRows, TransactionUpdate,
        Unsubscribe, UnsubscribeFlags,
    },
};
use spacetimedb_lib::bsatn;
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{DedicatedWorkerGlobalScope, WebSocket};

// Reconnection constants
const BACKOFF_SCHEDULE: [u32; 5] = [5000, 10000, 20000, 40000, 60000];
const MAX_RETRIES: u32 = 5;

// Compression tags for server messages
const COMPRESSION_NONE: u8 = 0;
const COMPRESSION_BROTLI: u8 = 1;
const COMPRESSION_GZIP: u8 = 2;

// WebSocket protocol identifier
const WS_PROTOCOL: &str = "v2.bsatn.spacetimedb";

/// SpacetimeDB client state
pub struct WorkerClient {
    ws: Option<WebSocket>,
    uri: String,
    database: String,
    reconnect_attempt: u32,
    intentional_disconnect: bool,
    request_id: u32,
    chunk_subscription_id: Option<QuerySetId>,
    // Store closures to prevent memory leaks
    onopen_cb: Option<Closure<dyn FnMut(web_sys::Event)>>,
    onmessage_cb: Option<Closure<dyn FnMut(web_sys::MessageEvent)>>,
    onerror_cb: Option<Closure<dyn FnMut(web_sys::Event)>>,
    onclose_cb: Option<Closure<dyn FnMut(web_sys::CloseEvent)>>,
}

thread_local! {
    static CLIENT: RefCell<Option<Rc<RefCell<WorkerClient>>>> = const { RefCell::new(None) };
}

impl WorkerClient {
    pub fn new() -> Self {
        Self {
            ws: None,
            uri: String::new(),
            database: String::new(),
            reconnect_attempt: 0,
            intentional_disconnect: false,
            request_id: 0,
            chunk_subscription_id: None,
            onopen_cb: None,
            onmessage_cb: None,
            onerror_cb: None,
            onclose_cb: None,
        }
    }

    /// Get the next request ID
    fn next_request_id(&mut self) -> u32 {
        self.request_id += 1;
        self.request_id
    }

    /// Connect to SpacetimeDB
    pub fn connect(&mut self, uri: String, database: String) {
        web_sys::console::log_1(&format!("Connecting to {} / {}", uri, database).into());

        self.uri = uri.clone();
        self.database = database.clone();
        self.intentional_disconnect = false;

        // Clean up old WebSocket and closures
        if let Some(old_ws) = self.ws.take() {
            old_ws.close().ok();
        }
        self.onopen_cb = None;
        self.onmessage_cb = None;
        self.onerror_cb = None;
        self.onclose_cb = None;

        let url = format!("{}/v1/database/{}/subscribe", uri, database);

        let ws = WebSocket::new_with_str(&url, WS_PROTOCOL).expect("Failed to create WebSocket");
        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);

        // Set up WebSocket callbacks
        let onopen = Closure::wrap(Box::new(move |_event: web_sys::Event| {
            web_sys::console::log_1(&"WebSocket connected".into());

            CLIENT.with(|c| {
                if let Some(client) = c.borrow().as_ref() {
                    client.borrow_mut().reconnect_attempt = 0;
                }
            });

            send_to_main_thread(WorkerToMain::Connected);
        }) as Box<dyn FnMut(_)>);

        ws.set_onopen(Some(onopen.as_ref().unchecked_ref()));
        self.onopen_cb = Some(onopen);

        let onmessage = Closure::wrap(Box::new(move |event: web_sys::MessageEvent| {
            handle_ws_message(event);
        }) as Box<dyn FnMut(_)>);

        ws.set_onmessage(Some(onmessage.as_ref().unchecked_ref()));
        self.onmessage_cb = Some(onmessage);

        let onerror = Closure::wrap(Box::new(move |_event: web_sys::Event| {
            web_sys::console::error_1(&"WebSocket error".into());
        }) as Box<dyn FnMut(_)>);

        ws.set_onerror(Some(onerror.as_ref().unchecked_ref()));
        self.onerror_cb = Some(onerror);

        let onclose = Closure::wrap(Box::new(move |_event: web_sys::CloseEvent| {
            web_sys::console::log_1(&"WebSocket closed, attempting reconnect...".into());
            with_client(|client| client.reconnect());
        }) as Box<dyn FnMut(_)>);

        ws.set_onclose(Some(onclose.as_ref().unchecked_ref()));
        self.onclose_cb = Some(onclose);

        self.ws = Some(ws);
    }

    /// Subscribe: chunk table for initial load, pixel table for live updates.
    /// After chunk data arrives, we unsubscribe from chunk to avoid 4MB blobs.
    pub fn subscribe(&mut self) {
        // Subscribe to chunk for initial state
        let request_id = self.next_request_id();
        let chunk_qid = QuerySetId::new(request_id);
        self.chunk_subscription_id = Some(chunk_qid);
        self.send_message(&ClientMessage::Subscribe(Subscribe {
            request_id,
            query_set_id: chunk_qid,
            query_strings: vec!["SELECT * FROM chunk".into()].into_boxed_slice(),
        }));

        // Subscribe to pixel for live updates
        let request_id2 = self.next_request_id();
        self.send_message(&ClientMessage::Subscribe(Subscribe {
            request_id: request_id2,
            query_set_id: QuerySetId::new(request_id2),
            query_strings: vec!["SELECT * FROM pixel".into()].into_boxed_slice(),
        }));
    }

    /// Unsubscribe from chunk after initial load
    fn unsubscribe_chunks(&mut self) {
        if let Some(qid) = self.chunk_subscription_id.take() {
            let request_id = self.next_request_id();
            self.send_message(&ClientMessage::Unsubscribe(Unsubscribe {
                request_id,
                query_set_id: qid,
                flags: UnsubscribeFlags::default(),
            }));
            web_sys::console::log_1(&"[worker] Unsubscribed from chunk (initial load complete)".into());
        }
    }

    /// Send BSATN-encoded reducer call
    pub fn call_reducer(&mut self, reducer_name: &str, args: &[u8]) -> u32 {
        let request_id = self.next_request_id();

        let call = CallReducer {
            request_id,
            flags: CallReducerFlags::Default,
            reducer: reducer_name.into(),
            args: Bytes::copy_from_slice(args),
        };

        self.send_message(&ClientMessage::CallReducer(call));
        request_id
    }

    /// Send a client message
    fn send_message(&self, message: &ClientMessage) {
        let Some(ws) = &self.ws else {
            web_sys::console::error_1(&"WebSocket not connected".into());
            return;
        };

        let bytes = match bsatn::to_vec(message) {
            Ok(b) => b,
            Err(e) => {
                web_sys::console::error_1(&format!("Failed to serialize message: {:?}", e).into());
                return;
            }
        };

        if let Err(e) = ws.send_with_u8_array(&bytes) {
            web_sys::console::error_1(&format!("Failed to send message: {:?}", e).into());
        }
    }

    /// Disconnect
    pub fn disconnect(&mut self) {
        self.intentional_disconnect = true;
        if let Some(ws) = self.ws.take() {
            ws.close().ok();
        }
    }

    /// Handle reconnection
    pub fn reconnect(&mut self) {
        if self.intentional_disconnect {
            return;
        }

        if self.reconnect_attempt >= MAX_RETRIES {
            send_to_main_thread(WorkerToMain::FatalError {
                message: format!("Connection lost after {} retries", MAX_RETRIES),
            });
            return;
        }

        let backoff_ms = BACKOFF_SCHEDULE
            .get(self.reconnect_attempt as usize)
            .copied()
            .unwrap_or(*BACKOFF_SCHEDULE.last().unwrap());
        web_sys::console::log_1(
            &format!(
                "Reconnecting in {}ms (attempt {}/{})",
                backoff_ms,
                self.reconnect_attempt + 1,
                MAX_RETRIES
            )
            .into(),
        );

        self.reconnect_attempt += 1;
        let uri = self.uri.clone();
        let database = self.database.clone();

        let scope: DedicatedWorkerGlobalScope = js_sys::global().unchecked_into();
        let closure = Closure::once(Box::new(move || {
            with_client(|client| {
                client.connect(uri, database);
            });
        }) as Box<dyn FnOnce()>);

        let _ = scope.set_timeout_with_callback_and_timeout_and_arguments_0(
            closure.as_ref().unchecked_ref(),
            backoff_ms as i32,
        );
        closure.forget();
    }
}

/// Initialize the global client
pub fn init_client() {
    CLIENT.with(|c| {
        *c.borrow_mut() = Some(Rc::new(RefCell::new(WorkerClient::new())));
    });
}

/// Access the client
pub fn with_client<F: FnOnce(&mut WorkerClient)>(f: F) {
    CLIENT.with(|c| {
        if let Some(client) = c.borrow().as_ref() {
            f(&mut client.borrow_mut());
        }
    });
}

/// Send a message to the main thread
fn send_to_main_thread(msg: WorkerToMain) {
    let scope: DedicatedWorkerGlobalScope = js_sys::global().unchecked_into();
    let json = serde_json::to_string(&msg).expect("Failed to serialize WorkerToMain");
    scope.post_message(&JsValue::from_str(&json)).expect("postMessage failed");
}

/// Handle WebSocket message
fn handle_ws_message(event: web_sys::MessageEvent) {
    let data = event.data();

    if let Some(text) = data.as_string() {
        web_sys::console::log_1(&format!("JSON message: {}", text).into());
    } else if let Ok(array_buffer) = data.dyn_into::<js_sys::ArrayBuffer>() {
        let uint8_array = js_sys::Uint8Array::new(&array_buffer);
        let bytes = uint8_array.to_vec();
        parse_spacetimedb_message(&bytes);
    }
}

/// Parse SpacetimeDB binary message
fn parse_spacetimedb_message(bytes: &[u8]) {
    if bytes.is_empty() {
        return;
    }

    let compression_tag = bytes[0];
    let message_bytes = &bytes[1..];

    let decompressed = match compression_tag {
        COMPRESSION_NONE => message_bytes.to_vec(),
        COMPRESSION_BROTLI => match decompress_brotli(message_bytes) {
            Ok(data) => data,
            Err(e) => {
                web_sys::console::error_1(&format!("Brotli decompression failed: {}", e).into());
                return;
            }
        },
        COMPRESSION_GZIP => match decompress_gzip(message_bytes) {
            Ok(data) => data,
            Err(e) => {
                web_sys::console::error_1(&format!("Gzip decompression failed: {}", e).into());
                return;
            }
        },
        _ => {
            web_sys::console::error_1(
                &format!("Unknown compression tag: {}", compression_tag).into(),
            );
            return;
        }
    };

    let message: ServerMessage = match bsatn::from_slice(&decompressed) {
        Ok(msg) => msg,
        Err(e) => {
            web_sys::console::error_1(&format!("Failed to deserialize message: {:?}", e).into());
            return;
        }
    };

    // Log large messages
    let compressed_kb = bytes.len() / 1024;
    let decompressed_kb = decompressed.len() / 1024;
    if decompressed_kb > 100 {
        web_sys::console::log_1(&format!(
            "[PERF worker] decompress | {}KB -> {}KB",
            compressed_kb, decompressed_kb
        ).into());
    }

    handle_server_message(message);
}

fn handle_server_message(message: ServerMessage) {
    match message {
        ServerMessage::InitialConnection(init) => {
            handle_initial_connection(init);
        }
        ServerMessage::SubscribeApplied(sub) => {
            handle_subscribe_applied(sub);
        }
        ServerMessage::TransactionUpdate(tx) => {
            handle_transaction_update(tx);
        }
        ServerMessage::SubscriptionError(err) => {
            web_sys::console::error_1(&format!("Subscription error: {}", err.error).into());
        }
        ServerMessage::ReducerResult(result) => {
            handle_reducer_result(result);
        }
        ServerMessage::UnsubscribeApplied(_) => {
            web_sys::console::log_1(&"Unsubscribe applied".into());
        }
        _ => {}
    }
}

fn handle_initial_connection(init: InitialConnection) {
    web_sys::console::log_1(&format!("Connected with identity: {:?}", init.identity).into());
    send_to_main_thread(WorkerToMain::Connected);
}

fn handle_subscribe_applied(sub: SubscribeApplied) {
    web_sys::console::log_1(
        &format!("Subscribe applied for query set {:?}", sub.query_set_id).into(),
    );
    process_query_rows(&sub.rows);

    // If this was the chunk subscription, unsubscribe to avoid 4MB updates
    with_client(|client| {
        if client.chunk_subscription_id == Some(sub.query_set_id) {
            client.unsubscribe_chunks();
        }
    });
}

fn handle_transaction_update(tx: TransactionUpdate) {
    for query_set in tx.query_sets.iter() {
        for table in query_set.tables.iter() {
            process_table_update(table);
        }
    }
}

fn handle_reducer_result(result: ReducerResult) {
    let ok = matches!(result.result, ReducerOutcome::Ok(_) | ReducerOutcome::OkEmpty);
    if !ok {
        web_sys::console::error_1(
            &format!("Reducer failed: request_id={}", result.request_id).into()
        );
    }

    // Process table updates from successful reducer calls
    if let ReducerOutcome::Ok(reducer_ok) = result.result {
        for query_set in reducer_ok.transaction_update.query_sets.iter() {
            for table in query_set.tables.iter() {
                process_table_update(table);
            }
        }
    }
}

/// Process initial subscription rows
fn process_query_rows(rows: &QueryRows) {
    for table_rows in rows.tables.iter() {
        let table_name: &str = &table_rows.table;
        if table_name == "chunk" {
            for row_bytes in &table_rows.rows {
                if let Some(chunk) = parse_chunk(&row_bytes) {
                    send_chunk_to_main(chunk);
                }
            }
        }
    }
}

/// Process table updates — route to chunk or pixel handler
fn process_table_update(table: &TableUpdate) {
    let name: &str = &table.table_name;
    if name == "chunk" {
        for rows in table.rows.iter() {
            if let TableUpdateRows::PersistentTable(persistent) = rows {
                for row_bytes in &persistent.inserts {
                    if let Some(chunk) = parse_chunk(&row_bytes) {
                        send_chunk_to_main(chunk);
                    }
                }
            }
        }
    } else if name == "pixel" {
        process_pixel_updates(table);
    }
}

/// Process pixel table inserts — send as lightweight binary to main thread
fn process_pixel_updates(table: &TableUpdate) {
    let scope: DedicatedWorkerGlobalScope = js_sys::global()
        .dyn_into().expect("not in worker");

    let mut pixels: Vec<u8> = Vec::new();
    let mut count = 0u32;

    for rows in table.rows.iter() {
        if let TableUpdateRows::PersistentTable(persistent) = rows {
            for row_bytes in &persistent.inserts {
                if let Some(px) = parse_pixel(&row_bytes) {
                    pixels.extend_from_slice(&px.chunk_id.to_le_bytes());
                    pixels.extend_from_slice(&px.cell_offset.to_le_bytes());
                    pixels.push(px.r);
                    pixels.push(px.g);
                    pixels.push(px.b);
                    pixels.push(if px.checked { 1 } else { 0 });
                    count += 1;
                }
            }
        }
    }

    if count == 0 { return; }

    // Binary format: [tag=3] [count: u32] [N × 16 bytes]
    let total_len = 1 + 4 + pixels.len();
    let buffer = js_sys::ArrayBuffer::new(total_len as u32);
    let view = js_sys::Uint8Array::new(&buffer);

    let mut header = [0u8; 5];
    header[0] = 3; // PixelBatch tag
    header[1..5].copy_from_slice(&count.to_le_bytes());
    view.set(&js_sys::Uint8Array::from(&header[..]), 0);

    let data_view = unsafe { js_sys::Uint8Array::view(&pixels) };
    view.set(&data_view, 5);

    let transfer = js_sys::Array::new();
    transfer.push(&buffer);
    scope.post_message_with_transfer(&buffer, &transfer).expect("postMessage failed");
}

/// Send chunk data to main thread as binary transfer
fn send_chunk_to_main(chunk: ChunkData) {
    let scope: DedicatedWorkerGlobalScope = js_sys::global()
        .dyn_into()
        .expect("not in worker");

    let data_kb = chunk.state.len() / 1024;

    // Binary format: [tag: u8 = 1] [chunk_id: i64] [version: u64] [state...]
    let total_len = 1 + 8 + 8 + chunk.state.len();
    let buffer = js_sys::ArrayBuffer::new(total_len as u32);
    let view = js_sys::Uint8Array::new(&buffer);

    let mut header = vec![0u8; 17];
    header[0] = 1; // ChunkInserted tag
    header[1..9].copy_from_slice(&chunk.chunk_id.to_le_bytes());
    header[9..17].copy_from_slice(&chunk.version.to_le_bytes());
    view.set(&js_sys::Uint8Array::from(&header[..]), 0);

    let state_view = unsafe { js_sys::Uint8Array::view(&chunk.state) };
    view.set(&state_view, 17);

    let transfer = js_sys::Array::new();
    transfer.push(&buffer);

    if let Err(e) = scope.post_message_with_transfer(&buffer, &transfer) {
        web_sys::console::error_1(&format!("postMessage failed: {:?}", e).into());
    }

    if data_kb > 100 {
        web_sys::console::log_1(&format!(
            "[PERF worker->main] chunk {} ({}KB)", chunk.chunk_id, data_kb
        ).into());
    }
}

/// Parse a Chunk from BSATN
fn parse_chunk(bytes: &[u8]) -> Option<ChunkData> {
    let mut reader = bytes;

    // chunk_id: i64
    if reader.len() < 8 { return None; }
    let chunk_id = i64::from_le_bytes(reader[..8].try_into().ok()?);
    reader = &reader[8..];

    // state: Vec<u8> (length-prefixed u32)
    if reader.len() < 4 { return None; }
    let state_len = u32::from_le_bytes(reader[..4].try_into().ok()?) as usize;
    reader = &reader[4..];
    if reader.len() < state_len { return None; }
    let state = reader[..state_len].to_vec();
    reader = &reader[state_len..];

    // version: u64
    if reader.len() < 8 { return None; }
    let version = u64::from_le_bytes(reader[..8].try_into().ok()?);

    Some(ChunkData { chunk_id, state, version })
}

struct ChunkData {
    chunk_id: i64,
    state: Vec<u8>,
    version: u64,
}

/// Parse a Pixel row from BSATN
/// Fields: id(u64) + chunk_id(i64) + cell_offset(u32) + r(u8) + g(u8) + b(u8) + checked(bool)
fn parse_pixel(bytes: &[u8]) -> Option<PixelData> {
    if bytes.len() < 8 + 8 + 4 + 4 { return None; }
    let mut r = bytes;

    let _id = u64::from_le_bytes(r[..8].try_into().ok()?);
    r = &r[8..];
    let chunk_id = i64::from_le_bytes(r[..8].try_into().ok()?);
    r = &r[8..];
    let cell_offset = u32::from_le_bytes(r[..4].try_into().ok()?);
    r = &r[4..];
    if r.len() < 4 { return None; }

    Some(PixelData {
        chunk_id,
        cell_offset,
        r: r[0],
        g: r[1],
        b: r[2],
        checked: r[3] != 0,
    })
}

struct PixelData {
    chunk_id: i64,
    cell_offset: u32,
    r: u8,
    g: u8,
    b: u8,
    checked: bool,
}

// === BSATN argument encoding ===

/// Encode arguments for update_pixel reducer
pub fn encode_update_args(
    chunk_id: i64,
    cell_offset: u32,
    r: u8,
    g: u8,
    b: u8,
    checked: bool,
) -> Vec<u8> {
    let mut buf = Vec::with_capacity(16);
    buf.extend_from_slice(&chunk_id.to_le_bytes());
    buf.extend_from_slice(&cell_offset.to_le_bytes());
    buf.push(r);
    buf.push(g);
    buf.push(b);
    buf.push(if checked { 1 } else { 0 });
    buf
}

/// Encode arguments for batch_update reducer
pub fn encode_batch_update_args(updates: &[(i64, u32, u8, u8, u8, bool)]) -> Vec<u8> {
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

// === Compression ===

fn decompress_brotli(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    let mut reader = brotli::Decompressor::new(data, 4096);
    std::io::Read::read_to_end(&mut reader, &mut output)
        .map_err(|e| format!("Brotli: {}", e))?;
    Ok(output)
}

fn decompress_gzip(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    let mut decoder = flate2::read::GzDecoder::new(data);
    let mut output = Vec::new();
    decoder.read_to_end(&mut output)
        .map_err(|e| format!("Gzip: {}", e))?;
    Ok(output)
}
