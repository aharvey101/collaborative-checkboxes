import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  // Run tests in the typescript-frontend directory to avoid conflicts
  testDir: './tests',
  testMatch: [
    // Future Playwright-specific tests
    '**/playwright/**/*.spec.{ts,js}',
    '**/e2e/**/*.spec.{ts,js}', 
    '**/*.playwright.spec.{ts,js}',
    // Existing tests when converted to Playwright format
    '**/*.e2e.spec.{ts,js}'
  ],
  
  // SpacetimeDB and collaborative features need time
  timeout: 30000,
  expect: { timeout: 10000 },
  
  // Handle SpacetimeDB startup delays and occasional connection issues
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Sequential execution for collaborative state management
  
  // Global configuration
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Additional browser settings for SpacetimeDB WebSocket testing
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 720 },
  },
  
  // Environment-specific projects
  projects: [
    {
      name: 'ci',
      use: {
        baseURL: 'http://localhost:5174',
      },
    },
    {
      name: 'staging', 
      use: {
        baseURL: process.env.STAGING_URL || 'https://checkbox-grid-staging.netlify.app',
      },
    },
    {
      name: 'production',
      use: {
        baseURL: process.env.PRODUCTION_URL || 'https://checkbox-grid-100x100.netlify.app',
      },
    }
  ],
  
  // Auto-start dev server for CI environment
  webServer: process.env.TEST_ENV === 'ci' ? {
    command: 'npm run dev',
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  } : undefined,
  
  // Global setup/teardown for SpacetimeDB state management
  globalSetup: './test-setup.js',
  globalTeardown: './test-teardown.js',
  
  // Reporting
  reporter: [
    ['html'],
    ['json', { outputFile: 'playwright-report/results.json' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  // Output directories
  outputDir: 'test-results/',
});