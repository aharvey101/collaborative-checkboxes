# Delta Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 4MB full-row broadcasts with ~80KB delta blobs for live checkbox sync between clients.

**Architecture:** Add a `checkbox_delta` table with packed binary updates. Use two-phase subscription: subscribe to `checkbox_chunk` + `checkbox_delta` for initial load, then unsubscribe from `checkbox_chunk` to stop 4MB broadcasts. All live updates flow through deltas only.

**Tech Stack:** Rust (SpacetimeDB backend), Rust/WASM (Leptos frontend), SpacetimeDB v2 WebSocket protocol (BSATN)

**Spec:** `docs/superpowers/specs/2026-03-22-delta-updates-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/src/lib.rs` | Modify | Add `CheckboxDelta` table, modify reducers to emit deltas, add cleanup reducer |
| `frontend-rust/src/worker/protocol.rs` | Modify | Add `DeltaUpdate` variant to `WorkerToMain` |
| `frontend-rust/src/worker/client.rs` | Modify | Two-phase subscription, delta table parsing, unsubscribe after initial load |
| `frontend-rust/src/worker_bridge.rs` | Modify | Handle `DeltaUpdate` binary messages |
| `frontend-rust/src/app.rs` | Modify | Apply delta updates to `loaded_chunks` |

---

### Task 1: Add `CheckboxDelta` table and modify backend reducers

**Files:**
- Modify: `backend/src/lib.rs`

- [ ] **Step 1: Add `CheckboxDelta` table struct after `CheckboxChunk` (after line 181)**

```rust
/// Stores batched checkbox updates as packed binary blobs for efficient live sync.
/// Each entry in `data` is 16 bytes: chunk_id(8) + cell_offset(4) + r + g + b + checked.
/// Clients subscribe to this table for incremental updates instead of receiving
/// full 4MB chunk rows on every change.
#[table(accessor = checkbox_delta, public)]
pub struct CheckboxDelta {
    #[auto_inc]
    #[primary_key]
    pub id: u64,
    pub data: Vec<u8>,
    pub timestamp: u64,
}
```

- [ ] **Step 2: Modify `update_checkbox` reducer to emit a delta (lines 195-221)**

Add delta insertion at the end of the reducer, after both the update and insert paths. The full reducer becomes:

```rust
#[reducer]
pub fn update_checkbox(
    ctx: &ReducerContext,
    chunk_id: i64,
    cell_offset: u32,
    r: u8,
    g: u8,
    b: u8,
    checked: bool,
) {
    // Try to find existing chunk by primary key
    if let Some(mut row) = ctx.db.checkbox_chunk().chunk_id().find(chunk_id) {
        set_checkbox(&mut row.state, cell_offset as usize, r, g, b, checked);
        row.version += 1;
        ctx.db.checkbox_chunk().chunk_id().update(row);
    } else {
        // If chunk doesn't exist, create it and set the checkbox
        let mut new_chunk = CheckboxChunk {
            chunk_id,
            state: vec![0u8; CHUNK_DATA_SIZE],
            version: 0,
        };
        set_checkbox(&mut new_chunk.state, cell_offset as usize, r, g, b, checked);
        ctx.db.checkbox_chunk().insert(new_chunk);
    }

    // Emit delta for live subscribers
    let mut delta_data = Vec::with_capacity(16);
    delta_data.extend_from_slice(&chunk_id.to_le_bytes());
    delta_data.extend_from_slice(&cell_offset.to_le_bytes());
    delta_data.push(r);
    delta_data.push(g);
    delta_data.push(b);
    delta_data.push(if checked { 1 } else { 0 });
    ctx.db.checkbox_delta().insert(CheckboxDelta {
        id: 0,
        data: delta_data,
        timestamp: ctx.timestamp.to_micros_since_epoch() / 1000,
    });
}
```

- [ ] **Step 3: Modify `batch_update_checkboxes` to emit a delta (lines 225-263)**

Build delta data BEFORE the loop that consumes `updates`. The full reducer becomes:

