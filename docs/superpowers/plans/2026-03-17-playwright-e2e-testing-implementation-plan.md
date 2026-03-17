# Playwright E2E Testing Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert test database infrastructure from incorrectly using Vitest to properly using Playwright for E2E testing of the SpacetimeDB collaborative checkbox application.

**Architecture:** Leverage existing typescript-frontend Playwright setup, add SpacetimeDB state management for test isolation, supplement CI pipeline with parallel E2E testing while preserving working unit tests.

**Tech Stack:** Playwright, SpacetimeDB CLI, GitHub Actions, Node.js, existing test-db-manager infrastructure

---

## Chunk 1: SpacetimeDB State Management Infrastructure

### Task 1: Create SpacetimeDB State Reset Functionality

**Files:**
- Create: `scripts/reset-test-state.js`
- Test: Manual verification with SpacetimeDB CLI

- [ ] **Step 1: Write the SpacetimeDB state reset script**

```javascript
#!/usr/bin/env node
import { execSync } from 'child_process';
import path from 'path';

/**
 * Reset SpacetimeDB test database state for clean test runs
 */
export async function resetTestState() {
  try {
    const backendDir = path.resolve(path.dirname(import.meta.url.replace('file://', '')), '../backend');
    
    // Clear all checkbox data in test database
    execSync('spacetime call clear_all_checkboxes', { 
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
```

- [ ] **Step 2: Test the state reset functionality**

Run: `node scripts/reset-test-state.js`
Expected: "✅ Test state reset successfully" or clear error message if SpacetimeDB not running

- [ ] **Step 3: Make script executable**

```bash
chmod +x scripts/reset-test-state.js
```

- [ ] **Step 4: Commit state reset functionality**

```bash
git add scripts/reset-test-state.js
git commit -m "feat: add SpacetimeDB test state reset functionality

- Provides clean database state between E2E test runs
- Essential for collaborative checkbox test isolation
- Can be run standalone or imported as module"
```

### Task 2: Enhance Test Database Manager with State Reset

**Files:**
- Modify: `scripts/test-db-manager.js:95-117` (add new method)

- [ ] **Step 1: Add state reset method to test database manager**

Add to `TestDatabaseManager` class before the CLI interface section:

```javascript
  async resetTestData() {
    const { resetTestState } = await import('./reset-test-state.js');
    const success = await resetTestState();
    if (success) {
      console.log('✓ Test data reset completed');
    } else {
      console.log('⚠️ Test data reset failed');
      throw new Error('Failed to reset test data');
    }
  }
```

- [ ] **Step 2: Add CLI command for state reset**

Update the switch statement in the CLI interface (around line 100):

```javascript
switch (command) {
  case 'switch':
    const env = process.argv[3];
    await manager.switchEnvironment(env);
    break;
  case 'restore':
    await manager.restoreEnvironment();
    break;
  case 'start-local':
    await manager.startLocalSpacetimeDB();
    break;
  case 'stop-local':
    await manager.stopLocalSpacetimeDB();
    break;
  case 'reset-data':
    await manager.resetTestData();
    break;
  default:
    console.log('Usage: node test-db-manager.js [switch|restore|start-local|stop-local|reset-data] [env]');
    process.exit(1);
}
```

- [ ] **Step 3: Test enhanced database manager**

Run: `cd scripts && node test-db-manager.js reset-data`
Expected: "✓ Test data reset completed" (if SpacetimeDB running) or clear error

- [ ] **Step 4: Commit enhanced database manager**

```bash
git add scripts/test-db-manager.js
git commit -m "feat: add reset-data command to test database manager

- Integrates SpacetimeDB state reset into existing infrastructure
- Provides consistent CLI interface for all database operations
- Enables automated test isolation"
```

## Chunk 2: Playwright Configuration and Test Setup

### Task 3: Create Playwright Configuration

**Files:**
- Create: `typescript-frontend/playwright.config.js`

- [ ] **Step 1: Create comprehensive Playwright configuration**

