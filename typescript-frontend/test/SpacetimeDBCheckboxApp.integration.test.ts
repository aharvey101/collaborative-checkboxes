import { describe, test, beforeEach, afterEach, expect } from 'vitest';
import { SpacetimeDBCheckboxApp } from '../src/SpacetimeDBCheckboxApp.js';
import { MemoryManager } from '../src/MemoryManager.js';

describe('SpacetimeDBCheckboxApp Integration', () => {
  let app: SpacetimeDBCheckboxApp;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    app = new SpacetimeDBCheckboxApp();
  });

  afterEach(() => {
    document.body.removeChild(canvas);
  });

  test('should initialize with large canvas based on memory manager', () => {
    app.initializeCanvas(canvas);
    
    // Canvas size should be set based on memory capabilities
    expect(canvas.width).toBeGreaterThanOrEqual(800);
    expect(canvas.height).toBeGreaterThanOrEqual(600);
  });

  test('should handle viewport navigation for large grid', () => {
    app.initializeCanvas(canvas);
    
    // Should be able to navigate to different parts of 100x100 grid
    const result = app.navigateTo(50, 50); // Middle of grid
    expect(result).toBe(true);
  });

  test('should toggle checkboxes at different viewport positions', async () => {
    app.initializeCanvas(canvas);
    
    // Navigate to different position
    app.navigateTo(32, 32); // Move viewport to see cell (1,1)
    
    // Toggle checkbox that would be visible in viewport
    const result = await app.toggleCheckbox(1, 1);
    expect(result).toBe(true);
  });
});