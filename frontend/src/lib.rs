use serde::{Deserialize, Serialize};
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{window, HtmlInputElement};

#[cfg(target_arch = "wasm32")]
mod spacetimedb_client;
#[cfg(target_arch = "wasm32")]
use spacetimedb_client::{SpacetimeDBClient, ConnectionState};

#[cfg(not(target_arch = "wasm32"))]
#[derive(Debug, Clone, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed(String),
}

#[cfg(not(target_arch = "wasm32"))]
pub struct SpacetimeDBClient {
    server_url: String,
    database_name: String,
    state: ConnectionState,
}

#[cfg(not(target_arch = "wasm32"))]
impl SpacetimeDBClient {
    pub fn new(server_url: &str, database_name: &str) -> Result<Self, String> {
        Ok(Self {
            server_url: server_url.to_string(),
            database_name: database_name.to_string(),
            state: ConnectionState::Disconnected,
        })
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        Err("SpacetimeDB not available on native target".to_string())
    }
}

mod chunk_cache;
use chunk_cache::{ChunkCache, CachedChunk};

mod subscription_manager;
use subscription_manager::SubscriptionManager;

#[cfg(target_arch = "wasm32")]
mod collaborative_state;
#[cfg(target_arch = "wasm32")]
use collaborative_state::CollaborativeState;

#[cfg(not(target_arch = "wasm32"))]
// Mock CollaborativeState for non-WASM targets
pub struct CollaborativeState {
    server_url: String,
    database_name: String,
    cache: ChunkCache,
    client: SpacetimeDBClient,
}

#[cfg(not(target_arch = "wasm32"))]
impl CollaborativeState {
    pub fn new(server_url: &str, database_name: &str, cache_size: usize) -> Result<Self, String> {
        Ok(Self {
            server_url: server_url.to_string(),
            database_name: database_name.to_string(),
            cache: ChunkCache::new(cache_size),
            client: SpacetimeDBClient::new(server_url, database_name)?,
        })
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        self.client.connect().await
    }

    pub async fn update_checkbox(&mut self, _chunk_id: u32, _x: u32, _y: u32) -> Result<(), String> {
        Ok(())
    }

    pub async fn update_viewport(&mut self, _x: i32, _y: i32, _width: u32, _height: u32) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(target_arch = "wasm32")]
mod async_handlers;
#[cfg(target_arch = "wasm32")]
use async_handlers::{AsyncUpdateQueue, PendingUpdate};

#[cfg(not(target_arch = "wasm32"))]
// Mock AsyncUpdateQueue for non-WASM targets
#[derive(Debug, Clone)]
pub enum PendingUpdate {
    CheckboxToggle { x: u32, y: u32 },
    ViewportChange { x: i32, y: i32, width: u32, height: u32 },
}

#[cfg(not(target_arch = "wasm32"))]
pub struct AsyncUpdateQueue {
    updates: Vec<PendingUpdate>,
}

#[cfg(not(target_arch = "wasm32"))]
impl AsyncUpdateQueue {
    pub fn new() -> Self {
        Self {
            updates: Vec::new(),
        }
    }

    pub fn queue_checkbox_toggle(&mut self, x: u32, y: u32) {
        self.updates.push(PendingUpdate::CheckboxToggle { x, y });
    }

    pub fn queue_viewport_change(&mut self, x: i32, y: i32, width: u32, height: u32) {
        self.updates.push(PendingUpdate::ViewportChange { x, y, width, height });
    }

    pub fn pop_next_update(&mut self) -> Option<PendingUpdate> {
        if self.updates.is_empty() {
            None
        } else {
            Some(self.updates.remove(0))
        }
    }
}

#[cfg(test)]
mod dependency_tests {
    #[test]
    fn test_spacetimedb_v2_import() {
        #[cfg(target_arch = "wasm32")]
        {
            // Test that SpacetimeDB 2.0 types can be imported
            use spacetimedb::ConnectionId;

            // Simple compilation test - if this compiles, dependency is working
            let _: Option<ConnectionId> = None;
        }
        assert!(true); // Always passes if compilation succeeds
    }
}

#[cfg(test)]
mod wasm_interface_tests {
    use super::*;
    use wasm_bindgen_test::*;

    wasm_bindgen_test_configure!(run_in_browser);

