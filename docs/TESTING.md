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