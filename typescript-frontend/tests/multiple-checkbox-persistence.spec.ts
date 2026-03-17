import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Multiple Checkbox Persistence Configuration', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide consistent configuration for persistence testing', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Configuration should support persistence features
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    
    // Database connection should be stable for persistence
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
  });

  test('should handle multiple test runs with same configuration', () => {
    const config1 = testConfig.getDatabaseConfig();
    const config2 = testConfig.getDatabaseConfig();
    const config3 = testConfig.getDatabaseConfig();
    
    // Should return consistent configuration across calls
    expect(config1).toEqual(config2);
    expect(config2).toEqual(config3);
    expect(config1.server).toBe(config2.server);
    expect(config1.database).toBe(config2.database);
  });

  test('should provide appropriate timeout for persistence tests', () => {
    const timeout = testConfig.getTestTimeout();
    
    // Persistence tests may need more time
    expect(timeout).toBeGreaterThan(5000);
    
    const environment = process.env.TEST_ENV || 'ci';
    switch (environment) {
      case 'ci':
        expect(timeout).toBe(10000);
        break;
      case 'staging':
      case 'production':
        expect(timeout).toBe(30000);
        break;
    }
  });

  test('should support environment-aware persistence testing', () => {
    const environment = process.env.TEST_ENV || 'ci';
    const shouldSkipE2E = testConfig.shouldSkipE2E();
    
    // CI should skip E2E tests by default
    if (environment === 'ci' && !process.env.RUN_E2E_TESTS) {
      expect(shouldSkipE2E).toBe(true);
    }
    
    // Other environments should allow E2E testing
    if (environment !== 'ci' || process.env.RUN_E2E_TESTS) {
      expect(shouldSkipE2E).toBe(false);
    }
  });
});