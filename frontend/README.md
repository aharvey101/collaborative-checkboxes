# Checkboxes Frontend

A high-performance WASM frontend for collaborative real-time checkbox grids using SpacetimeDB 2.0.

## Features

- **Dual Mode Support**: Local-only and collaborative real-time operation
- **High Performance**: Pure Rust/WASM with optimized bit manipulation
- **Smart Caching**: LRU cache with viewport-aware chunk subscriptions
- **Optimistic Updates**: Immediate UI feedback with background server sync
- **Efficient Networking**: Only sync visible chunks to minimize bandwidth

## Building

```bash
# Build for web
wasm-pack build --target web --out-dir pkg

# Run tests
cargo test --target wasm32-unknown-unknown
cargo test --test integration_test

# Run WASM tests in browser
wasm-pack test --firefox  # or --chrome, --node
```

## Usage

See [COLLABORATIVE_MODE.md](./COLLABORATIVE_MODE.md) for detailed usage instructions.

## Architecture

- `spacetimedb_client.rs`: SpacetimeDB 2.0 connection management
- `chunk_cache.rs`: LRU cache for chunk data
- `subscription_manager.rs`: Viewport-aware subscription management  
- `collaborative_state.rs`: Unified state management for real-time features
- `async_handlers.rs`: Async update queue and processing
- `lib.rs`: Main app logic with WASM bindings

## Requirements

- Rust 1.94.0 (for SpacetimeDB 2.0 compatibility)
- wasm-pack for building WASM modules
- SpacetimeDB 2.0 server (for collaborative mode)