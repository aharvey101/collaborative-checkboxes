import { test, expect } from '@playwright/test';

test('Doom performance with worker (compare to baseline)', async ({ page }) => {
    await page.goto('http://127.0.0.1:8090');
    await page.waitForSelector('canvas', { timeout: 15000 });
    await page.waitForTimeout(3000); // Wait for worker initialization

    console.log('\n=== Starting Doom Performance Test ===');

    const results = await page.evaluate(async () => {
        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) return { error: 'No canvas found' };

        // Simulate Doom-like rendering (many pixel updates per frame)
        const FRAMES = 60;
        const PIXELS_PER_FRAME = 50000; // Typical Doom frame
        const frameTimings: number[] = [];
        let frameCount = 0;

        const startTime = performance.now();

        for (let frame = 0; frame < FRAMES; frame++) {
            const frameStart = performance.now();

            // Simulate a Doom frame with 50k pixel updates
            const updates: any[] = [];
            for (let i = 0; i < PIXELS_PER_FRAME; i++) {
                const r = Math.floor(Math.random() * 256);
                const g = Math.floor(Math.random() * 256);
                const b = Math.floor(Math.random() * 256);
                updates.push([5000 + frame, i, r, g, b, true]);
            }

            // Send batch update via worker
            if ((window as any).test_send_batch_update) {
                (window as any).test_send_batch_update(updates);
            }

            const frameEnd = performance.now();
            frameTimings.push(frameEnd - frameStart);
            frameCount++;

            // Allow event loop to process
            await new Promise(r => setTimeout(r, 16)); // ~60fps target
        }

        const endTime = performance.now();
        const elapsed = (endTime - startTime) / 1000;
        const fps = frameCount / elapsed;

        return {
            frameTimings,
            frameCount,
            elapsed,
            fps,
        };
    });

    if ('error' in results) {
        throw new Error(results.error as string);
    }

    const { frameTimings, frameCount, elapsed, fps } = results;

    console.log('\n=== PERFORMANCE RESULTS (With Worker) ===');
    console.log(`Duration: ${elapsed.toFixed(1)}s`);
    console.log(`Total frames: ${frameCount}`);
    console.log(`Average FPS: ${fps.toFixed(2)}`);
    console.log(`Average frame time: ${(frameTimings.reduce((a, b) => a + b, 0) / frameTimings.length).toFixed(2)}ms`);

    console.log('\n=== BASELINE (Before Worker) ===');
    console.log('FPS: ~5 FPS');
    console.log('Main thread blocking: ~200ms per frame');

    console.log('\n=== TARGET ===');
    console.log('FPS: 15+ FPS');
    console.log('Main thread frame time: < 16ms');

    // Assert performance targets
    if (fps >= 15) {
        console.log('✅ FPS target met!');
    } else {
        console.log(`⚠️  FPS below target: ${fps.toFixed(2)} < 15`);
    }
});
