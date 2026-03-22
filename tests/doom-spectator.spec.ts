import { test, expect } from '@playwright/test';

test('spectator sees Doom frames', async ({ browser }) => {
  test.setTimeout(120_000);

  const player = await (await browser.newContext()).newPage();
  const spectator = await (await browser.newContext()).newPage();

  // Connect BOTH users first before starting Doom
  await player.goto('/');
  await player.waitForSelector('canvas', { timeout: 15000 });
  await player.waitForSelector('.status.connected', { timeout: 60000 });
  console.log('STEP 1: Player connected');

  await spectator.goto('/');
  await spectator.waitForSelector('canvas', { timeout: 30000 });
  await spectator.waitForSelector('.status.connected', { timeout: 60000 });
  console.log('STEP 2: Spectator connected');

  // Navigate spectator to doom area
  await spectator.click('.doom-location-btn');
  await spectator.waitForTimeout(2000);
  console.log('STEP 3: Spectator navigated to doom area');

  // Check spectator's worker stats BEFORE Doom starts
  // (Using the worker intercept to count delta messages)
  await spectator.addInitScript(`
    window.__deltaCount = 0;
    window.__deltaBytes = 0;
    const OrigWorker = window.Worker;
    window.Worker = function(url, opts) {
      const w = new OrigWorker(url, opts);
      w.addEventListener('message', function(e) {
        if (e.data && typeof e.data === 'object' && e.data.type === 'DeltaUpdate' && e.data.data) {
          window.__deltaCount++;
          window.__deltaBytes += e.data.data.byteLength || 0;
        }
      });
      const origPost = w.postMessage.bind(w);
      w.postMessage = function(d, t) { return origPost(d, t); };
      return w;
    };
    window.Worker.prototype = OrigWorker.prototype;
  `);

  // Reload spectator to pick up the intercept script
  await spectator.goto('/');
  await spectator.waitForSelector('canvas', { timeout: 30000 });
  await spectator.waitForSelector('.status.connected', { timeout: 60000 });
  await spectator.click('.doom-location-btn');
  await spectator.waitForTimeout(2000);
  console.log('STEP 3b: Spectator reconnected with delta tracking');

  // Start Doom on the player
  await player.click('.doom-btn');
  await player.waitForFunction(
    () => typeof (window as any).DoomMode !== 'undefined' && (window as any).DoomMode.isRunning(),
    { timeout: 20000 }
  );
  console.log('STEP 4: Doom running on player');

  // Wait for frames to flush to SpacetimeDB and propagate via deltas
  console.log('Waiting 15s for frames to propagate...');
  await player.waitForTimeout(15000);

  // Check how many delta messages the spectator received
  const deltaStats = await spectator.evaluate(() => ({
    count: (window as any).__deltaCount || 0,
    bytes: (window as any).__deltaBytes || 0,
  }));
  console.log(`Spectator received ${deltaStats.count} delta messages (${deltaStats.bytes} bytes)`);

  // The spectator must have received delta updates from Doom frames
  expect(deltaStats.count).toBeGreaterThan(0);
  console.log(`✓ Spectator is receiving Doom frames via delta updates`);
});

/** Sample canvas pixels across a grid and count how many are non-black */
async function sampleCanvasPixels(page: any): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return 0;
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
    if (!gl) return 0;

    let nonzero = 0;
    // Sample a grid of pixels across the canvas
    for (let x = 0; x < canvas.width; x += 20) {
      for (let y = 0; y < canvas.height; y += 20) {
        const pixel = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        if (pixel[0] > 0 || pixel[1] > 0 || pixel[2] > 0) {
          nonzero++;
        }
      }
    }
    return nonzero;
  });
}
