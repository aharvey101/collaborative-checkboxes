use std::collections::HashSet;

pub struct SubscriptionManager {
    active_chunks: HashSet<u32>,
    chunk_size: u32, // Size of each chunk in pixels
}

impl SubscriptionManager {
    pub fn new() -> Self {
        Self {
            active_chunks: HashSet::new(),
            chunk_size: 32, // Default 32x32 pixel chunks
        }
    }

    pub fn active_subscriptions(&self) -> &HashSet<u32> {
        &self.active_chunks
    }

    pub fn is_subscribed_to_chunk(&self, chunk_id: u32) -> bool {
        self.active_chunks.contains(&chunk_id)
    }

    pub fn subscribe_to_chunks(&mut self, chunk_ids: &[u32]) {
        for &chunk_id in chunk_ids {
            self.active_chunks.insert(chunk_id);
        }
    }

    pub fn unsubscribe_from_chunk(&mut self, chunk_id: u32) {
        self.active_chunks.remove(&chunk_id);
    }

    pub fn calculate_viewport_chunks(
        &self,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
        chunk_size: u32,
    ) -> Vec<u32> {
        let mut chunks = Vec::new();

        // Calculate chunk boundaries for the viewport
        let start_chunk_x = (x / chunk_size as i32).max(0) as u32;
        let start_chunk_y = (y / chunk_size as i32).max(0) as u32;
        let end_chunk_x = ((x + width as i32) / chunk_size as i32).max(0) as u32;
        let end_chunk_y = ((y + height as i32) / chunk_size as i32).max(0) as u32;

        // Add chunks covering the viewport
        for chunk_y in start_chunk_y..=end_chunk_y {
            for chunk_x in start_chunk_x..=end_chunk_x {
                let chunk_id = chunk_y * 1000 + chunk_x; // Simple ID scheme
                chunks.push(chunk_id);
            }
        }

        chunks
    }

    pub fn update_viewport_subscriptions(
        &mut self,
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    ) -> (Vec<u32>, Vec<u32>) {
        let new_chunks = self.calculate_viewport_chunks(x, y, width, height, self.chunk_size);
        let new_chunks_set: HashSet<u32> = new_chunks.iter().cloned().collect();

        // Find chunks to subscribe to (new ones)
        let to_subscribe: Vec<u32> = new_chunks_set
            .difference(&self.active_chunks)
            .cloned()
            .collect();

        // Find chunks to unsubscribe from (old ones not in viewport)
        let to_unsubscribe: Vec<u32> = self
            .active_chunks
            .difference(&new_chunks_set)
            .cloned()
            .collect();

        // Update active subscriptions
        self.active_chunks = new_chunks_set;

        (to_subscribe, to_unsubscribe)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_subscription_manager_creation() {
        let manager = SubscriptionManager::new();
        assert_eq!(manager.active_subscriptions().len(), 0);
        assert!(!manager.is_subscribed_to_chunk(0));
    }

    #[test]
    fn test_viewport_calculation() {
        let manager = SubscriptionManager::new();
        let chunks = manager.calculate_viewport_chunks(0, 0, 200, 200, 32);

        // Should include chunks covering 200x200 area at origin with 32x32 chunks
        assert!(chunks.contains(&0)); // Top-left chunk
        assert!(chunks.len() > 1); // Multiple chunks for 200x200 area
    }

    #[test]
    fn test_subscription_tracking() {
        let mut manager = SubscriptionManager::new();
        let chunks = vec![0, 1, 2];

        manager.subscribe_to_chunks(&chunks);
        assert!(manager.is_subscribed_to_chunk(0));
        assert!(manager.is_subscribed_to_chunk(1));
        assert!(!manager.is_subscribed_to_chunk(3));

        manager.unsubscribe_from_chunk(1);
        assert!(!manager.is_subscribed_to_chunk(1));
    }
}
