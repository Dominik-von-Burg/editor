const { test, expect } = require('@playwright/test');

test('debug Tab cursor', async ({ page }) => {
  await page.goto('http://localhost:8888/index.html?_t=' + Date.now());
  await page.waitForTimeout(200);
  
  // Type list
  await page.keyboard.type('- Item');
  await page.waitForTimeout(300);
  
  // Tab
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
  
  const cursor = await page.evaluate(() => {
    const sel = window.getSelection();
    const node = sel.anchorNode;
    return {
      nodeType: node?.nodeType,
      nodeName: node?.nodeName,
      parentNode: node?.parentNode?.className || node?.parentNode?.nodeName,
      parentTag: node?.parentNode?.tagName,
      offset: sel.anchorOffset,
    };
  });
  console.log('Cursor:', cursor);
  
  const tc = await page.evaluate(() => JSON.stringify(document.querySelector('article').textContent));
  console.log('textContent:', tc);
});
