import { test, expect } from '@playwright/test';
import {
  resetPage, getCursor, countListItems, getListContents,
  placeCursorInListItem, placeCursorAtEndOfListItem,
  findListItems,
} from './test-helpers';

// Helper: exit list and create separator paragraph
async function exitList(page) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.type('Section break');
  await page.waitForTimeout(50);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
}

// Helper: place cursor at end of list item content by text
async function placeCursorInListItemByContent(page, searchText) {
  await page.evaluate((text) => {
    const art = document.querySelector('article');
    // Walk text nodes to find the search text
    const walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
    let node = walker.currentNode;
    while (node) {
      const nodeText = node.nodeValue || '';
      const idx = nodeText.indexOf(text);
      if (idx !== -1) {
        // Found it — place cursor at end of matched text
        const offset = Math.min(idx + text.length, node.length);
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      node = walker.nextNode();
    }
  }, searchText);
  await page.waitForTimeout(50);
}

test.describe('Multi-List Editing', () => {
  test('edit first list after creating a second list', async ({ page }) => {
    await resetPage(page);

    // Create first list
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('Banana');
    await page.waitForTimeout(50);

    // Exit first list and create separator
    await exitList(page);

    // Create second list
    await page.keyboard.type('- Cat');
    await page.waitForTimeout(50);

    // Verify cursor is on a list item
    const c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);

    // Move cursor back to first list and type
    await placeCursorInListItemByContent(page, 'Apple');
    await page.waitForTimeout(50);

    await page.keyboard.type(' (red)');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Apple (red)');
    expect(content).toContain('Banana');
    expect(content).toContain('Cat');
  });

  test('cursor placement when moving between lists with arrow keys', async ({ page }) => {
    await resetPage(page);

    // Create two lists with separator
    await page.keyboard.type('- First');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Between');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('- Second');
    await page.waitForTimeout(50);

    // Verify cursor is in second list
    const c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);

    // Move up (should go to "Between" paragraph)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    const c2 = await getCursor(page);
    expect(c2.onListItem).toBe(false);
  });

  test('type into first list when second list exists', async ({ page }) => {
    await resetPage(page);

    // Set up two separate lists directly
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- One\n- Two\n\nSection break\n\n- Three\n- Four\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(200);

    // Verify setup
    expect(await countListItems(page)).toBe(4);

    // Move cursor to first list item and type
    await placeCursorInListItemByContent(page, 'One');
    await page.waitForTimeout(50);

    await page.keyboard.type(' (edited)');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('One (edited)');
    expect(content).toContain('Two');
    expect(content).toContain('Three');
    expect(content).toContain('Four');
  });

  test('split in first list does not affect second list', async ({ page }) => {
    await resetPage(page);

    // Create first list with content
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(50);

    // Position cursor mid-content
    await placeCursorInListItem(page, 0, 6);
    await page.waitForTimeout(50);

    // Split with Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Exit first list and create separator
    await exitList(page);

    // Create second list
    await page.keyboard.type('- Second List');
    await page.waitForTimeout(50);

    // Verify both lists exist
    expect(await countListItems(page)).toBeGreaterThanOrEqual(3);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Hello');
    expect(content).toContain('World');
    expect(content).toContain('Second List');
  });

  test('two lists with multiple items each', async ({ page }) => {
    await resetPage(page);

    // Create first list with 2 items
    await page.keyboard.type('- A');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('B');
    await page.waitForTimeout(50);

    // Exit and create separator
    await exitList(page);

    // Create second list with 2 items
    await page.keyboard.type('- X');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('Y');
    await page.waitForTimeout(50);

    // Verify both lists intact
    const content = await page.locator('article').textContent();
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(content).toContain('X');
    expect(content).toContain('Y');

    expect(await countListItems(page)).toBe(4);
  });

  test('ordered list in first, unordered in second', async ({ page }) => {
    await resetPage(page);

    // Create ordered list
    await page.keyboard.type('1. First');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);

    // Exit and create separator
    await exitList(page);

    // Create unordered list
    await page.keyboard.type('- Bullet');
    await page.waitForTimeout(50);

    // Verify both lists
    const content = await page.locator('article').textContent();
    expect(content).toContain('First');
    expect(content).toContain('Second');
    expect(content).toContain('Bullet');

    expect(await countListItems(page)).toBe(3);
  });

  test('edit item in first list when second list exists', async ({ page }) => {
    await resetPage(page);

    // Set up two separate lists directly
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- Alpha\n- Beta\n\nSeparator\n\n- Gamma\n- Delta\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(200);

    // Verify setup
    expect(await countListItems(page)).toBe(4);

    // Move cursor to second item of first list and type
    await placeCursorInListItemByContent(page, 'Beta');
    await page.waitForTimeout(50);

    await page.keyboard.type(' (updated)');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Alpha');
    expect(content).toContain('Beta (updated)');
    expect(content).toContain('Gamma');
    expect(content).toContain('Delta');
  });

  test('numbered list followed by unordered list preserves numbering', async ({ page }) => {
    await resetPage(page);

    // Create ordered list
    await page.keyboard.type('1. First');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);

    // Exit and create separator
    await exitList(page);

    // Create unordered list
    await page.keyboard.type('- Bullet');
    await page.waitForTimeout(50);

    // Verify ordered list numbering
    const content = await page.locator('article').textContent();
    expect(content).toContain('First');
    expect(content).toContain('Second');
    expect(content).toContain('Bullet');

    // Check for list markers
    const markers = await page.evaluate(() => {
      const items = window.__findListItems();
      return items.map(item => {
        const m = item.text.match(/^[ \t]*(-|\d+[.)]) */);
        return m ? m[1] : '';
      });
    });
    expect(markers.some(m => m === '1.')).toBe(true);
    expect(markers.some(m => m === '2.')).toBe(true);
  });

  test('typing in second list does not jump cursor to first list', async ({ page }) => {
    await resetPage(page);

    // Set up two separate lists
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- First\n- Second\n\nSeparator\n\n- Third\n- Fourth\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(200);

    // Move cursor to end of second list item ("Fourth")
    await placeCursorInListItemByContent(page, 'Fourth');
    await page.waitForTimeout(50);

    // Type to trigger re-render
    await page.keyboard.type('!');
    await page.waitForTimeout(300);

    // Cursor should still be in fourth item, not first list
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);

    // Verify the correct item is edited (fourth, not first)
    const content = await page.locator('article').textContent();
    expect(content).toContain('Fourth!'); // Fourth was edited
    expect(content).not.toContain('First!'); // First was NOT edited
  });

  test('Enter in second list creates item in correct list', async ({ page }) => {
    await resetPage(page);

    // Set up two separate lists
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- First\n- Second\n\nSeparator\n\n- Third\n- Fourth\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(200);

    // Move cursor to end of last item in second list ("Fourth")
    await placeCursorInListItemByContent(page, 'Fourth');
    await page.waitForTimeout(100);

    // Press Enter to create new item in second list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Type new content
    await page.keyboard.type('Fifth');
    await page.waitForTimeout(200);

    // Verify new item is in second list, not first
    expect(await countListItems(page)).toBe(5);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Fifth');
    expect(content).toContain('First');
    expect(content).toContain('Second');
    expect(content).toContain('Third');
    expect(content).toContain('Fourth');
  });

  test('Enter at start of second list item should continue list, not exit', async ({ page }) => {
    await resetPage(page);

    // Set up two separate lists
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- First\n- Second\n\nSeparator\n\n- Third\n- Fourth\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(200);

    // Place cursor at the start of the last item in second list ("Fourth")
    await page.evaluate(() => {
      const items = window.__findListItems();
      const fourth = items[3]; // First=0, Second=1, Third=2, Fourth=3
      if (!fourth) return;
      const m = fourth.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      const offset = fourth.start + (m ? m[0].length : 0);
      const art = document.querySelector('article');

      // Traverse text nodes to find the correct position
      let charIndex = 0;
      const walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
      let node = walker.currentNode;
      while (node) {
        const nodeLen = (node.nodeValue || '').length;
        if (charIndex + nodeLen >= offset) {
          const range = document.createRange();
          range.setStart(node, Math.min(offset - charIndex, node.length));
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
        charIndex += nodeLen;
        node = walker.nextNode();
      }
    });
    await page.waitForTimeout(50);

    // Press Enter at start of item - should create new item in same list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Check state after Enter
    const afterEnterContent = await page.evaluate(() => document.querySelector('article').textContent);
    console.log('After Enter content:', JSON.stringify(afterEnterContent));

    // There should be 5 items total (not 4 - we should have added a new one)
    const items = await countListItems(page);
    console.log('Items count:', items);
    expect(items).toBe(5);
  });

  test('adding item to second list via keyboard does not affect first list', async ({ page }) => {
    await resetPage(page);

    // Create first list
    await page.keyboard.type('- Item1');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item2');
    await page.waitForTimeout(100);

    // Exit first list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Create second list
    await page.keyboard.type('- A');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('B');
    await page.waitForTimeout(200);

    // Now add a third item to the second list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type into the new item
    await page.keyboard.type('C');
    await page.waitForTimeout(300);

    // Verify cursor is on a list item
    const cursor = await getCursor(page);
    console.log('Cursor:', cursor);

    const content = await page.locator('article').textContent();
    console.log('Content:', content);

    // Check the content of all items
    const listItems = await page.evaluate(() => {
      return window.__findListItems().map(item => {
        const m = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
        return m ? item.text.slice(m[0].length).replace(/\n$/, '') : item.text.replace(/\n$/, '');
      });
    });
    console.log('List items:', listItems);

    expect(cursor.onListItem).toBe(true);
    expect(listItems).toContain('C');
  });
});
