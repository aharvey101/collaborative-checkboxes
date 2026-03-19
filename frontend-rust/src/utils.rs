use crate::constants::{CELL_SIZE, CHUNKS_X, CHUNKS_Y, CHUNK_SIZE, GRID_HEIGHT, GRID_WIDTH};

/// Convert canvas coordinates to grid column/row
/// Returns None if outside grid bounds
pub fn canvas_to_grid(
    mouse_x: f64,
    mouse_y: f64,
    offset_x: f64,
    offset_y: f64,
    scale: f64,
) -> Option<(u32, u32)> {
    let cell_size = CELL_SIZE * scale;
    let col = ((mouse_x - offset_x) / cell_size).floor() as i32;
    let row = ((mouse_y - offset_y) / cell_size).floor() as i32;

    if col >= 0 && col < GRID_WIDTH as i32 && row >= 0 && row < GRID_HEIGHT as i32 {
        Some((col as u32, row as u32))
    } else {
        None
    }
}

/// Calculate chunk_id from global grid coordinates
pub fn grid_to_chunk_id(col: u32, row: u32) -> u32 {
    let chunk_x = col / CHUNK_SIZE;
    let chunk_y = row / CHUNK_SIZE;
    chunk_x + chunk_y * CHUNKS_X
}

/// Calculate local coordinates within a chunk
pub fn grid_to_local(col: u32, row: u32) -> (u32, u32) {
    (col % CHUNK_SIZE, row % CHUNK_SIZE)
}

/// Calculate visible chunk range with buffer
/// Returns (min_chunk_x, min_chunk_y, max_chunk_x, max_chunk_y)
pub fn visible_chunk_range(
    offset_x: f64,
    offset_y: f64,
    scale: f64,
    canvas_w: f64,
    canvas_h: f64,
) -> (u32, u32, u32, u32) {
    let cell_size = CELL_SIZE * scale;

    // Visible grid bounds
    let min_col = ((-offset_x) / cell_size).floor().max(0.0) as u32;
    let min_row = ((-offset_y) / cell_size).floor().max(0.0) as u32;
    let max_col = ((canvas_w - offset_x) / cell_size)
        .ceil()
        .min(GRID_WIDTH as f64 - 1.0) as u32;
    let max_row = ((canvas_h - offset_y) / cell_size)
        .ceil()
        .min(GRID_HEIGHT as f64 - 1.0) as u32;

    // Convert to chunk coordinates with 1-chunk buffer
    let chunk_min_x = (min_col / CHUNK_SIZE).saturating_sub(1);
    let chunk_min_y = (min_row / CHUNK_SIZE).saturating_sub(1);
    let chunk_max_x = ((max_col / CHUNK_SIZE) + 1).min(CHUNKS_X - 1);
    let chunk_max_y = ((max_row / CHUNK_SIZE) + 1).min(CHUNKS_Y - 1);

    (chunk_min_x, chunk_min_y, chunk_max_x, chunk_max_y)
}

/// Get set of chunk IDs in visible range
pub fn visible_chunk_ids(
    offset_x: f64,
    offset_y: f64,
    scale: f64,
    canvas_w: f64,
    canvas_h: f64,
) -> std::collections::HashSet<u32> {
    let (min_cx, min_cy, max_cx, max_cy) =
        visible_chunk_range(offset_x, offset_y, scale, canvas_w, canvas_h);
    let mut chunks = std::collections::HashSet::new();
    for cy in min_cy..=max_cy {
        for cx in min_cx..=max_cx {
            chunks.insert(cx + cy * CHUNKS_X);
        }
    }
    chunks
}
