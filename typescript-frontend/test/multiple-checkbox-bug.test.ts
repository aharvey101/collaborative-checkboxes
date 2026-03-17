import { describe, test, beforeEach, afterEach, expect, vi, type Mock } from 'vitest';
import { SpacetimeDBCheckboxApp } from '../src/SpacetimeDBCheckboxApp.js';

describe('Multiple Checkbox State Bug', () => {
  let app: SpacetimeDBCheckboxApp;
  let canvas: HTMLCanvasElement;

  beforeEach(async () => {
    // Create DOM elements
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    document.body.appendChild(canvas);

    // Create app instance with mocked database
    app = new SpacetimeDBCheckboxApp();
    
    // Mock database methods to avoid real connections
    vi.spyOn(app['checkboxDatabase'], 'connect').mockResolvedValue(true);
    vi.spyOn(app['checkboxDatabase'], 'updateCheckbox').mockResolvedValue(undefined);
    vi.spyOn(app['checkboxDatabase'], 'addChunk').mockResolvedValue(undefined);
    vi.spyOn(app['checkboxDatabase'], 'isConnected').mockReturnValue(true);
    vi.spyOn(app['checkboxDatabase'], 'getAllChunks').mockResolvedValue([]);

    // Initialize the app
    app.initializeCanvas(canvas);
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for auto-connect
  });

  afterEach(() => {
    document.body.removeChild(canvas);
    vi.clearAllMocks();
  });

  test('should allow multiple checkboxes to be checked simultaneously', async () => {
    // Check first checkbox at (x=0, y=0) 
    await app.toggleCheckbox(0, 0);
    const firstState = app.getCheckboxState(0, 0); // row=0, col=0
    expect(firstState).toBe(true);

    // Check second checkbox at (x=1, y=0)
    await app.toggleCheckbox(1, 0);
    const secondState = app.getCheckboxState(0, 1); // row=0, col=1
    expect(secondState).toBe(true);

    // CRITICAL: First checkbox should STILL be checked
    const firstStateAfter = app.getCheckboxState(0, 0);
    expect(firstStateAfter).toBe(true);

    // Check third checkbox at (x=0, y=1)
    await app.toggleCheckbox(0, 1);
    const thirdState = app.getCheckboxState(1, 0); // row=1, col=0
    expect(thirdState).toBe(true);

    // CRITICAL: Both previous checkboxes should STILL be checked
    expect(app.getCheckboxState(0, 0)).toBe(true); // First checkbox
    expect(app.getCheckboxState(0, 1)).toBe(true); // Second checkbox
  });

  test('should maintain independent state for checkboxes in different positions', async () => {
    // Test checkboxes at various positions (x, y)
    const positions = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2]];
    
    // Check all positions
    for (const [x, y] of positions) {
      await app.toggleCheckbox(x, y);
    }

    // Verify all positions are checked (getCheckboxState expects row, col)
    for (const [x, y] of positions) {
      const state = app.getCheckboxState(y, x); // Convert x,y to row,col
      expect(state).toBe(true);
    }

    // Uncheck one position (x=1, y=0)
    await app.toggleCheckbox(1, 0);
    expect(app.getCheckboxState(0, 1)).toBe(false); // row=0, col=1 should now be unchecked

    // All other positions should remain checked
    expect(app.getCheckboxState(0, 0)).toBe(true); // (x=0,y=0) = row=0,col=0
    expect(app.getCheckboxState(1, 0)).toBe(true); // (x=0,y=1) = row=1,col=0  
    expect(app.getCheckboxState(1, 1)).toBe(true); // (x=1,y=1) = row=1,col=1
    expect(app.getCheckboxState(2, 2)).toBe(true); // (x=2,y=2) = row=2,col=2
  });

  test('should handle bit manipulation correctly across byte boundaries', async () => {
    // Test checkboxes that span different bytes in the chunk
    // Byte 0: bits 0-7, Byte 1: bits 8-15, etc.
    
    // Check bit 7 (last bit of byte 0)
    await app.toggleCheckbox(7, 0); // globalIndex = 0*100 + 7 = 7, bit 7 of byte 0
    
    // Check bit 8 (first bit of byte 1) 
    await app.toggleCheckbox(8, 0); // globalIndex = 0*100 + 8 = 8, bit 0 of byte 1
    
    // Both should be checked
    expect(app.getCheckboxState(0, 7)).toBe(true);
    expect(app.getCheckboxState(0, 8)).toBe(true);
  });
});