# Collaborative Checkboxes

Real-time collaborative checkbox grid using SpacetimeDB. Supports 1 million checkboxes per chunk using bit-packed data.

## Architecture

- **Backend**: Rust reducer compiled to WASM, running on SpacetimeDB v2.0
- **Frontend**: Leptos (Rust) with WebGL rendering and web worker networking

## Prerequisites

- Rust nightly toolchain (see `rust-toolchain.toml`)
- SpacetimeDB CLI v2.0+

## Development

Start SpacetimeDB:

```bash
spacetime start --listen-addr 127.0.0.1:3000 --in-memory
```

Build and publish the backend:

```bash
cargo build --target wasm32-unknown-unknown --release
spacetime publish checkboxes --server http://localhost:3000 \
  --bin-path ./target/wasm32-unknown-unknown/release/backend.wasm
```
