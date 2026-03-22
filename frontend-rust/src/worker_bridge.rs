//! Bridge between main thread and worker
//!
//! Provides interface for spawning worker and sending/receiving messages

use crate::worker::protocol::{MainToWorker, WorkerToMain};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{MessageEvent, Worker};

thread_local! {
    static WORKER: RefCell<Option<Worker>> = const { RefCell::new(None) };
    static ON_MESSAGE_CALLBACK: RefCell<Option<Closure<dyn FnMut(MessageEvent)>>> = const { RefCell::new(None) };
}

/// Initialize worker and set up message handlers
pub fn init_worker<F>(on_message: F) -> Result<(), String>
where
    F: Fn(WorkerToMain) + 'static,
{
    web_sys::console::log_1(&"[Main] init_worker called".into());

    // Create worker (as ES6 module)
    let mut options = web_sys::WorkerOptions::new();
    options.set_type(web_sys::WorkerType::Module);

    web_sys::console::log_1(&"[Main] Creating worker from worker-loader.js".into());
    let worker = Worker::new_with_options("worker-loader.js", &options)
        .map_err(|e| {
            let err_msg = format!("Failed to create worker: {:?}", e);
            web_sys::console::error_1(&err_msg.clone().into());
            err_msg
        })?;

    web_sys::console::log_1(&"[Main] Worker created successfully".into());

    // Set up message handler
    // Supports two formats:
    //   1. JSON string (for small messages: Connected, FatalError)
    //   2. JS object with ArrayBuffer (for chunk data: ChunkInserted, ChunkUpdated)
    let callback = Closure::wrap(Box::new(move |event: MessageEvent| {
        let data = event.data();

        // Try JSON string first (small messages)
        if let Some(json_str) = data.as_string() {
            match serde_json::from_str::<WorkerToMain>(&json_str) {
                Ok(msg) => on_message(msg),
                Err(e) => {
                    web_sys::console::error_1(
                        &format!("Failed to deserialize worker message: {:?}", e).into(),
                    );
                }
            }
            return;
        }

        // Try JS object with ArrayBuffer (chunk data)
        if data.is_object() {
            if let Some(msg) = parse_binary_chunk_message(&data) {
                on_message(msg);
                return;
            }
        }

        web_sys::console::error_1(&"Received unknown message format from worker".into());
    }) as Box<dyn FnMut(_)>);

    worker.set_onmessage(Some(callback.as_ref().unchecked_ref()));

    // Store worker and callback
    WORKER.with(|w| {
        *w.borrow_mut() = Some(worker);
    });

    ON_MESSAGE_CALLBACK.with(|c| {
        *c.borrow_mut() = Some(callback);
    });

    Ok(())
}

/// Send message to worker
pub fn send_to_worker(msg: MainToWorker) {
    WORKER.with(|w| {
        if let Some(worker) = w.borrow().as_ref() {
            let Ok(json) = serde_json::to_string(&msg) else { return };
            let value = JsValue::from_str(&json);
            let _ = worker.post_message(&value);
        }
    });
}

/// Send raw JSON string to worker (for testing/performance optimization)
pub fn send_raw_json(json: &str) {
    WORKER.with(|w| {
        if let Some(worker) = w.borrow().as_ref() {
            let value = JsValue::from_str(json);
            let _ = worker.post_message(&value);
        }
    });
}

/// Parse a binary message (JS object with ArrayBuffer)
/// Supports chunk messages and delta updates
fn parse_binary_chunk_message(data: &JsValue) -> Option<WorkerToMain> {
    let msg_type = js_sys::Reflect::get(data, &"type".into())
        .ok()?
        .as_string()?;

    // DeltaUpdate has a different shape: { type, data: ArrayBuffer }
    if msg_type == "DeltaUpdate" {
        let data_val = js_sys::Reflect::get(data, &"data".into()).ok()?;
        let array_buffer = data_val.dyn_into::<js_sys::ArrayBuffer>().ok()?;
        let uint8_array = js_sys::Uint8Array::new(&array_buffer);
        return Some(WorkerToMain::DeltaUpdate { data: uint8_array.to_vec() });
    }

    // Chunk messages: { type, chunk_id, version, state: ArrayBuffer }
    let chunk_id = js_sys::Reflect::get(data, &"chunk_id".into())
        .ok()?
        .as_f64()? as i64;
    let version = js_sys::Reflect::get(data, &"version".into())
        .ok()?
        .as_f64()? as u64;
    let state_val = js_sys::Reflect::get(data, &"state".into()).ok()?;

    let array_buffer = state_val.dyn_into::<js_sys::ArrayBuffer>().ok()?;
    let uint8_array = js_sys::Uint8Array::new(&array_buffer);
    let state = uint8_array.to_vec();

    match msg_type.as_str() {
        "ChunkInserted" => Some(WorkerToMain::ChunkInserted { chunk_id, state, version }),
        "ChunkUpdated" => Some(WorkerToMain::ChunkUpdated { chunk_id, state, version }),
        _ => None,
    }
}

/// Terminate worker
pub fn terminate_worker() {
    WORKER.with(|w| {
        if let Some(worker) = w.borrow_mut().take() {
            worker.terminate();
        }
    });

    ON_MESSAGE_CALLBACK.with(|c| {
        *c.borrow_mut() = None;
    });
}
