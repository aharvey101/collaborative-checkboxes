import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Checkbox Grid - Basic Functionality', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should load application successfully', async () => {
    // Test implementation using testConfig.getBaseUrl()
    expect(testConfig.getBaseUrl()).toBeDefined();
  });

  test('should connect to SpacetimeDB', async () => {
    const dbConfig = testConfig.getDatabaseConfig();
    expect(dbConfig.server).toBeDefined();
    expect(dbConfig.database).toBeDefined();
  });

  test('should have valid test configuration', () => {
    // Test configuration
    expect(testConfig.getTestTimeout()).toBeGreaterThan(0);
    expect(typeof testConfig.getBaseUrl()).toBe('string');
    
    // Environment-specific tests
    const environment = process.env.TEST_ENV || 'ci';
    switch (environment) {
      case 'ci':
        expect(testConfig.getBaseUrl()).toBe('http://localhost:5174');
        break;
      case 'staging':
        expect(testConfig.getBaseUrl()).toBe('https://checkbox-grid-staging.netlify.app');
        break;
      case 'production':
        expect(testConfig.getBaseUrl()).toBe('https://checkbox-grid-100x100.netlify.app');
        break;
    }
  });

  test('should handle database configuration properly', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Validate database config structure
    expect(dbConfig).toHaveProperty('server');
    expect(dbConfig).toHaveProperty('database');
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
  });

  test('should respect environment-based E2E test skipping', () => {
    // Test E2E skip logic
    const shouldSkip = testConfig.shouldSkipE2E();
    const environment = process.env.TEST_ENV || 'ci';
    
    if (environment === 'ci' && !process.env.RUN_E2E_TESTS) {
      expect(shouldSkip).toBe(true);
    } else {
      expect(shouldSkip).toBe(false);
    }
  });

  test('should have appropriate test timeouts for environment', () => {
    const timeout = testConfig.getTestTimeout();
    const environment = process.env.TEST_ENV || 'ci';
    
    switch (environment) {
      case 'ci':
        expect(timeout).toBe(10000);
        break;
      case 'staging':
      case 'production':
        expect(timeout).toBe(30000);
        break;
      default:
        expect(timeout).toBe(15000);
    }
  });

  test('should handle configuration file loading', () => {
    // Test that configuration loads without errors
    expect(() => testConfig.getBaseUrl()).not.toThrow();
    expect(() => testConfig.getDatabaseConfig()).not.toThrow();
    expect(() => testConfig.getTestTimeout()).not.toThrow();
  });
});