```rust
#[reducer]
pub fn batch_update_checkboxes(ctx: &ReducerContext, updates: Vec<CheckboxUpdate>) {
    use std::collections::HashMap;

    // Build delta data BEFORE consuming updates
    let mut delta_data = Vec::with_capacity(updates.len() * 16);
    for update in &updates {
        delta_data.extend_from_slice(&update.chunk_id.to_le_bytes());
        delta_data.extend_from_slice(&update.cell_offset.to_le_bytes());
        delta_data.push(update.r);
        delta_data.push(update.g);
        delta_data.push(update.b);
        delta_data.push(if update.checked { 1 } else { 0 });
    }

    // Group updates by chunk_id
    let mut chunk_updates: HashMap<i64, Vec<(u32, u8, u8, u8, bool)>> = HashMap::new();

    for update in updates {
        chunk_updates.entry(update.chunk_id).or_default().push((
            update.cell_offset,
            update.r,
            update.g,
            update.b,
            update.checked,
        ));
    }

    // Apply all updates per chunk
    for (chunk_id, updates) in chunk_updates {
        if let Some(mut row) = ctx.db.checkbox_chunk().chunk_id().find(chunk_id) {
            for (cell_offset, r, g, b, checked) in updates {
                set_checkbox(&mut row.state, cell_offset as usize, r, g, b, checked);
            }
            row.version += 1;
            ctx.db.checkbox_chunk().chunk_id().update(row);
        } else {
            let mut new_chunk = CheckboxChunk {
                chunk_id,
                state: vec![0u8; CHUNK_DATA_SIZE],
                version: 0,
            };
            for (cell_offset, r, g, b, checked) in updates {
                set_checkbox(&mut new_chunk.state, cell_offset as usize, r, g, b, checked);
            }
            ctx.db.checkbox_chunk().insert(new_chunk);
        }
    }

    // Emit delta for live subscribers
    if !delta_data.is_empty() {
        ctx.db.checkbox_delta().insert(CheckboxDelta {
            id: 0,
            data: delta_data,
            timestamp: ctx.timestamp.to_micros_since_epoch() / 1000,
        });
    }
}
```

- [ ] **Step 4: Add `cleanup_old_deltas` reducer (after `clear_all_checkboxes`)**

```rust
/// Clean up old delta rows to prevent unbounded table growth.
/// Call periodically with max_age_ms (e.g., 30000 for 30 seconds).
#[reducer]
pub fn cleanup_old_deltas(ctx: &ReducerContext, max_age_ms: u64) {
    let now_ms = ctx.timestamp.to_micros_since_epoch() / 1000;
    let cutoff = now_ms.saturating_sub(max_age_ms);
    let old_ids: Vec<u64> = ctx
        .db
        .checkbox_delta()
        .iter()
        .filter(|d| d.timestamp < cutoff)
        .map(|d| d.id)
        .collect();
    for id in old_ids {
        ctx.db.checkbox_delta().id().delete(id);
    }
}
```

- [ ] **Step 5: Build backend and verify it compiles**

Run: `cd backend && cargo build --target wasm32-unknown-unknown --release`
Expected: Compiles with no errors.

- [ ] **Step 6: Publish updated backend**

Run: `echo "y" | spacetime publish checkboxes --server http://localhost:3000 --bin-path ./target/wasm32-unknown-unknown/release/backend.wasm --clear-database`
Expected: "Updated database with name: checkboxes"

- [ ] **Step 7: Verify delta table exists**

Run: `spacetime sql checkboxes --server http://localhost:3000 "SELECT id FROM checkbox_delta"`
Expected: Empty result set (table exists, no rows).

- [ ] **Step 8: Commit**

```bash
git add backend/src/lib.rs
git commit -m "feat: add checkbox_delta table and emit deltas from reducers

Add CheckboxDelta table for incremental sync. Both update_checkbox and
batch_update_checkboxes now insert a packed binary delta row alongside
the chunk update. Add cleanup_old_deltas reducer for garbage collection."
```

---

### Task 2: Add `DeltaUpdate` to worker protocol

**Files:**
- Modify: `frontend-rust/src/worker/protocol.rs`

- [ ] **Step 1: Add `DeltaUpdate` variant to `WorkerToMain` enum (after `ChunkUpdated`, line 55)**

```rust
    /// Incremental update from checkbox_delta table
    DeltaUpdate {
        data: Vec<u8>,
    },
```

The full enum becomes:

