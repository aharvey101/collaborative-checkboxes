import { test, expect } from "@playwright/test";

test.describe("Checkbox Grid Sync", () => {
  test("two browsers see each other's checkbox changes in real-time", async ({
    browser,
  }) => {
    // Create two independent browser contexts (like two different users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Navigate both to the app
    await Promise.all([
      page1.goto("/"),
      page2.goto("/"),
    ]);

    // Wait for both to be fully connected and subscribed
    // The status shows "Connected" when subscription is complete
    await Promise.all([
      page1.waitForFunction(() => {
        const status = document.getElementById("status");
        return status?.textContent === "Connected";
      }, { timeout: 15000 }),
      page2.waitForFunction(() => {
        const status = document.getElementById("status");
        return status?.textContent === "Connected";
      }, { timeout: 15000 }),
    ]);

    console.log("Both browsers connected to SpacetimeDB");

    // Additional wait to ensure connection is fully ready
    await page1.waitForTimeout(500);

    // Get checked count from stats (format: "X / 1,000,000 checked | ...")
    const getCheckedCount = async (page: typeof page1) => {
      return page.evaluate(() => {
        const stats = document.getElementById("stats");
        const match = stats?.textContent?.match(/^([\d,]+)\s*\//);
        return match ? parseInt(match[1].replace(/,/g, "")) : -1;
      });
    };

    const initialCount = await getCheckedCount(page1);
    console.log(`Initial checked count: ${initialCount}`);

    // Click on the canvas in page1 to toggle a checkbox
    // Click near top-left where checkboxes are visible at default zoom
    const canvas1 = page1.locator("canvas");
    
    // Use force:true to ensure click goes through
    await canvas1.click({ position: { x: 100, y: 100 }, force: true });
    console.log("Clicked on canvas in page1");

    // Wait for the update to propagate
    await page1.waitForTimeout(1000);

    // Get the new count from page1
    const page1CountAfterClick = await getCheckedCount(page1);
    console.log(`Page1 count after click: ${page1CountAfterClick}`);

    // Verify the click actually changed something
    // (count should differ by 1 - either +1 if we checked, or -1 if we unchecked)
    expect(Math.abs(page1CountAfterClick - initialCount)).toBe(1);

    // Now check that page2 sees the same count (sync worked!)
    // Wait for sync with polling
    await page2.waitForFunction(
      (expectedCount) => {
        const stats = document.getElementById("stats");
        const match = stats?.textContent?.match(/^([\d,]+)\s*\//);
        const count = match ? parseInt(match[1].replace(/,/g, "")) : -1;
        return count === expectedCount;
      },
      page1CountAfterClick,
      { timeout: 5000 }
    );

    const page2Count = await getCheckedCount(page2);
    console.log(`Page2 count after sync: ${page2Count}`);

    // Both pages should show the same checked count
    expect(page2Count).toBe(page1CountAfterClick);

    // Now click in page2 and verify page1 sees it
    const canvas2 = page2.locator("canvas");
    await canvas2.click({ position: { x: 150, y: 150 }, force: true });
    console.log("Clicked on canvas in page2");

    await page2.waitForTimeout(1000);

    const page2CountAfterClick = await getCheckedCount(page2);
    console.log(`Page2 count after its click: ${page2CountAfterClick}`);

    // Wait for page1 to sync
    await page1.waitForFunction(
      (expectedCount) => {
        const stats = document.getElementById("stats");
        const match = stats?.textContent?.match(/^([\d,]+)\s*\//);
        const count = match ? parseInt(match[1].replace(/,/g, "")) : -1;
        return count === expectedCount;
      },
      page2CountAfterClick,
      { timeout: 5000 }
    );

    const page1FinalCount = await getCheckedCount(page1);
    console.log(`Page1 final count: ${page1FinalCount}`);

    // Both should match
    expect(page1FinalCount).toBe(page2CountAfterClick);

    console.log("Sync test passed!");

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test("page loads and shows checkbox grid", async ({ page }) => {
    await page.goto("/");

    // Wait for connection
    await page.waitForFunction(() => {
      const status = document.getElementById("status");
      return status?.textContent === "Connected";
    }, { timeout: 15000 });

    // Verify we can see the stats (format: "X / 1,000,000 checked | ...")
    const stats = page.locator("#stats");
    await expect(stats).toContainText("/ 1,000,000 checked");

    // The canvas should be visible
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
  });
});
