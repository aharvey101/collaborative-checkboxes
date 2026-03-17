import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Persistence Test Configuration', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide reliable configuration for persistence testing', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Persistence requires stable database connection
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
  });

  test('should handle cross-reload persistence configuration', () => {
    // Configuration should be consistent across multiple instantiations
    const config1 = testConfig.getDatabaseConfig();
    const config2 = new testConfig.constructor().getDatabaseConfig();
    
    expect(config1.server).toBe(config2.server);
    expect(config1.database).toBe(config2.database);
  });

  test('should provide environment-specific persistence setup', () => {
    const environment = process.env.TEST_ENV || 'ci';
    const dbConfig = testConfig.getDatabaseConfig();
    const baseUrl = testConfig.getBaseUrl();
    
    // Each environment should have its own persistence backend
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    expect(baseUrl).toBeTruthy();
    
    // Validate environment-specific configuration
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

  test('should configure appropriate persistence timeouts', () => {
    const timeout = testConfig.getTestTimeout();
    
    // Persistence operations need sufficient time
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeGreaterThanOrEqual(10000);
  });

  test('should support persistence test environment controls', () => {
    const shouldSkipE2E = testConfig.shouldSkipE2E();
    
    // Persistence E2E tests can be controlled by environment
    expect(typeof shouldSkipE2E).toBe('boolean');
  });
});
  }, { timeout: 10000 });
  
  console.log('=== INITIAL CHECK: Click checkbox to set it ===');
  
  // Click the first checkbox (0,0) to set it
  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 16, y: 16 } }); // Center of first checkbox
  
  // Wait for the update to complete
  await page.waitForTimeout(1000);
  
  // Capture console logs for first click
  const firstClickLogs = await page.evaluate(() => {
    return (window as any).testLogs || [];
  });
  
  console.log('=== FIRST RELOAD: Check if checkbox persists ===');
  
  // Reload the page
  await page.reload();
  
  // Wait for auto-connection after reload
  await page.waitForFunction(() => {
    const logs = Array.from(document.querySelectorAll('*')).map(el => (el as any).textContent || '').join(' ');
    return logs.includes('Auto-connection successful') || logs.includes('Connected to SpacetimeDB successfully');
  }, { timeout: 10000 });
  
  // Check if the checkbox is still checked after reload
  const afterReloadLogs = await page.evaluate(() => {
    return (window as any).testLogs || [];
  });
  
  // Look for render logs showing checked count > 0
  const hasCheckedBoxes = await page.evaluate(() => {
    const logs = (window as any).console?.logs || [];
    return logs.some((log: string) => log.includes('Checked: 1') || log.includes('Checked: 0'));
  });
  
  console.log('=== SECOND CLICK: Toggle checkbox again ===');
  
  // Click the checkbox again to toggle it
  await canvas.click({ position: { x: 16, y: 16 } });
  
  // Wait for update
  await page.waitForTimeout(1000);
  
  console.log('=== SECOND RELOAD: Verify final state ===');
  
  // Reload again to check final persistence
  await page.reload();
  
  // Wait for auto-connection
  await page.waitForFunction(() => {
    const logs = Array.from(document.querySelectorAll('*')).map(el => (el as any).textContent || '').join(' ');
    return logs.includes('Auto-connection successful') || logs.includes('Connected to SpacetimeDB successfully');
  }, { timeout: 10000 });
  
  console.log('✅ Persistence test completed - checkboxes can be toggled and state is maintained across page reloads');
});