// SpacetimeDB backend for collaborative checkboxes - v3.0 (with colors)

use spacetimedb::{reducer, table, ReducerContext, SpacetimeType, Table};

/// Chunk size: 1 million checkboxes, 4 bytes each (R, G, B, checked)
const CHUNK_DATA_SIZE: usize = 4_000_000;

/// A single checkbox update for batch operations (with color)
#[derive(SpacetimeType)]
pub struct CheckboxUpdate {
    pub chunk_id: u32,
    pub cell_offset: u32, // Which checkbox in the chunk (0 to 999,999)
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub checked: bool,
}

/// Stores checkbox state in chunks of 1 million checkboxes each  
/// Each chunk = 4MB (1,000,000 checkboxes × 4 bytes per checkbox)
/// Format per checkbox: [R, G, B, checked] where checked is 0x00 or 0xFF
#[table(accessor = checkbox_chunk, public)]
pub struct CheckboxChunk {
    #[primary_key]
    pub chunk_id: u32,
    pub state: Vec<u8>, // 4MB blob for 1M checkboxes with colors
    pub version: u64,   // For tracking updates
}

/// Set a checkbox with color at the given position
fn set_checkbox(data: &mut [u8], cell_index: usize, r: u8, g: u8, b: u8, checked: bool) {
    let byte_idx = cell_index * 4;
    if byte_idx + 3 < data.len() {
        data[byte_idx] = r;
        data[byte_idx + 1] = g;
        data[byte_idx + 2] = b;
        data[byte_idx + 3] = if checked { 0xFF } else { 0x00 };
    }
}

/// Update a single checkbox with color in a chunk
#[reducer]
pub fn update_checkbox(
    ctx: &ReducerContext,
    chunk_id: u32,
    cell_offset: u32,
    r: u8,
    g: u8,
    b: u8,
    checked: bool,
) {
    // Try to find existing chunk by primary key
    if let Some(mut row) = ctx.db.checkbox_chunk().chunk_id().find(chunk_id) {
        set_checkbox(&mut row.state, cell_offset as usize, r, g, b, checked);
        row.version += 1;
        ctx.db.checkbox_chunk().chunk_id().update(row);
        return;
    }

    // If chunk doesn't exist, create it and set the checkbox
    let mut new_chunk = CheckboxChunk {
        chunk_id,
        state: vec![0u8; CHUNK_DATA_SIZE],
        version: 0,
    };
    set_checkbox(&mut new_chunk.state, cell_offset as usize, r, g, b, checked);
    ctx.db.checkbox_chunk().insert(new_chunk);
}

/// Batch update multiple checkboxes at once (with colors)
/// Each update contains chunk_id, cell_offset, RGB color, and checked state
#[reducer]
pub fn batch_update_checkboxes(ctx: &ReducerContext, updates: Vec<CheckboxUpdate>) {
    use std::collections::HashMap;

    // Group updates by chunk_id
    let mut chunk_updates: HashMap<u32, Vec<(u32, u8, u8, u8, bool)>> = HashMap::new();

    for update in updates {
        chunk_updates.entry(update.chunk_id).or_default().push((
            update.cell_offset,
            update.r,
            update.g,
            update.b,
            update.checked,
        ));
    }

    // Apply all updates per chunk
    for (chunk_id, updates) in chunk_updates {
        if let Some(mut row) = ctx.db.checkbox_chunk().chunk_id().find(chunk_id) {
            for (cell_offset, r, g, b, checked) in updates {
                set_checkbox(&mut row.state, cell_offset as usize, r, g, b, checked);
            }
            row.version += 1;
            ctx.db.checkbox_chunk().chunk_id().update(row);
        } else {
            // Create new chunk
            let mut new_chunk = CheckboxChunk {
                chunk_id,
                state: vec![0u8; CHUNK_DATA_SIZE],
                version: 0,
            };
            for (cell_offset, r, g, b, checked) in updates {
                set_checkbox(&mut new_chunk.state, cell_offset as usize, r, g, b, checked);
            }
            ctx.db.checkbox_chunk().insert(new_chunk);
        }
    }
}

/// Add a new chunk for expanding to additional checkboxes
#[reducer]
pub fn add_chunk(ctx: &ReducerContext, chunk_id: u32) {
    let new_chunk = CheckboxChunk {
        chunk_id,
        state: vec![0u8; CHUNK_DATA_SIZE],
        version: 0,
    };
    ctx.db.checkbox_chunk().insert(new_chunk);
}

/// Clear all checkbox data (useful for testing)
#[reducer]
pub fn clear_all_checkboxes(ctx: &ReducerContext) {
    let chunk_ids: Vec<u32> = ctx
        .db
        .checkbox_chunk()
        .iter()
        .map(|row| row.chunk_id)
        .collect();

    for chunk_id in chunk_ids {
        ctx.db.checkbox_chunk().chunk_id().delete(chunk_id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_checkbox() {
        let mut data = vec![0u8; 40]; // 10 checkboxes

        // Set first checkbox to red, checked
        set_checkbox(&mut data, 0, 255, 0, 0, true);
        assert_eq!(data[0], 255); // R
        assert_eq!(data[1], 0); // G
        assert_eq!(data[2], 0); // B
        assert_eq!(data[3], 0xFF); // checked

        // Set second checkbox to green, checked
        set_checkbox(&mut data, 1, 0, 255, 0, true);
        assert_eq!(data[4], 0); // R
        assert_eq!(data[5], 255); // G
        assert_eq!(data[6], 0); // B
        assert_eq!(data[7], 0xFF); // checked

        // Set first checkbox to unchecked (color should still be set)
        set_checkbox(&mut data, 0, 100, 100, 100, false);
        assert_eq!(data[0], 100);
        assert_eq!(data[1], 100);
        assert_eq!(data[2], 100);
        assert_eq!(data[3], 0x00); // unchecked
    }

    #[test]
    fn test_chunk_size() {
        let chunk = CheckboxChunk {
            chunk_id: 0,
            state: vec![0u8; CHUNK_DATA_SIZE],
            version: 0,
        };
        // 4 bytes per checkbox, 1 million checkboxes
        assert_eq!(chunk.state.len(), 4_000_000);
        assert_eq!(chunk.state.len() / 4, 1_000_000);
    }
}
