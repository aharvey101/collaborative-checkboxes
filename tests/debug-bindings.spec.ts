import { test, expect } from '@playwright/test';

test('debug wasmBindings', async ({ page }) => {
    await page.goto('http://127.0.0.1:8090');
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
        return {
            hasWasmBindings: !!window.wasmBindings,
            wasmBindingsKeys: window.wasmBindings ? Object.keys(window.wasmBindings) : [],
            hasTestFn: !!(window.wasmBindings && window.wasmBindings.test_send_batch_update),
        };
    });

    console.log('Debug result:', JSON.stringify(result, null, 2));
});