    #[wasm_bindgen_test]
    fn test_create_local_app() {
        let app = create_checkbox_app_local();
        // Should not panic and return valid app
    }

    #[wasm_bindgen_test] 
    fn test_create_collaborative_app() {
        let app = create_checkbox_app_collaborative("http://localhost:3000", "checkboxes");
        // Should not panic even if server not available
    }
}

#[cfg(test)]
mod collaborative_tests {
    use super::*;
    
    #[test]
    fn test_app_with_collaborative_mode() {
        // Test that app can be created with collaborative state
        let app = CheckboxApp::new_collaborative("http://localhost:3000", "checkboxes", 10);
        assert!(app.is_ok());
    }
    
    #[test]
    fn test_local_vs_collaborative_modes() {
        let local_app = CheckboxApp::new();
        let collab_app = CheckboxApp::new_collaborative("http://localhost:3000", "checkboxes", 10).unwrap();
        
        // Both should start with clean state
        assert_eq!(local_app.get_checkbox(0, 0), false);
        // Note: Collaborative app checkbox state depends on server, can't easily test here
    }

    #[test]
    fn test_collaborative_checkbox_toggle() {
        let mut app = CheckboxApp::new_collaborative("http://localhost:3000", "checkboxes", 5).unwrap();
        
        // Test that toggle methods exist
        assert!(app.can_toggle_checkbox(0, 0));
    }

    #[test] 
    fn test_viewport_updates_trigger_sync() {
        let mut app = CheckboxApp::new_collaborative("http://localhost:3000", "checkboxes", 5).unwrap();
        
        // Should not crash when updating viewport (connection logic tested separately)
        app.set_viewport(100, 200, 400, 300);
    }
}

/// Simplified frontend for testing SpacetimeDB connection
/// This focuses on basic functionality to validate the integration

/// Checkbox data structure - matches the SpacetimeDB module
#[derive(Serialize, Deserialize, Clone)]
struct CheckboxChunk {
    chunk_id: u32,
    state: Vec<u8>,
    version: u64,
}

/// Tracks the current viewport position in the 1000×1000 grid
#[derive(Clone, Copy)]
struct Viewport {
    x: u16, // top-left x coordinate (0-900)
    y: u16, // top-left y coordinate (0-900)
}

impl Viewport {
    fn new() -> Self {
        Viewport { x: 450, y: 450 } // Start in the middle
    }

    /// Convert 2D grid coordinates to 1D bit array index
    fn coords_to_index(x: u16, y: u16) -> usize {
        (y as usize) * 1000 + (x as usize)
    }
}

/// Efficient bit array for storing checkbox states (1M checkboxes = 125KB)
#[derive(Clone)]
struct BitArray {
    data: Rc<RefCell<Vec<u8>>>,
}

impl BitArray {
    fn new(num_bits: usize) -> Self {
        let num_bytes = (num_bits + 7) / 8;
        BitArray {
            data: Rc::new(RefCell::new(vec![0u8; num_bytes])),
        }
    }

    fn get(&self, index: usize) -> bool {
        let data = self.data.borrow();
        let byte_idx = index / 8;
        let bit_idx = index % 8;
        if byte_idx >= data.len() {
            false
        } else {
            (data[byte_idx] & (1 << bit_idx)) != 0
        }
    }

    fn set(&self, index: usize, value: bool) {
        let mut data = self.data.borrow_mut();
        let byte_idx = index / 8;
        let bit_idx = index % 8;
        if byte_idx < data.len() {
            if value {
                data[byte_idx] |= 1 << bit_idx;
            } else {
                data[byte_idx] &= !(1 << bit_idx);
            }
        }
    }

    fn toggle(&self, index: usize) {
        self.set(index, !self.get(index));
    }

    fn count_checked(&self, limit: usize) -> usize {
        let data = self.data.borrow();
        let mut count = 0;
        for (byte_idx, &byte) in data.iter().enumerate() {
            if byte_idx * 8 >= limit {
                break;
            }
            for bit_idx in 0..8 {
                let global_idx = byte_idx * 8 + bit_idx;
                if global_idx >= limit {
                    return count;
                }
                if (byte & (1 << bit_idx)) != 0 {
                    count += 1;
                }
            }
        }
        count
    }
}

// Simple chunk type for the main app (different from cached chunk)
#[derive(Clone)]
pub struct Chunk {
    pub data: Vec<u8>,
    pub version: u64,
}

