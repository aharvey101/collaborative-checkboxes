# Scalable Checkboxes on SpacetimeDB Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time collaborative checkbox grid starting with 1 million checkboxes, scalable to 1 billion, using SpacetimeDB WebSockets.

**Architecture:** Chunked bit array storage in SpacetimeDB backend with Dioxus frontend for rendering and updates.

**Tech Stack:** Rust (SpacetimeDB), JavaScript (Web app), WebSockets.

---

## File Structure

- `Cargo.toml`: Workspace configuration
- `backend/Cargo.toml`: SpacetimeDB module dependencies
- `backend/src/lib.rs`: Schema, reducers, chunk management
- `frontend/index.html`: HTML structure
- `frontend/script.js`: Grid logic and WebSocket
- `frontend/style.css`: CSS for responsive grid
- `docs/superpowers/plans/2026-03-15-checkboxes-spacetimedb-plan.md`: This plan

## Chunk 1: Project Setup

### Task 1: Initialize Cargo Workspace

**Files:**
- Create: `Cargo.toml`
- Create: `backend/Cargo.toml`
- Create: `backend/src/lib.rs`
- Create: `frontend/index.html`
- Create: `frontend/script.js`
- Create: `frontend/style.css`

- [ ] **Step 1: Create workspace Cargo.toml**

```toml
[workspace]
members = ["backend"]
```

- [ ] **Step 2: Create backend Cargo.toml**

```toml
[package]
name = "backend"
version = "0.1.0"
edition = "2021"

[dependencies]
spacetimedb = "latest"
```

- [ ] **Step 3: Create backend/src/lib.rs placeholder**

```rust
// SpacetimeDB module placeholder
```

- [ ] **Step 4: Create frontend/index.html**

```html
<!DOCTYPE html>
<html>
<head><title>Checkboxes</title><link rel="stylesheet" href="style.css"></head>
<body>
<div id="grid"></div>
<script src="script.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create frontend/script.js placeholder**

```javascript
// WebSocket connection and grid logic placeholder
```

- [ ] **Step 6: Create frontend/style.css placeholder**

```css
/* Grid styles */
```

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: add vanilla JS frontend files"
```

### Task 2: Setup SpacetimeDB Backend Schema

**Files:**
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Write failing test for schema**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checkbox_chunks_table_schema() {
        // Test that CheckboxChunks has correct fields
        let chunk = CheckboxChunks {
            chunk_id: 0,
            state: vec![0u8; 125000],
            version: 0,
        };
        assert_eq!(chunk.chunk_id, 0);
        assert_eq!(chunk.state.len(), 125000);
        assert_eq!(chunk.version, 0);
    }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cargo test --manifest-path backend/Cargo.toml`
Expected: FAIL

- [ ] **Step 3: Implement schema**

```rust
use spacetimedb::{spacetimedb, ReducerContext, Table};

#[spacetimedb(table)]
pub struct CheckboxChunks {
    #[primarykey]
    pub chunk_id: u32,
    pub state: Vec<u8>, // 125KB bit array
    pub version: u64,
}
```

- [ ] **Step 4: Run test to verify passes**

Run: `cargo test --manifest-path backend/Cargo.toml`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib.rs
git commit -m "feat: add CheckboxChunks table schema"
```

## Chunk 2: Backend Reducers

### Task 3: Implement Update Reducer

**Files:**
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Write failing test for update reducer**

```rust
#[test]
fn test_update_checkbox_flips_bit() {
    // TODO
}
```

- [ ] **Step 2: Implement reducer**

```rust
#[spacetimedb(reducer)]
pub fn update_checkbox(ctx: ReducerContext, chunk_id: u32, bit_offset: u16, checked: bool) {
    // Update bit in chunk
}
```

- [ ] **Step 3: Run test and commit**

Similar to above.

### Task 4: Implement Add Chunk Reducer

Similar structure.

## Chunk 3: Frontend Grid Rendering

### Task 5: JavaScript Grid Component

**Files:**
- Modify: `frontend/script.js`

- [ ] **Step 1: Write failing test**

// No direct test, but verify in browser

- [ ] **Step 2: Implement responsive grid**

```javascript
// Create grid of checkboxes based on window size
function createGrid() {
    const grid = document.getElementById('grid');
    // Calculate rows/cols, create checkboxes
}
```

- [ ] **Step 3: Run and commit**

## Chunk 4: WebSocket Integration

### Task 6: Connect to SpacetimeDB

- [ ] Subscribe to chunks, handle updates

## Chunk 5: Testing and Optimization

- Performance tests for concurrency