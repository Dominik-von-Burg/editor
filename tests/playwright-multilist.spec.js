import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8901';

async function resetPage(page) {
  await page.goto(`${BASE_URL}/index.html?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await page.click('article');
  await page.waitForTimeout(100);
}

async function getCursor(page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return { parentTag: 'NONE', parentClass: '', offset: 0 };
    const node = sel.anchorNode;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return {
      parentTag: el.tagName,
      parentClass: el.className || '',
      offset: sel.anchorOffset,
    };
  });
}

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
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');

    // Move cursor back to first list and type
    await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      const firstContent = items[0]?.querySelector('.md-listcontent');
      if (firstContent?.firstChild) {
        const range = document.createRange();
        range.setStart(firstContent.firstChild, firstContent.firstChild.textContent.length);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
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
    expect(c1.parentClass).toContain('md-listcontent');

    // Move up (should go to "Between" paragraph)
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    const c2 = await getCursor(page);
    expect(c2.parentTag).toMatch(/ARTICLE|SPAN/);
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
    const items = await page.locator('.md-listitem').count();
    expect(items).toBe(4);

    // Move cursor to first list item and type
    await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      const firstContent = items[0]?.querySelector('.md-listcontent');
      if (firstContent?.firstChild) {
        const range = document.createRange();
        range.setStart(firstContent.firstChild, firstContent.firstChild.textContent.length);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
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
    await page.evaluate(() => {
      const content = document.querySelector('.md-listcontent');
      if (content?.firstChild) {
        const range = document.createRange();
        range.setStart(content.firstChild, 6);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
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
    const items = await page.locator('.md-listitem').count();
    expect(items).toBeGreaterThanOrEqual(3);

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

    const items = await page.locator('.md-listitem').count();
    expect(items).toBe(4);
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

    const items = await page.locator('.md-listitem').count();
    expect(items).toBe(3);
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
    const items = await page.locator('.md-listitem').count();
    expect(items).toBe(4);

    // Move cursor to second item of first list and type
    await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      const secondContent = items[1]?.querySelector('.md-listcontent');
      if (secondContent?.firstChild) {
        const range = document.createRange();
        range.setStart(secondContent.firstChild, secondContent.firstChild.textContent.length);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
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
    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers.some(m => m.startsWith('1.'))).toBe(true);
    expect(markers.some(m => m.startsWith('2.'))).toBe(true);
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
    await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      const fourthContent = items[3]?.querySelector('.md-listcontent');
      if (fourthContent?.firstChild) {
        const range = document.createRange();
        range.setStart(fourthContent.firstChild, fourthContent.firstChild.textContent.length);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    await page.waitForTimeout(50);

    // Type to trigger re-render
    await page.keyboard.type('!');
    await page.waitForTimeout(300);

    // Cursor should still be in fourth item, not first list
    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');

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
    await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      const fourthContent = items[3]?.querySelector('.md-listcontent');
      if (fourthContent?.firstChild) {
        const range = document.createRange();
        range.setStart(fourthContent.firstChild, fourthContent.firstChild.textContent.length);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    await page.waitForTimeout(100);

    // Press Enter to create new item in second list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Type new content
    await page.keyboard.type('Fifth');
    await page.waitForTimeout(200);

    // Verify new item is in second list, not first
    const items = await page.locator('.md-listitem').count();
    expect(items).toBe(5);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Fifth');
    expect(content).toContain('First');
    expect(content).toContain('Second');
    expect(content).toContain('Third');
    expect(content).toContain('Fourth');
  });
});