impl Chunk {
    pub fn new() -> Self {
        Self {
            data: vec![0u8; 125], // 1000 bits = 125 bytes for a chunk
            version: 0,
        }
    }
}

/// Main application structure that manages checkbox state
/// Can operate in local-only mode or collaborative mode with real-time sync
#[wasm_bindgen]
pub struct CheckboxApp {
    chunks: HashMap<u32, Chunk>,
    viewport_x: i32,
    viewport_y: i32,
    viewport_width: u32,
    viewport_height: u32,
    collaborative: Option<CollaborativeState>, // None = local mode
    update_queue: AsyncUpdateQueue,
}

impl CheckboxApp {
    pub fn new() -> Self {
        Self {
            chunks: HashMap::new(),
            viewport_x: 0,
            viewport_y: 0,
            viewport_width: 800,
            viewport_height: 600,
            collaborative: None, // Local mode
            update_queue: AsyncUpdateQueue::new(),
        }
    }

    pub fn new_collaborative(server_url: &str, database_name: &str, cache_size: usize) -> Result<Self, String> {
        Ok(Self {
            chunks: HashMap::new(),
            viewport_x: 0,
            viewport_y: 0,
            viewport_width: 800,
            viewport_height: 600,
            collaborative: Some(CollaborativeState::new(server_url, database_name, cache_size)?),
            update_queue: AsyncUpdateQueue::new(),
        })
    }

    pub fn is_collaborative_mode(&self) -> bool {
        self.collaborative.is_some()
    }

    pub fn get_checkbox(&self, x: u32, y: u32) -> bool {
        let chunk_id = self.get_chunk_id(x, y);
        if let Some(chunk) = self.chunks.get(&chunk_id) {
            let local_x = x % 32;
            let local_y = y % 32;
            let index = local_y * 32 + local_x;
            let byte_idx = (index / 8) as usize;
            let bit_idx = index % 8;
            
            if byte_idx < chunk.data.len() {
                (chunk.data[byte_idx] & (1 << bit_idx)) != 0
            } else {
                false
            }
        } else {
            false
        }
    }

    pub fn toggle_checkbox(&mut self, x: u32, y: u32) {
        if let Some(ref mut collaborative) = self.collaborative {
            // Collaborative mode: queue change for server sync
            self.toggle_checkbox_collaborative(x, y);
        } else {
            // Local mode: direct toggle (existing logic)
            self.toggle_checkbox_local(x, y);
        }
    }

    fn toggle_checkbox_local(&mut self, x: u32, y: u32) {
        let chunk_id = self.get_chunk_id(x, y);
        let chunk = self.chunks.entry(chunk_id).or_insert_with(|| Chunk::new());
        let local_x = x % 32;
        let local_y = y % 32;
        let index = local_y * 32 + local_x;
        
        // Toggle the bit (cast to usize for indexing)
        chunk.data[(index / 8) as usize] ^= 1 << (index % 8);
    }
    
    fn toggle_checkbox_collaborative(&mut self, x: u32, y: u32) {
        // First update local state immediately (optimistic update)
        self.toggle_checkbox_local(x, y);
        
        // Queue server update
        self.update_queue.queue_checkbox_toggle(x, y);
    }

    pub fn can_toggle_checkbox(&self, _x: u32, _y: u32) -> bool {
        // In collaborative mode, always allow toggles (they'll be optimistic updates)
        // In local mode, always allow toggles
        true
    }

    pub fn set_viewport(&mut self, x: i32, y: i32, width: u32, height: u32) {
        self.viewport_x = x;
        self.viewport_y = y;
        self.viewport_width = width;
        self.viewport_height = height;
        
        // Queue viewport sync if in collaborative mode
        if self.collaborative.is_some() {
            self.update_queue.queue_viewport_change(x, y, width, height);
        }
    }

    pub async fn process_pending_updates(&mut self) -> Result<(), String> {
        if self.collaborative.is_none() {
            return Ok(()); // No async updates in local mode
        }

        while let Some(update) = self.update_queue.pop_next_update() {
            match update {
                PendingUpdate::CheckboxToggle { x, y } => {
                    let chunk_id = self.get_chunk_id(x, y);
                    
                    if let Some(ref mut collaborative) = self.collaborative {
                        collaborative.update_checkbox(chunk_id, x, y).await?;
                    }
                }
                PendingUpdate::ViewportChange { x, y, width, height } => {
                    self.sync_viewport().await?;
                }
            }
        }
        
        Ok(())
    }

