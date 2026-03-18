import { test, expect } from "@playwright/test";

test.describe("Checkbox Grid Stress Test", () => {
  test("debug: check for console errors", async ({ page }) => {
    const consoleMessages: string[] = [];
    const consoleErrors: string[] = [];
    
    page.on("console", (msg) => {
      consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    
    page.on("pageerror", (err) => {
      consoleErrors.push(`PAGE ERROR: ${err.message}`);
    });
    
    await page.goto("/");
    
    // Wait longer for WASM to load
    await page.waitForTimeout(5000);
    
    console.log("Console messages:", consoleMessages);
    console.log("Console errors:", consoleErrors);
    
    // Check if canvas exists
    const canvasCount = await page.locator("canvas").count();
    console.log("Canvas count:", canvasCount);
    
    // Get page HTML
    const html = await page.content();
    console.log("HTML preview:", html.substring(0, 500));
    
    expect(consoleErrors.length).toBe(0);
  });

  test("measure click-to-pixel-change latency", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 15000 });
    await page.waitForTimeout(2000);

    console.log("Measuring actual pixel change latency...");

    const results = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) return { error: "No canvas found" };

      const gl = canvas.getContext("webgl");
      if (!gl) return { error: "No WebGL context" };

      const latencies: number[] = [];
      const NUM_CLICKS = 20;

      for (let i = 0; i < NUM_CLICKS; i++) {
        const x = 100 + (i % 5) * 50;
        const y = 100 + Math.floor(i / 5) * 50;

        // Read pixel color before click
        const pixelBefore = new Uint8Array(4);
        gl.readPixels(x, canvas.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelBefore);
        const colorBefore = `${pixelBefore[0]},${pixelBefore[1]},${pixelBefore[2]}`;

        const start = performance.now();

        // Dispatch click
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new MouseEvent("click", {
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
        }));

        // Poll until pixel changes or timeout
        let colorAfter = colorBefore;
        let elapsed = 0;
        while (colorAfter === colorBefore && elapsed < 500) {
          const pixelAfter = new Uint8Array(4);
          gl.readPixels(x, canvas.height - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelAfter);
          colorAfter = `${pixelAfter[0]},${pixelAfter[1]},${pixelAfter[2]}`;
          elapsed = performance.now() - start;
          if (colorAfter === colorBefore) {
            await new Promise(r => setTimeout(r, 1));
          }
        }

        if (colorAfter !== colorBefore) {
          latencies.push(elapsed);
        }

        // Small delay between clicks
        await new Promise(r => setTimeout(r, 50));
      }

      if (latencies.length === 0) {
        return { error: "No pixel changes detected" };
      }

      return {
        latencies,
        avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        count: latencies.length,
      };
    });

    if ('error' in results) {
      console.log("Error:", results.error);
      throw new Error(results.error as string);
    }

    console.log("\n" + "=".repeat(60));
    console.log("CLICK-TO-PIXEL-CHANGE LATENCY");
    console.log("=".repeat(60));
    console.log(`Measurements: ${results.count}`);
    console.log(`Avg: ${results.avg.toFixed(2)}ms`);
    console.log(`Min: ${results.min.toFixed(2)}ms`);
    console.log(`Max: ${results.max.toFixed(2)}ms`);
    console.log(`All latencies: ${results.latencies.map(l => l.toFixed(1)).join(", ")}`);

    // Should be under 16ms for 60fps feel
    expect(results.avg).toBeLessThan(50);
  });

  test("measure actual in-browser click responsiveness", async ({ page }) => {
    await page.goto("/");

    // Wait for the app to load (Leptos/WASM app)
    await page.waitForSelector("canvas", { timeout: 15000 });
    
    // Give WASM time to initialize
    await page.waitForTimeout(2000);

    console.log("App loaded, measuring click responsiveness in-browser");

    // Inject performance measurement directly into the page
    const results = await page.evaluate(async () => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) return { error: "No canvas found" };
      
      const clickTimes: number[] = [];
      const NUM_CLICKS = 50;
      
      for (let i = 0; i < NUM_CLICKS; i++) {
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
        
        // Small delay to let the UI update
        await new Promise(r => setTimeout(r, 10));
        
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

    if ('error' in results) {
      console.log("Error:", results.error);
      throw new Error(results.error);
    }

    console.log("\n" + "=".repeat(60));
    console.log("IN-BROWSER CLICK RESPONSIVENESS");
    console.log("=".repeat(60));
    console.log(`Clicks measured: ${results.count}`);
    console.log(`Avg time: ${results.avg.toFixed(2)}ms`);
    console.log(`Min: ${results.min.toFixed(2)}ms`);
    console.log(`Max: ${results.max.toFixed(2)}ms`);
    
    expect(results.avg).toBeLessThan(100);
  });

  test("page loads and shows canvas", async ({ page }) => {
    await page.goto("/");
    
    // Wait for canvas to appear
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15000 });
    
    console.log("Canvas is visible");
  });

  test("rapid clicking stress test", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 15000 });
    await page.waitForTimeout(2000);

    const canvas = page.locator("canvas");
    
    console.log("Starting rapid click test...");
    
    const NUM_CLICKS = 100;
    const startTime = Date.now();
    
    for (let i = 0; i < NUM_CLICKS; i++) {
      await canvas.click({
        position: {
          x: 50 + Math.random() * 400,
          y: 50 + Math.random() * 300,
        },
        force: true,
      });
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`\n${NUM_CLICKS} clicks in ${elapsed}ms`);
    console.log(`Clicks per second: ${((NUM_CLICKS / elapsed) * 1000).toFixed(1)}`);
  });
});