```rust
pub enum WorkerToMain {
    ChunkInserted {
        chunk_id: i64,
        state: Vec<u8>,
        version: u64,
    },
    ChunkUpdated {
        chunk_id: i64,
        state: Vec<u8>,
        version: u64,
    },
    /// Incremental update from checkbox_delta table
    DeltaUpdate {
        data: Vec<u8>,
    },
    Connected,
    FatalError {
        message: String,
    },
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend-rust && cargo build --target wasm32-unknown-unknown`
Expected: Compiles (warnings OK).

- [ ] **Step 3: Commit**

```bash
git add frontend-rust/src/worker/protocol.rs
git commit -m "feat: add DeltaUpdate variant to WorkerToMain protocol"
```

---

### Task 3: Implement two-phase subscription and delta handling in worker

**Files:**
- Modify: `frontend-rust/src/worker/client.rs`

- [ ] **Step 1: Add `Unsubscribe` and `UnsubscribeFlags` to imports (line 13)**

Change:
```rust
        CallReducer, CallReducerFlags, ClientMessage, InitialConnection, QueryRows,
        ReducerResult, ServerMessage, Subscribe, SubscribeApplied, SubscriptionError,
        TableUpdate, TableUpdateRows, TransactionUpdate,
```

To:
```rust
        CallReducer, CallReducerFlags, ClientMessage, InitialConnection, QueryRows,
        ReducerResult, ServerMessage, Subscribe, SubscribeApplied, SubscriptionError,
        TableUpdate, TableUpdateRows, TransactionUpdate, Unsubscribe, UnsubscribeFlags,
```

- [ ] **Step 2: Add `chunk_query_set_id` field to `WorkerClient` struct (after line 45)**

Change the struct to add the field:
```rust
pub struct WorkerClient {
    ws: Option<WebSocket>,
    uri: String,
    database: String,
    reconnect_attempt: u32,
    intentional_disconnect: bool,
    subscribed_chunks: Vec<i64>,
    chunk_query_set_id: Option<QuerySetId>,
    request_id: u32,
    // Store closures to prevent memory leaks
    onopen_cb: Option<Closure<dyn FnMut(web_sys::Event)>>,
    onmessage_cb: Option<Closure<dyn FnMut(web_sys::MessageEvent)>>,
    onerror_cb: Option<Closure<dyn FnMut(web_sys::Event)>>,
    onclose_cb: Option<Closure<dyn FnMut(web_sys::CloseEvent)>>,
}
```

And add `chunk_query_set_id: None,` to `WorkerClient::new()` (after line 65).

- [ ] **Step 3: Rewrite `subscribe` method for two-phase subscription (lines 145-156)**

```rust
    /// Subscribe to checkbox_chunk (snapshot) and checkbox_delta (live updates).
    /// After the chunk subscription's SubscribeApplied arrives, we unsubscribe
    /// from chunks to stop receiving 4MB full-row broadcasts.
    pub fn subscribe(&mut self) {
        // Phase 1: Subscribe to chunks (for initial snapshot)
        let chunk_request_id = self.next_request_id();
        let chunk_query_set_id = QuerySetId::new(chunk_request_id);
        self.chunk_query_set_id = Some(chunk_query_set_id);
        let chunk_sub = Subscribe {
            request_id: chunk_request_id,
            query_set_id: chunk_query_set_id,
            query_strings: vec!["SELECT * FROM checkbox_chunk".into()].into_boxed_slice(),
        };
        self.send_message(&ClientMessage::Subscribe(chunk_sub));

        // Phase 2: Subscribe to deltas (kept for live updates)
        let delta_request_id = self.next_request_id();
        let delta_sub = Subscribe {
            request_id: delta_request_id,
            query_set_id: QuerySetId::new(delta_request_id),
            query_strings: vec!["SELECT * FROM checkbox_delta".into()].into_boxed_slice(),
        };
        self.send_message(&ClientMessage::Subscribe(delta_sub));
    }
```

- [ ] **Step 4: Update `handle_subscribe_applied` to unsubscribe from chunks (line 403)**

Replace the existing function:

```rust
fn handle_subscribe_applied(sub: SubscribeApplied) {
    web_sys::console::log_1(
        &format!("Subscribe applied for query set {:?}", sub.query_set_id).into(),
    );

    // Process initial rows (chunks and/or deltas)
    process_query_rows(&sub.rows);

    // If this was the chunk subscription, unsubscribe to stop 4MB broadcasts
    with_client(|client| {
        if client.chunk_query_set_id == Some(sub.query_set_id) {
            web_sys::console::log_1(&"Unsubscribing from checkbox_chunk (initial load complete)".into());
            let request_id = client.next_request_id();
            let unsub = Unsubscribe {
                request_id,
                query_set_id: sub.query_set_id,
                flags: UnsubscribeFlags::Default,
            };
            client.send_message(&ClientMessage::Unsubscribe(unsub));
            client.chunk_query_set_id = None;
        }
    });
}
```

- [ ] **Step 5: Add `parse_checkbox_delta` function (after `parse_checkbox_chunk`, ~line 534)**

```rust
/// Parse a CheckboxDelta from BSATN
/// Format: id (u64 LE) + data (u32 len + bytes) + timestamp (u64 LE)
fn parse_checkbox_delta(bytes: &[u8]) -> Option<Vec<u8>> {
    let mut reader = bytes;

    // Skip id (u64, 8 bytes)
    if reader.len() < 8 {
        return None;
    }
    reader = &reader[8..];

    // Read data (Vec<u8>): length-prefixed with u32
    if reader.len() < 4 {
        return None;
    }
    let data_len = u32::from_le_bytes([reader[0], reader[1], reader[2], reader[3]]) as usize;
    reader = &reader[4..];

    if reader.len() < data_len {
        return None;
    }
    let data = reader[..data_len].to_vec();

    Some(data)
}
```

- [ ] **Step 6: Update `process_table_update` to handle deltas and skip chunk broadcasts (line 457)**

Replace the existing function:

```rust
fn process_table_update(table: &TableUpdate) {
    let table_name: &str = &table.table_name;

    if table_name == "checkbox_delta" {
        // Process delta inserts
        for rows in table.rows.iter() {
            match rows {
                TableUpdateRows::PersistentTable(persistent) => {
                    for row_bytes in &persistent.inserts {
                        if let Some(data) = parse_checkbox_delta(row_bytes) {
                            send_to_main_thread(WorkerToMain::DeltaUpdate { data });
                        }
                    }
                }
                _ => {}
            }
        }
        return;
    }

    // Skip checkbox_chunk TransactionUpdates — we unsubscribe after initial load,
    // but guard defensively in case any arrive during the unsubscribe window.
    if table_name == "checkbox_chunk" {
        return;
    }
}
```

- [ ] **Step 7: Update `send_to_main_thread` to handle `DeltaUpdate` with binary transfer (line 565)**

Add a new match arm before the `other` catch-all:

```rust
        WorkerToMain::DeltaUpdate { data } => {
            send_delta_binary(&scope, &data);
        }
```

And add the helper function after `send_chunk_binary`:

```rust
/// Send delta data as a JS object with a transferable ArrayBuffer
fn send_delta_binary(scope: &DedicatedWorkerGlobalScope, data: &[u8]) {
    let uint8_array = js_sys::Uint8Array::new_with_length(data.len() as u32);
    uint8_array.copy_from(data);
    let array_buffer = uint8_array.buffer();

    let obj = js_sys::Object::new();
    js_sys::Reflect::set(&obj, &"type".into(), &"DeltaUpdate".into()).unwrap();
    js_sys::Reflect::set(&obj, &"data".into(), &array_buffer).unwrap();

    let transfer = js_sys::Array::new();
    transfer.push(&array_buffer);

    scope
        .post_message_with_transfer(&obj.into(), &transfer)
        .expect("postMessage with transfer failed");
}
```

- [ ] **Step 8: Verify it compiles**

Run: `cd frontend-rust && cargo build --target wasm32-unknown-unknown`
Expected: Compiles (warnings OK).

- [ ] **Step 9: Commit**

```bash
git add frontend-rust/src/worker/client.rs
git commit -m "feat: two-phase subscription with delta handling in worker

Subscribe to both checkbox_chunk and checkbox_delta. Unsubscribe from
chunks after SubscribeApplied to stop 4MB broadcasts. Parse delta rows
from TransactionUpdate and forward as DeltaUpdate via ArrayBuffer."
```

---

### Task 4: Handle `DeltaUpdate` in worker bridge and app