```javascript
import { defineConfig } from '@playwright/test';
import path from 'path';

export default defineConfig({
  // Run both root-level integration tests and local E2E tests
  testDir: '../',
  testMatch: ['*.spec.js', 'typescript-frontend/tests/**/*.spec.js'],
  
  // SpacetimeDB and collaborative features need time
  timeout: 30000,
  expect: { timeout: 10000 },
  
  // Handle SpacetimeDB startup delays and occasional connection issues
  retries: process.env.CI ? 2 : 1,
  workers: 1, // Sequential execution for collaborative state management
  
  // Global configuration
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  
  // Environment-specific projects
  projects: [
    {
      name: 'ci',
      use: {
        baseURL: 'http://localhost:8000',
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
    port: 8000,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  } : undefined,
  
  // Global setup/teardown for SpacetimeDB state management
  globalSetup: require.resolve('./test-setup.js'),
  globalTeardown: require.resolve('./test-teardown.js'),
  
  // Reporting
  reporter: [
    ['html'],
    ['json', { outputFile: 'playwright-report/results.json' }],
    process.env.CI ? ['github'] : ['list']
  ],
  
  // Output directories
  outputDir: 'test-results/',
  
  // Browser configuration
  use: {
    ...((module.exports || {}).use || {}),
    // Additional browser settings for SpacetimeDB WebSocket testing
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1280, height: 720 },
  },
});
```

- [ ] **Step 2: Test Playwright configuration syntax**

Run: `cd typescript-frontend && npx playwright test --config=playwright.config.js --list`
Expected: Lists available tests without syntax errors

- [ ] **Step 3: Commit Playwright configuration**

```bash
git add typescript-frontend/playwright.config.js
git commit -m "feat: create comprehensive Playwright configuration

- Environment-aware testing (CI, staging, production)
- SpacetimeDB optimized timeouts and retry policies
- Global setup/teardown for state management
- Auto dev server startup for CI environment
- Proper reporting and output configuration"
```

### Task 4: Create Test Setup and Teardown

**Files:**
- Create: `typescript-frontend/test-setup.js`
- Create: `typescript-frontend/test-teardown.js`

- [ ] **Step 1: Create global test setup**

Create `typescript-frontend/test-setup.js`:

```javascript
import { resetTestState } from '../scripts/reset-test-state.js';
import { execSync } from 'child_process';

/**
 * Global setup for Playwright tests - ensures clean SpacetimeDB state
 */
export default async function globalSetup() {
  console.log('🧪 Setting up test environment...');
  
  // Ensure SpacetimeDB is available for state reset
  try {
    execSync('spacetime version list', { stdio: 'ignore' });
  } catch (error) {
    console.log('⚠️ SpacetimeDB CLI not available - skipping state reset');
    return;
  }
  
  // Reset SpacetimeDB state before all tests
  try {
    await resetTestState();
    console.log('✅ Test environment setup complete');
  } catch (error) {
    console.log('⚠️ Test state reset failed during setup:', error.message);
    // Don't fail setup - tests may still work
  }
}
```

- [ ] **Step 2: Create global test teardown**

Create `typescript-frontend/test-teardown.js`:

```javascript
import { resetTestState } from '../scripts/reset-test-state.js';

/**
 * Global teardown for Playwright tests - cleanup SpacetimeDB state
 */
export default async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...');
  
  // Reset SpacetimeDB state after all tests
  try {
    await resetTestState();
    console.log('✅ Test environment cleanup complete');
  } catch (error) {
    console.log('⚠️ Test cleanup failed:', error.message);
    // Don't fail teardown - cleanup is best effort
  }
}
```

- [ ] **Step 3: Test setup and teardown scripts**

Run: `cd typescript-frontend && node test-setup.js`
Expected: "✅ Test environment setup complete" or skip message if SpacetimeDB unavailable

Run: `cd typescript-frontend && node test-teardown.js`
Expected: "✅ Test environment cleanup complete" or skip message

- [ ] **Step 4: Commit test setup and teardown**

```bash
git add typescript-frontend/test-setup.js typescript-frontend/test-teardown.js
git commit -m "feat: add global test setup and teardown for state management

- Ensures clean SpacetimeDB state before and after test runs
- Graceful handling when SpacetimeDB unavailable
- Essential for collaborative checkbox test isolation"
```

## Chunk 3: Package.json and Script Enhancement

