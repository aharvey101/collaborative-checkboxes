# Billion Checkboxes Design

Scale the collaborative checkboxes app from 1 million to 1 billion checkboxes using chunked lazy-loading.

## Summary

- **Grid:** 40,000 × 25,000 = 1,000,000,000 checkboxes
- **Chunks:** 40 × 25 = 1,000 chunks, each 1,000 × 1,000 (1M checkboxes, 125KB)
- **Loading:** Viewport + 1-chunk buffer, on-demand chunk creation
- **Count display:** Removed (no aggregation overhead)
- **Rendering:** Per-chunk texture rendering (multiple draw calls)

## Grid Layout

| Property | Value |
|----------|-------|
| Grid width | 40,000 cells |
| Grid height | 25,000 cells |
| Total checkboxes | 1,000,000,000 |
| Chunk dimensions | 1,000 × 1,000 |
| Chunks horizontally | 40 |
| Chunks vertically | 25 |
| Total chunks | 1,000 |
| Chunk size (bytes) | 125,000 (125KB) |
| Max total storage | 125MB |

## Frontend Changes

### Constants (`frontend-rust/src/constants.rs`)

Update existing constants file:

```rust
// Grid configuration: 40,000 x 25,000 = 1 billion checkboxes
pub const GRID_WIDTH: u32 = 40_000;
pub const GRID_HEIGHT: u32 = 25_000;
pub const TOTAL_CHECKBOXES: u64 = GRID_WIDTH as u64 * GRID_HEIGHT as u64;

// Chunk configuration
pub const CHUNK_SIZE: u32 = 1_000;  // 1000x1000 checkboxes per chunk
pub const CHUNKS_X: u32 = 40;       // GRID_WIDTH / CHUNK_SIZE
pub const CHUNKS_Y: u32 = 25;       // GRID_HEIGHT / CHUNK_SIZE
pub const TOTAL_CHUNKS: u32 = CHUNKS_X * CHUNKS_Y;  // 1000
```

### State (`frontend-rust/src/state.rs`)

Replace single chunk with multi-chunk tracking:

```rust
// Remove these fields:
pub chunk_data: RwSignal<Vec<u8>>,
pub checked_count: RwSignal<u32>,

// Add these fields:
pub loaded_chunks: RwSignal<HashMap<u32, Vec<u8>>>,  // chunk_id -> data
pub loading_chunks: RwSignal<HashSet<u32>>,          // chunks currently being fetched
pub subscribed_chunks: RwSignal<HashSet<u32>>,       // chunks with active subscriptions
```

### Header Component (`frontend-rust/src/components/header.rs`)

Remove checked count display. Update title and stats:

```rust
// Change title from "1 Million Checkboxes" to "1 Billion Checkboxes"
// Remove checked_count from stats_text
// Keep: Zoom level, pan/zoom instructions
```

### Chunk Coordinate System

```
chunk_id = chunk_x + chunk_y * CHUNKS_X

Where:
  chunk_x = global_col / CHUNK_SIZE
  chunk_y = global_row / CHUNK_SIZE
  
Local coordinates within chunk:
  local_col = global_col % CHUNK_SIZE
  local_row = global_row % CHUNK_SIZE
  bit_offset = local_row * CHUNK_SIZE + local_col
```

### Visible Chunk Calculation (`frontend-rust/src/utils.rs`)

Add new function:

