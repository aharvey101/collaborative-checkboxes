// SpacetimeDB backend for Infinite Drawing

use spacetimedb::{reducer, table, ReducerContext, SpacetimeType, Table};

/// Chunk size: 1 million pixels per chunk (1000x1000)
const CHUNK_DATA_SIZE: usize = 4_000_000; // 4 bytes per pixel (R, G, B, checked)

/// A single pixel update for batch operations
#[derive(SpacetimeType)]
pub struct PixelUpdate {
    pub chunk_id: i64,
    pub cell_offset: u32,
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub checked: bool,
}

/// Stores full pixel state per chunk. Each chunk is 1000x1000 pixels.
/// State is a 4MB RGBA blob. Subscribers receive updates via SpacetimeDB.
#[table(accessor = chunk, public)]
pub struct Chunk {
    #[primary_key]
    pub chunk_id: i64,
    pub state: Vec<u8>,
    pub version: u64,
}

/// Set a pixel at the given position
fn set_pixel(data: &mut [u8], cell_index: usize, r: u8, g: u8, b: u8, checked: bool) {
    let byte_idx = cell_index * 4;
    if byte_idx + 3 < data.len() {
        data[byte_idx] = r;
        data[byte_idx + 1] = g;
        data[byte_idx + 2] = b;
        data[byte_idx + 3] = if checked { 0xFF } else { 0x00 };
    }
}

/// Update a single pixel
#[reducer]
pub fn update_pixel(
    ctx: &ReducerContext,
    chunk_id: i64,
    cell_offset: u32,
    r: u8,
    g: u8,
    b: u8,
    checked: bool,
) {
    if let Some(mut row) = ctx.db.chunk().chunk_id().find(chunk_id) {
        set_pixel(&mut row.state, cell_offset as usize, r, g, b, checked);
        row.version += 1;
        ctx.db.chunk().chunk_id().update(row);
    } else {
        let mut state = vec![0u8; CHUNK_DATA_SIZE];
        set_pixel(&mut state, cell_offset as usize, r, g, b, checked);
        ctx.db.chunk().insert(Chunk {
            chunk_id,
            state,
            version: 1,
        });
    }
}

/// Batch update multiple pixels at once
#[reducer]
pub fn batch_update(ctx: &ReducerContext, updates: Vec<PixelUpdate>) {
    use std::collections::HashMap;

    let mut by_chunk: HashMap<i64, Vec<(u32, u8, u8, u8, bool)>> = HashMap::new();
    for u in updates {
        by_chunk.entry(u.chunk_id).or_default().push((u.cell_offset, u.r, u.g, u.b, u.checked));
    }

    for (chunk_id, pixels) in by_chunk {
        if let Some(mut row) = ctx.db.chunk().chunk_id().find(chunk_id) {
            for (offset, r, g, b, checked) in pixels {
                set_pixel(&mut row.state, offset as usize, r, g, b, checked);
            }
            row.version += 1;
            ctx.db.chunk().chunk_id().update(row);
        } else {
            let mut state = vec![0u8; CHUNK_DATA_SIZE];
            for (offset, r, g, b, checked) in pixels {
                set_pixel(&mut state, offset as usize, r, g, b, checked);
            }
            ctx.db.chunk().insert(Chunk {
                chunk_id,
                state,
                version: 1,
            });
        }
    }
}

/// Clear all data
#[reducer]
pub fn clear_all(ctx: &ReducerContext) {
    let ids: Vec<i64> = ctx.db.chunk().iter().map(|r| r.chunk_id).collect();
    for id in ids {
        ctx.db.chunk().chunk_id().delete(id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_pixel() {
        let mut data = vec![0u8; 40];
        set_pixel(&mut data, 0, 255, 0, 0, true);
        assert_eq!(data[0], 255);
        assert_eq!(data[3], 0xFF);

        set_pixel(&mut data, 1, 0, 255, 0, true);
        assert_eq!(data[4], 0);
        assert_eq!(data[5], 255);
        assert_eq!(data[7], 0xFF);

        set_pixel(&mut data, 0, 100, 100, 100, false);
        assert_eq!(data[0], 100);
        assert_eq!(data[3], 0x00);
    }
}
