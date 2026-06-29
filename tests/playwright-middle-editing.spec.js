import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  findListItems, placeCursorInListItem, placeCursorAtEndOfListItem,
  getListContents,
} from './test-helpers';

test.describe('Middle-of-List Editing', () => {
  // Helper: inject a 3-item list and place cursor in item at index (0-based)
  async function setupThreeItemList(page, cursorItemIndex = 1, cursorOffset = 0) {
    await resetPage(page);
    await page.evaluate(({idx, off}) => {
      const el = document.querySelector('article');
      el.textContent = '- A\n- B\n- C\n';
      parseMarkdown(el);
      // Place cursor in the specified item using text-based positioning
      const items = window.__findListItems();
      const item = items[idx];
      if (!item) return;
      const m = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      const contentStart = item.start + (m ? m[0].length : 0);
      const textNode = el.firstChild;
      if (!textNode) return;
      const range = document.createRange();
      range.setStart(textNode, contentStart + Math.min(off, item.text.length - (m ? m[0].length : 0)));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, {idx: cursorItemIndex, off: cursorOffset});
    await page.waitForTimeout(100);
  }

  test('split middle item B: cursor stays in new item', async ({ page }) => {
    await setupThreeItemList(page, 1, 0); // cursor at start of B
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    expect(await countListItems(page)).toBe(4);

    // Cursor should be in the new (3rd) item, at offset 0
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);

    // Verify content: A, B (empty before split point), empty new item, C
    const content = await page.locator('article').textContent();
    const lines = content.split('\n').filter(l => l.trim());
    expect(lines.length).toBe(4);
  });

  test('split middle item B mid-content: parts preserved correctly', async ({ page }) => {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- Alpha\n- BetaGamma\n- Delta\n';
      parseMarkdown(el);
      // Place cursor between 'Beta' and 'Gamma' (offset 4 in item 1)
      const items = window.__findListItems();
      const item = items[1];
      if (!item) return;
      const m = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      const contentStart = item.start + (m ? m[0].length : 0);
      const textNode = el.firstChild;
      if (!textNode) return;
      const range = document.createRange();
      range.setStart(textNode, contentStart + 4);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    const content = await page.locator('article').textContent();
    expect(content).toContain('- Alpha');
    expect(content).toContain('- Beta');
    expect(content).toContain('- Gamma');
    expect(content).toContain('- Delta');

    expect(await countListItems(page)).toBe(4);

    // Cursor should be in the new item (Gamma's item), offset 0
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);
  });

  test('split middle item mid-content then type: text goes into correct item', async ({ page }) => {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- Alpha\n- BetaGamma\n- Delta\n';
      parseMarkdown(el);
      // Place cursor between 'Beta' and 'Gamma' (offset 4 in item 1)
      const items = window.__findListItems();
      const item = items[1];
      if (!item) return;
      const m = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      const contentStart = item.start + (m ? m[0].length : 0);
      const textNode = el.firstChild;
      if (!textNode) return;
      const range = document.createRange();
      range.setStart(textNode, contentStart + 4);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Verify cursor is in the new item (Gamma's item)
    const cursorAfterSplit = await getCursor(page);
    expect(cursorAfterSplit.onListItem).toBe(true);
    expect(cursorAfterSplit.offset).toBe(0);

    // Type in the new item
    await page.keyboard.type('New');
    await page.waitForTimeout(150);

    const content = await page.locator('article').textContent();
    expect(content).toContain('- Alpha');
    expect(content).toContain('- Beta');
    expect(content).toContain('- NewGamma');
    expect(content).toContain('- Delta');

    expect(await countListItems(page)).toBe(4);
  });

  test('split at end of middle item: cursor in new empty item', async ({ page }) => {
    await setupThreeItemList(page, 1, 1); // cursor at end of 'B'
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    expect(await countListItems(page)).toBe(4);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);
  });

  test('split at end of middle item then type: text goes into new item', async ({ page }) => {
    await setupThreeItemList(page, 1, 1); // cursor at end of 'B'
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    // Type into the new empty item
    await page.keyboard.type('New');
    await page.waitForTimeout(150);

    // Verify we have 4 items total
    expect(await countListItems(page)).toBe(4);

    // Verify item contents: A, B, New, C
    const contents = await getListContents(page);
    expect(contents[0]).toBe('A');
    expect(contents[1]).toBe('B');
    expect(contents[2]).toBe('New');
    expect(contents[3]).toBe('C');
  });

  test('multiple splits in same list maintain correct cursor', async ({ page }) => {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- One\n- Two\n- Three\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(100);

    // Split 'Two'
    await placeCursorInListItem(page, 1, 1); // after 'T'
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    expect(await countListItems(page)).toBe(4);

    // Type in new item
    await page.keyboard.type('X');
    await page.waitForTimeout(100);

    // Split again
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    expect(await countListItems(page)).toBe(5);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
  });

  test('Enter at end of first item continues list correctly', async ({ page }) => {
    await setupThreeItemList(page, 0, 1); // cursor at end of 'A'
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    expect(await countListItems(page)).toBe(4);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);
  });

  test('Enter at end of last item continues list correctly', async ({ page }) => {
    await setupThreeItemList(page, 2, 1); // cursor at end of 'C'
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);

    expect(await countListItems(page)).toBe(4);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);
  });
});
