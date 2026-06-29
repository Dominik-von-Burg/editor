import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  getListMarkers, getListContents,
  findListItems, placeCursorInListItem,
} from './test-helpers';

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

    expect(await countListItems(page)).toBe(3);

    const markers = await getListMarkers(page);
    expect(markers).toContain('- ');
  });

  test('typing creates list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(200);

    expect(await countListItems(page)).toBe(1);
  });

  test('Enter continues list', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    expect(await countListItems(page)).toBe(2);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
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

    expect(await countListItems(page)).toBe(1);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(false);
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
    // After Tab indent, cursor is in article (md-listitem spans removed)
    expect(cursor.parentTag).toBe('ARTICLE');
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
    expect(cursor.parentTag).toBe('ARTICLE');
    expect(cursor.offset).toBeGreaterThanOrEqual(0);
  });

  test('split list item mid-content', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(100);

    // Move cursor to position 6
    await placeCursorInListItem(page, 0, 6);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    expect(await countListItems(page)).toBe(2);

    const content = await page.locator('article').textContent();
    expect(content).toBe('- Hello \n- World\n');
  });

  test('cursor after split is in content at offset 0', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(100);

    await placeCursorInListItem(page, 0, 6);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
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
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);
  });

  test('multi-item list content', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    let cursor1 = await getCursor(page);
    expect(cursor1.onListItem).toBe(true);
    expect(cursor1.offset).toBe(0);

    await page.keyboard.type('Banana');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const cursor2 = await getCursor(page);
    expect(cursor2.onListItem).toBe(true);
    expect(cursor2.offset).toBe(0);

    await page.keyboard.type('Cherry');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Apple');
    expect(content).toContain('Banana');
    expect(content).toContain('Cherry');

    expect(await countListItems(page)).toBe(3);
  });

  test('raw textContent has markers', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Item');
    await page.waitForTimeout(100);

    const content = await page.locator('article').textContent();
    expect(content).toMatch(/^- /);

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(4);
  });

  test('no extra leading space in content', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Apple');
    await page.waitForTimeout(100);

    const contents = await getListContents(page);
    expect(contents[0]).toBe('Apple');

    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
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
    expect(cursor.onListItem).toBe(false);
  });
});