```rust
fn visible_chunk_range(
    offset_x: f64, offset_y: f64, 
    scale: f64, 
    canvas_w: f64, canvas_h: f64
) -> (u32, u32, u32, u32) {
    let cell_size = CELL_SIZE * scale;
    
    // Visible grid bounds
    let min_col = ((-offset_x) / cell_size).floor().max(0.0) as u32;
    let min_row = ((-offset_y) / cell_size).floor().max(0.0) as u32;
    let max_col = ((canvas_w - offset_x) / cell_size).ceil().min(GRID_WIDTH as f64) as u32;
    let max_row = ((canvas_h - offset_y) / cell_size).ceil().min(GRID_HEIGHT as f64) as u32;
    
    // Convert to chunk coordinates with 1-chunk buffer
    let chunk_min_x = (min_col / CHUNK_SIZE).saturating_sub(1);
    let chunk_min_y = (min_row / CHUNK_SIZE).saturating_sub(1);
    let chunk_max_x = ((max_col / CHUNK_SIZE) + 1).min(CHUNKS_X - 1);
    let chunk_max_y = ((max_row / CHUNK_SIZE) + 1).min(CHUNKS_Y - 1);
    
    (chunk_min_x, chunk_min_y, chunk_max_x, chunk_max_y)
}
```

### Chunk Subscription Management (`frontend-rust/src/db.rs`)

Add chunk subscription manager using existing SpacetimeDB patterns:

```rust
/// Subscribe to a specific chunk
pub fn subscribe_chunk(client: &SharedClient, chunk_id: u32) {
    let query = format!("SELECT * FROM checkbox_chunk WHERE chunk_id = {}", chunk_id);
    // Use existing subscribe() function from ws_client
    subscribe(client, &[&query]);
}

/// Unsubscribe from a chunk (remove from local state, stop tracking)
pub fn unsubscribe_chunk(state: AppState, chunk_id: u32) {
    state.loaded_chunks.update(|chunks| { chunks.remove(&chunk_id); });
    state.subscribed_chunks.update(|subs| { subs.remove(&chunk_id); });
}

/// Update subscriptions based on visible range
pub fn update_chunk_subscriptions(
    client: &SharedClient,
    state: AppState,
    visible_chunks: HashSet<u32>,
) {
    let current_subs = state.subscribed_chunks.get_untracked();
    
    // Subscribe to newly visible chunks
    for chunk_id in visible_chunks.difference(&current_subs) {
        if !state.loading_chunks.get_untracked().contains(chunk_id) {
            state.loading_chunks.update(|loading| { loading.insert(*chunk_id); });
            subscribe_chunk(client, *chunk_id);
        }
    }
    
    // Unsubscribe from chunks no longer visible
    for chunk_id in current_subs.difference(&visible_chunks) {
        unsubscribe_chunk(state, *chunk_id);
    }
}
```

**SpacetimeDB callback handling:** Update existing `on_chunk_insert` and `on_chunk_update` callbacks to handle any chunk_id (not just 0).

### WebGL Renderer Changes (`frontend-rust/src/webgl.rs`)

Render each visible chunk separately (multiple draw calls per frame):

```rust
pub fn render(
    &self,
    canvas: &HtmlCanvasElement,
    loaded_chunks: &HashMap<u32, Vec<u8>>,
    offset_x: f64,
    offset_y: f64,
    scale: f64,
) {
    // Clear entire canvas with grid background color
    self.gl.clear_color(...);
    self.gl.clear(GL::COLOR_BUFFER_BIT);
    
    // Calculate visible chunk range
    let (min_cx, min_cy, max_cx, max_cy) = visible_chunk_range(...);
    
    // Render each loaded chunk
    for cy in min_cy..=max_cy {
        for cx in min_cx..=max_cx {
            let chunk_id = cx + cy * CHUNKS_X;
            if let Some(chunk_data) = loaded_chunks.get(&chunk_id) {
                self.render_chunk(canvas, chunk_id, chunk_data, offset_x, offset_y, scale);
            }
            // Unloaded chunks: background color already cleared, nothing to do
        }
    }
}

fn render_chunk(
    &self,
    canvas: &HtmlCanvasElement,
    chunk_id: u32,
    chunk_data: &[u8],
    offset_x: f64,
    offset_y: f64,
    scale: f64,
) {
    // Calculate chunk's world position
    let chunk_x = chunk_id % CHUNKS_X;
    let chunk_y = chunk_id / CHUNKS_X;
    let chunk_offset_x = offset_x + (chunk_x * CHUNK_SIZE) as f64 * CELL_SIZE * scale;
    let chunk_offset_y = offset_y + (chunk_y * CHUNK_SIZE) as f64 * CELL_SIZE * scale;
    
    // Upload chunk texture and render with adjusted uniforms
    self.upload_texture(chunk_data);
    self.gl.uniform2f(Some(&self.u_offset), chunk_offset_x as f32, chunk_offset_y as f32);
    self.gl.draw_arrays(GL::TRIANGLES, 0, 6);
}
```

