import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('SpacetimeDB Configuration Fix', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should use constructor parameters from test config instead of hardcoded defaults', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Verify that configuration is loaded dynamically from files
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    
    // Should not be using hardcoded defaults
    expect(dbConfig.server).not.toBe('localhost:3000');
    expect(dbConfig.database).not.toBe('hardcoded-default');
  });

  test('should provide environment-specific configuration', () => {
    const environment = process.env.TEST_ENV || 'ci';
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Verify environment-specific config is used
    switch (environment) {
      case 'production':
        expect(dbConfig.server).toContain('maincloud.spacetimedb.com');
        break;
      case 'staging':
        // Staging should have its own configuration
        expect(dbConfig.server).toBeTruthy();
        expect(dbConfig.database).toBeTruthy();
        break;
      case 'ci':
        // CI should use local configuration
        expect(dbConfig.server).toBeTruthy();
        expect(dbConfig.database).toBeTruthy();
        break;
    }
  });

  test('should validate configuration file structure', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Configuration should have required fields
    expect(dbConfig).toHaveProperty('server');
    expect(dbConfig).toHaveProperty('database');
    
    // Values should be strings
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
    
    // Values should not be empty
    expect(dbConfig.server.length).toBeGreaterThan(0);
    expect(dbConfig.database.length).toBeGreaterThan(0);
  });

  test('should handle configuration loading errors', () => {
    // Test that configuration can be loaded without throwing
    expect(() => testConfig.getDatabaseConfig()).not.toThrow();
    expect(() => testConfig.getBaseUrl()).not.toThrow();
    expect(() => testConfig.getTestTimeout()).not.toThrow();
  });
});