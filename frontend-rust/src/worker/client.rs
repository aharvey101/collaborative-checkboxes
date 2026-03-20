//! Worker-side SpacetimeDB client
//!
//! Handles WebSocket connection, BSATN encoding, and reconnection logic
//!
//! Note: Helper functions like `send_to_main_thread`, `handle_ws_message`, and
//! `handle_ws_close` are defined later in this file.

use super::protocol::{MainToWorker, WorkerToMain};
use std::cell::RefCell;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{DedicatedWorkerGlobalScope, WebSocket};

// Reconnection constants
const BACKOFF_SCHEDULE: [u32; 5] = [5000, 10000, 20000, 40000, 60000];
const MAX_RETRIES: u32 = 5;

/// SpacetimeDB client state
pub struct WorkerClient {
    ws: Option<WebSocket>,
    uri: String,
    database: String,
    reconnect_attempt: u32,
    intentional_disconnect: bool,
    subscribed_chunks: Vec<i64>,
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
            subscribed_chunks: Vec::new(),
            onopen_cb: None,
            onmessage_cb: None,
            onerror_cb: None,
            onclose_cb: None,
        }
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

        let full_uri = format!("{}/{}", uri, database);

        let ws = WebSocket::new(&full_uri).expect("Failed to create WebSocket");
        ws.set_binary_type(web_sys::BinaryType::Arraybuffer);

        // Set up WebSocket callbacks
        let onopen = Closure::wrap(Box::new(move |_event: web_sys::Event| {
            web_sys::console::log_1(&"WebSocket connected".into());

            // Reset reconnection counter on successful connection
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
            web_sys::console::log_1(&"WebSocket closed".into());
            handle_ws_close();
        }) as Box<dyn FnMut(_)>);

        ws.set_onclose(Some(onclose.as_ref().unchecked_ref()));
        self.onclose_cb = Some(onclose);

        self.ws = Some(ws);
    }

    /// Subscribe to checkbox_chunk table
    pub fn subscribe(&self) {
        if let Some(ws) = &self.ws {
            let subscribe_msg = r#"{"call":{"fn":"subscribe","args":["SELECT * FROM checkbox_chunk"]}}"#;
            ws.send_with_str(subscribe_msg).ok();
        }
    }

    /// Send BSATN-encoded reducer call
    pub fn call_reducer(&self, reducer_name: &str, args: &[u8]) {
        if let Some(ws) = &self.ws {
            // Format: {"call":{"fn":"reducer_name","args":[base64_args]}}
            let args_base64 = base64_encode(args);
            let msg = format!(
                r#"{{"call":{{"fn":"{}","args":["{}"]}}}}"#,
                reducer_name, args_base64
            );

            ws.send_with_str(&msg).ok();
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

        // Schedule reconnection
        let window = js_sys::global();
        let closure = Closure::once(Box::new(move || {
            CLIENT.with(|c| {
                if let Some(client) = c.borrow().as_ref() {
                    let mut client_mut = client.borrow_mut();
                    let uri = client_mut.uri.clone();
                    let database = client_mut.database.clone();
                    client_mut.connect(uri, database);
                }
            });
        }) as Box<dyn FnOnce()>);

        let scope = window
            .dyn_into::<DedicatedWorkerGlobalScope>()
            .expect("not in worker");
        scope
            .set_timeout_with_callback_and_timeout_and_arguments_0(
                closure.as_ref().unchecked_ref(),
                backoff_ms as i32,
            )
            .ok();
        closure.forget();
    }
}

/// Initialize global client
pub fn init_client() {
    CLIENT.with(|c| {
        *c.borrow_mut() = Some(Rc::new(RefCell::new(WorkerClient::new())));
    });
}

/// Get client reference
pub fn with_client<F, R>(f: F) -> Option<R>
where
    F: FnOnce(&mut WorkerClient) -> R,
{
    CLIENT.with(|c| c.borrow().as_ref().map(|client| f(&mut client.borrow_mut())))
}

/// Handle WebSocket message
fn handle_ws_message(event: web_sys::MessageEvent) {
    let data = event.data();

    // Check if it's a string first (doesn't consume data)
    if let Some(text) = data.as_string() {
        // JSON message (for subscribe acknowledgment)
        web_sys::console::log_1(&format!("JSON message: {}", text).into());
    } else if let Ok(array_buffer) = data.dyn_into::<js_sys::ArrayBuffer>() {
        // Binary BSATN message
        let uint8_array = js_sys::Uint8Array::new(&array_buffer);
        let bytes = uint8_array.to_vec();

        // Parse SpacetimeDB message
        parse_spacetimedb_message(&bytes);
    }
}

