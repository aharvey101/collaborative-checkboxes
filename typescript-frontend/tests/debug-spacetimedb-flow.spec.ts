import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Debug SpacetimeDB Flow', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide debugging configuration', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Should have debug-friendly configuration
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    
    // Log configuration for debugging
    console.log('Debug configuration:', dbConfig);
  });

  test('should handle debug environment setup', () => {
    const environment = process.env.TEST_ENV || 'ci';
    const baseUrl = testConfig.getBaseUrl();
    const timeout = testConfig.getTestTimeout();
    
    console.log('Debug environment:', environment);
    console.log('Debug base URL:', baseUrl);
    console.log('Debug timeout:', timeout);
    
    // Validate debug configuration
    expect(baseUrl).toBeTruthy();
    expect(timeout).toBeGreaterThan(0);
  });

  test('should provide debugging information for data flow', () => {
    const config = {
      environment: process.env.TEST_ENV || 'ci',
      database: testConfig.getDatabaseConfig(),
      baseUrl: testConfig.getBaseUrl(),
      timeout: testConfig.getTestTimeout(),
      shouldSkipE2E: testConfig.shouldSkipE2E()
    };
    
    console.log('Complete debug configuration:', JSON.stringify(config, null, 2));
    
    // All debug info should be available
    expect(config.environment).toBeTruthy();
    expect(config.database.server).toBeTruthy();
    expect(config.database.database).toBeTruthy();
    expect(config.baseUrl).toBeTruthy();
    expect(config.timeout).toBeGreaterThan(0);
    expect(typeof config.shouldSkipE2E).toBe('boolean');
  });

  test('should validate configuration file paths for debugging', () => {
    const configFile = testConfig.getConfigFile();
    
    console.log('Debug config file:', configFile);
    
    // Should provide valid config file path
    expect(configFile).toBeTruthy();
    expect(configFile.endsWith('.json')).toBe(true);
    
    // Should match environment
    const environment = process.env.TEST_ENV || 'ci';
    switch (environment) {
      case 'production':
        expect(configFile).toBe('spacetime.json');
        break;
      case 'staging':
        expect(configFile).toBe('spacetime.staging.json');
        break;
      case 'ci':
        expect(configFile).toBe('spacetime.ci.json');
        break;
    }
  });
});

  // Wait for the app to initialize
  await page.waitForTimeout(3000);

  console.log('=== INITIAL STATE ===');
  console.log('Console messages so far:', consoleMessages.length);
  
  // Find and click a checkbox in the canvas
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  console.log('=== CLICKING CHECKBOX ===');
  
  // Click at position 0,0 to test the first bit (easier to debug)
  await canvas.click({ position: { x: 16, y: 16 } });  // Center of first cell

  // Wait for any async operations to complete
  await page.waitForTimeout(5000);

  console.log('=== POST-CLICK STATE ===');
  console.log('Total console messages:', consoleMessages.length);
  console.log('Network requests:', networkRequests.length);

  // Analyze the debug logs we added
  const debugLogs = {
    reducerCall: consoleMessages.filter(msg => msg.includes('[DEBUG-1] About to call reducer')),
    reducerComplete: consoleMessages.filter(msg => msg.includes('[DEBUG-2] Reducer call completed')),
    subscriptionSetup: consoleMessages.filter(msg => msg.includes('[DEBUG-SUB]')),
    callbackTrigger: consoleMessages.filter(msg => msg.includes('[DEBUG-UPDATE] Update callback triggered')),
    callbackNotify: consoleMessages.filter(msg => msg.includes('[DEBUG-NOTIFY]')),
    renderCalls: consoleMessages.filter(msg => msg.includes('[RENDER]')),
    stateVerification: consoleMessages.filter(msg => msg.includes('[VERIFY]'))
  };

  console.log('=== DEBUG LOG ANALYSIS ===');
  Object.entries(debugLogs).forEach(([category, logs]) => {
    console.log(`${category}: ${logs.length} messages`);
    logs.forEach(log => console.log(`  ${log}`));
  });

  console.log('=== NETWORK ANALYSIS ===');
  networkRequests.forEach(req => console.log(req));

  // Check for specific failure points
  const hasReducerCall = debugLogs.reducerCall.length > 0;
  const hasReducerComplete = debugLogs.reducerComplete.length > 0;
  const hasCallbackTrigger = debugLogs.callbackTrigger.length > 0;
  const hasRenderCall = debugLogs.renderCalls.length > 0;

  console.log('=== FAILURE POINT ANALYSIS ===');
  console.log(`Reducer call initiated: ${hasReducerCall}`);
  console.log(`Reducer call completed: ${hasReducerComplete}`);
  console.log(`Subscription callback triggered: ${hasCallbackTrigger}`);
  console.log(`Render called after update: ${hasRenderCall}`);

  // Determine the failure point
  if (!hasReducerCall) {
    console.log('❌ FAILURE POINT: Click handler not triggering reducer call');
  } else if (!hasReducerComplete) {
    console.log('❌ FAILURE POINT: Reducer call fails or times out');
  } else if (!hasCallbackTrigger) {
    console.log('❌ FAILURE POINT: Subscription callbacks not firing (database connection or subscription issue)');
  } else if (!hasRenderCall) {
    console.log('❌ FAILURE POINT: Callbacks fire but render not triggered');
  } else {
    console.log('✅ All debug points reached - issue may be in render logic or state persistence');
  }

  // Check for any errors
  const errorLogs = consoleMessages.filter(msg => 
    msg.includes('error:') || msg.includes('ERROR') || msg.includes('❌')
  );
  
  if (errorLogs.length > 0) {
    console.log('=== ERROR MESSAGES ===');
    errorLogs.forEach(error => console.log(error));
  }

  // Take a screenshot for visual verification
  await page.screenshot({ path: 'checkbox-debug-screenshot.png' });
  console.log('Screenshot saved: checkbox-debug-screenshot.png');
});