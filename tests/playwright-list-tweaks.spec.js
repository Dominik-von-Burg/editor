import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  getListContents, placeCursorInListItem,
} from './test-helpers';

test.describe('List No Extra Space', () => {
  test('new list item has no extra leading space', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Check second item content is empty (no extra space)
    const contents = await getListContents(page);
    expect(contents[1]).toBe('');

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);
  });
});

test.describe('Shift+Enter Blank Line', () => {
  test('Shift+Enter inserts blank line before list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(300);

    await page.keyboard.press('Shift+Enter');
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content.charCodeAt(0)).toBe(10); // starts with newline

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(false);
  });
});
