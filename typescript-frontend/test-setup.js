#!/usr/bin/env node
import path from 'path';

/**
 * Playwright global setup for SpacetimeDB collaborative checkbox tests
 * Ensures clean database state before test runs
 */
async function globalSetup() {
  console.log('🚀 Starting Playwright global setup...');
  
  try {
    // Import the test database manager
    const modulePath = path.resolve('../scripts/test-db-manager.js');
    const module = await import(modulePath);
    
    // Create instance - handle both default and named exports
    const TestDatabaseManager = module.TestDatabaseManager || module.default;
    const dbManager = new TestDatabaseManager();

    // Switch to appropriate test environment
    const testEnv = process.env.TEST_ENV || 'ci';
    console.log(`📋 Setting up environment: ${testEnv}`);
    
    if (testEnv === 'ci') {
      // Start local SpacetimeDB for CI environment
      await dbManager.startLocalSpacetimeDB();
    }
    
    // Switch to test environment configuration
    await dbManager.switchEnvironment(testEnv);
    
    // Reset test data to ensure clean state
    await dbManager.resetTestData();
    
    console.log('✅ Playwright global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error.message);
    throw error;
  }
}

export default globalSetup;