### Task 5: Update TypeScript Frontend Package.json Scripts

**Files:**
- Modify: `typescript-frontend/package.json:6-25` (scripts section)

- [ ] **Step 1: Enhance existing Playwright scripts with environment awareness**

Update the scripts section in `typescript-frontend/package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "serve": "vite --host --port 8080",
    "generate": "spacetime generate --lang typescript --out-dir ./src/generated --module-path ../backend",
    "test": "vitest",
    "test:unit": "vitest run",
    "test:unit:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "test:ci": "TEST_ENV=ci vitest run",
    "test:e2e": "playwright test --project=ci",
    "test:e2e-playwright": "playwright test --project=ci",
    "test:e2e-staging": "playwright test --project=staging",
    "test:e2e-production": "playwright test --project=production",
    "test:e2e-ui": "playwright test --ui",
    "test:e2e-headed": "playwright test --headed",
    "test:e2e-debug": "playwright test --debug",
    "test:integration": "playwright test ../*.spec.js",
    "test:setup": "node ../scripts/test-db-manager.js start-local",
    "test:teardown": "node ../scripts/test-db-manager.js stop-local",
    "test:reset": "node ../scripts/test-db-manager.js reset-data",
    "test:full": "npm run test:setup && npm run test:e2e && npm run test:teardown"
  }
}
```

- [ ] **Step 2: Test enhanced scripts**

Run: `cd typescript-frontend && npm run test:reset`
Expected: "✓ Test data reset completed" or clear error message

Run: `cd typescript-frontend && npm run test:e2e --help`
Expected: Playwright help output showing available options

- [ ] **Step 3: Commit enhanced package.json scripts**

```bash
git add typescript-frontend/package.json
git commit -m "feat: enhance package.json with comprehensive test scripts

- Clear separation between unit, integration, and E2E testing
- Environment-aware Playwright scripts (CI, staging, production)
- Test setup/teardown and reset functionality
- Full test suite orchestration script"
```

### Task 6: Update Root Package.json Scripts

**Files:**
- Modify: `package.json:5-7` (scripts section)

- [ ] **Step 1: Create helpful root-level test scripts**

Update the scripts section in root `package.json`:

```json
{
  "scripts": {
    "test": "echo 'Run specific tests from typescript-frontend directory:' && echo '  npm run test:unit    # Unit tests (Vitest)' && echo '  npm run test:e2e     # E2E tests (Playwright)' && echo '  npm run test:full    # Complete test suite'",
    "test:e2e": "cd typescript-frontend && npm run test:e2e",
    "test:integration": "cd typescript-frontend && npm run test:integration",
    "test:full": "cd typescript-frontend && npm run test:full"
  }
}
```

- [ ] **Step 2: Test root-level scripts**

Run: `npm test`
Expected: Helpful message showing available test commands

Run: `npm run test:e2e`
Expected: Runs Playwright tests from typescript-frontend

- [ ] **Step 3: Commit root package.json updates**

```bash
git add package.json
git commit -m "feat: add helpful root-level test scripts

- Provides clear guidance for developers
- Delegates to typescript-frontend where dependencies exist
- Consistent interface for CI and development"
```

## Chunk 4: CI/CD Pipeline Integration

### Task 7: Update GitHub Actions Workflow

**Files:**
- Modify: `.github/workflows/test-and-deploy.yml:63-82` (test section)

- [ ] **Step 1: Add Playwright browser installation to CI**

Insert after the "Install dependencies" step (around line 47):

```yaml
      - name: Install Playwright browsers
        run: |
          cd typescript-frontend
          npx playwright install --with-deps chromium firefox
```

- [ ] **Step 2: Add parallel E2E testing step**

Replace the existing "Run test suite" step (lines 63-66) with:

```yaml
      - name: Run unit tests
        run: |
          cd typescript-frontend
          TEST_ENV=ci npm run test:ci
          
      - name: Run E2E tests
        run: |
          cd typescript-frontend  
          TEST_ENV=ci npm run test:e2e-playwright
```

- [ ] **Step 3: Update test coverage to focus on unit tests**

Update the "Generate test coverage" step (lines 68-71):

