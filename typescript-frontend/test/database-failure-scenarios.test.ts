import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { SpacetimeDBCheckboxApp } from '../src/SpacetimeDBCheckboxApp.js';

describe('Database Failure Scenarios', () => {
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
    
    // Initialize the app
    app.initializeCanvas(canvas);
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    document.body.removeChild(canvas);
    vi.clearAllMocks();
  });

  test('should maintain state when database calls timeout', async () => {
    // Create database mock that simulates timeouts
    mockDatabase = {
      connect: vi.fn().mockResolvedValue(true),
      updateCheckbox: vi.fn().mockImplementation(() => {
        // Simulate hanging promise that never resolves
        return new Promise(() => {}); // Never resolves
      }),
      addChunk: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      getAllChunks: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(undefined),
    };

    // Replace database with timeout mock
    (app as any).checkboxDatabase = mockDatabase;

    console.log('=== TESTING DATABASE TIMEOUT BEHAVIOR ===');
    
    // Initial states should be false
    expect(app.getCheckboxState(0, 0)).toBe(false);
    expect(app.getCheckboxState(0, 1)).toBe(false);
    
    console.log('🧪 Step 1: Toggle checkbox with timeout - this should hang');
    
    // Start the toggle operation but don't await (it will hang)
    const togglePromise = app.toggleCheckbox(0, 0);
    
    // Give it a moment to start, then check state
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('🔍 Checking state while database call is hanging...');
    const stateWhileHanging = app.getCheckboxState(0, 0);
    console.log(`State (0, 0) while hanging: ${stateWhileHanging}`);
    
    // State should still be false since database call hasn't completed
    expect(stateWhileHanging).toBe(false);
    
    console.log('🧪 Step 2: Try toggle second checkbox while first is hanging');
    
    // Try to toggle another checkbox
    const togglePromise2 = app.toggleCheckbox(1, 0);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('🔍 Checking both states while both calls are hanging...');
    expect(app.getCheckboxState(0, 0)).toBe(false); // First should still be false
    expect(app.getCheckboxState(0, 1)).toBe(false); // Second should still be false
    
    console.log('=== TIMEOUT BEHAVIOR VERIFIED ===');
    
    // Note: We don't await the hanging promises to avoid test timeout
  });

  test('should maintain state when database calls fail with errors', async () => {
    // Create database mock that throws errors
    mockDatabase = {
      connect: vi.fn().mockResolvedValue(true),
      updateCheckbox: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      addChunk: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      getAllChunks: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(undefined),
    };

    // Replace database with error mock
    (app as any).checkboxDatabase = mockDatabase;

    console.log('=== TESTING DATABASE ERROR BEHAVIOR ===');
    
    // Initial state should be false
    expect(app.getCheckboxState(0, 0)).toBe(false);
    
    console.log('🧪 Step 1: Toggle checkbox with database error');
    
    // This should handle the error gracefully
    await app.toggleCheckbox(0, 0);
    
    // State should remain false since database failed
    const stateAfterError = app.getCheckboxState(0, 0);
    console.log(`State (0, 0) after database error: ${stateAfterError}`);
    expect(stateAfterError).toBe(false);
    
    console.log('🧪 Step 2: Toggle second checkbox');
    await app.toggleCheckbox(1, 0);
    
    // Both states should remain false
    expect(app.getCheckboxState(0, 0)).toBe(false);
    expect(app.getCheckboxState(0, 1)).toBe(false);
    
    // Verify database was called but failed
    expect(mockDatabase.updateCheckbox).toHaveBeenCalledTimes(2);
    
    console.log('=== ERROR BEHAVIOR VERIFIED ===');
  });

  test('should handle mixed success and failure scenarios', async () => {
    let callCount = 0;
    
    // Create database mock that succeeds sometimes, fails others
    mockDatabase = {
      connect: vi.fn().mockResolvedValue(true),
      updateCheckbox: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount % 2 === 1) {
          // Odd calls succeed
          return Promise.resolve();
        } else {
          // Even calls fail
          return Promise.reject(new Error('Intermittent failure'));
        }
      }),
      addChunk: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn().mockReturnValue(true),
      getAllChunks: vi.fn().mockResolvedValue([]),
      subscribe: vi.fn().mockResolvedValue(undefined),
    };

    (app as any).checkboxDatabase = mockDatabase;

    console.log('=== TESTING MIXED SUCCESS/FAILURE SCENARIOS ===');
    
    // Call 1: Should succeed (odd)
    console.log('🧪 Call 1: Should succeed');
    await app.toggleCheckbox(0, 0);
    expect(app.getCheckboxState(0, 0)).toBe(true);
    
    // Call 2: Should fail (even)  
    console.log('🧪 Call 2: Should fail');
    await app.toggleCheckbox(1, 0);
    expect(app.getCheckboxState(0, 1)).toBe(false); // Should remain false
    
    // Call 3: Should succeed (odd)
    console.log('🧪 Call 3: Should succeed');
    await app.toggleCheckbox(0, 1);
    expect(app.getCheckboxState(1, 0)).toBe(true);
    
    // Verify previous successful state is still intact
    expect(app.getCheckboxState(0, 0)).toBe(true); // Should still be true from call 1
    
    console.log('=== MIXED SCENARIOS VERIFIED ===');
  });
});