**Files:**
- Modify: `frontend-rust/src/worker_bridge.rs`
- Modify: `frontend-rust/src/app.rs`

- [ ] **Step 1: Extend `parse_binary_chunk_message` in worker_bridge.rs to handle `DeltaUpdate` (line 122)**

Add a new match arm:

```rust
        "DeltaUpdate" => {
            let data_val = js_sys::Reflect::get(data, &"data".into()).ok()?;
            let array_buffer = data_val.dyn_into::<js_sys::ArrayBuffer>().ok()?;
            let uint8_array = js_sys::Uint8Array::new(&array_buffer);
            let data = uint8_array.to_vec();
            Some(WorkerToMain::DeltaUpdate { data })
        }
```

The full match block becomes:

```rust
    match msg_type.as_str() {
        "ChunkInserted" => Some(WorkerToMain::ChunkInserted {
            chunk_id,
            state,
            version,
        }),
        "ChunkUpdated" => Some(WorkerToMain::ChunkUpdated {
            chunk_id,
            state,
            version,
        }),
        "DeltaUpdate" => {
            let data_val = js_sys::Reflect::get(data, &"data".into()).ok()?;
            let array_buffer = data_val.dyn_into::<js_sys::ArrayBuffer>().ok()?;
            let uint8_array = js_sys::Uint8Array::new(&array_buffer);
            let delta_data = uint8_array.to_vec();
            Some(WorkerToMain::DeltaUpdate { data: delta_data })
        }
        _ => None,
    }
```

Note: `DeltaUpdate` messages don't have `chunk_id`/`version`/`state` fields, so the extraction of those at the top of the function will return `None`. We need to restructure so `DeltaUpdate` is checked before the chunk_id/version/state extraction. Refactor the function:

```rust
fn parse_binary_chunk_message(data: &JsValue) -> Option<WorkerToMain> {
    let msg_type = js_sys::Reflect::get(data, &"type".into())
        .ok()?
        .as_string()?;

    // DeltaUpdate has a different shape: { type, data: ArrayBuffer }
    if msg_type == "DeltaUpdate" {
        let data_val = js_sys::Reflect::get(data, &"data".into()).ok()?;
        let array_buffer = data_val.dyn_into::<js_sys::ArrayBuffer>().ok()?;
        let uint8_array = js_sys::Uint8Array::new(&array_buffer);
        return Some(WorkerToMain::DeltaUpdate { data: uint8_array.to_vec() });
    }

    // Chunk messages: { type, chunk_id, version, state: ArrayBuffer }
    let chunk_id = js_sys::Reflect::get(data, &"chunk_id".into())
        .ok()?
        .as_f64()? as i64;
    let version = js_sys::Reflect::get(data, &"version".into())
        .ok()?
        .as_f64()? as u64;
    let state_val = js_sys::Reflect::get(data, &"state".into()).ok()?;

    let array_buffer = state_val.dyn_into::<js_sys::ArrayBuffer>().ok()?;
    let uint8_array = js_sys::Uint8Array::new(&array_buffer);
    let state = uint8_array.to_vec();

    match msg_type.as_str() {
        "ChunkInserted" => Some(WorkerToMain::ChunkInserted { chunk_id, state, version }),
        "ChunkUpdated" => Some(WorkerToMain::ChunkUpdated { chunk_id, state, version }),
        _ => None,
    }
}
```

- [ ] **Step 2: Add `DeltaUpdate` handler in app.rs (after the `ChunkUpdated` match arm, ~line 131)**

Add before the `FatalError` arm:

```rust
                        WorkerToMain::DeltaUpdate { data } => {
                            state.loaded_chunks.update(|chunks| {
                                for entry in data.chunks_exact(16) {
                                    let chunk_id = i64::from_le_bytes(
                                        entry[0..8].try_into().unwrap(),
                                    );
                                    // Skip doom chunks — optimistic local frames are authoritative
                                    if crate::doom::is_doom_chunk(chunk_id) {
                                        continue;
                                    }
                                    let cell_offset = u32::from_le_bytes(
                                        entry[8..12].try_into().unwrap(),
                                    );
                                    let r = entry[12];
                                    let g = entry[13];
                                    let b = entry[14];
                                    let checked = entry[15] != 0;
                                    if let Some(chunk_data) = chunks.get_mut(&chunk_id) {
                                        crate::db::set_checkbox(
                                            chunk_data,
                                            cell_offset as usize,
                                            r, g, b, checked,
                                        );
                                    }
                                }
                            });
                            state.render_version.update(|v| *v += 1);
                        }
```

