import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8901';

async function resetPage(page) {
  await page.goto(`${BASE_URL}/index.html?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await page.click('article');
  await page.waitForTimeout(100);
}

async function getCursorInList(page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return { isInList: false };
    const anchor = sel.anchorNode;
    let node = anchor;
    while (node && node !== document.querySelector('article')) {
      if (node.nodeType === 1 && node.classList?.contains('md-listcontent')) {
        return {
          isInList: true,
          itemIndex: Array.from(document.querySelectorAll('.md-listitem')).indexOf(node.closest('.md-listitem')),
        };
      }
      node = node.parentElement;
    }
    return { isInList: false };
  });
}

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

    // Capture cursor state before second Enter
    const beforeSecondEnter = await getCursorInList(page);
    console.log('Before second Enter:', JSON.stringify(beforeSecondEnter));

    // Second Enter should exit the list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // After second Enter, cursor should NOT be in the list
    const afterSecondEnter = await getCursorInList(page);
    console.log('After second Enter:', JSON.stringify(afterSecondEnter));

    // Check that the cursor is NOT in a list item
    expect(afterSecondEnter.isInList).toBe(false);

    // Check that we only have 2 list items now (not 3)
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);
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
    const cursor = await getCursorInList(page);
    expect(cursor.isInList).toBe(false);
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
    const cursor = await getCursorInList(page);
    expect(cursor.isInList).toBe(false);

    // Should only have the original item
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
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
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);

    // Verify content is correct
    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toHaveLength(2);
  });

  test('first list item has correct indentation', async ({ page }) => {
    await resetPage(page);

    // Create a list
    await page.keyboard.type('- First item');
    await page.waitForTimeout(200);

    // Check the first list item's indentation
    const firstItemIndent = await page.evaluate(() => {
      const firstItem = document.querySelector('.md-listitem');
      if (!firstItem) return null;
      const style = window.getComputedStyle(firstItem);
      const indentSpan = firstItem.querySelector('.md-listindent');
      return {
        paddingLeft: style.paddingLeft,
        indentText: indentSpan?.textContent || '',
        indentWidth: indentSpan ? window.getComputedStyle(indentSpan).width : null,
      };
    });

    console.log('First item indent:', JSON.stringify(firstItemIndent));

    // First item should have no indent
    expect(firstItemIndent.indentText).toBe('');
    expect(firstItemIndent.paddingLeft).toMatch(/^0/);
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

    // Check all items have consistent indentation
    const indentations = await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      return Array.from(items).map(item => {
        const style = window.getComputedStyle(item);
        const indentSpan = item.querySelector('.md-listindent');
        return {
          paddingLeft: style.paddingLeft,
          indentText: indentSpan?.textContent || '',
        };
      });
    });

    console.log('Indentations:', JSON.stringify(indentations));

    // All items should have the same indentation
    const firstIndent = indentations[0]?.paddingLeft;
    for (const ind of indentations) {
      expect(ind.paddingLeft).toBe(firstIndent);
    }
  });

  test('typing very rapidly does not cause indentation issues', async ({ page }) => {
    await resetPage(page);

    // Type list items with minimal waits (simulating fast typing)
    // Using keyboard.type which sends events quickly
    await page.keyboard.type('- A');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- B');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- C');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- D');
    await page.waitForTimeout(300);

    // Check all items have consistent indentation
    const indentations = await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      return Array.from(items).map(item => {
        const style = window.getComputedStyle(item);
        const indentSpan = item.querySelector('.md-listindent');
        return {
          paddingLeft: style.paddingLeft,
          indentText: indentSpan?.textContent || '',
        };
      });
    });

    console.log('Rapid typing indentations:', JSON.stringify(indentations));

    // All items should have the same indentation
    const firstIndent = indentations[0]?.paddingLeft;
    for (const ind of indentations) {
      expect(ind.paddingLeft).toBe(firstIndent);
    }
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
      const pos = await getCursorInList(page);
      cursorPositions.push(pos);
    }

    console.log('Cursor positions during rapid typing:', JSON.stringify(cursorPositions));

    // Cursor should always be in the same list item (the second one)
    for (const pos of cursorPositions) {
      if (pos.isInList) {
        expect(pos.itemIndex).toBe(1); // Second item
      }
    }

    // Content should have accumulated
    const content = await page.locator('article').textContent();
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
    const markers = await page.evaluate(() => {
      const markerSpans = document.querySelectorAll('.md-listmarker');
      return Array.from(markerSpans).map(span => span.textContent);
    });

    console.log('Markers:', JSON.stringify(markers));

    // All markers should have the same format (either all "- " or all "-")
    // The important thing is consistency
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
    const markers = await page.evaluate(() => {
      const markerSpans = document.querySelectorAll('.md-listmarker');
      return Array.from(markerSpans).map(span => span.textContent);
    });

    console.log('Markers after re-render:', JSON.stringify(markers));

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
    const markers = await page.evaluate(() => {
      const markerSpans = document.querySelectorAll('.md-listmarker');
      return Array.from(markerSpans).map(span => span.textContent);
    });

    console.log('Markers (no space after dash):', JSON.stringify(markers));

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

    const markers = await page.evaluate(() => {
      const markerSpans = document.querySelectorAll('.md-listmarker');
      return Array.from(markerSpans).map(span => span.textContent);
    });

    console.log('Ordered markers (no space after period):', JSON.stringify(markers));

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

    const markers = await page.evaluate(() => {
      const markerSpans = document.querySelectorAll('.md-listmarker');
      return Array.from(markerSpans).map(span => span.textContent);
    });

    console.log('Ordered markers (with space):', JSON.stringify(markers));

    expect(markers[0]).toBe('1. ');
    expect(markers[1]).toBe('2. ');
  });
});
