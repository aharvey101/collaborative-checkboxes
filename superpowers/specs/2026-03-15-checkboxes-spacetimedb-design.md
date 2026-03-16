# Design for Scalable Checkboxes on SpacetimeDB

## Overview
Recreate the "One Million Checkboxes" experience using SpacetimeDB for real-time, high-concurrency collaborative drawing. The goal is to explore SpacetimeDB's WebSocket capabilities and scalability, starting with 1 million checkboxes and supporting expansion to 1 billion.

## Overall Architecture
- **SpacetimeDB Module**: Rust module managing state and mutations.
- **Web Frontend**: Vanilla JS app for rendering and interaction.
- **Real-time Sync**: WebSocket-based subscriptions for instant updates.

## Backend Design (SpacetimeDB Module)
- **Schema**: Table `CheckboxChunks` with columns: `chunk_id` (u32, primary key), `state` (blob, 125KB for 1M bits per chunk), `version` (u64).
- **Reducers**:
  - `update_checkbox(chunk_id: u32, bit_offset: u16, checked: bool)`: Updates bit in chunk.
  - `add_chunk()`: Adds new chunks for expansion.
- **Subscriptions**: Broadcast per-chunk deltas to clients.
- **Performance**: Parallel updates, linear scaling.

## Frontend Design
- **Tech Stack**: Vanilla HTML/CSS/JS with SpacetimeDB JS client.
- **Grid Rendering**: Responsive grid scaling to window width.
- **State Sync**: Full state load on connect, delta updates for live changes.

## Real-time Communication and Performance
- **WebSocket Handling**: Auto-reconnect, compression for blobs.
- **Concurrency**: Target 10,000+ connections; batch updates, deltas.
- **Optimizations**: Rust bit ops, client-side efficiency, rate limiting.
- **Error Handling**: Retries, graceful degradation.

## Success Criteria
- Support 1 million checkboxes initially, expandable to 1 billion.
- Sub-100ms update latency for high concurrency.
- Real-time sync via WebSockets.