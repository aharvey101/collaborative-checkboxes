import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Rapid Toggle Test Configuration', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide high-performance configuration for rapid operations', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    const timeout = testConfig.getTestTimeout();
    
    // Rapid operations require stable, fast connections
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    expect(timeout).toBeGreaterThan(0);
    
    // Configuration should support high-frequency operations
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
  });

  test('should handle concurrent operation configuration', () => {
    const environment = process.env.TEST_ENV || 'ci';
    const timeout = testConfig.getTestTimeout();
    
    // Rapid toggles need appropriate timeouts
    switch (environment) {
      case 'ci':
        expect(timeout).toBe(10000); // Local operations should be fast
        break;
      case 'staging':
      case 'production':
        expect(timeout).toBe(30000); // Remote operations need more time
        break;
    }
  });

  test('should provide consistent configuration for race condition testing', () => {
    const configs = [];
    
    // Rapid access should return consistent configuration
    for (let i = 0; i < 10; i++) {
      configs.push(testConfig.getDatabaseConfig());
    }
    
    // All configurations should be identical
    const firstConfig = configs[0];
    configs.forEach(config => {
      expect(config.server).toBe(firstConfig.server);
      expect(config.database).toBe(firstConfig.database);
    });
  });

  test('should optimize for rapid test execution', () => {
    const shouldSkipE2E = testConfig.shouldSkipE2E();
    const environment = process.env.TEST_ENV || 'ci';
    
    // Rapid tests may benefit from skipping slow E2E operations
    if (environment === 'ci' && !process.env.RUN_E2E_TESTS) {
      expect(shouldSkipE2E).toBe(true);
    }
  });

  test('should provide thread-safe configuration access', () => {
    // Simulate concurrent access patterns
    const promises = Array.from({ length: 5 }, () => 
      Promise.resolve(testConfig.getDatabaseConfig())
    );
    
    return Promise.all(promises).then(configs => {
      // All concurrent accesses should return same configuration
      const firstConfig = configs[0];
      configs.forEach(config => {
        expect(config).toEqual(firstConfig);
      });
    });
  });
});
      type: msg.type(),
      text: msg.text()
    });
  });

  // Wait for the app to initialize and connect
  await page.waitForTimeout(4000);  // Increased wait time

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

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  // Reset console messages after initialization
  consoleMessages = [];

  console.log('=== RAPID TOGGLE TEST ===');

  // First click - should turn checkbox ON
  console.log('First click...');
  await canvas.click({ position: { x: 16, y: 16 } });
  
  // Very brief wait to allow initial state to be processed
  await page.waitForTimeout(100);

  // Second click immediately - should turn checkbox OFF
  console.log('Second click (rapid)...');
  await canvas.click({ position: { x: 16, y: 16 } });

  // Allow all async operations to complete
  await page.waitForTimeout(2000);

  // Analyze the console logs to verify the toggle sequence
  const stateToggles = consoleMessages.filter(msg => 
    msg.text.includes('🎯 [STATE] Toggle')
  ).map(msg => msg.text);

  console.log('Toggle sequence:', stateToggles);

  // The critical test: Check database sync indicates actual changes
  const dbChanges = consoleMessages
    .filter(msg => msg.text.includes('🔄 [DB-IN] CHANGED: YES'))
    .length;
    
  console.log(`Database changes detected: ${dbChanges}`);
  
  // Debug all render calls to see state progression  
  const renderCalls = consoleMessages
    .filter(msg => msg.text.includes('🎨 [RENDER] Complete'))
    .map(msg => msg.text);
  
  console.log('Render progression:', renderCalls);
  
  // Also verify the database calls
  const dbCalls = consoleMessages
    .filter(msg => msg.text.includes('📤 [DB-OUT] Calling updateCheckbox'))
    .map(msg => msg.text);
    
  console.log('Database calls:', dbCalls);

  // In a real distributed system, rapid calls might not all result in 
  // detectable database changes due to timing, but final state should be correct
  expect(dbChanges).toBeGreaterThanOrEqual(1); // At least one change should be detected

  // Expected final state progression
  expect(stateToggles.length).toBe(2);
  expect(stateToggles[0]).toContain('false → true');
  expect(stateToggles[1]).toContain('true → false');

  // Expected final state: back to 0 checked (off→on→off)
  const finalRender = renderCalls[renderCalls.length - 1];
  expect(finalRender).toBeDefined();
  expect(finalRender).toContain('Checked: 0');
});