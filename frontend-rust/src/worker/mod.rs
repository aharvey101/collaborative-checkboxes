//! Web worker module for offloading SpacetimeDB networking

pub mod protocol;
pub mod client;

use protocol::{MainToWorker, WorkerToMain};
use wasm_bindgen::prelude::*;
use web_sys::DedicatedWorkerGlobalScope;

/// Worker entry point - called when worker starts
#[wasm_bindgen(start)]
pub fn worker_main() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"Worker started".into());

    // Set up message handler
    let scope = js_sys::global()
        .dyn_into::<DedicatedWorkerGlobalScope>()
        .expect("not in worker context");

    let handler = Closure::wrap(Box::new(move |event: web_sys::MessageEvent| {
        handle_main_message(event);
    }) as Box<dyn FnMut(_)>);

    scope.set_onmessage(Some(handler.as_ref().unchecked_ref()));
    handler.forget();
}

/// Send message to main thread
fn send_to_main(msg: WorkerToMain) {
    let scope = js_sys::global()
        .dyn_into::<DedicatedWorkerGlobalScope>()
        .expect("not in worker context");

    let value = serde_wasm_bindgen::to_value(&msg).expect("serialization failed");
    scope.post_message(&value).expect("postMessage failed");
}

/// Handle messages from main thread
fn handle_main_message(event: web_sys::MessageEvent) {
    let data = event.data();

    // Deserialize message
    let msg: MainToWorker = match serde_wasm_bindgen::from_value(data) {
        Ok(m) => m,
        Err(e) => {
            web_sys::console::error_1(&format!("Failed to parse message: {:?}", e).into());
            return;
        }
    };

    web_sys::console::log_1(&format!("Worker received: {:?}", msg).into());

    // TODO: Handle messages (Phase 2)
    match msg {
        MainToWorker::Connect { uri, database } => {
            web_sys::console::log_1(&format!("Connect to {} / {}", uri, database).into());
            // Echo back success for now
            send_to_main(WorkerToMain::Connected);
        }
        MainToWorker::Disconnect => {
            web_sys::console::log_1(&"Disconnect requested".into());
        }
        _ => {
            web_sys::console::log_1(&"Message received but not handled yet".into());
        }
    }
}

/// Main entry point (required by Cargo for binary target)
/// When compiled to WASM, the #[wasm_bindgen(start)] function above is the actual entry point
fn main() {}
