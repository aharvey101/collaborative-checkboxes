use std::collections::VecDeque;

#[derive(Debug, Clone)]
pub enum PendingUpdate {
    CheckboxToggle {
        x: u32,
        y: u32,
    },
    ViewportChange {
        x: i32,
        y: i32,
        width: u32,
        height: u32,
    },
}

pub struct AsyncUpdateQueue {
    pending_updates: VecDeque<PendingUpdate>,
}

impl AsyncUpdateQueue {
    pub fn new() -> Self {
        Self {
            pending_updates: VecDeque::new(),
        }
    }

    pub fn pending_count(&self) -> usize {
        self.pending_updates.len()
    }

    pub fn queue_checkbox_toggle(&mut self, x: u32, y: u32) {
        self.pending_updates
            .push_back(PendingUpdate::CheckboxToggle { x, y });
    }

    pub fn queue_viewport_change(&mut self, x: i32, y: i32, width: u32, height: u32) {
        self.pending_updates
            .push_back(PendingUpdate::ViewportChange {
                x,
                y,
                width,
                height,
            });
    }

    pub fn pop_next_update(&mut self) -> Option<PendingUpdate> {
        self.pending_updates.pop_front()
    }

    pub fn clear(&mut self) {
        self.pending_updates.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_update_queue_creation() {
        let queue = AsyncUpdateQueue::new();
        assert_eq!(queue.pending_count(), 0);
    }

    #[test]
    fn test_queuing_checkbox_updates() {
        let mut queue = AsyncUpdateQueue::new();
        queue.queue_checkbox_toggle(5, 10);
        queue.queue_checkbox_toggle(15, 20);

        assert_eq!(queue.pending_count(), 2);
    }
}
