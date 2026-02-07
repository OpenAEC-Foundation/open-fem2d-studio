/**
 * Real UI test: Actually draw a plate and add supports via clicks
 */

import { chromium } from 'playwright';

async function runTest() {
  console.log('🔧 Real UI Plate Test\n');

  const browser = await chromium.launch({ headless: false }); // Show browser for debugging
  const page = await browser.newPage();

  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Error') || text.includes('error') || text.includes('[Plate') || text.includes('constraint') || text.includes('Transfer') || text.includes('active')) {
      console.log(`[Browser] ${text}`);
    }
  });

  try {
    await page.goto('http://localhost:3006', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Close startup dialog
    try { await page.click('.proj-info-btn.cancel', { timeout: 2000 }); } catch (e) {}
    await page.waitForTimeout(500);

    // Get canvas position
    const canvas = await page.$('canvas');
    const box = await canvas.boundingBox();
    console.log('Canvas bounds:', box);

    // === STEP 1: Select draw plate tool ===
    console.log('\n=== STEP 1: Select draw plate tool ===');
    await page.click('[data-tool="drawPlate"]');
    await page.waitForTimeout(500);

    // === STEP 2: Draw a rectangular plate (4 corners) ===
    console.log('\n=== STEP 2: Drawing plate polygon ===');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Define 4 corners (relative to canvas center)
    const corners = [
      { x: cx - 150, y: cy - 75 },  // Bottom-left
      { x: cx + 150, y: cy - 75 },  // Bottom-right
      { x: cx + 150, y: cy + 75 },  // Top-right
      { x: cx - 150, y: cy + 75 },  // Top-left
    ];

    for (let i = 0; i < corners.length; i++) {
      console.log(`  Clicking corner ${i + 1}: (${corners[i].x.toFixed(0)}, ${corners[i].y.toFixed(0)})`);
      await page.mouse.click(corners[i].x, corners[i].y);
      await page.waitForTimeout(300);
    }

    // Close polygon with Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);

    // === STEP 3: Confirm plate dialog ===
    console.log('\n=== STEP 3: Confirming plate dialog ===');
    try {
      await page.click('button:has-text("OK")', { timeout: 2000 });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('No plate dialog found, trying alternative...');
      try {
        await page.click('.plate-dialog button.primary', { timeout: 1000 });
        await page.waitForTimeout(1000);
      } catch (e2) {
        console.log('Still no dialog, continuing...');
      }
    }

    // === STEP 4: Check mesh state after plate creation ===
    console.log('\n=== STEP 4: Checking mesh state ===');
    const stateAfterPlate = await page.evaluate(() => {
      // Try to access mesh through different methods
      if (typeof window !== 'undefined') {
        // Try React DevTools approach
        const rootEl = document.querySelector('#root');
        if (rootEl && rootEl._reactRootContainer) {
          // React 17-
        }
        // Check if there's a global debug object
        if (window.FEM_DEBUG) {
          return window.FEM_DEBUG.getMeshState();
        }
      }
      return { error: 'Could not access mesh state' };
    });
    console.log('State after plate:', stateAfterPlate);

    // === STEP 5: Select pinned support tool ===
    console.log('\n=== STEP 5: Selecting pinned support tool ===');
    await page.click('[data-tool="addPinned"]');
    await page.waitForTimeout(500);

    // === STEP 6: Click on bottom-left corner to add support ===
    console.log('\n=== STEP 6: Adding first support (bottom-left) ===');
    await page.mouse.click(corners[0].x, corners[0].y);
    await page.waitForTimeout(500);

    // === STEP 7: Click on bottom-right corner to add support ===
    console.log('\n=== STEP 7: Adding second support (bottom-right) ===');
    await page.mouse.click(corners[1].x, corners[1].y);
    await page.waitForTimeout(500);

    // === STEP 8: Select load tool ===
    console.log('\n=== STEP 8: Selecting load tool ===');
    await page.click('[data-tool="addLoad"]');
    await page.waitForTimeout(500);

    // === STEP 9: Click on top-right corner to add load ===
    console.log('\n=== STEP 9: Adding load (top-right) ===');
    await page.mouse.click(corners[2].x, corners[2].y);
    await page.waitForTimeout(500);

    // Fill in load dialog
    try {
      console.log('  Looking for load dialog...');
      const fyInput = await page.$('input[name="fy"]', { timeout: 2000 });
      if (fyInput) {
        await fyInput.fill('-10');
        await page.click('button:has-text("OK")', { timeout: 1000 });
        console.log('  Load dialog filled');
      }
    } catch (e) {
      console.log('  No load dialog appeared');
    }
    await page.waitForTimeout(500);

    // === STEP 10: Press F5 to solve ===
    console.log('\n=== STEP 10: Pressing F5 to solve ===');
    await page.keyboard.press('F5');
    await page.waitForTimeout(2000);

    // Check for any error messages
    const pageContent = await page.content();
    if (pageContent.includes('error') || pageContent.includes('Error')) {
      console.log('\n⚠️ Page may contain error messages');
    }

    // === STEP 11: Take screenshot ===
    console.log('\n=== STEP 11: Taking screenshot ===');
    await page.screenshot({ path: 'test-plate-result.png', fullPage: true });
    console.log('Screenshot saved to test-plate-result.png');

    // Keep browser open for manual inspection
    console.log('\n=== PAUSING FOR 30 SECONDS FOR INSPECTION ===');
    console.log('Check the browser window to see if the plate is solved correctly');
    await page.waitForTimeout(30000);

  } finally {
    await browser.close();
  }
}

runTest();
