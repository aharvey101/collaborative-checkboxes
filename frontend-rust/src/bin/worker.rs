//! Web worker binary entry point

use checkbox_frontend::worker::client::{encode_batch_update_args, encode_update_args, init_client, with_client};
use checkbox_frontend::worker::protocol::MainToWorker;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use web_sys::DedicatedWorkerGlobalScope;

// Worker-side batch accumulator — flushed on a timer
thread_local! {
    static PENDING_UPDATES: RefCell<Vec<(i64, u32, u8, u8, u8, bool)>> = const { RefCell::new(Vec::new()) };
    static FLUSH_SCHEDULED: RefCell<bool> = const { RefCell::new(false) };
}

/// Max updates per SpacetimeDB reducer call
const MAX_BATCH_SIZE: usize = 50_000;

/// Flush accumulated updates to SpacetimeDB
fn flush_worker_batch() {
    let updates = PENDING_UPDATES.with(|p| std::mem::take(&mut *p.borrow_mut()));
    FLUSH_SCHEDULED.with(|f| *f.borrow_mut() = false);

    if updates.is_empty() {
        return;
    }

    for chunk in updates.chunks(MAX_BATCH_SIZE) {
        let args = encode_batch_update_args(chunk);
        with_client(|client| {
            client.call_reducer("batch_update", &args);
        });
    }
}

/// Schedule a flush if one isn't already pending
fn schedule_flush() {
    let already_scheduled = FLUSH_SCHEDULED.with(|f| {
        let was = *f.borrow();
        *f.borrow_mut() = true;
        was
    });

    if already_scheduled {
        return;
    }

    let scope: DedicatedWorkerGlobalScope = js_sys::global().unchecked_into();
    let closure = Closure::once(Box::new(|| {
        flush_worker_batch();
    }) as Box<dyn FnOnce()>);

    let _ = scope.set_timeout_with_callback_and_timeout_and_arguments_0(
        closure.as_ref().unchecked_ref(),
        16,
    );
    closure.forget();
}

/// Periodically clean up old pixel broadcast rows
fn schedule_pixel_cleanup() {
    let scope: DedicatedWorkerGlobalScope = js_sys::global().unchecked_into();
    let closure = Closure::once(Box::new(|| {
        // Clean up all pixels (they've been delivered to subscribers already)
        let args = u64::MAX.to_le_bytes();
        with_client(|client| {
            client.call_reducer("cleanup_pixels", &args);
        });
        schedule_pixel_cleanup();
    }) as Box<dyn FnOnce()>);

    let _ = scope.set_timeout_with_callback_and_timeout_and_arguments_0(
        closure.as_ref().unchecked_ref(),
        10000, // every 10 seconds
    );
    closure.forget();
}

/// Worker entry point
#[wasm_bindgen(start)]
pub fn worker_main() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"Worker started".into());

    init_client();

    let scope = js_sys::global()
        .dyn_into::<DedicatedWorkerGlobalScope>()
        .expect("not in worker context");

    // Periodic pixel cleanup
    schedule_pixel_cleanup();

    let handler = Closure::wrap(Box::new(move |event: web_sys::MessageEvent| {
        handle_main_message(event);
    }) as Box<dyn FnMut(_)>);

    scope.set_onmessage(Some(handler.as_ref().unchecked_ref()));
    handler.forget();
}

/// Handle messages from main thread
fn handle_main_message(event: web_sys::MessageEvent) {
    let data = event.data();

    // Try binary buffer first (BatchUpdate), then fall back to JSON
    if let Ok(buffer) = data.clone().dyn_into::<js_sys::ArrayBuffer>() {
        let view = js_sys::Uint8Array::new(&buffer);
        let len = view.length() as usize;
        if len < 1 { return; }

        let mut tag_byte = [0u8; 1];
        view.slice(0, 1).copy_to(&mut tag_byte);

        if tag_byte[0] == 3 {
            // BatchUpdate: parse 16-byte update tuples
            let update_count = (len - 1) / 16;
            let mut bytes = vec![0u8; len - 1];
            view.slice(1, len as u32).copy_to(&mut bytes);

            let mut updates = Vec::with_capacity(update_count);
            for i in 0..update_count {
                let offset = i * 16;
                let chunk_id = i64::from_le_bytes(bytes[offset..offset + 8].try_into().unwrap());
                let cell_offset = u32::from_le_bytes(bytes[offset + 8..offset + 12].try_into().unwrap());
                let r = bytes[offset + 12];
                let g = bytes[offset + 13];
                let b = bytes[offset + 14];
                let checked = bytes[offset + 15] != 0;
                updates.push((chunk_id, cell_offset, r, g, b, checked));
            }

            PENDING_UPDATES.with(|p| p.borrow_mut().extend(updates));
            schedule_flush();
        }
        return;
    }

    // JSON string message
    let msg: MainToWorker = match data.as_string() {
        Some(json_str) => match serde_json::from_str(&json_str) {
            Ok(m) => m,
            Err(_) => return,
        },
        None => return,
    };

    match msg {
        MainToWorker::Connect { uri, database } => {
            with_client(|client| client.connect(uri, database));
        }
        MainToWorker::Subscribe { chunk_ids: _ } => {
            with_client(|client| client.subscribe());
        }
        MainToWorker::UpdateCheckbox { chunk_id, cell_offset, r, g, b, checked } => {
            let args = encode_update_args(chunk_id, cell_offset, r, g, b, checked);
            with_client(|client| { client.call_reducer("update_pixel", &args); });
        }
        MainToWorker::BatchUpdate { updates } => {
            PENDING_UPDATES.with(|p| p.borrow_mut().extend(updates));
            schedule_flush();
        }
        MainToWorker::Disconnect => {
            with_client(|client| client.disconnect());
        }
    }
}

fn main() {}
