import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { SpacetimeDBCheckboxApp } from '../src/SpacetimeDBCheckboxApp.js';

describe('Checkbox State Logic - Isolated Testing', () => {
  let app: SpacetimeDBCheckboxApp;
  let canvas: HTMLCanvasElement;
  let mockDatabase: any;

  beforeEach(async () => {
    // Create DOM elements
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    document.body.appendChild(canvas);

    // Create app instance
    app = new SpacetimeDBCheckboxApp();
    
    // Create comprehensive database mock that simulates SUCCESS
    mockDatabase = {
      connect: vi.fn().mockResolvedValue(true),
      updateCheckbox: vi.fn().mockResolvedValue(undefined), // Always succeeds
      addChunk: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      getAllChunks: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(undefined),
    };

    // Replace the real database with our mock
    (app as any).checkboxDatabase = mockDatabase;

    // Initialize the app
    app.initializeCanvas(canvas);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for initialization
  });

  afterEach(() => {
    document.body.removeChild(canvas);
    vi.clearAllMocks();
  });

  test('should maintain independent state when database calls succeed', async () => {
    console.log('=== TESTING FRONTEND LOGIC WITH SUCCESSFUL DATABASE MOCK ===');
    
    // Verify we start with empty state
    expect(app.getCheckboxState(0, 0)).toBe(false);
    expect(app.getCheckboxState(0, 1)).toBe(false);
    
    console.log('🧪 Step 1: Toggle checkbox (0, 0)');
    await app.toggleCheckbox(0, 0);
    
    // Verify database was called
    expect(mockDatabase.updateCheckbox).toHaveBeenCalledWith(0, 0, true);
    
    // Check state after first toggle
    const state1 = app.getCheckboxState(0, 0);
    console.log(`🔍 State (0, 0) after toggle: ${state1}`);
    expect(state1).toBe(true);
    
    console.log('🧪 Step 2: Toggle checkbox (1, 0) - this should NOT affect (0, 0)');
    await app.toggleCheckbox(1, 0);
    
    // Verify second database call
    expect(mockDatabase.updateCheckbox).toHaveBeenCalledWith(0, 1, true);
    
    // Check state after second toggle
    const state2 = app.getCheckboxState(0, 1);
    console.log(`🔍 State (0, 1) after toggle: ${state2}`);
    expect(state2).toBe(true);
    
    // CRITICAL TEST: First checkbox should STILL be checked
    const state1After = app.getCheckboxState(0, 0);
    console.log(`🔍 CRITICAL: State (0, 0) after second toggle: ${state1After}`);
    expect(state1After).toBe(true); // This should pass if frontend logic is correct
    
    console.log('🧪 Step 3: Toggle third checkbox (0, 1)');
    await app.toggleCheckbox(0, 1);
    
    const state3 = app.getCheckboxState(1, 0);
    console.log(`🔍 State (1, 0) after toggle: ${state3}`);
    expect(state3).toBe(true);
    
    // CRITICAL TEST: Both previous checkboxes should STILL be checked
    console.log('🧪 FINAL CHECK: All checkboxes should remain independent');
    expect(app.getCheckboxState(0, 0)).toBe(true); // First checkbox
    expect(app.getCheckboxState(0, 1)).toBe(true); // Second checkbox  
    expect(app.getCheckboxState(1, 0)).toBe(true); // Third checkbox
    
    console.log('=== ALL FRONTEND LOGIC TESTS PASSED ===');
  });

  test('should handle bit manipulation correctly across byte boundaries', async () => {
    console.log('=== TESTING BIT MANIPULATION ACROSS BYTE BOUNDARIES ===');
    
    // Test checkboxes that span different bytes in the chunk
    // globalIndex = row * 100 + col
    // Byte boundaries occur every 8 bits
    
    // Checkbox at bit 7 (last bit of byte 0)
    console.log('🧪 Toggle checkbox at bit 7 (last bit of byte 0)');
    await app.toggleCheckbox(7, 0); // globalIndex = 0*100 + 7 = 7
    
    // Checkbox at bit 8 (first bit of byte 1)
    console.log('🧪 Toggle checkbox at bit 8 (first bit of byte 1)');
    await app.toggleCheckbox(8, 0); // globalIndex = 0*100 + 8 = 8
    
    // Both should be checked independently
    expect(app.getCheckboxState(0, 7)).toBe(true);
    expect(app.getCheckboxState(0, 8)).toBe(true);
    
    // Test more boundary cases
    console.log('🧪 Toggle checkbox at bit 15 (last bit of byte 1)');
    await app.toggleCheckbox(15, 0); // globalIndex = 15
    
    console.log('🧪 Toggle checkbox at bit 16 (first bit of byte 2)');
    await app.toggleCheckbox(16, 0); // globalIndex = 16
    
    // All should remain checked
    expect(app.getCheckboxState(0, 7)).toBe(true);
    expect(app.getCheckboxState(0, 8)).toBe(true);
    expect(app.getCheckboxState(0, 15)).toBe(true);
    expect(app.getCheckboxState(0, 16)).toBe(true);
    
    console.log('=== BIT MANIPULATION TESTS PASSED ===');
  });

  test('should verify global index calculation is consistent', async () => {
    console.log('=== TESTING GLOBAL INDEX CALCULATION CONSISTENCY ===');
    
    // Test various positions to ensure globalIndex calculation is correct
    const testCases = [
      { x: 0, y: 0, expectedGlobalIndex: 0 },
      { x: 1, y: 0, expectedGlobalIndex: 1 },
      { x: 0, y: 1, expectedGlobalIndex: 100 },
      { x: 1, y: 1, expectedGlobalIndex: 101 },
      { x: 99, y: 0, expectedGlobalIndex: 99 },
      { x: 0, y: 99, expectedGlobalIndex: 9900 },
    ];
    
    for (const testCase of testCases) {
      console.log(`🧪 Testing position (${testCase.x}, ${testCase.y})`);
      
      // Clear the mock call history
      mockDatabase.updateCheckbox.mockClear();
      
      // Toggle the checkbox
      await app.toggleCheckbox(testCase.x, testCase.y);
      
      // Verify the correct globalIndex was passed to the database
      // The call should be: updateCheckbox(chunkId, bitOffset, true)
      // Where bitOffset should equal expectedGlobalIndex (for chunk 0)
      const calls = mockDatabase.updateCheckbox.mock.calls;
      expect(calls).toHaveLength(1);
      
      const [chunkId, bitOffset, state] = calls[0];
      console.log(`  📍 Database call: updateCheckbox(${chunkId}, ${bitOffset}, ${state})`);
      console.log(`  📍 Expected bitOffset: ${testCase.expectedGlobalIndex}`);
      
      expect(chunkId).toBe(0); // Should be chunk 0 for small indices
      expect(bitOffset).toBe(testCase.expectedGlobalIndex);
      expect(state).toBe(true);
      
      // Verify the checkbox state is correctly read back
      const readState = app.getCheckboxState(testCase.y, testCase.x); // Note: row, col order
      expect(readState).toBe(true);
    }
    
    console.log('=== GLOBAL INDEX CALCULATION TESTS PASSED ===');
  });
});