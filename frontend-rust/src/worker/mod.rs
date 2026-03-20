//! Web worker module for offloading SpacetimeDB networking

pub mod protocol;
pub mod client;

use wasm_bindgen::prelude::*;

/// Worker entry point - called when worker starts
#[wasm_bindgen(start)]
pub fn worker_main() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"Worker initialized".into());
}
