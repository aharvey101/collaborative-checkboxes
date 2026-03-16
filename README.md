# Scalable Checkboxes with SpacetimeDB

A real-time collaborative checkbox grid supporting 1 million checkboxes (scalable to 1 billion) using SpacetimeDB 0.1 backend and vanilla WASM frontend.

## Architecture

- **Backend**: SpacetimeDB 0.1 library with `CheckboxChunk` table storing 1M checkbox states per chunk (125KB compressed bit array)
- **Frontend**: Vanilla WASM using web-sys, renders 10,000 checkboxes with full 1M state tracking
- **Communication**: WebSocket JSON messages for real-time sync

## Running the Project

### Prerequisites
- Rust 1.70+ (nightly for WASM)
- wasm-pack (for WASM compilation)
- Python 3 (for HTTP server)

### Build

```bash
cd /Users/alexander/development/checkboxes/.worktrees/checkboxes-impl

# Build backend server
cd backend
cargo build --bin server --release

# Build frontend WASM
cd ../frontend
wasm-pack build --target web
```

### Run

In one terminal, start the backend WebSocket server:
```bash
cd backend
cargo run --bin server --release
# Output: WebSocket server listening on ws://127.0.0.1:8080/subscribe
```

In another terminal, start the HTTP server:
```bash
cd frontend
python3 ../serve.py
# Output: Serving frontend on http://localhost:3000
```

Then open `http://localhost:3000` in your browser.

## How It Works

1. **Frontend loads**: Vanilla WASM initializes with 1M bit array in memory
2. **User clicks checkbox**: JS toggles bit locally + sends `UpdateCheckbox` message to server
3. **Server receives**: Updates `CheckboxChunk` table in memory, sends confirmation back
4. **Frontend syncs**: Updates local state and re-renders the 10K visible checkboxes

## Project Structure

```
checkboxes-impl/
├── backend/
│   ├── src/
│   │   ├── lib.rs         # CheckboxChunk table + helper functions
│   │   └── main.rs        # WebSocket server
│   └── Cargo.toml
├── frontend/
│   ├── src/
│   │   └── lib.rs         # WASM entry point + UI logic
│   ├── index.html         # HTML harness
│   ├── pkg/               # Generated WASM bindings (after build)
│   └── Cargo.toml
├── serve.py               # HTTP server for testing
└── Cargo.toml             # Workspace config
```

## Testing

### Unit Tests
```bash
cd backend
cargo test
# All 5 tests pass: set_bit, get_bit, boundaries, out_of_bounds, multiple_bits
```

### E2E Testing
1. Start backend server
2. Start HTTP server
3. Open http://localhost:3000
4. Click checkboxes and observe:
   - Local state updates instantly
   - WebSocket messages sent to server
   - Server logs checkbox updates

## Known Limitations

- SpacetimeDB integration is library-only (no CLI setup required)
- Server stores state in memory (not persisted)
- No multi-user synchronization yet (would need broadcast on updates)
- Rendering limited to 10,000 checkboxes (could optimize with virtual scrolling)

## Next Steps

- [ ] Add multi-user synchronization via broadcast
- [ ] Implement virtual scrolling for rendering optimization
- [ ] Add persistence layer (database)
- [ ] Load test with 1000+ concurrent users
- [ ] Create a real SpacetimeDB deployment
