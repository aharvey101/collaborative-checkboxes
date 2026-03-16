use std::collections::HashMap;

#[derive(Clone)]
pub struct CachedChunk {
    pub data: Vec<u8>,
    pub version: u64,
    pub last_accessed: u64, // Timestamp for LRU
}

pub struct ChunkCache {
    chunks: HashMap<u32, CachedChunk>,
    max_size: usize,
    next_timestamp: u64,
}

impl ChunkCache {
    pub fn new(max_size: usize) -> Self {
        Self {
            chunks: HashMap::new(),
            max_size,
            next_timestamp: 0,
        }
    }

    pub fn len(&self) -> usize {
        self.chunks.len()
    }

    pub fn capacity(&self) -> usize {
        self.max_size
    }

    pub fn insert(&mut self, chunk_id: u32, data: Vec<u8>) -> Result<(), String> {
        if data.is_empty() {
            return Err("Cannot insert empty chunk data".to_string());
        }
        self.insert_with_version(chunk_id, data, 0)
    }

    pub fn insert_with_version(
        &mut self,
        chunk_id: u32,
        data: Vec<u8>,
        version: u64,
    ) -> Result<(), String> {
        if data.is_empty() {
            return Err("Cannot insert empty chunk data".to_string());
        }

        // Evict if at capacity (only if this is a new chunk)
        if !self.chunks.contains_key(&chunk_id) && self.chunks.len() >= self.max_size {
            // Find the chunk with the oldest timestamp (minimum last_accessed)
            let oldest_id = self
                .chunks
                .iter()
                .min_by_key(|(_, chunk)| chunk.last_accessed)
                .map(|(id, _)| *id);

            if let Some(oldest_id) = oldest_id {
                self.chunks.remove(&oldest_id);
            }
        }

        // Insert or update chunk
        let chunk = CachedChunk {
            data,
            version,
            last_accessed: self.next_timestamp,
        };

        self.chunks.insert(chunk_id, chunk);
        self.next_timestamp += 1;
        Ok(())
    }

    pub fn get(&mut self, chunk_id: &u32) -> Option<&Vec<u8>> {
        if let Some(chunk) = self.chunks.get_mut(chunk_id) {
            // Update timestamp for LRU - O(1) operation
            chunk.last_accessed = self.next_timestamp;
            self.next_timestamp += 1;
            Some(&chunk.data)
        } else {
            None
        }
    }

    pub fn get_version(&self, chunk_id: &u32) -> Option<u64> {
        self.chunks.get(chunk_id).map(|chunk| chunk.version)
    }

    pub fn update_chunk(
        &mut self,
        chunk_id: u32,
        data: Vec<u8>,
        version: u64,
    ) -> Result<(), String> {
        if self.chunks.contains_key(&chunk_id) {
            self.insert_with_version(chunk_id, data, version)
        } else {
            Err(format!("Chunk {} not found for update", chunk_id))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_creation() {
        let cache = ChunkCache::new(3); // Max 3 chunks
        assert_eq!(cache.len(), 0);
        assert_eq!(cache.capacity(), 3);
    }

    #[test]
    fn test_cache_insert_and_get() {
        let mut cache = ChunkCache::new(2);
        let chunk_data = vec![1u8, 2u8, 255u8]; // Test data, not empty

        assert!(cache.insert(0, chunk_data.clone()).is_ok());
        assert_eq!(cache.get(&0), Some(&chunk_data));
        assert_eq!(cache.get(&1), None);
    }

    #[test]
    fn test_cache_validation() {
        let mut cache = ChunkCache::new(2);
        let empty_data = vec![];

        assert!(cache.insert(0, empty_data).is_err());
    }

    #[test]
    fn test_lru_eviction() {
        let mut cache = ChunkCache::new(2);

        assert!(cache.insert(0, vec![0u8, 1u8]).is_ok());
        assert!(cache.insert(1, vec![1u8, 2u8]).is_ok());
        assert!(cache.insert(2, vec![2u8, 3u8]).is_ok()); // Should evict chunk 0

        assert_eq!(cache.get(&0), None); // Evicted
        assert_eq!(cache.get(&1), Some(&vec![1u8, 2u8]));
        assert_eq!(cache.get(&2), Some(&vec![2u8, 3u8]));
    }

    #[test]
    fn test_lru_access_order() {
        let mut cache = ChunkCache::new(2);

        // Insert two chunks
        assert!(cache.insert(0, vec![0u8, 1u8]).is_ok());
        assert!(cache.insert(1, vec![1u8, 2u8]).is_ok());

        // Access chunk 0, making it more recently used
        assert_eq!(cache.get(&0), Some(&vec![0u8, 1u8]));

        // Insert new chunk - should evict chunk 1 (least recently used)
        assert!(cache.insert(2, vec![2u8, 3u8]).is_ok());

        assert_eq!(cache.get(&0), Some(&vec![0u8, 1u8])); // Should still be present
        assert_eq!(cache.get(&1), None); // Should be evicted
        assert_eq!(cache.get(&2), Some(&vec![2u8, 3u8])); // Should be present
    }
}