```yaml
      - name: Generate unit test coverage
        run: |
          cd typescript-frontend  
          TEST_ENV=ci npm run test:coverage
```

- [ ] **Step 4: Add E2E test results upload**

Insert after the coverage upload step (around line 77):

```yaml
      - name: Upload E2E test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: typescript-frontend/playwright-report/
          retention-days: 30
          
      - name: Upload E2E test screenshots
        uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-screenshots
          path: typescript-frontend/test-results/
          retention-days: 30
```

- [ ] **Step 5: Test CI configuration syntax**

Run: `yamllint .github/workflows/test-and-deploy.yml`
Expected: No syntax errors

- [ ] **Step 6: Commit CI/CD pipeline enhancements**

```bash
git add .github/workflows/test-and-deploy.yml
git commit -m "feat: enhance CI pipeline with Playwright E2E testing

- Add parallel E2E testing alongside existing unit tests
- Install Playwright browsers for reliable test execution
- Upload test artifacts and screenshots for debugging
- Preserve existing test coverage for unit tests"
```

## Chunk 5: Test Enhancement and Documentation

### Task 8: Enhance Root-Level Integration Tests

**Files:**
- Modify: `test.spec.js` (add environment awareness and state management)
- Modify: `test-panning.spec.js` (enhance with better state isolation)
- Modify: `test-mouse.spec.js` (add proper timeout handling)
- Modify: `test-fixed.spec.js` (improve collaborative state management)

- [ ] **Step 1: Enhance basic functionality test with state management**

Add to the top of `test.spec.js` (after imports):

```javascript
import { test, expect } from '@playwright/test';

// Reset state before each test for isolation
test.beforeEach(async ({ page }) => {
  // Reset SpacetimeDB state if available
  try {
    const { execSync } = await import('child_process');
    execSync('node scripts/test-db-manager.js reset-data', { stdio: 'ignore' });
  } catch (error) {
    console.log('State reset skipped - SpacetimeDB may not be running');
  }
});
```

- [ ] **Step 2: Update hardcoded URLs to be environment-aware**

Replace hardcoded localhost URLs in all test files. In each `*.spec.js` file, replace:

```javascript
await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
```

With:

```javascript
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000';
await page.goto(baseURL, { waitUntil: 'networkidle' });
```

- [ ] **Step 3: Add better error handling and timeouts**

Add to each test file after the beforeEach block:

```javascript
// Enhanced error handling for SpacetimeDB connection issues
test.beforeEach(async ({ page }) => {
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('ERROR')) {
      console.log(`[BROWSER ERROR] ${msg.text()}`);
    }
  });
  
  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });
});
```

- [ ] **Step 4: Test enhanced integration tests**

Run: `cd typescript-frontend && npm run test:integration`
Expected: Tests run with improved error handling and state isolation

- [ ] **Step 5: Commit enhanced integration tests**

```bash
git add test.spec.js test-panning.spec.js test-mouse.spec.js test-fixed.spec.js
git commit -m "feat: enhance integration tests with state management

- Add SpacetimeDB state reset before each test
- Environment-aware URL configuration
- Improved error handling and logging
- Better timeout handling for collaborative features"
```

### Task 9: Create Comprehensive Testing Documentation

**Files:**
- Create: `docs/TESTING.md`

- [ ] **Step 1: Create comprehensive testing guide**

```markdown
# Testing Guide

## Overview

This project uses a comprehensive testing strategy with three types of tests:

- **Unit Tests** (Vitest) - Individual module testing
- **Integration Tests** (Playwright) - Root-level application testing  
- **E2E Tests** (Playwright) - Full user workflow testing

## Quick Start

### Development Testing
```bash
# Run all tests
cd typescript-frontend && npm run test:full

# Individual test types
npm run test:unit        # Unit tests only
npm run test:e2e         # E2E tests only
npm run test:integration # Integration tests only
```

### Debugging Tests
```bash
# Debug E2E tests with browser UI
npm run test:e2e-debug

# Run tests in headed mode (see browser)
npm run test:e2e-headed

