import { test, expect } from '@playwright/test';
import {
  BASE_URL, injectHelpers, placeCursorInListItem,
} from './test-helpers';

test('debug split', async ({ page }) => {
  page.on('console', msg => console.log('Browser:', msg.text()));
  await page.goto(`${BASE_URL}/index.html`);
  await page.waitForLoadState('domcontentloaded');
  await injectHelpers(page);
  await page.click('article');
  await page.keyboard.type('- Hello World');
  await page.waitForTimeout(200);

  const info = await page.evaluate(() => {
    const art = document.querySelector('article');
    const items = window.__findListItems();
    return {
      artText: JSON.stringify(art.textContent),
      itemText: items[0] ? JSON.stringify(items[0].text) : 'none',
      numItems: items.length,
    };
  });
  console.log('Info:', JSON.stringify(info));

  // Place cursor at offset 8 (between "Hello " and "World")
  await placeCursorInListItem(page, 0, 6);

  const offset = await page.evaluate(() => {
    const s = window.getSelection();
    const el = document.querySelector('article');
    const range = document.createRange();
    range.setStart(el, 0);
    range.setEnd(s.anchorNode, s.anchorOffset);
    return range.toString().length;
  });
  console.log('Cursor offset:', offset);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => JSON.stringify(document.querySelector('article').textContent));
  console.log('After Enter:', after);
});
