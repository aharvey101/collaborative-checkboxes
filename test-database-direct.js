#!/usr/bin/env node

// Direct test of SpacetimeDB connection and reducer calls
// This will help us isolate whether the issue is in the database layer or frontend integration

import { CheckboxDatabase } from './typescript-frontend/src/generated/CheckboxDatabase.js';

async function testDatabaseDirectly() {
  console.log('🧪 Starting direct database test...');
  
  const db = new CheckboxDatabase('http://localhost:3001', 'checkboxes-local-demo');
  
  try {
    console.log('📞 Step 1: Connecting to database...');
    const connected = await db.connect();
    
    if (!connected) {
      console.error('❌ Failed to connect');
      return false;
    }
    
    console.log('✅ Step 1: Connected successfully');
    
    console.log('📞 Step 2: Setting up subscriptions...');
    
    let insertReceived = false;
    let updateReceived = false;
    
    db.onCheckboxChunkInsert((chunk) => {
      console.log('🔔 INSERT EVENT RECEIVED:', chunk);
      insertReceived = true;
    });
    
    db.onCheckboxChunkUpdate((chunk) => {
      console.log('🔔 UPDATE EVENT RECEIVED:', chunk);
      updateReceived = true;
    });
    
    // Wait a bit for subscriptions to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('📞 Step 3: Adding a chunk...');
    await db.addChunk(0);
    console.log('✅ Step 3: Chunk added successfully');
    
    // Wait for insert callback
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('📞 Step 4: Updating a checkbox...');
    await db.updateCheckbox(0, 42, true);
    console.log('✅ Step 4: Checkbox updated successfully');
    
    // Wait for update callback
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('📞 Step 5: Querying chunks...');
    const chunks = await db.getAllChunks();
    console.log('✅ Step 5: Query results:', chunks);
    
    console.log('📞 Step 6: Results summary');
    console.log(`   Insert callback fired: ${insertReceived}`);
    console.log(`   Update callback fired: ${updateReceived}`);
    console.log(`   Chunks in database: ${chunks.length}`);
    
    if (chunks.length > 0) {
      const chunk0 = chunks[0];
      console.log(`   Chunk 0 state length: ${chunk0.state.length}`);
      console.log(`   First 10 bytes: ${Array.from(chunk0.state.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      
      // Check if bit 42 is set
      const byteIndex = Math.floor(42 / 8);
      const bitIndex = 42 % 8;
      const isSet = (chunk0.state[byteIndex] & (1 << bitIndex)) !== 0;
      console.log(`   Bit 42 set: ${isSet} (expected: true)`);
    }
    
    await db.disconnect();
    
    const success = insertReceived && updateReceived && chunks.length > 0;
    console.log(`🧪 Test ${success ? 'PASSED' : 'FAILED'}`);
    return success;
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    await db.disconnect();
    return false;
  }
}

testDatabaseDirectly().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('❌ Test crashed:', error);
  process.exit(1);
});