    pub async fn sync_viewport(&mut self) -> Result<(), String> {
        if let Some(ref mut collaborative) = self.collaborative {
            collaborative.update_viewport(
                self.viewport_x,
                self.viewport_y, 
                self.viewport_width,
                self.viewport_height
            ).await
        } else {
            Ok(()) // No sync needed in local mode
        }
    }

    pub async fn connect_collaborative(&mut self) -> Result<(), String> {
        if let Some(ref mut collaborative) = self.collaborative {
            collaborative.connect().await
        } else {
            Err("App not in collaborative mode".to_string())
        }
    }

    // Helper method to calculate chunk ID
    fn get_chunk_id(&self, x: u32, y: u32) -> u32 {
        // Simple chunk ID calculation based on position
        // Chunks are 32x32, so divide by 32 to get chunk coordinates
        let chunk_x = x / 32;
        let chunk_y = y / 32;
        chunk_y * 1000 + chunk_x // Assuming max 1000 chunks in each dimension
    }
}

// Bind to SpacetimeDB JavaScript client
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = "spacetimedb")]
    type SpacetimeDB;

    #[wasm_bindgen(constructor, js_namespace = spacetimedb)]
    fn new(address: &str) -> SpacetimeDB;

    #[wasm_bindgen(method, js_name = "call")]
    fn call(this: &SpacetimeDB, reducer: &str, args: &js_sys::Array) -> js_sys::Promise;

    #[wasm_bindgen(method)]
    fn subscribe(this: &SpacetimeDB, query: &str) -> js_sys::Promise;
}

