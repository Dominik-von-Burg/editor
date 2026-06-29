import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  placeCursorInListItem,
} from './test-helpers';

test.describe('Selection Support', () => {
  test('select text in paragraph - selection captured correctly', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Hello Beautiful World');
    await page.waitForTimeout(100);

    // Select "Beautiful " (offset 6 to 16)
    await page.evaluate(() => {
      const el = document.querySelector('article');
      const textNode = el.firstChild;
      const range = document.createRange();
      range.setStart(textNode, 6);
      range.setEnd(textNode, 16);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    // Verify selection is active
    const sel1 = await page.evaluate(() => {
      const sel = window.getSelection();
      return { text: sel.toString(), collapsed: sel.isCollapsed };
    });
    expect(sel1.collapsed).toBe(false);
    expect(sel1.text).toBe('Beautiful ');
  });

  test('select text in list item - selection captured correctly', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Hello Beautiful World');
    await page.waitForTimeout(100);

    // Select "Beautiful " inside the list content
    // "- Hello " = 8 chars, so "Beautiful " starts at offset 8+6=14
    await page.evaluate(() => {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      const item = items[0];
      if (!item) return;
      const m2 = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      const contentStart = item.start + (m2 ? m2[0].length : 0);
      const content = item.text.slice(contentStart).replace(/\n$/, '');
      const textNode = document.querySelector('article').firstChild;
      if (!textNode) return;
      const range = document.createRange();
      range.setStart(textNode, contentStart + 6);
      range.setEnd(textNode, contentStart + 16);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    const sel1 = await page.evaluate(() => {
      const sel = window.getSelection();
      return { text: sel.toString(), collapsed: sel.isCollapsed };
    });
    expect(sel1.collapsed).toBe(false);
    expect(sel1.text).toBe('Beautiful ');
  });

  test('select text in nested list item - selection captured correctly', async ({ page }) => {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- Parent\n  - Child Item Here\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(100);

    // Select "Item" in the nested child
    await page.evaluate(() => {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      const childItem = items[1]; // Child Item Here
      if (!childItem) return;
      const markerMatch = childItem.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      const contentStart = childItem.start + (markerMatch ? markerMatch[0].length : 0);
      // "Child " = 6 chars, "Item" starts at contentStart + 6
      const textNode = document.querySelector('article').firstChild;
      if (!textNode) return;
      const range = document.createRange();
      range.setStart(textNode, contentStart + 6);
      range.setEnd(textNode, contentStart + 10);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    const sel1 = await page.evaluate(() => {
      const sel = window.getSelection();
      return { text: sel.toString() };
    });
    expect(sel1.text).toBe('Item');
  });

  test('select all text and replace', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Original content here');
    await page.waitForTimeout(100);

    // Select all
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.waitForTimeout(50);

    const sel1 = await page.evaluate(() => {
      const sel = window.getSelection();
      return { collapsed: sel.isCollapsed, text: sel.toString() };
    });
    expect(sel1.collapsed).toBe(false);
    expect(sel1.text).toBe('Original content here');

    // Replace
    await page.keyboard.type('New content');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toBe('New content');
  });

  test('delete key removes selection in list item', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Hello Beautiful World');
    await page.waitForTimeout(100);

    // Select "Beautiful "
    await page.evaluate(() => {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      const item = items[0];
      if (!item) return;
      const m2 = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      const contentStart = item.start + (m2 ? m2[0].length : 0);
      const textNode = document.querySelector('article').firstChild;
      if (!textNode) return;
      const range = document.createRange();
      range.setStart(textNode, contentStart + 6);
      range.setEnd(textNode, contentStart + 16);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    // Press Delete to remove selection
    await page.keyboard.press('Delete');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('- Hello World');
  });
});
