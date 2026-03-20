import { test, expect } from '@playwright/test';

test('spectator sees Doom frames', async ({ browser }) => {
  const player = await (await browser.newContext()).newPage();
  const spectator = await (await browser.newContext()).newPage();

  // Connect BOTH users first before starting Doom
  await player.goto('http://127.0.0.1:8090');
  await player.waitForSelector('canvas', { timeout: 15000 });
  await player.waitForSelector('.status.connected', { timeout: 30000 });
  console.log('STEP 1: Player connected');

  await spectator.goto('http://127.0.0.1:8090');
  await spectator.waitForSelector('canvas', { timeout: 30000 });
  await spectator.waitForSelector('.status.connected', { timeout: 30000 });
  console.log('STEP 2: Spectator connected');

  // Navigate spectator to doom area first
  await spectator.click('.doom-location-btn');
  console.log('STEP 3: Spectator navigated to doom area');

  // Record spectator's doom data before Doom starts
  await spectator.waitForTimeout(2000);
  const beforeCount = await spectator.evaluate(() => {
    return (window as any).get_doom_chunk_nonzero_count?.() ?? -1;
  });
  console.log(`Spectator doom chunk BEFORE: ${beforeCount}`);

  // Now start Doom on the player
  await player.click('.doom-btn');
  await player.waitForFunction(
    () => typeof (window as any).DoomMode !== 'undefined' && (window as any).DoomMode.isRunning(),
    { timeout: 20000 }
  );
  console.log('STEP 4: Doom running on player');

  // Wait for frames to flush to SpacetimeDB and propagate
  await player.waitForTimeout(15000);

  const playerCount = await player.evaluate(() => {
    return (window as any).get_doom_chunk_nonzero_count?.() ?? -1;
  });
  console.log(`Player doom chunk: ${playerCount}`);

  const afterCount = await spectator.evaluate(() => {
    return (window as any).get_doom_chunk_nonzero_count?.() ?? -1;
  });
  console.log(`Spectator doom chunk AFTER: ${afterCount}`);
  console.log(`Spectator gained: ${afterCount - beforeCount} nonzero bytes`);

  // The spectator must have gained significant data from the Doom frames
  expect(afterCount - beforeCount).toBeGreaterThan(10000);

  // Pause so you can visually inspect the spectator window
  await spectator.waitForTimeout(10000);
});