# Interactive test UI
npm run test:e2e-ui
```

## Test Types Explained

### Unit Tests (Vitest)
- **Location:** `typescript-frontend/test/`
- **Purpose:** Test individual TypeScript modules and functions
- **Run:** `npm run test:unit`
- **Coverage:** `npm run test:coverage`

### Integration Tests (Playwright)
- **Location:** Root-level `*.spec.js` files
- **Purpose:** Test application initialization, WASM loading, basic interactions
- **Run:** `npm run test:integration`
- **Focus:** Core functionality and SpacetimeDB integration

### E2E Tests (Playwright)  
- **Location:** `typescript-frontend/tests/` (future)
- **Purpose:** Complete user workflows and collaborative features
- **Run:** `npm run test:e2e`
- **Focus:** Full application behavior and user scenarios

## Environment Testing

### CI Environment (Automated)
```bash
# Automatically used in development
cd typescript-frontend && npm run test:e2e
```

### Staging Environment (Manual)
```bash
# 1. Deploy to staging
./scripts/deploy-staging.sh

# 2. Set staging URL
export PLAYWRIGHT_BASE_URL="https://checkbox-grid-staging.netlify.app"
export STAGING_URL="https://checkbox-grid-staging.netlify.app"

# 3. Run staging tests
cd typescript-frontend && npm run test:e2e-staging

# 4. View results
npx playwright show-report
```

### Production Environment (Manual, Read-Only)
```bash
# 1. Ensure production deployment is current
./scripts/deploy-production.sh

# 2. Set production URL  
export PLAYWRIGHT_BASE_URL="https://checkbox-grid-100x100.netlify.app"
export PRODUCTION_URL="https://checkbox-grid-100x100.netlify.app"

# 3. Run read-only tests
cd typescript-frontend && npm run test:e2e-production

# 4. Review results carefully
npx playwright show-report
```

**⚠️ Production Testing Warning:** Production tests should be read-only and non-destructive. Avoid creating test data that affects real users.

## SpacetimeDB State Management

### Automatic State Reset
Tests automatically reset SpacetimeDB state between runs for isolation:

```bash
# Manual state reset
npm run test:reset
```

### State Reset Troubleshooting
If tests fail due to stale state:

```bash
# 1. Reset manually
node scripts/test-db-manager.js reset-data

# 2. Restart local SpacetimeDB
./scripts/spacetimedb-local.sh restart

# 3. Re-run tests
npm run test:e2e
```

## CI/CD Integration

### GitHub Actions Pipeline
The CI pipeline automatically runs:

1. Unit tests (Vitest) in parallel with E2E tests
2. E2E tests (Playwright) against local SpacetimeDB
3. Uploads test artifacts and screenshots on failure

### Local CI Simulation
```bash
# Simulate complete CI pipeline locally
npm run test:full
```

## Troubleshooting

### Common Issues

**"SpacetimeDB connection timeout"**
- Ensure local SpacetimeDB is running: `./scripts/spacetimedb-local.sh status`
- Restart if needed: `./scripts/spacetimedb-local.sh restart`

**"Module not found" errors**  
- Install dependencies: `cd typescript-frontend && npm install`
- Install Playwright browsers: `npx playwright install`

**"Test data conflicts"**
- Reset test state: `npm run test:reset`
- Check for running SpacetimeDB instances: `ps aux | grep spacetime`

**Playwright browser issues**
- Reinstall browsers: `npx playwright install --force`
- Check system dependencies: `npx playwright install-deps`

### Debug Mode
```bash
# Debug specific test
npx playwright test test-name --debug

# Debug with console output
npx playwright test --headed --slowMo=1000
```

### Test Reports
```bash
# View last test report
npx playwright show-report

# Generate fresh report
npm run test:e2e && npx playwright show-report
```

## Adding New Tests

### Unit Test Template
```javascript
// typescript-frontend/test/new-module.test.ts
import { describe, it, expect } from 'vitest';
import { newFunction } from '../src/new-module';

describe('newFunction', () => {
  it('should handle basic input', () => {
    expect(newFunction('test')).toBe('expected');
  });
});
```

### Integration Test Template
```javascript
// new-feature.spec.js (root level)
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // State reset handled automatically
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000';
  await page.goto(baseURL, { waitUntil: 'networkidle' });
});

