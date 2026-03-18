import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('checkboxes remain visible after click', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  
  const canvas = page.locator('canvas');
  
  // Take screenshot before click
  const beforeShot = await canvas.screenshot();
  fs.writeFileSync('test-before.png', beforeShot);
  
  // Click on one cell
  await canvas.click({ position: { x: 100, y: 100 } });
  
  // Wait a bit longer to see if grid disappears
  await page.waitForTimeout(500);
  
  // Take screenshot after click
  const afterShot = await canvas.screenshot();
  fs.writeFileSync('test-after.png', afterShot);
  
  console.log('Before screenshot size:', beforeShot.length);
  console.log('After screenshot size:', afterShot.length);
  
  const ratio = afterShot.length / beforeShot.length;
  console.log('Size ratio (after/before):', ratio);
  
  // If grid completely disappears, ratio will be very low (< 0.3)
  // A single cell change should barely affect the ratio
  expect(ratio).toBeGreaterThan(0.3);
  
  // Also click again to see what happens
  await canvas.click({ position: { x: 150, y: 150 } });
  await page.waitForTimeout(500);
  
  const afterSecondShot = await canvas.screenshot();
  fs.writeFileSync('test-after2.png', afterSecondShot);
  console.log('After second click size:', afterSecondShot.length);
  console.log('Ratio vs before:', afterSecondShot.length / beforeShot.length);
});
