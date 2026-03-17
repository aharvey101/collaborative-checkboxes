import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Page Refresh Persistence Configuration', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide stable configuration for persistence across refreshes', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Configuration must be stable for persistence testing
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    
    // Values should be consistent across multiple calls
    const config2 = testConfig.getDatabaseConfig();
    expect(dbConfig).toEqual(config2);
  });

  test('should provide environment-aware persistence configuration', () => {
    const environment = process.env.TEST_ENV || 'ci';
    const baseUrl = testConfig.getBaseUrl();
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Persistence tests need stable endpoints
    expect(baseUrl).toBeTruthy();
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    
    // Different environments use different persistence backends
    switch (environment) {
      case 'ci':
        expect(baseUrl).toBe('http://localhost:5174');
        break;
      case 'staging':
        expect(baseUrl).toBe('https://checkbox-grid-staging.netlify.app');
        break;
      case 'production':
        expect(baseUrl).toBe('https://checkbox-grid-100x100.netlify.app');
        break;
    }
  });

  test('should handle persistence-appropriate timeouts', () => {
    const timeout = testConfig.getTestTimeout();
    const environment = process.env.TEST_ENV || 'ci';
    
    // Persistence tests may need longer timeouts
    expect(timeout).toBeGreaterThan(5000);
    
    switch (environment) {
      case 'ci':
        expect(timeout).toBe(10000);
        break;
      case 'staging':
      case 'production':
        expect(timeout).toBe(30000); // Remote persistence needs more time
        break;
    }
  });

  test('should support persistence test environment controls', () => {
    const shouldSkipE2E = testConfig.shouldSkipE2E();
    const environment = process.env.TEST_ENV || 'ci';
    
    // Persistence E2E tests are complex and may be skipped in CI
    if (environment === 'ci' && !process.env.RUN_E2E_TESTS) {
      expect(shouldSkipE2E).toBe(true);
    }
  });
});
      type: msg.type(),
      text: msg.text()
    });
  });

  // Wait for the app to initialize and connect
  await page.waitForTimeout(4000);

  // Wait for at least one render call to ensure connection is complete
  let initialRenderCount = 0;
  let retries = 10;
  while (initialRenderCount === 0 && retries > 0) {
    initialRenderCount = consoleMessages.filter(msg => 
      msg.text.includes('🎨 [RENDER] Complete')
    ).length;
    if (initialRenderCount === 0) {
      await page.waitForTimeout(500);
      retries--;
    }
  }
  
  console.log(`Initial render calls detected: ${initialRenderCount}`);

  console.log('=== PAGE REFRESH PERSISTENCE TEST ===');

  const canvas = page.locator('canvas');

  // Click multiple checkboxes in different positions to create a pattern
  console.log('Checking multiple boxes before refresh...');
  
  // Click checkbox at (0, 0) 
  await canvas.click({ position: { x: 16, y: 16 } });
  await page.waitForTimeout(300);
  
  // Click checkbox at (2, 0)  
  await canvas.click({ position: { x: 80, y: 16 } });
  await page.waitForTimeout(300);
  
  // Click checkbox at (0, 2)  
  await canvas.click({ position: { x: 16, y: 80 } });
  await page.waitForTimeout(300);
  
  // Click checkbox at (3, 3) 
  await canvas.click({ position: { x: 112, y: 112 } });
  await page.waitForTimeout(300);

  // Verify all checkboxes are checked before refresh
  const renderMessages = consoleMessages.filter(msg => msg.text.includes('🎨 [RENDER] Complete'));
  const lastRenderMsg = renderMessages[renderMessages.length - 1];
  
  const preRefreshMatch = lastRenderMsg?.text.match(/Checked: (\d+)/);
  const preRefreshState = preRefreshMatch ? parseInt(preRefreshMatch[1]) : 0;

  console.log(`Pre-refresh checked count: ${preRefreshState}`);
  expect(preRefreshState).toBe(4); // Should have 4 checkboxes checked

  // Wait a bit more to ensure database sync completes
  await page.waitForTimeout(1000);

  console.log('Refreshing the page...');

  // Reset console tracking for post-refresh
  consoleMessages = [];
  
  // Refresh the page
  await page.reload();

  console.log('Waiting for auto-connection after refresh...');

  // Wait for auto-connection to complete after refresh
  await page.waitForTimeout(4000);
  
  // Wait for render calls to detect connection completion
  let postRefreshRenderCount = 0;
  let postRetries = 15; // Give more time for refresh
  while (postRefreshRenderCount === 0 && postRetries > 0) {
    postRefreshRenderCount = consoleMessages.filter(msg => 
      msg.text.includes('🎨 [RENDER] Complete')
    ).length;
    if (postRefreshRenderCount === 0) {
      await page.waitForTimeout(1000);
      postRetries--;
    }
  }

  console.log(`Post-refresh render calls detected: ${postRefreshRenderCount}`);

  // Debug: Show all console messages to understand what's happening
  console.log('=== POST-REFRESH CONSOLE MESSAGES ===');
  consoleMessages.forEach((msg, idx) => {
    if (msg.text.includes('chunks') || msg.text.includes('RENDER') || msg.text.includes('DB')) {
      console.log(`${idx}: ${msg.text}`);
    }
  });

  // Get the final checked count after reload
  const postRenderMessages = consoleMessages.filter(msg => msg.text.includes('🎨 [RENDER] Complete'));
  const lastPostRenderMsg = postRenderMessages[postRenderMessages.length - 1];
  
  console.log(`Last render message: ${lastPostRenderMsg?.text || 'none'}`);
  
  const postRefreshMatch = lastPostRenderMsg?.text.match(/Checked: (\d+)/);
  const postRefreshState = postRefreshMatch ? parseInt(postRefreshMatch[1]) : 0;

  console.log(`Post-refresh checked count: ${postRefreshState}`);

  // Verify that all checkboxes remain checked after page refresh
  expect(postRefreshState).toBe(4);
  
  console.log('✅ Page refresh persistence test passed - all checkboxes restored from database');

  // Take screenshot to verify visual state
  await page.screenshot({ path: 'page-refresh-persistence-test.png' });
});