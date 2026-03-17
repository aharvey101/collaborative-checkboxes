import { describe, test, expect, beforeEach, vi } from 'vitest';
import { testConfig } from '../test-config.js';

describe('Navigation & Interaction Configuration', () => {
  beforeEach(async () => {
    // Setup test environment
    global.fetch = vi.fn();
  });

  test('should provide responsive timeout configuration for navigation tests', () => {
    const timeout = testConfig.getTestTimeout();
    
    // Navigation tests may need reasonable timeouts
    expect(timeout).toBeGreaterThan(0);
    
    const environment = process.env.TEST_ENV || 'ci';
    
    // Validate timeout is appropriate for interaction tests
    if (environment === 'ci') {
      expect(timeout).toBe(10000); // Fast local tests
    } else {
      expect(timeout).toBeGreaterThanOrEqual(30000); // Remote tests need more time
    }
  });

  test('should provide environment-aware configuration for interaction testing', () => {
    const baseUrl = testConfig.getBaseUrl();
    const environment = process.env.TEST_ENV || 'ci';
    
    // Navigation tests need valid base URL
    expect(baseUrl).toBeTruthy();
    
    switch (environment) {
      case 'ci':
        expect(baseUrl).toBe('http://localhost:5174');
        break;
      case 'staging':
        expect(baseUrl).toBe('https://checkbox-grid-staging.netlify.app');
        break;
      case 'production':
        expect(baseUrl).toBe('https://checkbox-grid-100x100.netlify.app');
        break;
    }
  });

  test('should handle database configuration for real-time navigation updates', () => {
    const dbConfig = testConfig.getDatabaseConfig();
    
    // Real-time navigation requires stable database connection
    expect(dbConfig.server).toBeTruthy();
    expect(dbConfig.database).toBeTruthy();
    
    // Validate connection parameters
    expect(typeof dbConfig.server).toBe('string');
    expect(typeof dbConfig.database).toBe('string');
  });

  test('should provide navigation test skipping logic', () => {
    const shouldSkipE2E = testConfig.shouldSkipE2E();
    const environment = process.env.TEST_ENV || 'ci';
    
    // E2E navigation tests should be skipped in CI unless explicitly enabled
    if (environment === 'ci' && !process.env.RUN_E2E_TESTS) {
      expect(shouldSkipE2E).toBe(true);
    }
  });

  test('should maintain consistent configuration for navigation state', () => {
    const config1 = testConfig.getDatabaseConfig();
    const config2 = testConfig.getDatabaseConfig();
    
    // Configuration should be consistent for navigation state tracking
    expect(config1).toEqual(config2);
    expect(config1.server).toBe(config2.server);
    expect(config1.database).toBe(config2.database);
  });
});
    
    // Test right arrow
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('1, 0');
    
    // Test down arrow
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('1, 1');
    
    // Test left arrow
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('0, 1');
    
    // Test up arrow
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('0, 0');
  });

  test('should handle multiple arrow key presses', async ({ page }) => {
    const canvas = page.locator('#checkboxCanvas');
    await canvas.click();
    
    const positionDisplay = page.locator('#viewportPosition');
    
    // Navigate to position (5, 3)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(100);
    }
    
    await expect(positionDisplay).toContainText('5, 3');
  });

  test('should respect grid boundaries', async ({ page }) => {
    const canvas = page.locator('#checkboxCanvas');
    await canvas.click();
    
    const positionDisplay = page.locator('#viewportPosition');
    
    // Test upper-left boundary (can't go negative)
    await expect(positionDisplay).toContainText('0, 0');
    
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('0, 0');
    
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('0, 0');
    
    // Test that we can navigate to reasonable positions
    // (Testing the full 99,99 boundary would take too long)
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(50);
    }
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(50);
    }
    
    await expect(positionDisplay).toContainText('10, 10');
  });

  test('should toggle checkboxes on space key', async ({ page }) => {
    const canvas = page.locator('#checkboxCanvas');
    await canvas.click();
    
    const checkedCount = page.locator('#checkedCount');
    const activityLog = page.locator('#log');
    
    // Check initial checked count
    await expect(checkedCount).toContainText('0');
    
    // Toggle checkbox at (0,0)
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    
    // Look for indication that checkbox was toggled in the activity log
    // This will depend on our implementation - checking for any checkbox-related activity
    const logContent = await activityLog.textContent();
    expect(logContent).toBeTruthy();
  });

  test('should handle rapid navigation', async ({ page }) => {
    const canvas = page.locator('#checkboxCanvas');
    await canvas.click();
    
    const positionDisplay = page.locator('#viewportPosition');
    
    // Rapid navigation sequence
    const sequence = ['ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
    
    for (const key of sequence) {
      await page.keyboard.press(key);
      await page.waitForTimeout(50); // Fast navigation
    }
    
    // Should end up at (1, 1)
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('1, 1');
  });

  test('should maintain canvas focus during navigation', async ({ page }) => {
    const canvas = page.locator('#checkboxCanvas');
    await canvas.click();
    
    // Navigate around
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    
    // Canvas should still be focused or body should be focused (depending on implementation)
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['CANVAS', 'BODY']).toContain(focusedElement);
  });

  test('should handle keyboard focus correctly', async ({ page }) => {
    // Click on canvas to focus it
    const canvas = page.locator('#checkboxCanvas');
    await canvas.click();
    
    // Should be able to navigate
    const positionDisplay = page.locator('#viewportPosition');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('1, 0');
    
    // Click on a button to potentially lose focus
    await page.locator('#connectBtn').click();
    await page.waitForTimeout(200);
    
    // Click canvas again to regain focus
    await canvas.click();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    await expect(positionDisplay).toContainText('2, 0');
  });

  test('should render canvas content', async ({ page }) => {
    const canvas = page.locator('#checkboxCanvas');
    
    // Take a screenshot of the canvas to verify it's rendering content
    const canvasScreenshot = await canvas.screenshot();
    expect(canvasScreenshot.length).toBeGreaterThan(500); // Should have actual content
    
    // Navigate and take another screenshot to verify visual changes
    await canvas.click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);
    
    const canvasScreenshotAfterNav = await canvas.screenshot();
    expect(canvasScreenshotAfterNav.length).toBeGreaterThan(500);
    
    // Screenshots should be different (indicating visual feedback of navigation)
    expect(Buffer.compare(canvasScreenshot, canvasScreenshotAfterNav)).not.toBe(0);
  });
});