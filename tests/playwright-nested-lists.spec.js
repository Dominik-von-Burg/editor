import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  findListItems, placeCursorInListItem, placeCursorAtEndOfListItem,
  placeCursorAtStartOfListItem,
} from './test-helpers';

test.describe('Nested List Cursor Tests', () => {
  // Helper: inject a nested list structure
  async function setupNestedList(page) {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- A\n  - B\n  - C\n- D\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(100);
  }

  test('Enter in nested list continues at same nesting level', async ({ page }) => {
    await setupNestedList(page);
    // Place cursor at end of B (nested item)
    await placeCursorAtEndOfListItem(page, 1);
    await page.waitForTimeout(50);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    // Should have a new nested item
    const count = await countListItems(page);
    expect(count).toBe(5); // A, B, new-nested, C, D

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);
  });

  test('Tab indents a list item to create sub-list', async ({ page }) => {
    await setupNestedList(page);
    // Place cursor in C (index 2)
    await placeCursorAtStartOfListItem(page, 2);
    await page.waitForTimeout(50);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(150);

    const content = await page.locator('article').textContent();
    // C should now be indented under B
    expect(content).toContain('    - C');

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
  });

  test('Shift+Tab outdents a nested item', async ({ page }) => {
    await setupNestedList(page);
    // Place cursor in B (nested, index 1)
    await placeCursorAtStartOfListItem(page, 1);
    await page.waitForTimeout(50);

    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(150);

    const content = await page.locator('article').textContent();
    // B should now be at top level (no extra indentation)
    const lines = content.split('\n');
    const bLine = lines.find(l => l.includes('B'));
    expect(bLine).toMatch(/^- B/);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
  });

  test('double Enter exits nested list', async ({ page }) => {
    await setupNestedList(page);
    // Place cursor in C (nested, index 2)
    await placeCursorAtEndOfListItem(page, 2);
    await page.waitForTimeout(50);

    const beforeCount = await countListItems(page);

    // First Enter: continue nested list (new empty nested item)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Should have one more item
    const afterFirst = await countListItems(page);
    expect(afterFirst).toBe(beforeCount + 1);

    // Second Enter on empty item: exit list (removes empty item)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    const content = await page.locator('article').textContent();
    // Should still have the original items
    expect(content).toContain('- A');
    expect(content).toContain('- D');
  });

  test('cursor survives re-render in nested list', async ({ page }) => {
    await setupNestedList(page);
    // Place cursor in the middle of B's content
    await placeCursorAtStartOfListItem(page, 1);
    await page.waitForTimeout(50);

    // Type to trigger re-render
    await page.keyboard.type('X');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('XB');

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
  });

  test('nested ordered list Enter continues numbering', async ({ page }) => {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '1. First\n   1. Nested A\n   2. Nested B\n2. Second\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(100);

    // Place cursor at end of Nested B
    await placeCursorAtEndOfListItem(page, 2);
    await page.waitForTimeout(50);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    const content = await page.locator('article').textContent();
    // Should have nested item 3
    expect(content).toMatch(/\s+3\.[)\s]/);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
  });
});
