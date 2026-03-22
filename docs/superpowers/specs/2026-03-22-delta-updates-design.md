# Delta Updates for SpacetimeDB Checkbox Sync

**Date:** 2026-03-22
**Status:** Approved

## Problem

SpacetimeDB broadcasts the **entire 4MB chunk row** on every checkbox change. For Doom spectators, this means ~4MB per frame x 10+ FPS = OOM crashes or unusable framerates. Even with the recent ArrayBuffer transfer optimization (15MB JSON -> 3.8MB binary), the fundamental issue remains: the full row is sent for every single-cell change.

## Solution

Add a `checkbox_delta` table that stores batched change blobs. Use a **two-phase subscription** strategy:

1. **Initial load:** Subscribe to `checkbox_chunk` + `checkbox_delta` to get the full snapshot.
2. **Live mode:** After `SubscribeApplied`, unsubscribe from `checkbox_chunk` to stop receiving 4MB full-row broadcasts. Keep only the `checkbox_delta` subscription for live incremental updates.
3. **Reconnect:** On WebSocket reconnect, repeat from step 1.

This eliminates 4MB payloads from the WebSocket entirely during live operation.

## Schema

### New table: `checkbox_delta`

```rust
#[table(accessor = checkbox_delta, public)]
pub struct CheckboxDelta {
    #[auto_inc]
    #[primary_key]
    pub id: u64,
    pub data: Vec<u8>,    // packed binary updates
    pub timestamp: u64,   // epoch ms, for cleanup
}
```

### Delta binary format

Each update entry is 16 bytes, packed sequentially:

| Offset | Size | Field        |
|--------|------|-------------|
| 0      | 8    | chunk_id (i64 LE) |
| 8      | 4    | cell_offset (u32 LE) |
| 12     | 1    | r |
| 13     | 1    | g |
| 14     | 1    | b |
| 15     | 1    | checked (0 or 1) |

A batch of N updates = N x 16 bytes. A Doom frame with 5,000 changed pixels = 80KB.

## Backend Changes

### Modified reducers

`batch_update_checkboxes` and `update_checkbox` both gain a second write: after updating the chunk row, they insert a `checkbox_delta` row containing the packed binary changes.

**`batch_update_checkboxes`:** The delta data must be built before the updates are consumed by the chunk-grouping loop (since `for update in updates` moves ownership):

```rust
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

// ... existing chunk update logic (consumes updates) ...

// Insert delta row
ctx.db.checkbox_delta().insert(CheckboxDelta {
    id: 0, // auto_inc
    data: delta_data,
    timestamp: ctx.timestamp.to_micros_since_epoch() / 1000,
});
```

**`update_checkbox`:** Same pattern, single 16-byte entry:

```rust
// After updating the chunk row:
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
```

### New reducer: `cleanup_old_deltas`

```rust
#[reducer]
pub fn cleanup_old_deltas(ctx: &ReducerContext, max_age_ms: u64) {
    let now = ctx.timestamp.to_micros_since_epoch() / 1000;
    let cutoff = now.saturating_sub(max_age_ms);
    let old_ids: Vec<u64> = ctx.db.checkbox_delta()
        .iter()
        .filter(|d| d.timestamp < cutoff)
        .map(|d| d.id)
        .collect();
    for id in old_ids {
        ctx.db.checkbox_delta().id().delete(id);
    }
}
```

**Capacity note:** At 10 FPS Doom with ~5,000 changed pixels each, steady state is ~300 delta rows (~24MB) with 30-second cleanup. Multiple concurrent Doom players multiply this linearly.

## Worker Changes

### Two-phase subscription

The worker uses separate `QuerySetId`s for chunks and deltas so it can unsubscribe from chunks independently:

