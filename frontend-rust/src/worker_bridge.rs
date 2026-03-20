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
    // Create worker
    let worker = Worker::new("pkg/worker/worker.js")
        .map_err(|e| format!("Failed to create worker: {:?}", e))?;

    // Set up message handler
    let callback = Closure::wrap(Box::new(move |event: MessageEvent| {
        // Deserialize message from worker
        let msg: WorkerToMain = match event.data().as_string() {
            Some(json_str) => match serde_json::from_str(&json_str) {
                Ok(m) => m,
                Err(e) => {
                    web_sys::console::error_1(
                        &format!("Failed to deserialize worker message: {:?}", e).into(),
                    );
                    return;
                }
            },
            None => {
                web_sys::console::error_1(&"Received non-string message from worker".into());
                return;
            }
        };

        on_message(msg);
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
