// Test: Two WebSocket connections to SpacetimeDB syncing checkbox updates
import { DbConnection } from './generated';

const SPACETIMEDB_URL = 'ws://localhost:3000';
const DATABASE_NAME = 'checkboxes';

async function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(r => setTimeout(r, 50));
  }
}

function getBit(data: Uint8Array, bitIndex: number): boolean {
  const byteIdx = Math.floor(bitIndex / 8);
  const bitIdx = bitIndex % 8;
  return (data[byteIdx] & (1 << bitIdx)) !== 0;
}

async function main() {
  console.log('=== SpacetimeDB Two-Client Sync Test ===\n');

  let client1Chunks: Map<number, { state: Uint8Array, version: bigint }> = new Map();
  let client2Chunks: Map<number, { state: Uint8Array, version: bigint }> = new Map();
  let client1Connected = false;
  let client2Connected = false;
  let client1Subscribed = false;
  let client2Subscribed = false;

  console.log('Creating Client 1...');
  const conn1 = DbConnection.builder()
    .withUri(SPACETIMEDB_URL)
    .withDatabaseName(DATABASE_NAME)
    .onConnect(() => {
      console.log('Client 1: Connected');
      client1Connected = true;
    })
    .onDisconnect(() => {
      console.log('Client 1: Disconnected');
      client1Connected = false;
    })
    .build();

  console.log('Creating Client 2...');
  const conn2 = DbConnection.builder()
    .withUri(SPACETIMEDB_URL)
    .withDatabaseName(DATABASE_NAME)
    .onConnect(() => {
      console.log('Client 2: Connected');
      client2Connected = true;
    })
    .onDisconnect(() => {
      console.log('Client 2: Disconnected');
      client2Connected = false;
    })
    .build();

  console.log('Waiting for connections...');
  await waitFor(() => client1Connected && client2Connected);
  console.log('Both clients connected!\n');

  console.log('Setting up subscriptions...');
  const table1 = (conn1.db as any).checkbox_chunk;
  const table2 = (conn2.db as any).checkbox_chunk;
  
  conn1.subscriptionBuilder()
    .onApplied(() => {
      console.log('Client 1: Subscription applied');
      client1Subscribed = true;
      if (table1 && typeof table1.iter === 'function') {
        for (const row of table1.iter()) {
          client1Chunks.set(row.chunkId, { state: new Uint8Array(row.state), version: row.version });
        }
      }
    })
    .subscribe(['SELECT * FROM checkbox_chunk']);

  conn2.subscriptionBuilder()
    .onApplied(() => {
      console.log('Client 2: Subscription applied');
      client2Subscribed = true;
      if (table2 && typeof table2.iter === 'function') {
        for (const row of table2.iter()) {
          client2Chunks.set(row.chunkId, { state: new Uint8Array(row.state), version: row.version });
        }
      }
    })
    .subscribe(['SELECT * FROM checkbox_chunk']);

  await waitFor(() => client1Subscribed && client2Subscribed);
  console.log('Both clients subscribed!\n');

  // Set up update listeners
  if (table1) {
    table1.onInsert((ctx: any, row: any) => {
      console.log(`Client 1: INSERT chunk ${row.chunkId}`);
      client1Chunks.set(row.chunkId, { state: new Uint8Array(row.state), version: row.version });
    });
    table1.onUpdate((ctx: any, oldRow: any, newRow: any) => {
      console.log(`Client 1: UPDATE chunk ${newRow.chunkId}`);
      client1Chunks.set(newRow.chunkId, { state: new Uint8Array(newRow.state), version: newRow.version });
    });
  }

  if (table2) {
    table2.onInsert((ctx: any, row: any) => {
      console.log(`Client 2: INSERT chunk ${row.chunkId}`);
      client2Chunks.set(row.chunkId, { state: new Uint8Array(row.state), version: row.version });
    });
    table2.onUpdate((ctx: any, oldRow: any, newRow: any) => {
      console.log(`Client 2: UPDATE chunk ${newRow.chunkId}`);
      client2Chunks.set(newRow.chunkId, { state: new Uint8Array(newRow.state), version: newRow.version });
    });
  }

  // Test: Client 1 updates checkbox (bit 42)
  console.log('--- Test: Client 1 sets checkbox bit 42 ---');
  // Note: SpacetimeDB SDK uses object-style arguments
  conn1.reducers.updateCheckbox({ chunkId: 0, bitOffset: 42, checked: true });

  console.log('Waiting for sync...');
  await waitFor(() => {
    const chunk2 = client2Chunks.get(0);
    if (!chunk2) return false;
    return getBit(chunk2.state, 42);
  }, 10000);

  console.log('Client 2 received the update!\n');

  const chunk1 = client1Chunks.get(0);
  const chunk2 = client2Chunks.get(0);
  
  if (chunk1 && chunk2) {
    const bit1 = getBit(chunk1.state, 42);
    const bit2 = getBit(chunk2.state, 42);
    
    console.log(`Client 1: bit42=${bit1}`);
    console.log(`Client 2: bit42=${bit2}`);
    
    if (bit1 && bit2) {
      console.log('\n✅ SUCCESS: Both clients synced!');
    } else {
      console.log('\n❌ FAIL: Clients out of sync');
      process.exit(1);
    }
  } else {
    console.log('\n❌ FAIL: Missing chunk data');
    process.exit(1);
  }

  conn1.disconnect();
  conn2.disconnect();
  
  console.log('\nTest complete.');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
