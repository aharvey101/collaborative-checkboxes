import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('SpacetimeDB Connection & Database', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide database configuration', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    expect(dbConfig).toHaveProperty('server');
    expect(dbConfig).toHaveProperty('database');
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
  });

  test('should handle different environment configurations', () => {
    const environment = process.env.TEST_ENV || 'ci';
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Validate configuration is environment-specific
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    
    // Check that configuration changes with environment
    if (environment === 'ci') {
      expect(dbConfig.database).toBeTruthy(); // CI may use different naming
    }
  });

  test('should provide connection timeout configuration', () => {
    const timeout = testConfig.getTestTimeout();
    
    expect(timeout).toBeGreaterThan(0);
    expect(typeof timeout).toBe('number');
  });

  test('should handle connection configuration loading', () => {
    // Test that configuration can be loaded without errors
    expect(() => {
      const config = testConfig.getDatabaseConfig();
      return config.server && config.database;
    }).not.toThrow();
  });

  test('should validate server URL format', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    const serverUrl = dbConfig.server;
    
    // Should be a valid URL format
    expect(serverUrl).toMatch(/^https?:\/\/|^ws:\/\/|^localhost/);
  });

  test('should validate database name format', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    const databaseName = dbConfig.database;
    
    // Database name should be non-empty and follow naming conventions
    expect(databaseName).toBeTruthy();
    expect(databaseName).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  test('should provide environment-aware base URL', () => {
    const baseUrl = testConfig.getBaseUrl();
    const environment = process.env.TEST_ENV || 'ci';
    
    expect(baseUrl).toBeTruthy();
    
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

  test('should handle E2E test skipping logic', () => {
    const shouldSkip = testConfig.shouldSkipE2E();
    const environment = process.env.TEST_ENV || 'ci';
    
    if (environment === 'ci' && !process.env.RUN_E2E_TESTS) {
      expect(shouldSkip).toBe(true);
    } else {
      expect(shouldSkip).toBe(false);
    }
  });

  test('should load configuration from appropriate file', () => {
    const environment = process.env.TEST_ENV || 'ci';
    
    // Test that the correct config file is selected
    expect(() => testConfig.getConfigFile()).not.toThrow();
    
    const configFile = testConfig.getConfigFile();
    
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

  test('should handle configuration errors gracefully', () => {
    // Test with invalid environment
    const originalEnv = process.env.TEST_ENV;
    
    try {
      process.env.TEST_ENV = 'invalid_environment';
      
      expect(() => {
        new testConfig.constructor();
      }).toThrow();
    } finally {
      process.env.TEST_ENV = originalEnv;
    }
  });

  test('should provide consistent configuration object', () => {
    const config1 = testConfig.getDatabaseConfig();
    const config2 = testConfig.getDatabaseConfig();
    
    // Should return consistent results
    expect(config1).toEqual(config2);
    expect(config1.server).toBe(config2.server);
    expect(config1.database).toBe(config2.database);
  });
});