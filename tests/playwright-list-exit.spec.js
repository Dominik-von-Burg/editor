import { test, expect } from '@playwright/test';
import {
  resetPage, getCursor, countListItems, getListMarkers,
  getListContents, getListItems, getListIndents, placeCursorAtEndOfListItem,
  placeCursorAtStartOfListItem, placeCursorInListItem, getListItemContent,
  getArticleText,
} from './test-helpers';

test.describe('List Exit Cursor Behavior', () => {
  test('double Enter does not jump cursor back into list', async ({ page }) => {
    await resetPage(page);

    // Create a list with two items
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);

    // First Enter creates new item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Second Enter should exit the list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // After second Enter, cursor should NOT be in a list item
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(false);

    // Check that we only have 2 list items now (not 3)
    expect(await countListItems(page)).toBe(2);
  });

  test('cursor stays out of list after double Enter with rapid typing', async ({ page }) => {
    await resetPage(page);

    // Create a list
    await page.keyboard.type('- One');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('Two');
    await page.waitForTimeout(50);

    // Rapid double Enter
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Cursor should NOT be in a list
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(false);
  });

  test('triple Enter results in cursor outside list', async ({ page }) => {
    await resetPage(page);

    // Create a list
    await page.keyboard.type('- Item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Triple Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should be outside the list
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(false);

    // Should only have the original item
    expect(await countListItems(page)).toBe(1);
  });

  test('no extra blank list item after exiting list with content', async ({ page }) => {
    await resetPage(page);

    // Create list with content
    await page.keyboard.type('- Item 1');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item 2');
    await page.waitForTimeout(100);

    // Exit list with double Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Should have exactly 2 items (not 3 with a blank one)
    expect(await countListItems(page)).toBe(2);

    // Verify content is correct
    const contents = await getListContents(page);
    expect(contents).toContain('Item 1');
    expect(contents).toContain('Item 2');
  });

  test('first list item has no leading indent', async ({ page }) => {
    await resetPage(page);

    // Create a list
    await page.keyboard.type('- First item');
    await page.waitForTimeout(200);

    // Check the first list item has no leading indent
    const indents = await page.evaluate(() => {
      const items = window.__findListItems();
      return items.map(item => {
        const m = item.text.match(/^([ \t]*)/);
        return m ? m[1].length : 0;
      });
    });

    expect(indents[0]).toBe(0);
  });

  test('multiple rapid list creations have consistent indentation', async ({ page }) => {
    await resetPage(page);

    // Type several list items quickly
    await page.keyboard.type('- One');
    await page.waitForTimeout(30);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
    await page.keyboard.type('- Two');
    await page.waitForTimeout(30);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
    await page.keyboard.type('- Three');
    await page.waitForTimeout(200);

    // Check all items have consistent indentation (0 for top-level)
    const indents = await getListIndents(page);
    expect(indents).toEqual([0, 0, 0]);
  });

  test('typing very rapidly does not cause indentation issues', async ({ page }) => {
    await resetPage(page);

    // Type list items with minimal waits (simulating fast typing)
    await page.keyboard.type('- A');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- B');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- C');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- D');
    await page.waitForTimeout(300);

    // Check all items have consistent indentation
    const indents = await getListIndents(page);
    expect(indents).toEqual([0, 0, 0, 0]);
  });

  test('cursor position is stable during rapid typing in list', async ({ page }) => {
    await resetPage(page);

    // Create a list and type into it rapidly
    await page.keyboard.type('- Testing');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // Record cursor positions during rapid typing
    const cursorPositions = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.type('x');
      const pos = await getCursor(page);
      cursorPositions.push(pos);
    }

    // Cursor should always be on a list item
    for (const pos of cursorPositions) {
      expect(pos.onListItem).toBe(true);
    }

    // Content should have accumulated
    const content = await getArticleText(page);
    expect(content).toContain('xxxxxxxxxx');
  });

  test('all list markers have consistent spacing', async ({ page }) => {
    await resetPage(page);

    // Create a list by typing "- item1" then Enter, then "item2"
    await page.keyboard.type('- item1');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('item2');
    await page.waitForTimeout(200);

    // Check all list markers have the same format
    const markers = await getListMarkers(page);

    // All markers should have the same format
    const uniqueMarkers = [...new Set(markers)];
    expect(uniqueMarkers.length).toBe(1);
  });

  test('marker spacing is preserved after re-render', async ({ page }) => {
    await resetPage(page);

    // Create list
    await page.keyboard.type('- one');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('two');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('three');
    await page.waitForTimeout(200);

    // Force a re-render by triggering highlight
    await page.evaluate(() => {
      const article = document.querySelector('article');
      parseMarkdown(article);
    });
    await page.waitForTimeout(100);

    // Check markers after re-render
    const markers = await getListMarkers(page);

    // All markers should have consistent spacing
    const uniqueMarkers = [...new Set(markers)];
    expect(uniqueMarkers.length).toBe(1);
  });

  test('markers stay consistent when typing without space after dash', async ({ page }) => {
    await resetPage(page);

    // Type "-item1" (no space after dash), then Enter
    await page.keyboard.type('-item1');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('item2');
    await page.waitForTimeout(200);

    // Check all list markers
    const markers = await getListMarkers(page);

    // All markers should have consistent spacing
    const uniqueMarkers = [...new Set(markers)];
    expect(uniqueMarkers.length).toBe(1);
  });

  test('ordered list markers always have space, even when typed without', async ({ page }) => {
    await resetPage(page);

    // Type "1.item1" (no space after period), then Enter
    await page.keyboard.type('1.item1');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('item2');
    await page.waitForTimeout(200);

    const markers = await getListMarkers(page);

    expect(markers[0]).toBe('1. ');
    expect(markers[1]).toBe('2. ');
  });

  test('ordered list markers with space stay consistent', async ({ page }) => {
    await resetPage(page);

    // Type "1. item1" (with space after period), then Enter
    await page.keyboard.type('1. item1');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('item2');
    await page.waitForTimeout(200);

    const markers = await getListMarkers(page);

    expect(markers[0]).toBe('1. ');
    expect(markers[1]).toBe('2. ');
  });
});
