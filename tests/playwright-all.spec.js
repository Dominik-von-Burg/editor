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
    return {
      parentClass: sel.anchorNode?.parentElement?.className,
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
  });

  test('Tab indents sub-bullet', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content).toContain('  -');
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
    await page.keyboard.type('Banana');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
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
  });

  test('no extra leading space in content', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(100);

    const contentText = await page.locator('.md-listcontent').textContent();
    expect(contentText).toBe('Apple');
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
  });
});

test.describe('Numbered Lists (ordered)', () => {
  test('typing 1. creates list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. First');
    await page.waitForTimeout(200);

    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);

    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers[0]).toContain('1.');
  });

  test('Enter increments numbers', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('1. Alpha');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Beta');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
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
  });
});

test.describe('Undo/Redo', () => {
  test('Ctrl+Z undo removes last character', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Hello');
    await page.waitForTimeout(300);

    const before = await page.locator('article').textContent();
    expect(before).toContain('Hello');

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    const after = await page.locator('article').textContent();
    expect(after).not.toBe(before);
  });

  test('Ctrl+Shift+Z redo restores', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Hello');
    await page.waitForTimeout(300);

    const before = await page.locator('article').textContent();

    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);

    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(200);

    const after = await page.locator('article').textContent();
    expect(after).toBe(before);
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
  });
});
