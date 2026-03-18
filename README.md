# Collaborative Checkboxes

Real-time collaborative checkbox grid using SpacetimeDB. Supports 1 million checkboxes per chunk (scalable to billions).

## Architecture

- **Backend**: Rust reducer running on SpacetimeDB v2.0
- **Frontend**: TypeScript client using direct WebSocket connection to SpacetimeDB
- **Data Model**: Bit-packed chunks (125KB per 1M checkboxes)

## Quick Start

### Prerequisites

- Rust nightly toolchain (see `rust-toolchain.toml`)
- SpacetimeDB CLI v2.0+
- Node.js 18+

### Development

1. **Start SpacetimeDB server** (in a separate terminal):
   ```bash
   spacetime start --listen-addr 127.0.0.1:3000 --in-memory
   ```

2. **Build and publish the backend**:
   ```bash
   cargo build --target wasm32-unknown-unknown --release
   spacetime publish checkboxes --server http://localhost:3000 \
     --bin-path ./target/wasm32-unknown-unknown/release/backend.wasm
   ```

3. **Generate TypeScript SDK**:
   ```bash
   npm run generate
   ```

4. **Run tests**:
   ```bash
   npm install
   npm run test:sync
   ```

## Project Structure

```
checkboxes/
├── backend/           # Rust SpacetimeDB module
│   ├── src/lib.rs     # Reducers and table definitions
│   └── Cargo.toml
├── generated/         # Auto-generated TypeScript SDK (gitignored)
├── test-websocket-sync.ts  # Two-client sync test
├── package.json
└── rust-toolchain.toml
```

## API

### Reducers

- `update_checkbox(chunk_id: u32, bit_offset: u32, checked: bool)` - Toggle a checkbox
- `add_chunk(chunk_id: u32)` - Create a new chunk
- `clear_all_checkboxes()` - Reset all data (for testing)

### Tables

- `checkbox_chunk` - Stores checkbox state
  - `chunk_id: u32` (primary key)
  - `state: Vec<u8>` (125KB bit array)
  - `version: u64` (for change tracking)

## Key Discovery

SpacetimeDB TypeScript SDK 2.0 uses **object-style** reducer calls:

```typescript
// Correct
conn.reducers.updateCheckbox({ chunkId: 0, bitOffset: 42, checked: true });

// Wrong - will silently use wrong values!
conn.reducers.updateCheckbox(0, 42, true);
```
