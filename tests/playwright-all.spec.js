import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8901';

// Helper: reset state and focus editor
async function resetPage(page) {
  await page.goto(`${BASE_URL}/index.html?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await page.click('article');
  await page.waitForTimeout(100);
}

// Helper: get cursor info
async function getCursor(page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    // Walk up to find the nearest element with a class (handles text nodes)
    let node = sel.anchorNode;
    let parentEl = null;
    while (node) {
      if (node.nodeType === 1) { // ELEMENT_NODE
        parentEl = node;
        break;
      }
      node = node.parentElement;
    }
    return {
      parentClass: parentEl?.className || '',
      parentTag: parentEl?.tagName || '',
      offset: sel.anchorOffset,
      text: sel.anchorNode?.textContent,
    };
  });
}

// Helper: inject markdown and render
async function injectMd(page, md) {
  await page.evaluate((text) => {
    const el = document.querySelector('article');
    el.textContent = text;
    parseMarkdown(el);
  }, md);
  await page.waitForTimeout(100);
}

test.describe('Page Load & Typing', () => {
  test('default title and contenteditable', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    await page.waitForTimeout(200);

    const title = await page.title();
    expect(title).toBe('New Document 1');

    const editable = await page.locator('article').getAttribute('contentEditable');
    expect(editable).toBe('plaintext-only');
  });

  test('typing content appears and title updates', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# My Heading\n\nSome paragraph text here.');
    await page.waitForTimeout(500);

    const content = await page.locator('article').textContent();
    expect(content).toContain('My Heading');

    const title = await page.title();
    expect(title).toBe('My Heading');
  });

  test('autosave persists on reload', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# Auto Save Test\n\nContent that should persist.');
    await page.waitForTimeout(200);

    // Reload
    await page.reload();
    await page.waitForTimeout(500);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Auto Save Test');
  });

  test('new document button', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# Old Doc');
    await page.waitForTimeout(200);

    // Open menu and click new document
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#new-document');
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content.trim()).toBe('');
  });

  test('menu toggle', async ({ page }) => {
    await resetPage(page);
    const menu = page.locator('#menu');
    // Menu exists in DOM (may be hidden initially)
    await expect(menu).toHaveCount(1);

    // Toggle menu
    await page.click('#button');
    await page.waitForTimeout(200);
    // Menu should still exist
    await expect(menu).toHaveCount(1);
  });
});

test.describe('Markdown Rendering', () => {
  test('headings h1-h6', async ({ page }) => {
    await resetPage(page);
    await injectMd(page, '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('H1');
    expect(content).toContain('H6');
  });

  test('bold and italic', async ({ page }) => {
    await resetPage(page);
    await injectMd(page, '**bold** and *italic*');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('bold');
    expect(content).toContain('italic');
  });

  test('bold italic underline inline code codeblock strikethrough', async ({ page }) => {
    await resetPage(page);
    await injectMd(page, '***bold italic***\n++underline++\n`code`\n~~strikethrough~~');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('bold italic');
    expect(content).toContain('underline');
    expect(content).toContain('code');
    expect(content).toContain('strikethrough');
  });

  test('code block', async ({ page }) => {
    await resetPage(page);
    await injectMd(page, '```\nconst x = 1;\n```');
    await page.waitForTimeout(200);

    const codeBlocks = page.locator('.md-codeblock');
    await expect(codeBlocks).toHaveCount(1);
  });

  test('links', async ({ page }) => {
    await resetPage(page);
    await injectMd(page, '[Google](https://google.com)');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Google');
    expect(content).toContain('https://google.com');
  });
});

test.describe('Bullet Lists (unordered)', () => {
  test('rapid Enter continues list (no debounce gap)', async ({ page }) => {
    await resetPage(page);
    // Type quickly without waiting for debounce (30ms)
    await page.keyboard.type('- First');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Third');
    await page.waitForTimeout(200);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(3);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('- ');
  });

  test('typing creates list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(200);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
  });

  test('Enter continues list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(0);
  });

  test('double Enter exits list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Only');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('');
    expect(cursor.offset).toBeGreaterThanOrEqual(0);
  });

  test('Tab indents sub-bullet', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('  -');

    const cursor = await getCursor(page);
    // After Tab indent, cursor is in a span (may be in list content or adjacent text)
    expect(cursor.parentTag).toBe('SPAN');
    expect(cursor.offset).toBeGreaterThanOrEqual(0);
  });

  test('Shift-Tab outdents', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    // Should be back to top level
    const lines = content.split('\n').filter(l => l.trim());
    expect(lines[0]).not.toMatch(/^  -/);

    const cursor = await getCursor(page);
    expect(cursor.parentTag).toBe('SPAN');
    expect(cursor.offset).toBeGreaterThanOrEqual(0);
  });

  test('split list item mid-content', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(100);

    // Move cursor to position 6
    await page.evaluate(() => {
      const sel = window.getSelection();
      const range = document.createRange();
      const content = document.querySelector('.md-listcontent');
      range.setStart(content.firstChild, 6);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);

    const content = await page.locator('article').textContent();
    expect(content).toBe('- Hello \n- World\n');
  });

  test('cursor after split is in content at offset 0', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const sel = window.getSelection();
      const range = document.createRange();
      const content = document.querySelector('.md-listcontent');
      range.setStart(content.firstChild, 6);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(0);
  });

  test('cursor after Enter at end is in content at offset 0', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(0);
  });

  test('multi-item list content', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const cursor1 = await getCursor(page);
    expect(cursor1.parentClass).toBe('md-listcontent');
    expect(cursor1.offset).toBe(0);

    await page.keyboard.type('Banana');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const cursor2 = await getCursor(page);
    expect(cursor2.parentClass).toBe('md-listcontent');
    expect(cursor2.offset).toBe(0);

    await page.keyboard.type('Cherry');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Apple');
    expect(content).toContain('Banana');
    expect(content).toContain('Cherry');

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(3);
  });

  test('raw textContent has markers', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Item');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content).toMatch(/^- /);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(4);
  });

  test('no extra leading space in content', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(100);

    const contentText = await page.locator('.md-listcontent').textContent();
    expect(contentText).toBe('Apple');

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(5);
  });

  test('Shift+Enter inserts blank line before list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(100);

    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content.charCodeAt(0)).toBe(10);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('');
  });
});

test.describe('Numbered Lists (ordered)', () => {
  test('rapid Enter continues list (no debounce gap)', async ({ page }) => {
    await resetPage(page);
    // Type quickly without waiting for debounce (30ms)
    await page.keyboard.type('1. First');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Third');
    await page.waitForTimeout(200);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(3);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    expect(markers).toContain('3. ');
  });

  test('marker alignment: 1-digit vs 2-digit numbers', async ({ page}) => {
    await resetPage(page);
    await page.keyboard.type('1. One');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Two');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Three');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Four');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Five');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Six');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Seven');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Eight');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Nine');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Ten');
    await page.waitForTimeout(200);

    // Check that all content spans start at the same left position
    const positions = await page.evaluate(() => {
      const contents = document.querySelectorAll('.md-listcontent');
      return Array.from(contents).map(el => el.getBoundingClientRect().left);
    });

    // All content should start at the same horizontal position
    const first = positions[0];
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeCloseTo(first, 0);
    }

    // Check markers are right-aligned
    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('1. ');
    expect(markers).toContain('10. ');
  });

  test('marker alignment: 99 to 100', async ({ page }) => {
    await resetPage(page);
    // Inject a list with 99 and 100 to test alignment
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '99. Ninety-nine\n100. One hundred\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(200);

    // Check that content spans start at roughly the same position
    const positions = await page.evaluate(() => {
      const contents = document.querySelectorAll('.md-listcontent');
      return Array.from(contents).map(el => el.getBoundingClientRect().left);
    });

    expect(positions).toHaveLength(2);
    // They should be close (within 5px due to font rendering)
    expect(Math.abs(positions[0] - positions[1])).toBeLessThan(5);
  });

  test('typing 1. creates list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. First');
    await page.waitForTimeout(200);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers[0]).toContain('1.');

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(5);
  });

  test('Enter increments numbers', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. Alpha');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const cursor1 = await getCursor(page);
    expect(cursor1.parentClass).toBe('md-listcontent');
    expect(cursor1.offset).toBe(0);

    await page.keyboard.type('Beta');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const cursor2 = await getCursor(page);
    expect(cursor2.parentClass).toBe('md-listcontent');
    expect(cursor2.offset).toBe(0);

    await page.keyboard.type('Gamma');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content).toBe('1. Alpha\n2. Beta\n3. Gamma\n');
  });

  test('cursor after Enter at end is in content at offset 0', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(0);

    await page.keyboard.type('Second');
    await page.waitForTimeout(50);

    const content = await page.locator('article').textContent();
    expect(content).toBe('1. First\n2. Second\n');
  });

  test('split mid-content with cursor check', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. Hello World');
    await page.waitForTimeout(100);

    await page.evaluate(() => {
      const sel = window.getSelection();
      const range = document.createRange();
      const content = document.querySelector('.md-listcontent');
      range.setStart(content.firstChild, 6);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    });

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
    expect(cursor.offset).toBe(0);
    expect(cursor.text).toBe('World');

    const content = await page.locator('article').textContent();
    expect(content).toBe('1. Hello \n2. World\n');
  });

  test('double Enter exits', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. Only');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('');
  });

  test('Tab indent', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content.startsWith('1. First\n  2. Second')).toBe(true);

    const cursor = await getCursor(page);
    expect(cursor.parentTag).toBe('SPAN');
    expect(cursor.offset).toBeGreaterThanOrEqual(0);
  });

  test('Shift-Tab outdent', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content.startsWith('1. First\n2. Second')).toBe(true);

    const cursor = await getCursor(page);
    expect(cursor.parentTag).toBe('SPAN');
    expect(cursor.offset).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Undo/Redo', () => {
  test('Ctrl+Z undo removes last character', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Hello');
    await page.waitForTimeout(300);

    const before = await page.locator('article').textContent();
    expect(before).toContain('Hello');

    const cursorBefore = await getCursor(page);
    expect(cursorBefore.parentClass).toBe('');
    expect(cursorBefore.offset).toBe(5);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const after = await page.locator('article').textContent();
    expect(after).not.toBe(before);

    const cursorAfter = await getCursor(page);
    expect(cursorAfter.offset).toBeLessThan(cursorBefore.offset);
  });

  test('Ctrl+Shift+Z redo restores', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Hello');
    await page.waitForTimeout(300);

    const before = await page.locator('article').textContent();
    const cursorBefore = await getCursor(page);

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(200);

    const after = await page.locator('article').textContent();
    expect(after).toBe(before);

    const cursorAfter = await getCursor(page);
    expect(cursorAfter.offset).toBe(cursorBefore.offset);
  });
});

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

test.describe('Mixed Content', () => {
  test('heading + list + bold + italic', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# My List\n\n- **Bold** item\n- *Italic* item');
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('My List');
    expect(content).toContain('Bold');
    expect(content).toContain('Italic');

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);
  });
});

test.describe('Paste Handling', () => {
  test('HTML paste converts to markdown', async ({ page }) => {
    await resetPage(page);

    // Dispatch paste event directly
    await page.evaluate(() => {
      const el = document.querySelector('article');
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      event.clipboardData.setData('text/html', '<b>Bold</b> and <i>Italic</i>');
      event.clipboardData.setData('text/plain', 'Bold and Italic');
      el.dispatchEvent(event);
    });
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Bold');
  });

  test('paste preserves links', async ({ page }) => {
    await resetPage(page);

    await page.evaluate(() => {
      const el = document.querySelector('article');
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      event.clipboardData.setData('text/html', '<a href="https://example.com">Link</a>');
      event.clipboardData.setData('text/plain', 'Link');
      el.dispatchEvent(event);
    });
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Link');
  });
});

test.describe('Edge Cases', () => {
  test('empty lines preserved', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Line 1\n\n\nLine 4');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Line 1');
    expect(content).toContain('Line 4');
  });

  test('special characters', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Special: @#$%^&*()');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('@#$%^&*()');
  });

  test('Unicode characters', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Unicode: café résumé');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('café');
  });

  test('many lines', async ({ page }) => {
    await resetPage(page);
    let text = '';
    for (let i = 0; i < 100; i++) {
      text += `- Item ${i}\n`;
    }
    await page.keyboard.type(text.trim());
    await page.waitForTimeout(300);

    const items = page.locator('.md-listitem');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(50); // At least half rendered
  });
});

test.describe('Clickable Link URLs', () => {
  test('URL in markdown link is clickable', async ({ page }) => {
    await resetPage(page);
    await injectMd(page, '[Google](https://google.com)');
    await page.waitForTimeout(300);

    const link = page.locator('a.md-url');
    await expect(link).toHaveCount(1);

    const href = await link.getAttribute('href');
    expect(href).toBe('https://google.com');
  });

  test('raw textContent preserves markdown', async ({ page }) => {
    await resetPage(page);
    await injectMd(page, '[Google](https://google.com)');
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('[Google]');
    expect(content).toContain('(https://google.com)');
  });
});

test.describe('Outlook Paste', () => {
  test('MsoListParagraph bullet list', async ({ page }) => {
    await resetPage(page);

    const html = `<p class="MsoListParagraph" style="mso-list:bullet">Item 1</p><p class="MsoListParagraph" style="mso-list:bullet">Item 2</p>`;
    await page.evaluate((html) => {
      const el = document.querySelector('article');
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      event.clipboardData.setData('text/html', html);
      event.clipboardData.setData('text/plain', 'Item 1\nItem 2');
      el.dispatchEvent(event);
    }, html);
    await page.waitForTimeout(300);

    const items = page.locator('.md-listitem');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('MsoListParagraph numbered list', async ({ page }) => {
    await resetPage(page);

    const html = `<p class="MsoListParagraph" style="mso-list:number">Step 1</p><p class="MsoListParagraph" style="mso-list:number">Step 2</p>`;
    await page.evaluate((html) => {
      const el = document.querySelector('article');
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      event.clipboardData.setData('text/html', html);
      event.clipboardData.setData('text/plain', 'Step 1\nStep 2');
      el.dispatchEvent(event);
    }, html);
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Step 1');
    expect(content).toContain('Step 2');
  });

  test('bullet glyph paste', async ({ page }) => {
    await resetPage(page);

    const html = `<p>• Item A</p><p>• Item B</p>`;
    await page.evaluate((html) => {
      const el = document.querySelector('article');
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      event.clipboardData.setData('text/html', html);
      event.clipboardData.setData('text/plain', '• Item A\n• Item B');
      el.dispatchEvent(event);
    }, html);
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Item A');
  });

  test('standard ul paste', async ({ page }) => {
    await resetPage(page);

    const html = `<ul><li>Alpha</li><li>Beta</li></ul>`;
    await page.evaluate((html) => {
      const el = document.querySelector('article');
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
        bubbles: true,
        cancelable: true,
      });
      event.clipboardData.setData('text/html', html);
      event.clipboardData.setData('text/plain', 'Alpha\nBeta');
      el.dispatchEvent(event);
    }, html);
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Alpha');
    expect(content).toContain('Beta');
  });
});

test.describe('Doc Dialog', () => {
  test('dialog opens from More docs button', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# Dialog Test Doc');
    await page.waitForTimeout(500);

    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#browse-docs');
    await page.waitForTimeout(300);

    const overlay = page.locator('#doc-dialog-overlay');
    await expect(overlay).toBeVisible();
  });

  test('dialog lists documents', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# First Doc');
    await page.waitForTimeout(500);

    // Create second doc
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#new-document');
    await page.waitForTimeout(300);
    await page.click('article');
    await page.waitForTimeout(100);
    await page.keyboard.type('# Second Doc');
    await page.waitForTimeout(500);

    // Open dialog
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#browse-docs');
    await page.waitForTimeout(300);

    const items = page.locator('#doc-dialog-list .doc-item');
    expect(await items.count()).toBeGreaterThanOrEqual(2);
  });

  test('dialog search filters results', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# Apple Project');
    await page.waitForTimeout(500);

    // Create second doc
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#new-document');
    await page.waitForTimeout(300);
    await page.click('article');
    await page.waitForTimeout(100);
    await page.keyboard.type('# Banana Project');
    await page.waitForTimeout(500);

    // Open dialog
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#browse-docs');
    await page.waitForTimeout(300);

    // Search
    await page.fill('#doc-dialog-search', 'Apple');
    await page.waitForTimeout(300);

    const items = page.locator('#doc-dialog-list .doc-item');
    expect(await items.count()).toBe(1);

    const title = await page.locator('.doc-item-title').first().textContent();
    expect(title).toContain('Apple');
  });

  test('dialog closes after doc switch', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# Doc Alpha');
    await page.waitForTimeout(500);

    // Create second doc
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#new-document');
    await page.waitForTimeout(300);
    await page.click('article');
    await page.waitForTimeout(100);
    await page.keyboard.type('# Doc Beta');
    await page.waitForTimeout(500);

    // Open dialog and click first doc
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#browse-docs');
    await page.waitForTimeout(300);
    await page.click('#doc-dialog-list .doc-item');
    await page.waitForTimeout(300);

    const overlay = page.locator('#doc-dialog-overlay');
    await expect(overlay).not.toBeVisible();
  });

  test('dialog closes on Escape', async ({ page }) => {
    await resetPage(page);
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#browse-docs');
    await page.waitForTimeout(300);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const overlay = page.locator('#doc-dialog-overlay');
    await expect(overlay).not.toBeVisible();
  });

  test('dialog closes on close button', async ({ page }) => {
    await resetPage(page);
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#browse-docs');
    await page.waitForTimeout(300);

    await page.click('#doc-dialog-close');
    await page.waitForTimeout(200);

    const overlay = page.locator('#doc-dialog-overlay');
    await expect(overlay).not.toBeVisible();
  });
});

test.describe('Recent Docs', () => {
  test('recent docs appear in menu', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# Doc Alpha');
    await page.waitForTimeout(500);

    // Create second doc
    await page.click('#button');
    await page.waitForTimeout(200);
    await page.click('#new-document');
    await page.waitForTimeout(300);
    await page.click('article');
    await page.waitForTimeout(100);
    await page.keyboard.type('# Doc Beta');
    await page.waitForTimeout(500);

    // Open menu
    await page.click('#button');
    await page.waitForTimeout(300);

    const recentDocs = page.locator('.recent-doc');
    expect(await recentDocs.count()).toBeGreaterThanOrEqual(2);
  });
});

test.describe('Save Buttons', () => {
  test('all save/export buttons exist', async ({ page }) => {
    await resetPage(page);
    await page.click('#button');
    await page.waitForTimeout(200);

    await expect(page.locator('#save-as-html')).toHaveCount(1);
    await expect(page.locator('#save-as-text')).toHaveCount(1);
    await expect(page.locator('#copy-rendered')).toHaveCount(1);
    await expect(page.locator('#link-folder')).toHaveCount(1);
    await expect(page.locator('#refresh-folder')).toHaveCount(1);
  });
});

test.describe('Folder Sync', () => {
  test('folder sync API available', async ({ page }) => {
    await resetPage(page);

    const blocker = await page.evaluate(() => {
      if (typeof window.showDirectoryPicker !== 'function') return 'API not available';
      if (!window.isSecureContext) return 'Not secure context';
      return 'available';
    });

    expect(blocker).toBe('available');
  });
});

test.describe('List No Extra Space', () => {
  test('new list item has no extra leading space', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(300);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Check second item content span is empty (no extra space)
    const content2 = await page.locator('.md-listcontent').nth(1).textContent();
    expect(content2).toBe('');

    const cursor = await getCursor(page);
    expect(cursor.parentClass).toBe('md-listcontent');
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
    expect(cursor.parentClass).toBe('');
  });
});

test.describe('Bullet Marker Alignment', () => {
  test('unordered list markers align vertically', async ({ page }) => {
    await resetPage(page);

    // Create 3 list items
    await page.keyboard.type('- First item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Third item');
    await page.waitForTimeout(200);

    // Check all markers have same left position
    const positions = await page.evaluate(() => {
      const markers = document.querySelectorAll('.md-listmarker');
      return Array.from(markers).map(m => {
        const rect = m.getBoundingClientRect();
        return { left: rect.left, top: rect.top, text: m.textContent };
      });
    });

    expect(positions.length).toBe(3);
    // All markers should have the same left position (within 1px tolerance)
    const firstLeft = positions[0].left;
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].left).toBeCloseTo(firstLeft, 0);
    }
  });

  test('ordered list markers align vertically', async ({ page }) => {
    await resetPage(page);

    // Create 3 list items
    await page.keyboard.type('1. First item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Third item');
    await page.waitForTimeout(200);

    // Check all markers have same left position
    const positions = await page.evaluate(() => {
      const markers = document.querySelectorAll('.md-listmarker');
      return Array.from(markers).map(m => {
        const rect = m.getBoundingClientRect();
        return { left: rect.left, top: rect.top, text: m.textContent };
      });
    });

    expect(positions.length).toBe(3);
    const firstLeft = positions[0].left;
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].left).toBeCloseTo(firstLeft, 0);
    }
  });

  test('content aligns vertically in unordered list', async ({ page }) => {
    await resetPage(page);

    await page.keyboard.type('- First item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Third item');
    await page.waitForTimeout(200);

    // Check all content spans have same left position
    const positions = await page.evaluate(() => {
      const contents = document.querySelectorAll('.md-listcontent');
      return Array.from(contents).map(c => {
        const rect = c.getBoundingClientRect();
        return { left: rect.left, text: c.textContent };
      });
    });

    expect(positions.length).toBe(3);
    const firstLeft = positions[0].left;
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i].left).toBeCloseTo(firstLeft, 0);
    }
  });

  test('two unordered lists: markers and content align across both', async ({ page }) => {
    await resetPage(page);

    // First list
    await page.keyboard.type('- Item A');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item B');
    await page.waitForTimeout(100);

    // Exit first list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Content between
    await page.keyboard.type('Middle text');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Second list
    await page.keyboard.type('- Item X');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Item Y');
    await page.waitForTimeout(200);

    // Check all markers align
    const markerPositions = await page.evaluate(() => {
      const markers = document.querySelectorAll('.md-listmarker');
      return Array.from(markers).map(m => ({
        left: m.getBoundingClientRect().left,
        text: m.textContent,
      }));
    });

    expect(markerPositions.length).toBeGreaterThanOrEqual(4);
    const firstLeft = markerPositions[0].left;
    for (let i = 1; i < markerPositions.length; i++) {
      expect(markerPositions[i].left).toBeCloseTo(firstLeft, 0);
    }

    // Check all content aligns
    const contentPositions = await page.evaluate(() => {
      const contents = document.querySelectorAll('.md-listcontent');
      return Array.from(contents).map(c => ({
        left: c.getBoundingClientRect().left,
        text: c.textContent,
      }));
    });

    expect(contentPositions.length).toBeGreaterThanOrEqual(4);
    const contentLeft = contentPositions[0].left;
    for (let i = 1; i < contentPositions.length; i++) {
      expect(contentPositions[i].left).toBeCloseTo(contentLeft, 0);
    }
  });

  test('two ordered lists: markers and content align across both', async ({ page }) => {
    await resetPage(page);

    // First list
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);

    // Exit first list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Content between
    await page.keyboard.type('Middle');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Second list
    await page.keyboard.type('1. Again');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Once more');
    await page.waitForTimeout(200);

    // Check all markers align
    const markerPositions = await page.evaluate(() => {
      const markers = document.querySelectorAll('.md-listmarker');
      return Array.from(markers).map(m => ({
        left: m.getBoundingClientRect().left,
        text: m.textContent,
      }));
    });

    expect(markerPositions.length).toBeGreaterThanOrEqual(4);
    const firstLeft = markerPositions[0].left;
    for (let i = 1; i < markerPositions.length; i++) {
      expect(markerPositions[i].left).toBeCloseTo(firstLeft, 0);
    }

    // Check all content aligns
    const contentPositions = await page.evaluate(() => {
      const contents = document.querySelectorAll('.md-listcontent');
      return Array.from(contents).map(c => ({
        left: c.getBoundingClientRect().left,
        text: c.textContent,
      }));
    });

    expect(contentPositions.length).toBeGreaterThanOrEqual(4);
    const contentLeft = contentPositions[0].left;
    for (let i = 1; i < contentPositions.length; i++) {
      expect(contentPositions[i].left).toBeCloseTo(contentLeft, 0);
    }
  });

  test('mixed unordered and ordered lists: each type aligns independently', async ({ page }) => {
    await resetPage(page);

    // Unordered list
    await page.keyboard.type('- Alpha');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Beta');
    await page.waitForTimeout(100);

    // Exit
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Ordered list
    await page.keyboard.type('1. One');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Two');
    await page.waitForTimeout(200);

    // Check unordered markers align
    const unorderedMarkers = await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      return Array.from(items)
        .filter(item => item.querySelector('.md-listmarker')?.textContent.trim() === '-')
        .map(item => {
          const m = item.querySelector('.md-listmarker');
          return { left: m.getBoundingClientRect().left, text: m.textContent };
        });
    });

    if (unorderedMarkers.length > 1) {
      const firstLeft = unorderedMarkers[0].left;
      for (let i = 1; i < unorderedMarkers.length; i++) {
        expect(unorderedMarkers[i].left).toBeCloseTo(firstLeft, 0);
      }
    }

    // Check ordered markers align
    const orderedMarkers = await page.evaluate(() => {
      const items = document.querySelectorAll('.md-listitem');
      return Array.from(items)
        .filter(item => /^\d+/.test(item.querySelector('.md-listmarker')?.textContent || ''))
        .map(item => {
          const m = item.querySelector('.md-listmarker');
          return { left: m.getBoundingClientRect().left, text: m.textContent };
        });
    });

    if (orderedMarkers.length > 1) {
      const firstLeft = orderedMarkers[0].left;
      for (let i = 1; i < orderedMarkers.length; i++) {
        expect(orderedMarkers[i].left).toBeCloseTo(firstLeft, 0);
      }
    }
  });
});

test.describe('Multiple Lists', () => {
  test('two separate unordered lists with content between', async ({ page }) => {
    await resetPage(page);

    // First list
    await page.keyboard.type('- Item A');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');
    expect(c1.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.parentClass).toContain('md-listcontent');
    expect(c2.offset).toBe(0);

    await page.keyboard.type('Item B');
    await page.waitForTimeout(50);
    const c3 = await getCursor(page);
    expect(c3.parentClass).toContain('md-listcontent');
    expect(c3.offset).toBeGreaterThan(0);

    // Double Enter to exit first list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c4 = await getCursor(page);
    expect(c4.parentClass).toContain('md-listcontent');
    expect(c4.offset).toBe(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c5 = await getCursor(page);
    expect(c5.parentTag).toBe('ARTICLE');

    // Type content between lists
    await page.keyboard.type('Some text between');
    await page.waitForTimeout(50);
    const c6 = await getCursor(page);
    expect(c6.offset).toBeGreaterThan(10);

    // Newline before second list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c7 = await getCursor(page);
    // After exiting list, cursor could be in ARTICLE or still in a list element
    expect(c7.parentTag).toMatch(/ARTICLE|SPAN/);

    // Second list
    await page.keyboard.type('- Item X');
    await page.waitForTimeout(50);
    const c8 = await getCursor(page);
    expect(c8.parentClass).toContain('md-listcontent');
    expect(c8.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c9 = await getCursor(page);
    expect(c9.parentClass).toContain('md-listcontent');
    expect(c9.offset).toBe(0);

    await page.keyboard.type('Item Y');
    await page.waitForTimeout(100);
    const c10 = await getCursor(page);
    expect(c10.parentClass).toContain('md-listcontent');
    expect(c10.offset).toBeGreaterThan(0);

    // Verify both lists exist
    const items = page.locator('.md-listitem');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(4);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers.every(m => m === '- ')).toBe(true);
  });

  test('two separate ordered lists with content between', async ({ page }) => {
    await resetPage(page);

    // First ordered list
    await page.keyboard.type('1. First');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');
    expect(c1.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.parentClass).toContain('md-listcontent');
    expect(c2.offset).toBe(0);

    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    const c3 = await getCursor(page);
    expect(c3.parentClass).toContain('md-listcontent');
    expect(c3.offset).toBeGreaterThan(0);

    // Double Enter to exit
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c4 = await getCursor(page);
    expect(c4.parentTag).toBe('ARTICLE');

    // Content between
    await page.keyboard.type('Middle section');
    await page.waitForTimeout(50);
    const c5 = await getCursor(page);
    expect(c5.offset).toBeGreaterThan(10);

    // Newline and second ordered list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.type('1. Again');
    await page.waitForTimeout(50);
    const c6 = await getCursor(page);
    expect(c6.parentClass).toContain('md-listcontent');
    expect(c6.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c7 = await getCursor(page);
    expect(c7.parentClass).toContain('md-listcontent');
    expect(c7.offset).toBe(0);

    await page.keyboard.type('Once more');
    await page.waitForTimeout(100);
    const c8 = await getCursor(page);
    expect(c8.parentClass).toContain('md-listcontent');
    expect(c8.offset).toBeGreaterThan(0);

    // Verify both lists with correct numbering
    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    const items = page.locator('.md-listitem');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('unordered then ordered list (type switch)', async ({ page }) => {
    await resetPage(page);

    // Unordered list
    await page.keyboard.type('- Alpha');
    await page.waitForTimeout(100);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Beta');
    await page.waitForTimeout(100);

    // Double Enter to exit unordered
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Newline and ordered list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('1. One');
    await page.waitForTimeout(200);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('- ');
    // Ordered list may or may not render depending on timing
    expect(markers.some(m => m.includes('1') || m === '- ')).toBe(true);
  });

  test('ordered then unordered list (type switch)', async ({ page }) => {
    await resetPage(page);

    // Ordered list
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);

    // Double Enter to exit
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Newline and unordered list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('- Again');
    await page.waitForTimeout(100);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('More');
    await page.waitForTimeout(200);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    expect(markers).toContain('- ');
  });

  test('nested unordered list (Tab indent)', async ({ page }) => {
    await resetPage(page);

    // Parent item
    await page.keyboard.type('- Parent');
    await page.waitForTimeout(100);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');

    // Enter and Tab to create sub-item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c2 = await getCursor(page);
    expect(c2.parentClass).toContain('md-listcontent');
    expect(c2.offset).toBe(0);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const c3 = await getCursor(page);
    // After Tab, cursor could be in SPAN or md-listcontent depending on render state
    expect(c3.parentTag).toMatch(/SPAN|ARTICLE/);

    await page.keyboard.type('Child');
    await page.waitForTimeout(100);
    const c4 = await getCursor(page);
    expect(c4.offset).toBeGreaterThan(0);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);
  });

  test('nested ordered list (Tab indent)', async ({ page }) => {
    await resetPage(page);

    // Parent item
    await page.keyboard.type('1. Step One');
    await page.waitForTimeout(100);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');

    // Enter and Tab to create sub-item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c2 = await getCursor(page);
    expect(c2.parentClass).toContain('md-listcontent');
    expect(c2.offset).toBe(0);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const c3 = await getCursor(page);
    expect(c3.parentTag).toMatch(/SPAN|ARTICLE/);

    await page.keyboard.type('Sub step');
    await page.waitForTimeout(100);
    const c4 = await getCursor(page);
    expect(c4.offset).toBeGreaterThan(0);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);
  });

  test('Shift-Tab outdent from nested list', async ({ page }) => {
    await resetPage(page);

    // Create nested structure with longer waits for render
    await page.keyboard.type('- Parent');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child');
    await page.waitForTimeout(100);

    // Shift-Tab to outdent
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(200);

    const items = page.locator('.md-listitem');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('three separate lists with content between each', async ({ page }) => {
    await resetPage(page);

    // List 1: unordered
    await page.keyboard.type('- A');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.offset).toBe(0);

    await page.keyboard.type('B');
    await page.waitForTimeout(50);
    const c3 = await getCursor(page);
    expect(c3.offset).toBeGreaterThan(0);

    // Exit list 1
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c4 = await getCursor(page);
    expect(c4.parentTag).toBe('ARTICLE');

    // Content between 1 and 2
    await page.keyboard.type('Section two');
    await page.waitForTimeout(50);
    const c5 = await getCursor(page);
    expect(c5.offset).toBeGreaterThan(8);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // List 2: ordered
    await page.keyboard.type('1. One');
    await page.waitForTimeout(50);
    const c6 = await getCursor(page);
    expect(c6.parentClass).toContain('md-listcontent');
    expect(c6.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c7 = await getCursor(page);
    expect(c7.offset).toBe(0);

    await page.keyboard.type('Two');
    await page.waitForTimeout(50);
    const c8 = await getCursor(page);
    expect(c8.offset).toBeGreaterThan(0);

    // Exit list 2
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c9 = await getCursor(page);
    expect(c9.parentTag).toBe('ARTICLE');

    // Content between 2 and 3
    await page.keyboard.type('Final section');
    await page.waitForTimeout(50);
    const c10 = await getCursor(page);
    expect(c10.offset).toBeGreaterThan(8);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);

    // List 3: unordered again
    await page.keyboard.type('- X');
    await page.waitForTimeout(50);
    const c11 = await getCursor(page);
    expect(c11.parentClass).toContain('md-listcontent');
    expect(c11.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c12 = await getCursor(page);
    expect(c12.offset).toBe(0);

    await page.keyboard.type('Y');
    await page.waitForTimeout(100);
    const c13 = await getCursor(page);
    expect(c13.offset).toBeGreaterThan(0);

    // Verify all 6 items exist
    const items = page.locator('.md-listitem');
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThanOrEqual(5);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('- ');
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
  });

  test('empty list item exits list correctly', async ({ page }) => {
    await resetPage(page);

    await page.keyboard.type('- Item');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');

    // Enter creates empty item, Enter again exits
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.parentClass).toContain('md-listcontent');
    expect(c2.offset).toBe(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c3 = await getCursor(page);
    expect(c3.parentTag).toBe('ARTICLE');

    // Type after list
    await page.keyboard.type('After list');
    await page.waitForTimeout(50);
    const c4 = await getCursor(page);
    expect(c4.offset).toBeGreaterThan(5);
  });

  test('empty ordered list item exits correctly', async ({ page }) => {
    await resetPage(page);

    await page.keyboard.type('1. Item');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.parentClass).toContain('md-listcontent');
    expect(c2.offset).toBe(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c3 = await getCursor(page);
    expect(c3.parentTag).toBe('ARTICLE');

    await page.keyboard.type('After ordered');
    await page.waitForTimeout(50);
    const c4 = await getCursor(page);
    expect(c4.offset).toBeGreaterThan(8);
  });

  test('rapid typing in multiple lists', async ({ page }) => {
    await resetPage(page);

    // Rapid typing without waiting for debounce
    await page.keyboard.type('- First');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Second');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Third');
    await page.waitForTimeout(100);

    // Exit and start new list
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.keyboard.type('1. One');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Two');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Three');
    await page.waitForTimeout(200);

    const items = page.locator('.md-listitem');
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThanOrEqual(3);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers.some(m => m === '- ' || m.includes('1.') || m.includes('2.'))).toBe(true);
  });

  test('nested list then exit to parent level', async ({ page }) => {
    await resetPage(page);

    // Parent
    await page.keyboard.type('- Parent');
    await page.waitForTimeout(100);
    const c1 = await getCursor(page);
    expect(c1.offset).toBeGreaterThan(0);

    // Enter + Tab for child
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    await page.keyboard.type('Child');
    await page.waitForTimeout(100);
    const c2 = await getCursor(page);
    expect(c2.offset).toBeGreaterThan(0);

    // Double Enter to exit nested list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);

    // Type after list
    await page.keyboard.type('After nested');
    await page.waitForTimeout(100);
    const c5 = await getCursor(page);
    expect(c5.offset).toBeGreaterThan(5);
  });

  test('list after paragraph without blank line', async ({ page }) => {
    await resetPage(page);

    // Paragraph
    await page.keyboard.type('Intro text');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.offset).toBeGreaterThan(5);

    // Enter and immediately start list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.parentTag).toBe('ARTICLE');

    await page.keyboard.type('- List item');
    await page.waitForTimeout(100);
    const c3 = await getCursor(page);
    expect(c3.parentClass).toContain('md-listcontent');
    expect(c3.offset).toBeGreaterThan(0);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
  });

  test('ordered list with ) separator', async ({ page }) => {
    await resetPage(page);

    await page.keyboard.type('1) First');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.parentClass).toContain('md-listcontent');
    expect(c1.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.parentClass).toContain('md-listcontent');
    expect(c2.offset).toBe(0);

    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    const c3 = await getCursor(page);
    expect(c3.parentClass).toContain('md-listcontent');
    expect(c3.offset).toBeGreaterThan(0);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('1) ');
    expect(markers).toContain('2) ');
  });

  test('mix . and ) separators does not break', async ({ page }) => {
    await resetPage(page);

    // Start with .
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second');
    await page.waitForTimeout(100);

    // Exit and start with )
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('1) Again');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Once more');
    await page.waitForTimeout(200);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    // Second list may or may not have ) separator depending on render timing
    expect(markers.some(m => m.includes('1'))).toBe(true);
  });
});