```rust
pub fn subscribe(&mut self) {
    // Phase 1: Subscribe to chunks (for initial snapshot)
    let chunk_request_id = self.next_request_id();
    self.chunk_query_set_id = Some(QuerySetId::new(chunk_request_id));
    let chunk_sub = Subscribe {
        request_id: chunk_request_id,
        query_set_id: self.chunk_query_set_id.unwrap(),
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

After receiving `SubscribeApplied` for the chunk query set, send an `Unsubscribe` for that query set to stop full-row broadcasts:

```rust
fn handle_subscribe_applied(&mut self, sub: SubscribeApplied) {
    // Process initial rows as before...
    process_query_rows(&sub.rows);

    // If this was the chunk subscription, unsubscribe to stop 4MB broadcasts
    if Some(sub.query_set_id) == self.chunk_query_set_id {
        let unsub = Unsubscribe {
            request_id: self.next_request_id(),
            query_set_id: sub.query_set_id,
        };
        self.send_message(&ClientMessage::Unsubscribe(unsub));
        self.chunk_query_set_id = None;
    }
}
```

### Message handling

`process_table_update` gains a branch for `checkbox_delta`:
- Parse the `CheckboxDelta` row from BSATN (id: u64, data: Vec<u8>, timestamp: u64)
- Extract the `data` blob from insert rows
- Send to main thread as `WorkerToMain::DeltaUpdate`
- Ignore `checkbox_chunk` updates in `TransactionUpdate` (should not arrive after unsubscribe, but guard defensively)

**Handling `checkbox_delta` in `SubscribeApplied`:** Initial delta rows from subscription are **ignored** — the chunk snapshot is authoritative for initial state. Deltas are only applied from `TransactionUpdate` (live changes).

### New binary message to main thread

```rust
WorkerToMain::DeltaUpdate {
    data: Vec<u8>,  // sent as transferable ArrayBuffer
}
```

Uses the same transferable `ArrayBuffer` pattern as `ChunkInserted`/`ChunkUpdated`.

### Reconnection

On WebSocket reconnect, the worker calls `subscribe()` again, which repeats the two-phase flow: subscribe to chunks + deltas, get snapshot via `SubscribeApplied`, unsubscribe from chunks.

## Worker Bridge Changes

`parse_binary_chunk_message` extended to handle `"DeltaUpdate"` type, extracting the `data` ArrayBuffer.

## Main Thread Changes (app.rs)

New match arm in the worker message handler:

```rust
WorkerToMain::DeltaUpdate { data } => {
    state.loaded_chunks.update(|chunks| {
        for entry in data.chunks_exact(16) {
            let chunk_id = i64::from_le_bytes(entry[0..8].try_into().unwrap());
            let cell_offset = u32::from_le_bytes(entry[8..12].try_into().unwrap());
            let r = entry[12];
            let g = entry[13];
            let b = entry[14];
            let checked = entry[15] != 0;
            if let Some(chunk_data) = chunks.get_mut(&chunk_id) {
                crate::db::set_checkbox(chunk_data, cell_offset as usize, r, g, b, checked);
            }
        }
    });
    state.render_version.update(|v| *v += 1);
}
```

No allocation. Direct pointer writes into the existing 4MB chunk buffer in the HashMap.

## Data Flow

```
WRITER (Doom player):
  Doom frame -> batch pixel changes -> flush_pending_updates
  -> Worker: batch_update_checkboxes reducer (~80KB BSATN)
  -> Server: update chunk row + insert delta row
  -> Writer: ReducerResult (ignores own delta for doom chunks)

SPECTATOR:
  Connect -> subscribe to checkbox_chunk + checkbox_delta
  -> SubscribeApplied (chunks): full chunk rows (4MB each, one-time)
  -> Unsubscribe from checkbox_chunk (no more 4MB broadcasts)
  -> TransactionUpdate on checkbox_delta: ~80KB delta blob
  -> Worker: DeltaUpdate as transferable ArrayBuffer
  -> Main thread: apply byte writes to loaded_chunks -> re-render

RECONNECT:
  WebSocket closes -> reconnect with backoff
  -> Re-subscribe to both tables (repeat above flow)

CLEANUP:
  Periodic cleanup_old_deltas call -> delete rows > 30s old
```

## Performance Impact

| Metric | Before (full row) | After (delta) |
|--------|-------------------|---------------|
| Per-update WS payload to spectator | 4 MB | ~80 KB (Doom frame) |
| Per-click WS payload to spectator | 4 MB | 16 bytes |
| Spectator OOM threshold | ~10 updates | Thousands |
| Sustainable Doom FPS | <5 | 30+ |
| DB write overhead | 1 table write | 2 table writes |
| Delta table steady state (10 FPS) | N/A | ~300 rows, ~24 MB |

## What Doesn't Change

- Chunk table stays current (reducers still update it)
- Chunk subscription handles initial load (then unsubscribes)
- Optimistic rendering on the writer side
- Regular click-to-toggle UX
- ArrayBuffer transfer for all chunk/delta messages
- `is_doom_chunk` filtering for the Doom player (spectators don't filter)
