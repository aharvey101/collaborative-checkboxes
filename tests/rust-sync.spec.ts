import { test, expect } from "@playwright/test";

test.describe("Rust Frontend Sync", () => {
  test.use({ baseURL: "http://localhost:8081" });

  test("two browsers see each other's checkbox changes in real-time", async ({
    browser,
  }) => {
    // Create two independent browser contexts (like two different users)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Navigate both to the app
    await Promise.all([page1.goto("/"), page2.goto("/")]);

    // Wait for both to be connected
    await Promise.all([
      page1.waitForFunction(
        () => document.body.textContent?.includes("Connected"),
        { timeout: 15000 }
      ),
      page2.waitForFunction(
        () => document.body.textContent?.includes("Connected"),
        { timeout: 15000 }
      ),
    ]);

    console.log("Both browsers connected to SpacetimeDB");

    // Additional wait to ensure subscription is complete
    await page1.waitForTimeout(500);

    // Get checked count from the page
    const getCheckedCount = async (page: typeof page1) => {
      return page.evaluate(() => {
        const text = document.body.textContent || "";
        const match = text.match(/(\d[\d,]*)\s*\/\s*1,000,000\s*checked/);
        return match ? parseInt(match[1].replace(/,/g, "")) : -1;
      });
    };

    const initialCount = await getCheckedCount(page1);
    console.log(`Initial checked count: ${initialCount}`);

    // Click on canvas in page1
    const canvas1 = page1.locator("canvas");
    await canvas1.click({ position: { x: 100, y: 100 }, force: true });
    console.log("Clicked on canvas in page1");

    // Wait for update
    await page1.waitForTimeout(1000);

    const page1CountAfterClick = await getCheckedCount(page1);
    console.log(`Page1 count after click: ${page1CountAfterClick}`);

    // Verify click changed something
    expect(Math.abs(page1CountAfterClick - initialCount)).toBe(1);

    // Wait for page2 to sync
    await page2.waitForFunction(
      (expectedCount) => {
        const text = document.body.textContent || "";
        const match = text.match(/(\d[\d,]*)\s*\/\s*1,000,000\s*checked/);
        const count = match ? parseInt(match[1].replace(/,/g, "")) : -1;
        return count === expectedCount;
      },
      page1CountAfterClick,
      { timeout: 5000 }
    );

    const page2Count = await getCheckedCount(page2);
    console.log(`Page2 count after sync: ${page2Count}`);

    // Both should match
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
        const text = document.body.textContent || "";
        const match = text.match(/(\d[\d,]*)\s*\/\s*1,000,000\s*checked/);
        const count = match ? parseInt(match[1].replace(/,/g, "")) : -1;
        return count === expectedCount;
      },
      page2CountAfterClick,
      { timeout: 5000 }
    );

    const page1FinalCount = await getCheckedCount(page1);
    console.log(`Page1 final count: ${page1FinalCount}`);

    expect(page1FinalCount).toBe(page2CountAfterClick);

    console.log("Sync test passed!");

    await context1.close();
    await context2.close();
  });
});