Also add a log line in the message type logger (line 89-96):

```rust
                        WorkerToMain::DeltaUpdate { ref data } =>
                            web_sys::console::log_1(&format!("[Main] Received DeltaUpdate: {} bytes ({} entries)", data.len(), data.len() / 16).into()),
```

- [ ] **Step 3: Verify full frontend compiles**

Run: `cd frontend-rust && cargo build --target wasm32-unknown-unknown`
Expected: Compiles (warnings OK).

- [ ] **Step 4: Commit**

```bash
git add frontend-rust/src/worker_bridge.rs frontend-rust/src/app.rs
git commit -m "feat: handle DeltaUpdate in worker bridge and app

Parse DeltaUpdate binary messages in worker_bridge. Apply delta entries
directly to loaded_chunks in app.rs with zero allocation — each 16-byte
entry writes 4 bytes into the existing chunk buffer."
```

---

### Task 5: Add periodic delta cleanup

**Files:**
- Modify: `frontend-rust/src/worker/client.rs`

The `cleanup_old_deltas` reducer exists but nothing calls it. Add a periodic call from the worker after connection is established.

- [ ] **Step 1: Add a cleanup timer in the `onopen` callback (inside `connect()`, after `send_to_main_thread(WorkerToMain::Connected)`)**

After the `send_to_main_thread(WorkerToMain::Connected)` call in the `onopen` closure (~line 113), add a 30-second repeating timer that calls the cleanup reducer:

```rust
// Schedule periodic delta cleanup (every 30 seconds)
let cleanup_closure = Closure::wrap(Box::new(move || {
    CLIENT.with(|c| {
        if let Some(client) = c.borrow().as_ref() {
            let mut client_mut = client.borrow_mut();
            // Encode max_age_ms argument: 30000u64 as BSATN (little-endian u64)
            let args = 30000u64.to_le_bytes().to_vec();
            client_mut.call_reducer("cleanup_old_deltas", &args);
        }
    });
}) as Box<dyn FnMut()>);

let scope = js_sys::global()
    .dyn_into::<DedicatedWorkerGlobalScope>()
    .expect("not in worker");
scope
    .set_interval_with_callback_and_timeout_and_arguments_0(
        cleanup_closure.as_ref().unchecked_ref(),
        30_000,
    )
    .ok();
cleanup_closure.forget();
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend-rust && cargo build --target wasm32-unknown-unknown`
Expected: Compiles (warnings OK).

- [ ] **Step 3: Commit**

```bash
git add frontend-rust/src/worker/client.rs
git commit -m "feat: add periodic delta cleanup timer (every 30s)"
```

---

### Task 6: Build, test end-to-end, and run throughput test

**Files:**
- No new files

- [ ] **Step 1: Rebuild and restart trunk**

```bash
kill $(lsof -ti :8080) 2>/dev/null
cd frontend-rust && trunk serve &
```

Wait for "server listening" output.

- [ ] **Step 2: Verify in browser**

Open http://localhost:8080 in two browser tabs. Click checkboxes in one tab. Verify the other tab sees the changes (via deltas, not full-row broadcasts).

- [ ] **Step 3: Run throughput test with higher click count**

Update the test's `NUM_CLICKS` to 200 and run:
```bash
npx playwright test tests/websocket-throughput.spec.ts --reporter=list
```

Expected: Test passes without OOM. Client B should receive delta updates (~16 bytes each for clicks, ~80KB for batched Doom frames) instead of 4MB full-row broadcasts.

- [ ] **Step 4: Verify DB state**

```bash
spacetime sql checkboxes --server http://localhost:3000 "SELECT chunk_id, version FROM checkbox_chunk"
spacetime sql checkboxes --server http://localhost:3000 "SELECT id, timestamp FROM checkbox_delta"
```

Expected: Chunk versions increment. Delta rows exist with recent timestamps.

- [ ] **Step 5: Commit test updates if any**

```bash
git add tests/websocket-throughput.spec.ts
git commit -m "test: update throughput test for delta-based sync"
```
