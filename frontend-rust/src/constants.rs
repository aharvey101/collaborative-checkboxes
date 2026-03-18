// Grid configuration: 1000x1000 = 1 million checkboxes
pub const GRID_WIDTH: u32 = 1000;
pub const GRID_HEIGHT: u32 = 1000;
pub const TOTAL_CHECKBOXES: u32 = GRID_WIDTH * GRID_HEIGHT;
pub const CELL_SIZE: f64 = 4.0;

// Zoom bounds
pub const MIN_SCALE: f64 = 0.5;
pub const MAX_SCALE: f64 = 10.0;

// Colors
pub const COLOR_CHECKED: &str = "#2ecc71";
pub const COLOR_UNCHECKED: &str = "#2c3e50";
pub const COLOR_GRID: &str = "#1a1a2e";

// SpacetimeDB
pub const DATABASE_NAME: &str = "checkboxes";
pub const SPACETIMEDB_URI_LOCAL: &str = "ws://127.0.0.1:3000";
pub const SPACETIMEDB_URI_PROD: &str = "wss://maincloud.spacetimedb.com";