test('new feature works correctly', async ({ page }) => {
  // Test implementation
});
```

### E2E Test Template  
```javascript
// typescript-frontend/tests/new-workflow.spec.js
import { test, expect } from '@playwright/test';

test.describe('New User Workflow', () => {
  test('complete workflow from start to finish', async ({ page }) => {
    // Full user scenario testing
  });
});
```

## Best Practices

1. **Test Isolation:** Each test should work independently
2. **State Management:** Rely on automatic state reset between tests
3. **Environment Awareness:** Use environment variables for URLs
4. **Error Handling:** Include meaningful error messages and logging
5. **Performance:** Keep tests focused and efficient
6. **Documentation:** Document complex test scenarios and edge cases

## Contributing

When adding new tests:

1. Choose the appropriate test type (unit/integration/E2E)
2. Follow existing patterns and naming conventions
3. Include proper error handling and timeouts
4. Test locally before committing
5. Update this documentation if adding new patterns
```

- [ ] **Step 2: Test documentation formatting**

Run: `markdown-lint docs/TESTING.md` (if available) or manually verify formatting

- [ ] **Step 3: Commit comprehensive testing documentation**

```bash
git add docs/TESTING.md
git commit -m "feat: create comprehensive testing documentation

- Complete guide for unit, integration, and E2E testing
- Environment-specific testing procedures (CI/staging/production)
- SpacetimeDB state management and troubleshooting
- CI/CD integration details and local simulation
- Templates and best practices for adding new tests"
```

## Chunk 6: Validation and Final Integration

### Task 10: End-to-End Validation

**Files:**
- Test: All enhanced tests and configuration
- Validate: Complete CI pipeline simulation

- [ ] **Step 1: Validate Playwright configuration**

Run: `cd typescript-frontend && npx playwright test --list`
Expected: Lists all available tests from both root and typescript-frontend directories

Run: `cd typescript-frontend && npx playwright test --config=playwright.config.js --reporter=list --dry-run`
Expected: Shows test plan without syntax errors

- [ ] **Step 2: Test SpacetimeDB integration**

Run: `./scripts/spacetimedb-local.sh start`
Expected: Local SpacetimeDB starts successfully

Run: `cd typescript-frontend && npm run test:reset`
Expected: "✓ Test data reset completed"

Run: `./scripts/spacetimedb-local.sh stop`

- [ ] **Step 3: Validate enhanced integration tests**

Run: `./scripts/spacetimedb-local.sh start`
Run: `./scripts/spacetimedb-local.sh deploy`
Run: `cd typescript-frontend && npm run test:integration`
Expected: Integration tests pass with enhanced error handling

- [ ] **Step 4: Test complete E2E pipeline**

Run: `cd typescript-frontend && npm run test:full`
Expected: Complete test suite runs successfully with state management

- [ ] **Step 5: Validate CI configuration without running full pipeline**

```bash
# Check workflow syntax
yamllint .github/workflows/test-and-deploy.yml

# Verify npm scripts work
cd typescript-frontend
npm run test:unit --help
npm run test:e2e --help
```

- [ ] **Step 6: Final validation commit**

```bash
git add -A
git status  # Review all changes
git commit -m "feat: complete Playwright E2E testing implementation

✅ Comprehensive implementation includes:
- SpacetimeDB state management for test isolation
- Enhanced Playwright configuration with environment detection
- Improved CI pipeline with parallel unit and E2E testing
- Enhanced integration tests with better error handling
- Complete testing documentation and developer guide

Fixes critical architectural error of using Vitest for E2E testing.
Enables reliable browser-based testing of collaborative features."
```

---

## Implementation Complete

This plan provides comprehensive conversion from Vitest to Playwright for E2E testing while:

✅ **Leveraging existing infrastructure** - Uses typescript-frontend Playwright setup  
✅ **Adding proper state management** - SpacetimeDB reset between tests  
✅ **Enhancing CI pipeline** - Parallel testing without breaking existing functionality  
✅ **Improving developer experience** - Clear documentation and helpful scripts  
✅ **Maintaining test isolation** - Collaborative features won't interfere between tests

The implementation preserves all working functionality while fixing the fundamental testing framework mismatch.