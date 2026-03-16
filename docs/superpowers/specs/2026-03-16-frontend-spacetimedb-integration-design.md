# Frontend SpacetimeDB 2.0 Integration Design
*Created: 2026-03-16*

## Overview

Transform the existing WASM frontend from local-only test mode to a fully collaborative real-time application using SpacetimeDB 2.0 Rust client, while preserving all existing performance optimizations for the 1 million checkbox grid.

## Goals

- **Multi-user collaborative**: Users see each other's checkbox changes in real-time
- **Performance-focused**: Smart viewport filtering and chunk caching for scalability  
- **Pure Rust/WASM**: Use SpacetimeDB Rust client compiled to WASM for maximum speed
- **Memory efficient**: LRU chunk cache to handle large grid without memory bloat

## Architecture

### Core Components

**1. SpacetimeDB Client Integration**
- Upgrade `spacetimedb` dependency from 1.0 to 2.0 in frontend Cargo.toml
- Replace placeholder SpacetimeDB bindings with real client connection
- Initialize connection to `http://localhost:3000` (working SpacetimeDB 2.0 server)
- Handle connection states: connecting, connected, disconnected, error

**2. Viewport-Aware Chunk Subscription System**
- Calculate which chunks intersect with current viewport (100×100 visible area)
- Subscribe only to relevant chunks using SpacetimeDB subscriptions
- Dynamically add/remove subscriptions as viewport moves
- Handle chunk boundaries intelligently (viewport might span multiple chunks)

**3. Smart Chunk Cache with LRU Eviction**
- Maintain in-memory cache of loaded chunks (BitArray data)
- Implement LRU eviction when cache exceeds limit (e.g., 10 chunks = ~1.25MB)
- Keep frequently accessed chunks in memory
- Lazy load chunks on-demand when viewport enters new areas

**4. Real-time Collaborative Updates**
- Connect checkbox clicks to SpacetimeDB `update_checkbox` reducer calls
- Handle real-time updates from other users via SpacetimeDB subscriptions
- Update local BitArray cache when remote changes arrive
- Re-render affected viewport areas when changes occur

## Data Flow

### Connection & Initialization
```
App Start → Connect to SpacetimeDB → Subscribe to initial viewport chunks → Render grid
```

### User Interaction Flow
```
User clicks checkbox → Update local cache → Call SpacetimeDB reducer → Receive confirmation → Update UI state
```

### Remote Update Flow
```
Other user changes checkbox → SpacetimeDB subscription event → Update local cache → Re-render affected cells
```

### Viewport Change Flow
```
User pans/scrolls → Calculate new chunk requirements → Subscribe to new chunks → Unsubscribe from old chunks → Update cache
```

## Technical Implementation

### Chunk Subscription Logic
- Each chunk covers a specific coordinate range in the 1000×1000 grid
- Viewport (100×100) typically spans 1-4 chunks depending on position
- Subscribe with SQL queries like: `SELECT * FROM checkbox_chunk WHERE chunk_id IN (0,1,2,3)`
- Handle subscription lifecycle: add when entering range, remove when leaving

### Cache Management
- Maintain `HashMap<u32, CachedChunk>` where key is chunk_id
- `CachedChunk` contains: BitArray data, last_accessed timestamp, version number
- LRU eviction: remove least recently accessed chunks when cache size exceeds limit
- Cache coherency: update cached chunks when SpacetimeDB events arrive

### Performance Optimizations
- Debounce subscription changes (don't thrash on rapid viewport movement)
- Batch multiple checkbox updates where possible
- Use efficient bit manipulation for cache updates
- Minimal re-rendering: only update changed grid cells

## Error Handling

### Connection Management
- Handle SpacetimeDB connection failures gracefully (show offline mode)
- Implement automatic reconnection with exponential backoff
- Queue local changes during disconnection, sync when reconnected
- Show connection status in UI ("Connected", "Reconnecting", "Offline")

### Chunk Loading Edge Cases
- Handle missing chunks (auto-create via `add_chunk` reducer if needed)
- Manage partial chunk data during loading
- Handle chunk version conflicts (remote updates during local edits)
- Graceful degradation when cache limit exceeded

### Viewport Boundary Handling
- Smooth subscription transitions when moving between chunk boundaries
- Handle edge cases at grid boundaries (x=0, y=0, x=999, y=999)
- Prevent duplicate subscriptions when viewport spans chunk edges

## Testing Strategy

### Unit Tests
- Test chunk cache LRU eviction logic
- Test viewport-to-chunk coordinate calculations
- Test BitArray synchronization with SpacetimeDB data
- Test subscription management (add/remove logic)

### Integration Tests
- Test real SpacetimeDB connection and data persistence
- Test multi-user synchronization (simulate multiple browser windows)
- Test viewport panning and chunk loading/unloading
- Test offline/online mode transitions

### Performance Tests
- Measure memory usage with different cache sizes
- Test viewport change performance (subscription updates)
- Benchmark rendering performance with real-time updates
- Load test with multiple concurrent users

## Migration Path

**Phase 1**: Replace SpacetimeDB bindings, establish basic connection
**Phase 2**: Implement chunk subscription system without cache  
**Phase 3**: Add smart cache with LRU eviction
**Phase 4**: Add collaborative real-time features
**Phase 5**: Performance optimization and testing

## Success Criteria

- ✅ Multiple users can collaborate on checkbox grid in real-time
- ✅ Viewport changes smoothly load/unload chunks as needed
- ✅ Memory usage stays reasonable (under 10MB) regardless of grid exploration
- ✅ Checkbox changes sync to other users within 100ms
- ✅ Application handles network disconnections gracefully
- ✅ Performance remains smooth with 10+ concurrent users

## Files to Modify

- `frontend/Cargo.toml` - Upgrade SpacetimeDB dependency to 2.0
- `frontend/src/lib.rs` - Replace placeholder bindings with real client integration
- Add new modules for chunk cache, subscription management, and SpacetimeDB client wrapper