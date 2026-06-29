import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, injectMd,
  countListItems,
} from './test-helpers';

test.describe('Page Load & Typing', () => {
  test('default title and contentEditable', async ({ page }) => {
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

test.describe('Undo/Redo', () => {
  test('Ctrl+Z undo removes last character', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Hello');
    await page.waitForTimeout(300);

    const before = await page.locator('article').textContent();
    expect(before).toContain('Hello');

    const cursorBefore = await getCursor(page);
    expect(cursorBefore.onListItem).toBe(false);
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

test.describe('Mixed Content', () => {
  test('heading + list + bold + italic', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('# My List\n\n- **Bold** item\n- *Italic* item');
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('My List');
    expect(content).toContain('Bold');
    expect(content).toContain('Italic');

    expect(await countListItems(page)).toBe(2);
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

    expect(await countListItems(page)).toBeGreaterThanOrEqual(50); // At least half rendered
  });
});
