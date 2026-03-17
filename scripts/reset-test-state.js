#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';

/**
 * Reset SpacetimeDB test database state for clean test runs
 */
export async function resetTestState() {
  try {
    const backendDir = path.resolve(path.dirname(import.meta.url.replace('file://', '')), '../backend');
    
    // Clear all checkbox data in test database using SQL
    execSync('spacetime sql "DELETE FROM checkbox_chunk;"', { 
      stdio: 'inherit',
      cwd: backendDir
    });
    console.log('✅ Test state reset successfully');
    return true;
  } catch (error) {
    console.log('⚠️ Test state reset failed:', error.message);
    return false;
  }
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = await resetTestState();
  process.exit(success ? 0 : 1);
}