#!/usr/bin/env node
import path from 'path';

/**
 * Playwright global teardown for SpacetimeDB collaborative checkbox tests
 * Cleans up test environment and restores original configuration
 */
async function globalTeardown() {
  console.log('🧹 Starting Playwright global teardown...');
  
  try {
    // Import the test database manager
    const modulePath = path.resolve('../scripts/test-db-manager.js');
    const module = await import(modulePath);
    
    // Create instance - handle both default and named exports
    const TestDatabaseManager = module.TestDatabaseManager || module.default;
    const dbManager = new TestDatabaseManager();
    
    // Restore original environment configuration
    await dbManager.restoreEnvironment();
    
    // Stop local SpacetimeDB if we started it in CI
    const testEnv = process.env.TEST_ENV || 'ci';
    if (testEnv === 'ci') {
      await dbManager.stopLocalSpacetimeDB();
    }
    
    console.log('✅ Playwright global teardown completed successfully');
  } catch (error) {
    console.error('⚠️ Global teardown encountered an issue:', error.message);
    // Don't throw here - teardown failures shouldn't fail the test run
    console.log('Test results are still valid despite teardown issues');
  }
}

export default globalTeardown;