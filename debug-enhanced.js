// Enhanced debug script with console log capture
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();
  
  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('🎯') || text.includes('✅') || text.includes('📤') || text.includes('🎨')) {
      console.log('CONSOLE:', text);
    }
  });
  
  console.log('🚀 Opening app...');
  await page.goto('http://localhost:5174/');
  
  // Wait for the app to load and auto-connect
  console.log('⏳ Waiting for auto-connection...');
  await page.waitForTimeout(3000);
  
  const canvas = page.locator('canvas');
  
  console.log('📌 Clicking checkbox at (0,0)...');
  await canvas.click({ position: { x: 16, y: 16 } });
  await page.waitForTimeout(1500);
  
  console.log('📌 Clicking checkbox at (1,0)...');  
  await canvas.click({ position: { x: 48, y: 16 } });
  await page.waitForTimeout(1500);
  
  // Check console logs for click events
  const clickLogs = logs.filter(log => log.includes('🎯') || log.includes('Toggle'));
  console.log(`📄 Click-related logs (${clickLogs.length}):`, clickLogs.slice(-5));
  
  // Count checked boxes using page evaluation
  const checkedCount = await page.evaluate(() => {
    // Check if app is available on window
    if (!window.app) return -1;
    
    // Count checkboxes manually by checking state
    let count = 0;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        if (window.app.getCheckboxState(row, col)) {
          count++;
        }
      }
    }
    return count;
  });
  
  console.log(`🟦 Manual checkbox count: ${checkedCount}`);
  
  await browser.close();
})();