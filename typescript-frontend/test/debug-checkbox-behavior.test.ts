import { describe, test, beforeEach, afterEach, expect, vi } from 'vitest';
import { SpacetimeDBCheckboxApp } from '../src/SpacetimeDBCheckboxApp.js';

describe('Debug Checkbox Behavior - Real Database Calls', () => {
  let app: SpacetimeDBCheckboxApp;
  let canvas: HTMLCanvasElement;
  let consoleLogs: string[] = [];

  beforeEach(async () => {
    // Capture console.log for analysis
    consoleLogs = [];
    const originalConsoleLog = console.log;
    vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      const message = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
      consoleLogs.push(message);
      originalConsoleLog(...args);
    });

    // Create DOM elements
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    document.body.appendChild(canvas);

    // Create app instance with REAL database (but expect connection to fail)
    app = new SpacetimeDBCheckboxApp();
    
    // Initialize the app (this will try real connection and likely fail)
    app.initializeCanvas(canvas);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for connection attempt
  });

  afterEach(() => {
    document.body.removeChild(canvas);
    vi.clearAllMocks();
  });

  test('debug multiple checkbox toggles with full logging', async () => {
    console.log('=== STARTING DEBUG TEST ===');
    
    // Clear existing logs to focus on our test
    consoleLogs = [];
    
    // Toggle first checkbox at (0, 0)
    console.log('🧪 TEST: Toggling checkbox (0, 0)');
    await app.toggleCheckbox(0, 0);
    
    console.log('🧪 TEST: Checking state of (0, 0)');
    const state1 = app.getCheckboxState(0, 0);
    console.log(`🧪 TEST: State of (0, 0) = ${state1}`);
    
    // Toggle second checkbox at (1, 0) 
    console.log('🧪 TEST: Toggling checkbox (1, 0)');
    await app.toggleCheckbox(1, 0);
    
    console.log('🧪 TEST: Checking state of (0, 1)');
    const state2 = app.getCheckboxState(0, 1);
    console.log(`🧪 TEST: State of (0, 1) = ${state2}`);
    
    // THE CRITICAL QUESTION: Is the first checkbox still checked?
    console.log('🧪 TEST: Re-checking state of (0, 0) after second toggle');
    const state1After = app.getCheckboxState(0, 0);
    console.log(`🧪 TEST: State of (0, 0) after second toggle = ${state1After}`);
    
    // Print all debug logs for analysis
    console.log('\n=== FULL DEBUG TRACE ===');
    consoleLogs.forEach((log, i) => {
      console.log(`${i.toString().padStart(3, '0')}: ${log}`);
    });
    
    // These are the bug expectations - if the test fails here, we've reproduced the bug
    expect(state1).toBe(true); // First checkbox should be checked
    expect(state2).toBe(true); // Second checkbox should be checked  
    expect(state1After).toBe(true); // CRITICAL: First should STILL be checked
    
    console.log('=== DEBUG TEST COMPLETE ===');
  });
});