/// Parse SpacetimeDB binary message
///
/// Note: Message type constants are from SpacetimeDB v2.0 protocol.
/// Reference: https://spacetimedb.com/docs/sdks/rust/quickstart
/// If these values don't work, check SpacetimeDB client logs for actual message types.
fn parse_spacetimedb_message(bytes: &[u8]) {
    if bytes.is_empty() {
        return;
    }

    // SpacetimeDB message format:
    // - First byte is message type
    // - 0x01 = TransactionUpdate
    // - 0x02 = IdentityToken
    // - 0x03 = SubscriptionUpdate

    let msg_type = bytes[0];

    match msg_type {
        0x03 => {
            // SubscriptionUpdate - contains table rows
            parse_subscription_update(&bytes[1..]);
        }
        0x01 => {
            // TransactionUpdate - row inserts/updates/deletes
            parse_transaction_update(&bytes[1..]);
        }
        _ => {
            web_sys::console::log_1(&format!("Unknown message type: {}", msg_type).into());
        }
    }
}

/// Parse subscription update (initial data load)
fn parse_subscription_update(bytes: &[u8]) {
    // For now, assume checkbox_chunk table rows
    // Each row is BSATN-encoded: (chunk_id: i64, state: Vec<u8>, version: u64)

    let mut offset = 0;
    while offset < bytes.len() {
        if let Some(chunk) = parse_checkbox_chunk(&bytes[offset..]) {
            // Calculate offset before moving chunk
            let state_len = chunk.state.len();

            send_to_main_thread(WorkerToMain::ChunkInserted {
                chunk_id: chunk.chunk_id,
                state: chunk.state,
                version: chunk.version,
            });

            // Move offset forward (8 + 4 + state.len() + 8)
            offset += 8 + 4 + state_len + 8;
        } else {
            break;
        }
    }
}

/// Parse transaction update (real-time updates)
fn parse_transaction_update(bytes: &[u8]) {
    // Similar to subscription update
    parse_subscription_update(bytes);
}

/// Parse a single CheckboxChunk from BSATN
fn parse_checkbox_chunk(bytes: &[u8]) -> Option<CheckboxChunk> {
    let mut reader = bytes;

    // Read chunk_id (i64, little-endian)
    if reader.len() < 8 {
        return None;
    }
    let chunk_id = i64::from_le_bytes([
        reader[0], reader[1], reader[2], reader[3], reader[4], reader[5], reader[6], reader[7],
    ]);
    reader = &reader[8..];

    // Read state (Vec<u8>): length-prefixed with u32
    if reader.len() < 4 {
        return None;
    }
    let state_len = u32::from_le_bytes([reader[0], reader[1], reader[2], reader[3]]) as usize;
    reader = &reader[4..];

    if reader.len() < state_len {
        return None;
    }
    let state = reader[..state_len].to_vec();
    reader = &reader[state_len..];

    // Read version (u64, little-endian)
    if reader.len() < 8 {
        return None;
    }
    let version = u64::from_le_bytes([
        reader[0], reader[1], reader[2], reader[3], reader[4], reader[5], reader[6], reader[7],
    ]);

    Some(CheckboxChunk {
        chunk_id,
        state,
        version,
    })
}

struct CheckboxChunk {
    chunk_id: i64,
    state: Vec<u8>,
    version: u64,
}

/// Handle WebSocket close
fn handle_ws_close() {
    with_client(|client| {
        client.reconnect();
    });
}

/// Send message to main thread
fn send_to_main_thread(msg: WorkerToMain) {
    let scope = js_sys::global()
        .dyn_into::<DedicatedWorkerGlobalScope>()
        .expect("not in worker");

    let json = serde_json::to_string(&msg).expect("serialization failed");
    let value = wasm_bindgen::JsValue::from_str(&json);
    scope.post_message(&value).expect("postMessage failed");
}

/// Encode BSATN arguments for reducer
pub fn encode_update_checkbox_args(
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

/// Encode batch update arguments
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

/// Base64 encode bytes
fn base64_encode(data: &[u8]) -> String {
    let window = js_sys::global();
    let btoa = js_sys::Reflect::get(&window, &JsValue::from_str("btoa"))
        .expect("btoa not found");
    let btoa_fn = btoa.dyn_ref::<js_sys::Function>().expect("btoa not a function");

    // Convert to binary string properly
    let binary_string = data.iter()
        .map(|&byte| byte as char)
        .collect::<String>();

    btoa_fn
        .call1(&window, &JsValue::from_str(&binary_string))
        .expect("btoa failed")
        .as_string()
        .expect("btoa didn't return string")
}