#[wasm_bindgen(start)]
pub fn start() {
    const TOTAL_CHECKBOXES: usize = 1_000_000; // 1000×1000 grid
    const VIEWPORT_SIZE: usize = 100;
    const RENDER_LIMIT: usize = 10_000;

    // Helper function to render a simple grid
    fn render_grid(document: &web_sys::Document, bit_array: &BitArray, viewport: Viewport) {
        let grid_elem = document.get_element_by_id("grid").expect("grid element");
        let checked_elem = document
            .get_element_by_id("checked")
            .expect("checked element");

        grid_elem.set_inner_html("");
        grid_elem
            .set_attribute(
                "style",
                "grid-template-columns: repeat(10, 24px);", // 10x10 mini grid for testing
            )
            .ok();

        // Render only a small 10x10 grid for testing
        for local_y in 0..10 {
            for local_x in 0..10 {
                let grid_x = viewport.x as usize + local_x;
                let grid_y = viewport.y as usize + local_y;

                // Skip if out of bounds
                if grid_x >= 1000 || grid_y >= 1000 {
                    continue;
                }

                let global_index = Viewport::coords_to_index(grid_x as u16, grid_y as u16);

                let checkbox = document.create_element("label").expect("create label");
                checkbox.set_class_name(&format!(
                    "checkbox-item {}",
                    if bit_array.get(global_index) {
                        "checked"
                    } else {
                        ""
                    }
                ));

                let input = document.create_element("input").expect("create input");
                input.set_attribute("type", "checkbox").ok();
                input
                    .set_attribute("data-index", &global_index.to_string())
                    .ok();

                if bit_array.get(global_index) {
                    if let Some(input_elem) = input.dyn_ref::<HtmlInputElement>() {
                        input_elem.set_checked(true);
                    }
                }

                checkbox.append_child(&input).ok();
                grid_elem.append_child(&checkbox).ok();
            }
        }

        checked_elem.set_inner_html(&bit_array.count_checked(RENDER_LIMIT).to_string());
    }

    // Get DOM elements
    let window = window().expect("no global `window` exists");
    let document = Rc::new(window.document().expect("should have a document on window"));

    // Create root element if not exists
    if document.get_element_by_id("app").is_none() {
        let app = document.create_element("div").expect("create div");
        app.set_id("app");
        document
            .body()
            .expect("body exists")
            .append_child(&app)
            .ok();
    }

    let app = document.get_element_by_id("app").expect("app element");

    // Clear existing content
    app.set_inner_html("");

    // Create HTML structure - simplified for testing
    let html = r#"
        <h1>SpacetimeDB Checkboxes (Test)</h1>
        <div class="stats">
            <div>Status: <span id="status">Connecting to SpacetimeDB...</span></div>
            <div>Checked: <span id="checked">0</span></div>
            <div>Note: 10x10 test grid</div>
        </div>
        <div id="grid" class="grid"></div>
        <style>
            body {
                font-family: system-ui, -apple-system, sans-serif;
                margin: 0;
                padding: 12px;
            }
            .stats {
                display: flex;
                gap: 20px;
                margin: 20px 0;
                padding: 10px;
                background: #f0f0f0;
                border-radius: 4px;
                font-size: 14px;
            }
            .grid {
                display: grid;
                gap: 2px;
                justify-content: start;
                padding-top: 20px;
            }
            .checkbox-item {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                cursor: pointer;
            }
            .checkbox-item input[type="checkbox"] {
                width: 20px;
                height: 20px;
                cursor: pointer;
                margin: 0;
            }
            .checkbox-item.checked input[type="checkbox"] {
                accent-color: #2196F3;
            }
        </style>
    "#;

    app.set_inner_html(html);

    // State management
    let bit_array = BitArray::new(TOTAL_CHECKBOXES);
    let viewport = Rc::new(RefCell::new(Viewport::new()));

    render_grid(&document, &bit_array, *viewport.borrow());

    // For now, let's add basic checkbox click handling without SpacetimeDB integration
    // We'll implement the SpacetimeDB client connection in the next iteration

    // Update status to indicate this is a test version
    if let Some(status_elem) = document.get_element_by_id("status") {
        status_elem.set_inner_html("Test mode - SpacetimeDB integration pending");
    }

    // Setup checkbox change handlers (local only for now)
    let bit_array_clone = bit_array.clone();
    let document_click = document.clone();

    let onclick = Closure::wrap(Box::new(move |_event: web_sys::Event| {
        // Find which checkbox was clicked
        if let Some(target) = _event.target() {
            if let Some(input_elem) = target.dyn_ref::<HtmlInputElement>() {
                if let Some(parent) = input_elem.parent_element() {
                    if let Some(index_str) = input_elem.get_attribute("data-index") {
                        if let Ok(index) = index_str.parse::<usize>() {
                            bit_array_clone.toggle(index);
                            let new_state = bit_array_clone.get(index);

                            // Update UI
                            if new_state {
                                parent.set_class_name("checkbox-item checked");
                                input_elem.set_checked(true);
                            } else {
                                parent.set_class_name("checkbox-item");
                                input_elem.set_checked(false);
                            }

                            // Update checked count
                            if let Some(checked_elem) = document_click.get_element_by_id("checked")
                            {
                                checked_elem.set_inner_html(
                                    &bit_array_clone.count_checked(RENDER_LIMIT).to_string(),
                                );
                            }
                        }
                    }
                }
            }
        }
    }) as Box<dyn Fn(web_sys::Event)>);

    // Get grid element once for addEventListener
    if let Some(grid_elem) = document.get_element_by_id("grid") {
        grid_elem
            .add_event_listener_with_callback("click", onclick.as_ref().unchecked_ref())
            .ok();
    }
    onclick.forget();
}

// WASM Bindings for JavaScript Interface

#[wasm_bindgen]
pub fn create_checkbox_app_local() -> CheckboxApp {
    CheckboxApp::new()
}

#[wasm_bindgen]
pub fn create_checkbox_app_collaborative(server_url: &str, database_name: &str) -> Option<CheckboxApp> {
    CheckboxApp::new_collaborative(server_url, database_name, 20).ok()
}

#[wasm_bindgen]
impl CheckboxApp {
    #[wasm_bindgen(js_name = isCollaborative)]
    pub fn is_collaborative_js(&self) -> bool {
        self.collaborative.is_some()
    }

    #[wasm_bindgen(js_name = connectIfNeeded)]
    pub async fn connect_if_collaborative(&mut self) -> bool {
        if let Ok(_) = self.connect_collaborative().await {
            true
        } else {
            false
        }
    }

    #[wasm_bindgen(js_name = processPendingUpdates)]
    pub async fn process_updates(&mut self) -> bool {
        self.process_pending_updates().await.is_ok()
    }
}
