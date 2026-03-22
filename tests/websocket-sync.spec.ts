import { test, expect } from '@playwright/test';

test('two tabs sync checkbox updates via WebSocket', async ({ browser }) => {
  const tab1 = await (await browser.newContext()).newPage();
  const tab2 = await (await browser.newContext()).newPage();

  const url = process.env.BASE_URL || 'http://127.0.0.1:8080';
  await tab1.goto(url);
  await tab2.goto(url);

  await tab1.waitForSelector('.status.connected', { timeout: 15000 });
  console.log('Tab 1 connected');
  await tab2.waitForSelector('.status.connected', { timeout: 15000 });
  console.log('Tab 2 connected');

  // Screenshot tab2 before
  const before = await tab2.locator('canvas').screenshot();

  // Click checkboxes on tab1
  const canvas1 = tab1.locator('canvas');
  for (let i = 0; i < 5; i++) {
    await canvas1.click({ position: { x: 100 + i * 30, y: 100 } });
    await tab1.waitForTimeout(100);
  }
  console.log('Tab 1: clicked 5 checkboxes');

  // Wait for sync
  await tab2.waitForTimeout(3000);

  // Screenshot tab2 after
  const after = await tab2.locator('canvas').screenshot();

  const synced = Buffer.compare(before, after) !== 0;
  console.log('Sync result:', synced ? 'PASS' : 'FAIL');
  expect(synced).toBe(true);
});
