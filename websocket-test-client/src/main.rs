use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::time::Duration;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use url::Url;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 Starting SpacetimeDB WebSocket Test Client");
    
    // Connect to SpacetimeDB WebSocket
    let url = Url::parse("ws://localhost:3001/database/websocket?name_or_address=checkboxes-local-demo")?;
    println!("🔌 Connecting to: {}", url);
    
    let (ws_stream, _) = connect_async(url).await?;
    println!("✅ WebSocket connected!");
    
    let (mut ws_sink, mut ws_stream) = ws_stream.split();

    // Send initial connection/subscription messages
    // This is based on how SpacetimeDB clients typically work
    
    // 1. Send identity/auth (simplified)
    let auth_message = json!({
        "id": 1,
        "type": "connect",
        "identity": null  // Let server assign identity
    });
    
    println!("📤 Sending auth message: {}", auth_message);
    ws_sink.send(Message::Text(auth_message.to_string())).await?;
    
    // Listen for responses
    tokio::spawn(async move {
        while let Some(message) = ws_stream.next().await {
            match message {
                Ok(Message::Text(text)) => {
                    println!("📥 Received text: {}", text);
                    
                    // Parse and handle different message types
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        if let Some(msg_type) = parsed.get("type").and_then(|t| t.as_str()) {
                            match msg_type {
                                "connected" => {
                                    println!("🎉 Successfully connected to SpacetimeDB!");
                                },
                                "subscription_update" => {
                                    if let Some(updates) = parsed.get("table_updates") {
                                        println!("📊 Table updates received: {}", updates);
                                    }
                                },
                                _ => {
                                    println!("❓ Unknown message type: {}", msg_type);
                                }
                            }
                        }
                    }
                },
                Ok(Message::Binary(data)) => {
                    println!("📥 Received binary data: {} bytes", data.len());
                    println!("   First 20 bytes: {}", hex::encode(&data[..data.len().min(20)]));
                },
                Ok(Message::Close(_)) => {
                    println!("👋 Connection closed");
                    break;
                },
                Ok(Message::Ping(_)) | Ok(Message::Pong(_)) | Ok(Message::Frame(_)) => {
                    // Handle ping/pong/frame messages
                },
                Err(e) => {
                    println!("❌ WebSocket error: {}", e);
                    break;
                }
            }
        }
    });
    
    // Wait a bit for connection to establish
    tokio::time::sleep(Duration::from_secs(2)).await;
    
    // 2. Subscribe to checkbox_chunk table
    let subscribe_message = json!({
        "id": 2,
        "type": "subscribe",
        "query": "SELECT * FROM checkbox_chunk"
    });
    
    println!("📤 Sending subscription: {}", subscribe_message);
    ws_sink.send(Message::Text(subscribe_message.to_string())).await?;
    
    tokio::time::sleep(Duration::from_secs(1)).await;
    
    // 3. Call update_checkbox reducer
    let reducer_call = json!({
        "id": 3,
        "type": "call_reducer",
        "reducer": "update_checkbox",
        "args": {
            "chunkId": 0,
            "bitOffset": 5,  // Different bit to avoid confusion
            "checked": true
        }
    });
    
    println!("📤 Calling reducer: {}", reducer_call);
    ws_sink.send(Message::Text(reducer_call.to_string())).await?;
    
    // Wait for updates
    tokio::time::sleep(Duration::from_secs(3)).await;
    
    println!("🏁 Test complete");
    Ok(())
}