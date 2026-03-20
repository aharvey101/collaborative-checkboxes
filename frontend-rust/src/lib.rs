pub mod app;
pub mod bookmark;
pub mod components;
pub mod compression;
pub mod constants;
pub mod db;
pub mod doom;
pub mod state;
pub mod utils;
pub mod webgl;
pub mod worker;
pub mod worker_bridge;
pub mod ws_client;

// Alias for worker protocol to make it accessible as worker_protocol
pub use worker::protocol as worker_protocol;

// Re-export for convenience
pub use app::App;
// OLD EXPORTS - Worker handles networking now
// pub use db::{init_connection, toggle_checkbox};
pub use db::toggle_checkbox;
pub use state::{AppState, ConnectionStatus};
// OLD EXPORTS - Worker handles networking now
// pub use ws_client::{SharedClient, SpacetimeClient};

// Export test helper for performance tests
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn test_send_batch_update(updates_js: JsValue) -> Result<(), JsValue> {
    use worker::protocol::MainToWorker;
    use worker_bridge::send_to_worker;

    let updates: Vec<(i64, u32, u8, u8, u8, bool)> = serde_wasm_bindgen::from_value(updates_js)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse updates: {:?}", e)))?;

    send_to_worker(MainToWorker::BatchUpdate { updates });
    Ok(())
}
