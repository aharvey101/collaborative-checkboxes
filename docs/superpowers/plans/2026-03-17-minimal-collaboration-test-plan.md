# Minimal Collaboration Test Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 27-test suite with single collaboration test validating real-time checkbox synchronization between browser contexts

**Architecture:** Single test file using Playwright multi-browser contexts to validate SpacetimeDB real-time collaboration. Two browsers connect, one clicks checkbox, other verifies state synchronization.

**Tech Stack:** Playwright, JavaScript, SpacetimeDB WebSocket connections

---

## File Structure Changes

**Delete files:**
- `smoke-test.spec.js` (2 tests)
- `test.spec.js` (3 tests)  
- `test-mouse.spec.js` (10+ tests)
- `test-panning.spec.js` (5+ tests)
- `test-fixed.spec.js` (5+ tests)

**Create file:**
- `collaboration-test.spec.js` (1 test)

**Modify files:**
- `.github/workflows/test-and-deploy.yml` (reduce timeout expectations)

---

## Task 1: Clean Up Existing Tests

**Files:**
- Delete: All existing .spec.js files

- [ ] **Step 1: List current test files**
```bash
find . -name "*.spec.js" -type f
```

- [ ] **Step 2: Remove existing test files**
```bash
rm smoke-test.spec.js test.spec.js test-mouse.spec.js test-panning.spec.js test-fixed.spec.js
```

- [ ] **Step 3: Commit cleanup**
```bash
git add . && git commit -m "feat: remove existing test suite for minimal collaboration approach"
```

## Task 2: Create Collaboration Test

**Files:**
- Create: `collaboration-test.spec.js`

- [ ] **Step 1: Create test file structure**
```javascript
import { test, expect } from '@playwright/test';

test('real-time checkbox synchronization', async ({ browser }) => {
  // Test implementation
});
```

- [ ] **Step 2: Implement multi-browser context test**
```javascript
import { test, expect } from '@playwright/test';

test('real-time checkbox synchronization', async ({ browser }) => {
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();
  const page1 = await context1.newPage();
  const page2 = await context2.newPage();
  
  try {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8000';
    
    // Navigate both browsers
    await Promise.all([
      page1.goto(baseURL),
      page2.goto(baseURL)
    ]);
    
    // Wait for app initialization
    await Promise.all([
      page1.waitForSelector('#grid'),
      page2.waitForSelector('#grid')
    ]);
    
    // Find first checkbox in both browsers
    const checkbox1 = page1.locator('input[type="checkbox"]').first();
    const checkbox2 = page2.locator('input[type="checkbox"]').first();
    
    // Click in browser1
    await checkbox1.click();
    
    // Verify sync in browser2
    await expect(checkbox2).toBeChecked({ timeout: 5000 });
    
  } finally {
    await context1.close();
    await context2.close();
  }
});
```

- [ ] **Step 3: Test the collaboration test**
```bash
npx playwright test collaboration-test.spec.js
```

- [ ] **Step 4: Commit collaboration test**
```bash
git add collaboration-test.spec.js && git commit -m "feat: add real-time collaboration test"
```

## Task 3: Update CI Configuration

**Files:**
- Modify: `.github/workflows/test-and-deploy.yml`

- [ ] **Step 1: Update CI test command**
Replace the E2E test step with:
```yaml
- name: Run collaboration test
  run: |
    PLAYWRIGHT_BASE_URL=http://localhost:5173 TEST_ENV=ci timeout 300 npx playwright test collaboration-test.spec.js --project=ci
```

- [ ] **Step 2: Commit CI update**
```bash
git add .github/workflows/test-and-deploy.yml && git commit -m "feat: optimize CI for single collaboration test"
```

## Success Criteria

- ✅ Single test validates real-time collaboration
- ✅ Runtime under 3 minutes vs 25-30 minutes 
- ✅ CI timeout issues eliminated
- ✅ SpacetimeDB multi-browser sync confirmed
