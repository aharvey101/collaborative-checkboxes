#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export class StagingDatabaseReset {
  constructor() {
    this.backendDir = path.resolve('../backend');
    this.backupPath = path.join(this.backendDir, 'spacetime.json.backup');
  }

  async switchToStaging() {
    const stagingConfig = path.join(this.backendDir, 'spacetime.staging.json');
    const mainConfig = path.join(this.backendDir, 'spacetime.json');
    
    // Backup current config
    if (await fs.pathExists(mainConfig)) {
      await fs.copy(mainConfig, this.backupPath);
    }
    
    // Switch to staging
    await fs.copy(stagingConfig, mainConfig);
    console.log('✓ Switched to staging configuration');
  }

  async restoreConfig() {
    if (await fs.pathExists(this.backupPath)) {
      const mainConfig = path.join(this.backendDir, 'spacetime.json');
      await fs.copy(this.backupPath, mainConfig);
      await fs.remove(this.backupPath);
      console.log('✓ Restored original configuration');
    }
  }

  async clearDatabase() {
    console.log('🧹 Clearing staging database...');
    
    try {
      // Get current staging database info
      const result = execSync('spacetime describe', { 
        cwd: this.backendDir,
        encoding: 'utf8' 
      });
      
      console.log('Database info:', result);
      
      // Clear all tables by calling a special reset reducer
      // Note: This requires adding a reset reducer to the SpacetimeDB module
      const clearResult = execSync('spacetime call reset_all_data', {
        cwd: this.backendDir,
        encoding: 'utf8'
      });
      
      console.log('✅ Staging database cleared successfully');
      console.log('Clear result:', clearResult);
      
    } catch (error) {
      console.error('❌ Failed to clear staging database:', error.message);
      
      // Fallback: Try to redeploy the module (this will create fresh tables)
      console.log('🔄 Attempting fallback: redeploying module...');
      try {
        execSync('spacetime publish --force', { 
          cwd: this.backendDir,
          stdio: 'inherit' 
        });
        console.log('✅ Module redeployed successfully');
      } catch (deployError) {
        console.error('❌ Fallback deployment also failed:', deployError.message);
        throw deployError;
      }
    }
  }

  async logResetActivity() {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - Staging database reset completed\n`;
    
    try {
      await fs.appendFile('staging-reset.log', logEntry);
    } catch (error) {
      console.warn('Warning: Could not write to log file:', error.message);
    }
  }

  async run() {
    try {
      console.log('🚀 Starting staging database reset...');
      
      await this.switchToStaging();
      await this.clearDatabase();
      await this.logResetActivity();
      
      console.log('✅ Staging reset completed successfully');
      
    } catch (error) {
      console.error('❌ Staging reset failed:', error.message);
      process.exit(1);
    } finally {
      await this.restoreConfig();
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const resetManager = new StagingDatabaseReset();
  await resetManager.run();
}