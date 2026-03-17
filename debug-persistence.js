// Quick debug script to test checkbox persistence
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 1000 });
  const page = await browser.newPage();
  
  console.log('🚀 Opening app...');
  await page.goto('http://localhost:5174/');
  
  // Wait for the app to load and auto-connect
  console.log('⏳ Waiting for auto-connection...');
  await page.waitForTimeout(3000);
  
  const canvas = page.locator('canvas');
  
  console.log('📌 Clicking checkbox at (0,0)...');
  await canvas.click({ position: { x: 16, y: 16 } });
  await page.waitForTimeout(1000);
  
  console.log('📌 Clicking checkbox at (1,0)...');  
  await canvas.click({ position: { x: 48, y: 16 } });
  await page.waitForTimeout(1000);
  
  // Count checked boxes before refresh
  const preRefresh = await page.evaluate(() => {
    return window.app ? window.app.getCheckboxCount() : 0;
  });
  console.log(`🟦 Pre-refresh count: ${preRefresh}`);
  
  console.log('🔄 Refreshing page...');
  await page.reload();
  await page.waitForTimeout(3000);
  
  // Count checked boxes after refresh
  const postRefresh = await page.evaluate(() => {
    return window.app ? window.app.getCheckboxCount() : 0;
  });
  console.log(`🟦 Post-refresh count: ${postRefresh}`);
  
  console.log(`✅ Result: ${preRefresh} → ${postRefresh} (persistence: ${preRefresh === postRefresh ? 'SUCCESS' : 'FAILED'})`);
  
  await browser.close();
})();