import { test, expect } from "@playwright/test";

test.describe("Checkbox Grid Stress Test", () => {
  test("measure actual in-browser click responsiveness", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(
      () => document.getElementById("status")?.textContent === "Connected",
      { timeout: 15000 }
    );

    console.log("Connected, measuring actual click responsiveness in-browser");

    // Inject performance measurement directly into the page
    // This measures the REAL time from click to render, not Playwright overhead
    const results = await page.evaluate(async () => {
      const canvas = document.getElementById("checkbox-canvas") as HTMLCanvasElement;
      const stats = document.getElementById("stats")!;
      
      const clickTimes: number[] = [];
      const NUM_CLICKS = 100;
      
      // Get initial count
      const getCount = () => {
        const match = stats.textContent?.match(/^([\d,]+)\s*\//);
        return match ? parseInt(match[1].replace(/,/g, "")) : -1;
      };
      
      for (let i = 0; i < NUM_CLICKS; i++) {
        const initialCount = getCount();
        const x = 50 + (i % 10) * 30;
        const y = 50 + Math.floor(i / 10) * 30;
        
        const start = performance.now();
        
        // Dispatch a real click event
        const rect = canvas.getBoundingClientRect();
        const clickEvent = new MouseEvent("click", {
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
        });
        canvas.dispatchEvent(clickEvent);
        
        // Wait for the count to change (optimistic update should be instant)
        const waitStart = performance.now();
        while (getCount() === initialCount && performance.now() - waitStart < 100) {
          await new Promise(r => setTimeout(r, 0)); // yield
        }
        
        const elapsed = performance.now() - start;
        clickTimes.push(elapsed);
      }
      
      return {
        clickTimes,
        avg: clickTimes.reduce((a, b) => a + b, 0) / clickTimes.length,
        max: Math.max(...clickTimes),
        min: Math.min(...clickTimes),
        count: NUM_CLICKS,
      };
    });

    console.log("\n" + "=".repeat(60));
    console.log("IN-BROWSER CLICK RESPONSIVENESS (no Playwright overhead)");
    console.log("=".repeat(60));
    console.log(`Clicks measured: ${results.count}`);
    console.log(`Avg time to UI update: ${results.avg.toFixed(2)}ms`);
    console.log(`Min: ${results.min.toFixed(2)}ms`);
    console.log(`Max: ${results.max.toFixed(2)}ms`);
    console.log(`\nTarget: < 16ms for 60fps feel`);
    console.log(`Status: ${results.avg < 16 ? "PASS - Optimistic updates are fast!" : "NEEDS INVESTIGATION"}`);
    
    // If avg > 16ms, something is wrong with optimistic updates
    expect(results.avg).toBeLessThan(50); // generous threshold
  });

  test("rapidly click thousands of random checkboxes", async ({ browser }) => {
    // Configuration
    const NUM_BROWSERS = 3;
    const CLICKS_PER_BROWSER = 500;
    const GRID_WIDTH = 1000;
    const GRID_HEIGHT = 1000;
    const CELL_SIZE = 4;
    
    // Create multiple browser contexts to simulate concurrent users
    const contexts = await Promise.all(
      Array.from({ length: NUM_BROWSERS }, () => browser.newContext())
    );
    const pages = await Promise.all(contexts.map((ctx) => ctx.newPage()));

    // Navigate all pages and wait for connection
    await Promise.all(pages.map((page) => page.goto("/")));
    
    await Promise.all(
      pages.map((page) =>
        page.waitForFunction(
          () => document.getElementById("status")?.textContent === "Connected",
          { timeout: 15000 }
        )
      )
    );

    console.log(`${NUM_BROWSERS} browsers connected`);

    // Give connections time to stabilize
    await pages[0].waitForTimeout(500);

    // Get initial checked count
    const getCheckedCount = async (page: typeof pages[0]) => {
      return page.evaluate(() => {
        const stats = document.getElementById("stats");
        const match = stats?.textContent?.match(/^([\d,]+)\s*\//);
        return match ? parseInt(match[1].replace(/,/g, "")) : -1;
      });
    };

    // Get render time from stats (if available)
    const getRenderTime = async (page: typeof pages[0]) => {
      return page.evaluate(() => {
        const stats = document.getElementById("stats");
        const match = stats?.textContent?.match(/Render:\s*([\d.]+)ms/);
        return match ? parseFloat(match[1]) : null;
      });
    };

    const initialCount = await getCheckedCount(pages[0]);
    console.log(`Initial checked count: ${initialCount}`);

    // Generate random click positions within visible canvas area
    const generateRandomClicks = (count: number) => {
      const clicks: { x: number; y: number }[] = [];
      // Stay within a reasonable viewport area (800x600 visible area)
      const maxX = Math.min(800, GRID_WIDTH * CELL_SIZE);
      const maxY = Math.min(600, GRID_HEIGHT * CELL_SIZE);
      
      for (let i = 0; i < count; i++) {
        clicks.push({
          x: Math.floor(Math.random() * maxX) + 10,
          y: Math.floor(Math.random() * maxY) + 10,
        });
      }
      return clicks;
    };

    // Track timing
    const startTime = Date.now();
    let totalClicks = 0;
    const clickTimes: number[] = [];

    // Function to rapidly click checkboxes on a page
    const stressClickPage = async (
      page: typeof pages[0],
      pageIndex: number
    ) => {
      const canvas = page.locator("canvas");
      const clicks = generateRandomClicks(CLICKS_PER_BROWSER);

      for (let i = 0; i < clicks.length; i++) {
        const clickStart = Date.now();
        
        await canvas.click({
          position: clicks[i],
          force: true,
        });
        
        const clickEnd = Date.now();
        clickTimes.push(clickEnd - clickStart);
        totalClicks++;

        // Log progress every 100 clicks
        if ((i + 1) % 100 === 0) {
          const renderTime = await getRenderTime(page);
          console.log(
            `Page ${pageIndex + 1}: ${i + 1}/${CLICKS_PER_BROWSER} clicks` +
            (renderTime ? ` (render: ${renderTime.toFixed(1)}ms)` : "")
          );
        }

        // Small random delay to simulate realistic user behavior
        // but keep it very short to stress test
        if (Math.random() < 0.1) {
          await page.waitForTimeout(Math.floor(Math.random() * 10));
        }
      }
    };

    // Run stress test on all pages concurrently
    console.log(`\nStarting stress test: ${NUM_BROWSERS} browsers x ${CLICKS_PER_BROWSER} clicks each`);
    console.log("=".repeat(60));
    
    await Promise.all(pages.map((page, i) => stressClickPage(page, i)));

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Wait for all updates to propagate
    await pages[0].waitForTimeout(2000);

    // Collect final stats
    const finalCounts = await Promise.all(pages.map(getCheckedCount));
    const renderTimes = await Promise.all(pages.map(getRenderTime));

    // Calculate click timing stats
    const avgClickTime = clickTimes.reduce((a, b) => a + b, 0) / clickTimes.length;
    const maxClickTime = Math.max(...clickTimes);
    const minClickTime = Math.min(...clickTimes);

    // Report results
    console.log("\n" + "=".repeat(60));
    console.log("STRESS TEST RESULTS");
    console.log("=".repeat(60));
    console.log(`Total clicks: ${totalClicks}`);
    console.log(`Total time: ${totalTime}ms`);
    console.log(`Clicks per second: ${((totalClicks / totalTime) * 1000).toFixed(1)}`);
    console.log(`\nClick timing:`);
    console.log(`  Avg: ${avgClickTime.toFixed(2)}ms`);
    console.log(`  Min: ${minClickTime}ms`);
    console.log(`  Max: ${maxClickTime}ms`);
    console.log(`\nFinal checked counts per browser:`);
    finalCounts.forEach((count, i) => {
      console.log(`  Browser ${i + 1}: ${count.toLocaleString()}`);
    });
    console.log(`\nRender times (last frame):`);
    renderTimes.forEach((time, i) => {
      console.log(`  Browser ${i + 1}: ${time ? time.toFixed(1) + "ms" : "N/A"}`);
    });

    // Verify all browsers eventually converge to same count
    // (they should sync within a few seconds)
    const allSame = finalCounts.every((c) => c === finalCounts[0]);
    if (!allSame) {
      console.log("\nWARNING: Browsers have different counts - sync may still be in progress");
      // Wait more and check again
      await pages[0].waitForTimeout(3000);
      const recheckedCounts = await Promise.all(pages.map(getCheckedCount));
      console.log("After additional wait:", recheckedCounts);
      expect(recheckedCounts.every((c) => c === recheckedCounts[0])).toBe(true);
    } else {
      console.log("\nAll browsers synced successfully!");
    }

    // Cleanup
    await Promise.all(contexts.map((ctx) => ctx.close()));
  });

  test("measure render performance under load", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(
      () => document.getElementById("status")?.textContent === "Connected",
      { timeout: 15000 }
    );

    console.log("Connected, starting render performance test");

    // Collect console logs for render timing
    const renderLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("[Render]")) {
        renderLogs.push(msg.text());
      }
    });

    const canvas = page.locator("canvas");
    
    // Click rapidly to trigger many renders
    const NUM_CLICKS = 200;
    const startTime = Date.now();
    
    for (let i = 0; i < NUM_CLICKS; i++) {
      await canvas.click({
        position: {
          x: 50 + (i % 20) * 20,
          y: 50 + Math.floor(i / 20) * 20,
        },
        force: true,
      });
    }

    const clickTime = Date.now() - startTime;
    
    // Wait for renders to complete and logs to be captured
    await page.waitForTimeout(1000);

    console.log(`\n${NUM_CLICKS} clicks completed in ${clickTime}ms`);
    console.log(`Clicks per second: ${((NUM_CLICKS / clickTime) * 1000).toFixed(1)}`);
    console.log(`\nRender timing logs captured: ${renderLogs.length}`);
    
    // Parse and analyze render times
    if (renderLogs.length > 0) {
      const times = renderLogs.map((log) => {
        const match = log.match(/avg:\s*([\d.]+)ms/);
        return match ? parseFloat(match[1]) : null;
      }).filter((t): t is number => t !== null);

      if (times.length > 0) {
        const avgRenderTime = times[times.length - 1]; // Last reported average
        console.log(`\nFinal average render time: ${avgRenderTime.toFixed(2)}ms`);
        console.log(`Target for 60fps: < 16.67ms`);
        console.log(`Status: ${avgRenderTime < 16.67 ? "PASS ✓" : "NEEDS OPTIMIZATION"}`);
      }
    }

    // Print last few render logs
    console.log("\nLast render logs:");
    renderLogs.slice(-5).forEach((log) => console.log("  " + log));
  });

  test("zoom out stress test - maximum visible checkboxes", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(
      () => document.getElementById("status")?.textContent === "Connected",
      { timeout: 15000 }
    );

    console.log("Connected, zooming out to show maximum checkboxes");

    const canvas = page.locator("canvas");
    
    // Zoom out to minimum scale (0.5x) to show maximum checkboxes
    // Each wheel event with deltaY > 0 zooms out by 0.9x
    const zoomSteps = 10; // Enough to hit minimum zoom
    
    for (let i = 0; i < zoomSteps; i++) {
      await canvas.dispatchEvent("wheel", {
        deltaY: 100,
        clientX: 400,
        clientY: 300,
      });
      await page.waitForTimeout(50);
    }

    // Collect render logs
    const renderLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.text().includes("[Render]")) {
        renderLogs.push(msg.text());
      }
    });

    // Now click around to trigger renders at max zoom out
    console.log("Clicking at maximum zoom out (worst case rendering)");
    
    const NUM_CLICKS = 50;
    const startTime = Date.now();
    
    for (let i = 0; i < NUM_CLICKS; i++) {
      await canvas.click({
        position: {
          x: 100 + Math.random() * 600,
          y: 100 + Math.random() * 400,
        },
        force: true,
      });
    }

    const clickTime = Date.now() - startTime;
    await page.waitForTimeout(1000);

    console.log(`\n${NUM_CLICKS} clicks at max zoom out in ${clickTime}ms`);
    
    // Get final render stats from page
    const stats = await page.evaluate(() => {
      const statsEl = document.getElementById("stats");
      return statsEl?.textContent || "";
    });
    
    console.log(`Final stats: ${stats}`);
    
    if (renderLogs.length > 0) {
      console.log("\nRender logs at max zoom out:");
      renderLogs.slice(-3).forEach((log) => console.log("  " + log));
    }
  });
});
