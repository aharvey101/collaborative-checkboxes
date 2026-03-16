use crate::chunk_cache::ChunkCache;
use crate::{ConnectionState, SpacetimeDBClient};
use crate::subscription_manager::SubscriptionManager;

pub struct CollaborativeState {
    client: SpacetimeDBClient,
    cache: ChunkCache,
    subscriptions: SubscriptionManager,
    is_connected: bool,
}

impl CollaborativeState {
    pub fn new(server_url: &str, database_name: &str, cache_size: usize) -> Result<Self, String> {
        Ok(Self {
            client: SpacetimeDBClient::new(server_url, database_name)?,
            cache: ChunkCache::new(cache_size),
            subscriptions: SubscriptionManager::new(),
            is_connected: false,
        })
    }

    pub fn cache_size(&self) -> usize {
        self.cache.len()
    }

    pub fn cache_chunk(&mut self, chunk_id: u32, data: Vec<u8>, version: u64) {
        let _ = self.cache.insert_with_version(chunk_id, data, version);
    }

    pub async fn connect(&mut self) -> Result<(), String> {
        match self.client.connect().await {
            Ok(_) => {
                self.is_connected = true;
                // Subscribe to chunk table for real-time updates
                self.client.subscribe_to_table("chunks").await?;
                Ok(())
            }
            Err(e) => {
                self.is_connected = false;
                Err(e)
            }
        }
    }

    pub fn is_connected(&self) -> bool {
        self.is_connected && self.client.connection_state() == ConnectionState::Connected
    }

    pub async fn update_viewport(&mut self, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
        if !self.is_connected() {
            return Err("Not connected to server".to_string());
        }

        let (to_subscribe, to_unsubscribe) = self.subscriptions.update_viewport_subscriptions(x, y, width, height);
        
        // Request new chunks from server
        for chunk_id in to_subscribe {
            // Call reducer to get chunk data
            let chunk_id_str = chunk_id.to_string();
            self.client.call_reducer("get_chunk", &[&chunk_id_str]).await?;
        }
        
        // Clean up old chunks from cache (optional - LRU will handle this)
        for _chunk_id in to_unsubscribe {
            // Could explicitly remove from cache here, but LRU eviction handles this
        }
        
        Ok(())
    }

    pub async fn update_checkbox(&mut self, chunk_id: u32, x: u32, y: u32) -> Result<(), String> {
        if !self.is_connected() {
            return Err("Not connected to server".to_string());
        }

        let chunk_id_str = chunk_id.to_string();
        let x_str = x.to_string();
        let y_str = y.to_string();
        
        self.client.call_reducer("update_checkbox", &[&chunk_id_str, &x_str, &y_str]).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collaborative_state_creation() {
        let state = CollaborativeState::new("http://localhost:3000", "checkboxes", 10);
        assert!(state.is_ok());
    }

    #[test]
    fn test_chunk_cache_integration() {
        let mut state = CollaborativeState::new("http://localhost:3000", "checkboxes", 3).unwrap();

        // Should start with empty cache
        assert_eq!(state.cache_size(), 0);

        // Mock adding a chunk to cache
        let chunk_data = vec![1u8, 0u8, 1u8]; // Sample checkbox data
        state.cache_chunk(0, chunk_data.clone(), 1);
        assert_eq!(state.cache_size(), 1);
    }
}
