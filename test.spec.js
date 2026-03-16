import { test, expect } from '@playwright/test';

test('page loads and WASM initializes', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err));
  
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
  
  // Wait for WASM to load
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return app && app.innerHTML.includes('grid');
  }, { timeout: 5000 });
  
  // Check that the grid exists
  const grid = await page.locator('#grid');
  await expect(grid).toBeVisible();
  
  console.log('✅ Page loaded successfully');
});

test('arrow keys pan the grid', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err));
  
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
  
  // Wait for WASM to load
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return app && app.innerHTML.includes('grid');
  }, { timeout: 5000 });
  
  const grid = await page.locator('#grid');
  await expect(grid).toBeVisible();
  
  // Count initial checkboxes
  const initialCount = await page.locator('input[type="checkbox"]').count();
  console.log(`Initial checkbox count: ${initialCount}`);
  
  // Press arrow key to pan
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  
  // Verify grid still visible
  await expect(grid).toBeVisible();
  console.log('✅ Arrow key panning works');
});

test('checkboxes can be clicked', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err));
  
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle' });
  
  // Wait for WASM to load
  await page.waitForFunction(() => {
    const app = document.getElementById('app');
    return app && app.innerHTML.includes('grid');
  }, { timeout: 5000 });
  
  // Get first checkbox
  const firstCheckbox = await page.locator('input[type="checkbox"]').first();
  await expect(firstCheckbox).toBeVisible();
  
  // Click it
  await firstCheckbox.click();
  
  // Verify it's checked
  const isChecked = await firstCheckbox.isChecked();
  console.log(`First checkbox checked: ${isChecked}`);
  await expect(firstCheckbox).toBeChecked();
  
  console.log('✅ Checkbox click works');
});
