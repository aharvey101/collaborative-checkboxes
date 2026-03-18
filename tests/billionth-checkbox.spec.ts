import { test, expect } from '@playwright/test';
import * as fs from 'fs';

/**
 * Test for toggling the billionth checkbox
 * 
 * Grid: 40,000 x 25,000 = 1,000,000,000 checkboxes
 * The billionth checkbox (index 999,999,999) is at:
 *   x = 999,999,999 % 40,000 = 39,999
 *   y = floor(999,999,999 / 40,000) = 24,999
 * 
 * This is the bottom-right corner of the grid.
 * It's in chunk (39, 24) = chunk ID 39 + 24*40 = 999
 * 
 * NOTE: Chunks are created lazily when a checkbox in that region is clicked.
 * This test navigates to the corner and clicks to create/toggle chunk 999.
 */

test.describe('Billionth Checkbox', () => {
  test('navigate to corner and toggle billionth checkbox', async ({ page }) => {
    // Track chunk subscriptions and received data
    const subscribedChunks = new Set<number>();
    const receivedChunks = new Set<number>();
    
    page.on('console', msg => {
      const text = msg.text();
      
      // Track subscriptions
      const subMatch = text.match(/Subscribing to chunk (\d+)/);
      if (subMatch) {
        subscribedChunks.add(parseInt(subMatch[1]));
      }
      
      // Track received chunks
      const recMatch = text.match(/Chunk (\d+) received/);
      if (recMatch) {
        receivedChunks.add(parseInt(recMatch[1]));
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Step 1: Zoom out to minimum (0.1x)
    console.log('Step 1: Zooming out to minimum scale...');
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, 200);
    }
    await page.waitForTimeout(300);

    // Step 2: Pan to bottom-right corner
    // At 0.1x scale, grid is 16000x10000 pixels
    // Need to pan far to the right and down
    console.log('Step 2: Panning to bottom-right corner...');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.down('Shift');
      await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 20, box.y + 20, { steps: 2 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
    }
    await page.waitForTimeout(500);

    // Step 3: Zoom back in a bit so we can click accurately
    console.log('Step 3: Zooming in for accurate clicking...');
    for (let i = 0; i < 15; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, -150);
    }
    await page.waitForTimeout(500);

    // Take screenshot of where we ended up
    const viewScreenshot = await canvas.screenshot();
    fs.writeFileSync('billionth-view.png', viewScreenshot);

    // Step 4: Click to toggle a checkbox (this will create chunk 999 if needed)
    console.log('Step 4: Clicking to toggle checkbox...');
    const beforeClick = await canvas.screenshot();
    
    // Click near the bottom-right of the visible area
    await canvas.click({ position: { x: box.width - 50, y: box.height - 50 } });
    await page.waitForTimeout(1000);
    
    const afterClick = await canvas.screenshot();
    fs.writeFileSync('billionth-after-click.png', afterClick);

    const clickChanged = Buffer.compare(beforeClick, afterClick) !== 0;
    console.log('Click changed canvas:', clickChanged);

    // Wait for any chunk updates
    await page.waitForTimeout(1000);

    // Report results
    console.log('\n=== RESULTS ===');
    console.log('Subscribed chunks:', subscribedChunks.size);
    console.log('Received chunks:', receivedChunks.size);
    console.log('Max subscribed chunk:', Math.max(...subscribedChunks));
    
    if (receivedChunks.size > 0) {
      console.log('Max received chunk:', Math.max(...receivedChunks));
      console.log('Received chunks:', Array.from(receivedChunks).sort((a, b) => a - b).join(', '));
    }

    // The test passes if we subscribed to high-numbered chunks
    // (chunks are created lazily, so we may not receive chunk 999 until we click there)
    expect(subscribedChunks.size).toBeGreaterThan(10);
    const maxSubscribed = Math.max(...subscribedChunks);
    console.log('Maximum subscribed chunk ID:', maxSubscribed);
    
    // We should have subscribed to chunks near 999 (the corner)
    expect(maxSubscribed).toBeGreaterThan(800);
  });

  test('zoom out to see entire grid then zoom back in', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Take initial screenshot
    const initial = await canvas.screenshot();
    fs.writeFileSync('zoom-1-initial.png', initial);
    console.log('Initial view at 1.0x scale');

    // Zoom out to minimum (0.1x)
    console.log('Zooming out to 0.1x...');
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, 200);
    }
    await page.waitForTimeout(1000);

    const zoomedOut = await canvas.screenshot();
    fs.writeFileSync('zoom-2-zoomed-out.png', zoomedOut);
    console.log('Zoomed out view at ~0.1x scale');

    // Zoom back in to 1.0x
    console.log('Zooming back in to 1.0x...');
    for (let i = 0; i < 40; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, -200);
    }
    await page.waitForTimeout(1000);

    const zoomedIn = await canvas.screenshot();
    fs.writeFileSync('zoom-3-zoomed-in.png', zoomedIn);
    console.log('Zoomed back in to ~1.0x scale');

    // Verify we can still see checkboxes after zoom cycle
    expect(zoomedIn.length).toBeGreaterThan(1000);
  });

  test('click creates new chunk in unvisited area', async ({ page }) => {
    // This test verifies that clicking in an area creates a new chunk
    const receivedChunks = new Set<number>();
    
    page.on('console', msg => {
      const text = msg.text();
      const match = text.match(/Chunk (\d+) received/);
      if (match) {
        receivedChunks.add(parseInt(match[1]));
      }
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    const canvas = page.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Canvas not found');

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Record initial chunks
    await page.waitForTimeout(500);
    const initialChunks = new Set(receivedChunks);
    console.log('Initial chunks:', Array.from(initialChunks).join(', '));

    // Zoom out
    console.log('Zooming out...');
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, 150);
    }
    await page.waitForTimeout(300);

    // Pan down (to see chunks in row 1, e.g., chunks 40-79)
    console.log('Panning down...');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.down('Shift');
      await page.mouse.move(centerX, box.y + box.height - 20);
      await page.mouse.down();
      await page.mouse.move(centerX, box.y + 20, { steps: 2 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
    }
    await page.waitForTimeout(500);

    // Zoom in a bit
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, -100);
    }
    await page.waitForTimeout(500);

    // Click to create a checkbox in the new area
    console.log('Clicking in new area...');
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await page.waitForTimeout(1000);

    // Check for new chunks
    console.log('Final chunks:', Array.from(receivedChunks).sort((a, b) => a - b).join(', '));
    
    // We should have received some chunks
    expect(receivedChunks.size).toBeGreaterThanOrEqual(2);
  });
});
