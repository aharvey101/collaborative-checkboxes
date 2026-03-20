//! Bridge between main thread and worker
//!
//! Provides interface for spawning worker and sending/receiving messages

use crate::worker::protocol::{MainToWorker, WorkerToMain};
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::Worker;

thread_local! {
    static WORKER: RefCell<Option<Worker>> = RefCell::new(None);
    static MESSAGE_CALLBACK: RefCell<Option<Closure<dyn FnMut(web_sys::MessageEvent)>>> = RefCell::new(None);
}

/// Initialize worker and set up message handlers
pub fn init_worker<F>(on_message: F) -> Result<(), String>
where
    F: Fn(WorkerToMain) + 'static,
{
    web_sys::console::log_1(&"Initializing worker...".into());

    // Create worker
    let worker = Worker::new("pkg/worker/worker.js")
        .map_err(|e| format!("Failed to create worker: {:?}", e))?;

    // Set up message handler
    let callback = Closure::wrap(Box::new(move |event: web_sys::MessageEvent| {
        let data = event.data();

        // Deserialize message from worker
        let msg: WorkerToMain = match serde_wasm_bindgen::from_value(data) {
            Ok(m) => m,
            Err(e) => {
                web_sys::console::error_1(&format!("Failed to parse worker message: {:?}", e).into());
                return;
            }
        };

        web_sys::console::log_1(&format!("Main received: {:?}", msg).into());
        on_message(msg);
    }) as Box<dyn FnMut(_)>);

    worker.set_onmessage(Some(callback.as_ref().unchecked_ref()));

    // Set up error handler
    let error_callback = Closure::wrap(Box::new(move |event: web_sys::ErrorEvent| {
        web_sys::console::error_1(&format!("Worker error: {}", event.message()).into());
    }) as Box<dyn FnMut(_)>);

    worker.set_onerror(Some(error_callback.as_ref().unchecked_ref()));
    error_callback.forget();

    // Store worker and callback
    WORKER.with(|w| {
        *w.borrow_mut() = Some(worker);
    });

    MESSAGE_CALLBACK.with(|c| {
        *c.borrow_mut() = Some(callback);
    });

    web_sys::console::log_1(&"Worker initialized successfully".into());
    Ok(())
}

/// Send message to worker
pub fn send_to_worker(msg: MainToWorker) {
    WORKER.with(|w| {
        if let Some(worker) = w.borrow().as_ref() {
            let value = serde_wasm_bindgen::to_value(&msg).expect("serialization failed");
            worker.post_message(&value).expect("postMessage failed");
        } else {
            web_sys::console::error_1(&"Worker not initialized".into());
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

    MESSAGE_CALLBACK.with(|c| {
        *c.borrow_mut() = None;
    });
}
