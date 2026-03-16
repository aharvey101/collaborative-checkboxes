// SpacetimeDB backend for scalable checkboxes

use spacetimedb::spacetimedb;

/// Stores checkbox state in chunks of 1 million checkboxes each  
/// Each chunk = 125KB (1,000,000 bits / 8 bytes per bit)
#[spacetimedb(table)]
pub struct CheckboxChunk {
    #[primarykey]
    pub chunk_id: u32,
    pub state: Vec<u8>, // 125KB blob for 1M checkboxes
    pub version: u64,   // For tracking updates
}

/// Set a bit at the given position in a byte vector
fn set_bit(data: &mut [u8], bit_index: usize, value: bool) {
    let byte_idx = bit_index / 8;
    let bit_idx = bit_index % 8;

    if byte_idx < data.len() {
        if value {
            data[byte_idx] |= 1 << bit_idx;
        } else {
            data[byte_idx] &= !(1 << bit_idx);
        }
    }
}

/// Update a single checkbox bit in a chunk
#[spacetimedb(reducer)]
pub fn update_checkbox(chunk_id: u32, bit_offset: u16, checked: bool) {
    // Try to find existing chunk by iterating through all chunks
    for row in CheckboxChunk::iter() {
        if row.chunk_id == chunk_id {
            let mut chunk = row;
            // Set the bit
            set_bit(&mut chunk.state, bit_offset as usize, checked);
            chunk.version += 1;
            CheckboxChunk::update_by_chunk_id(&chunk_id, chunk);
            return;
        }
    }

    // If chunk doesn't exist, create it and set the bit
    let mut new_chunk = CheckboxChunk {
        chunk_id,
        state: vec![0u8; 125_000],
        version: 0,
    };
    set_bit(&mut new_chunk.state, bit_offset as usize, checked);
    CheckboxChunk::insert(new_chunk);
}

/// Add a new chunk for expanding to additional checkboxes
#[spacetimedb(reducer)]
pub fn add_chunk(chunk_id: u32) {
    // Initialize a new chunk with 125KB (1M bits) of zeros
    let new_chunk = CheckboxChunk {
        chunk_id,
        state: vec![0u8; 125_000], // 1,000,000 bits / 8
        version: 0,
    };
    CheckboxChunk::insert(new_chunk);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_bit() {
        let mut data = vec![0u8; 10];

        // Test setting and getting bits
        set_bit(&mut data, 0, true);
        assert_eq!(data[0] & 1, 1);

        set_bit(&mut data, 7, true);
        assert_eq!(data[0] & 0b10000000, 0b10000000);

        set_bit(&mut data, 8, true);
        assert_eq!(data[1] & 1, 1);

        // Test toggling
        set_bit(&mut data, 0, false);
        assert_eq!(data[0] & 1, 0);
    }
}
