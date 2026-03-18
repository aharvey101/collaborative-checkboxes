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
