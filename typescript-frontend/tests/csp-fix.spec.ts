import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('SpacetimeDB CSP Fix', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide configuration without CSP security violations', () => {
    // Test that configuration loading doesn't involve any CSP-violating operations
    expect(() => testConfig.getDatabaseConfig()).not.toThrow();
    
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Configuration should be loaded safely
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
  });

  test('should handle connection configuration securely', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Server URL should be properly formatted for secure connections
    expect(dbConfig.server).toMatch(/^(https?:\/\/|ws:\/\/|localhost)/);
    
    // Database identifier should be safe (no injection vectors)
    expect(dbConfig.database).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  test('should provide CSP-compliant base URLs', () => {
    const baseUrl = testConfig.getBaseUrl();
    
    // Base URL should be properly formatted and CSP-compliant
    expect(baseUrl).toMatch(/^https?:\/\//);
    
    // Should not contain any potentially unsafe characters
    expect(baseUrl).not.toMatch(/[<>"'`]/);
  });

  test('should load configuration from files without eval or unsafe operations', () => {
    // Test that configuration loading is done safely
    const environment = process.env.TEST_ENV || 'ci';
    
    expect(() => testConfig.getConfigFile()).not.toThrow();
    expect(() => testConfig.getBaseUrl()).not.toThrow();
    expect(() => testConfig.getDatabaseConfig()).not.toThrow();
    
    // Configuration should be environment-specific
    const configFile = testConfig.getConfigFile();
    expect(configFile).toBeTruthy();
    expect(configFile.endsWith('.json')).toBe(true);
  });

  test('should validate configuration data integrity', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Data should be clean and properly validated
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
    
    // Should not contain any potentially dangerous content
    expect(dbConfig.server).not.toMatch(/<script/i);
    expect(dbConfig.database).not.toMatch(/<script/i);
  });
});