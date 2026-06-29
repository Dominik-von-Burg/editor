import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, injectMd, pasteText,
  countListItems, getListMarkers, getListContents,
  findListItems, placeCursorInListItem, placeCursorAtEndOfListItem,
  placeCursorAtStartOfListItem, getListItemContent, isCursorOnListItem,
} from './test-helpers';
test.describe('Persistence', () => {
  test('content survives reload', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForTimeout(300);
    await page.click('article');
    await page.waitForTimeout(100);

    await page.keyboard.type('# Persistent Doc\n\nSome content.');
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForTimeout(500);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Persistent Doc');
  });

  test('multiple docs persist', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForTimeout(300);
    await page.click('article');
    await page.waitForTimeout(100);

    await page.keyboard.type('# Doc One');
    await page.waitForTimeout(500);

    // Create new doc
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#new-document');
    await page.waitForTimeout(300);
    await page.click('article');
    await page.waitForTimeout(100);
    await page.keyboard.type('# Doc Two');
    await page.waitForTimeout(500);

    // Reload
    await page.reload();
    await page.waitForTimeout(500);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Doc Two');
  });
});