### Click Handling (`frontend-rust/src/components/canvas.rs`)

Update click handler to compute chunk coordinates:

```rust
fn on_click(global_col: u32, global_row: u32, state: AppState) {
    let chunk_x = global_col / CHUNK_SIZE;
    let chunk_y = global_row / CHUNK_SIZE;
    let chunk_id = chunk_x + chunk_y * CHUNKS_X;
    
    let local_col = global_col % CHUNK_SIZE;
    let local_row = global_row % CHUNK_SIZE;
    let bit_offset = local_row * CHUNK_SIZE + local_col;
    
    // Get current value from loaded chunk (or assume unchecked if not loaded)
    let current_value = state.loaded_chunks.with_untracked(|chunks| {
        chunks.get(&chunk_id).map(|data| get_bit(data, bit_offset as usize)).unwrap_or(false)
    });
    let new_value = !current_value;
    
    // Optimistic local update
    state.loaded_chunks.update(|chunks| {
        if let Some(data) = chunks.get_mut(&chunk_id) {
            set_bit(data, bit_offset as usize, new_value);
        }
    });
    
    // Immediate visual feedback
    render_cell_immediate(...);
    
    // Send to server using existing reducer signature
    // update_checkbox(ctx, chunk_id: u32, bit_offset: u32, checked: bool)
    call_reducer_update_checkbox(chunk_id, bit_offset, new_value);
}
```

## Backend Changes

### Schema

No changes needed. Existing `CheckboxChunk` table and `update_checkbox` reducer already support any `chunk_id` value:

```rust
// backend/src/lib.rs - existing code handles this correctly:
#[reducer]
pub fn update_checkbox(ctx: &ReducerContext, chunk_id: u32, bit_offset: u32, checked: bool) {
    // Finds existing chunk OR creates new one - works for any chunk_id
    if let Some(mut row) = ctx.db.checkbox_chunk().chunk_id().find(chunk_id) {
        // Update existing
    } else {
        // Create new chunk with this chunk_id
    }
}
```

Verified: No hardcoded assumptions about chunk 0.

## Files to Modify

| File | Changes |
|------|---------|
| `frontend-rust/src/constants.rs` | Update grid dimensions, add chunk constants |
| `frontend-rust/src/state.rs` | Replace `chunk_data`/`checked_count` with multi-chunk state |
| `frontend-rust/src/components/header.rs` | Remove count display, update title |
| `frontend-rust/src/utils.rs` | Add `visible_chunk_range()` function |
| `frontend-rust/src/db.rs` | Add chunk subscription management, update callbacks |
| `frontend-rust/src/webgl.rs` | Multi-chunk rendering with per-chunk draw calls |
| `frontend-rust/src/components/canvas.rs` | Update click handler for chunk coordinates |

## Migration

No data migration needed:
- Existing chunk 0 contains the original 1M checkboxes (top-left of grid)
- Grid expands to include new chunk coordinates
- Empty chunks created on-demand when users explore new areas

## Performance Considerations

### Memory

- Each loaded chunk: 125KB
- Typical viewport: 4-12 chunks visible
- With 1-chunk buffer: ~500KB - 1.5MB in memory
- Well within browser limits

### Network

- Initial load: 1-4 chunks (~125-500KB)
- Panning: subscribe/unsubscribe as chunks enter/leave viewport
- Chunk updates: only subscribed chunks receive real-time updates

### Rendering

- WebGL renders only loaded chunks in visible range
- Per-chunk draw calls (4-12 per frame typical)
- Unloaded areas show as grid background color
- Immediate cell rendering unchanged
