import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { StagingDatabaseReset } from './reset-staging.js';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs-extra');

describe('StagingDatabaseReset', () => {
  let resetManager;
  const mockBackendDir = path.resolve('../backend');
  const mockBackupPath = path.join(mockBackendDir, 'spacetime.json.backup');
  const mockStagingConfig = path.join(mockBackendDir, 'spacetime.staging.json');
  const mockMainConfig = path.join(mockBackendDir, 'spacetime.json');

  beforeEach(() => {
    resetManager = new StagingDatabaseReset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('switchToStaging', () => {
    test('backs up current config and switches to staging', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.copy.mockResolvedValue();

      await resetManager.switchToStaging();

      expect(fs.pathExists).toHaveBeenCalledWith(mockMainConfig);
      expect(fs.copy).toHaveBeenCalledWith(mockMainConfig, mockBackupPath);
      expect(fs.copy).toHaveBeenCalledWith(mockStagingConfig, mockMainConfig);
    });

    test('skips backup if main config does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);
      fs.copy.mockResolvedValue();

      await resetManager.switchToStaging();

      expect(fs.pathExists).toHaveBeenCalledWith(mockMainConfig);
      expect(fs.copy).toHaveBeenCalledTimes(1); // Only staging to main copy
      expect(fs.copy).toHaveBeenCalledWith(mockStagingConfig, mockMainConfig);
    });
  });

  describe('restoreConfig', () => {
    test('restores backup config when backup exists', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.copy.mockResolvedValue();
      fs.remove.mockResolvedValue();

      await resetManager.restoreConfig();

      expect(fs.pathExists).toHaveBeenCalledWith(mockBackupPath);
      expect(fs.copy).toHaveBeenCalledWith(mockBackupPath, mockMainConfig);
      expect(fs.remove).toHaveBeenCalledWith(mockBackupPath);
    });

    test('does nothing when backup does not exist', async () => {
      fs.pathExists.mockResolvedValue(false);

      await resetManager.restoreConfig();

      expect(fs.pathExists).toHaveBeenCalledWith(mockBackupPath);
      expect(fs.copy).not.toHaveBeenCalled();
      expect(fs.remove).not.toHaveBeenCalled();
    });
  });

  describe('clearDatabase', () => {
    test('successfully clears database with reset_all_data command', async () => {
      execSync
        .mockReturnValueOnce('Database: collaborative-checkboxes-staging')
        .mockReturnValueOnce('Reset successful');

      await resetManager.clearDatabase();

      expect(execSync).toHaveBeenCalledWith('spacetime describe', {
        cwd: mockBackendDir,
        encoding: 'utf8'
      });
      expect(execSync).toHaveBeenCalledWith('spacetime call reset_all_data', {
        cwd: mockBackendDir,
        encoding: 'utf8'
      });
    });

    test('falls back to module redeploy when reset command fails', async () => {
      execSync
        .mockReturnValueOnce('Database: collaborative-checkboxes-staging')
        .mockImplementationOnce(() => {
          throw new Error('reset_all_data command not found');
        })
        .mockReturnValueOnce('Module deployed successfully');

      await resetManager.clearDatabase();

      expect(execSync).toHaveBeenCalledWith('spacetime describe', {
        cwd: mockBackendDir,
        encoding: 'utf8'
      });
      expect(execSync).toHaveBeenCalledWith('spacetime call reset_all_data', {
        cwd: mockBackendDir,
        encoding: 'utf8'
      });
      expect(execSync).toHaveBeenCalledWith('spacetime publish --force', {
        cwd: mockBackendDir,
        stdio: 'inherit'
      });
    });

    test('throws error when both reset and fallback deployment fail', async () => {
      execSync
        .mockReturnValueOnce('Database: collaborative-checkboxes-staging')
        .mockImplementationOnce(() => {
          throw new Error('reset_all_data command not found');
        })
        .mockImplementationOnce(() => {
          throw new Error('deployment failed');
        });

      await expect(resetManager.clearDatabase()).rejects.toThrow('deployment failed');
    });
  });

  describe('logResetActivity', () => {
    test('appends timestamp to staging-reset.log file', async () => {
      fs.appendFile.mockResolvedValue();

      await resetManager.logResetActivity();

      expect(fs.appendFile).toHaveBeenCalled();
      const [filename, content] = fs.appendFile.mock.calls[0];
      expect(filename).toBe('staging-reset.log');
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z - Staging database reset completed\n/);
    });

    test('handles log file write errors gracefully', async () => {
      fs.appendFile.mockRejectedValue(new Error('Permission denied'));

      // Should not throw
      await expect(resetManager.logResetActivity()).resolves.toBeUndefined();
    });
  });

  describe('run', () => {
    test('executes full reset workflow successfully', async () => {
      fs.pathExists.mockResolvedValue(true);
      fs.copy.mockResolvedValue();
      fs.remove.mockResolvedValue();
      fs.appendFile.mockResolvedValue();
      execSync
        .mockReturnValueOnce('Database: collaborative-checkboxes-staging')
        .mockReturnValueOnce('Reset successful');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

      await resetManager.run();

      expect(consoleSpy).toHaveBeenCalledWith('🚀 Starting staging database reset...');
      expect(consoleSpy).toHaveBeenCalledWith('✅ Staging reset completed successfully');
      expect(exitSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test('exits with code 1 when reset fails', async () => {
      fs.pathExists
        .mockRejectedValueOnce(new Error('File system error'))  // switchToStaging fails
        .mockResolvedValue(false);  // restoreConfig check (no backup to restore)
      
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called'); // Simulate exit
      });

      await expect(resetManager.run()).rejects.toThrow('Process exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Staging reset failed:', 'File system error');
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test('always restores config even when reset fails', async () => {
      fs.pathExists.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
      fs.copy.mockResolvedValue();
      fs.remove.mockResolvedValue();
      execSync.mockImplementation(() => {
        throw new Error('SpacetimeDB error');
      });

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called'); // Simulate exit
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(resetManager.run()).rejects.toThrow('Process exit called');

      // Should restore config despite the error
      expect(fs.copy).toHaveBeenCalledWith(mockBackupPath, mockMainConfig);
      expect(fs.remove).toHaveBeenCalledWith(mockBackupPath);
      expect(exitSpy).toHaveBeenCalledWith(1);
      
      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});