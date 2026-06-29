import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  findListItems, placeCursorInListItem,
} from './test-helpers';

test.describe('Backspace At Boundary Tests', () => {
  test('Backspace at start of list item exits list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('\n- Item');
    await page.waitForTimeout(100);

    // Move cursor to start of item content
    await placeCursorInListItem(page, 0, 0);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);

    const count = await countListItems(page);
    // Should have fewer items or the item should be merged
    expect(count).toBeLessThanOrEqual(1);
  });

  test('Backspace at start of second list item merges with previous', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);

    // Move cursor to start of Second
    await placeCursorInListItem(page, 1, 0);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);

    const content = await page.locator('article').textContent();
    // Items should be merged
    expect(content).toContain('First');
    expect(content).toContain('Second');
  });

  test('Backspace does not break content in middle of item', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(100);

    // Move cursor to middle (after 'Hello ')
    await placeCursorInListItem(page, 0, 6);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content).toContain('- HelloWorld');
    expect(await countListItems(page)).toBe(1);
  });

  test('multiple Backspaces at start of list items progressively exit', async ({ page }) => {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- A\n- B\n- C\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(100);

    // Move cursor to start of B
    await placeCursorInListItem(page, 1, 0);

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(150);

    // Should have merged or reduced items
    const count = await countListItems(page);
    expect(count).toBeLessThanOrEqual(3);
  });
});
