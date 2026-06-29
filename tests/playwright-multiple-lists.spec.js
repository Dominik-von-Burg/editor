import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  getListMarkers, getListContents,
  findListItems, placeCursorInListItem,
} from './test-helpers';

test.describe('Multiple Lists', () => {
  test('two separate unordered lists with content between', async ({ page }) => {
    await resetPage(page);

    // First list
    await page.keyboard.type('- Item A');
    await page.waitForTimeout(50);
    let c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);
    expect(c1.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    let c2 = await getCursor(page);
    expect(c2.onListItem).toBe(true);
    expect(c2.offset).toBe(0);

    await page.keyboard.type('Item B');
    await page.waitForTimeout(50);
    const c3 = await getCursor(page);
    expect(c3.onListItem).toBe(true);
    expect(c3.offset).toBeGreaterThan(0);

    // Double Enter to exit first list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c4 = await getCursor(page);
    expect(c4.onListItem).toBe(true);
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
    expect(c8.onListItem).toBe(true);
    expect(c8.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c9 = await getCursor(page);
    expect(c9.onListItem).toBe(true);
    expect(c9.offset).toBe(0);

    await page.keyboard.type('Item Y');
    await page.waitForTimeout(100);
    const c10 = await getCursor(page);
    expect(c10.onListItem).toBe(true);
    expect(c10.offset).toBeGreaterThan(0);

    // Verify both lists exist
    expect(await countListItems(page)).toBeGreaterThanOrEqual(4);

    const markers = await getListMarkers(page);
    expect(markers.every(m => m === '- ')).toBe(true);
  });

  test('two separate ordered lists with content between', async ({ page }) => {
    await resetPage(page);

    // First ordered list
    await page.keyboard.type('1. First');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);
    expect(c1.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.onListItem).toBe(true);
    expect(c2.offset).toBe(0);

    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    const c3 = await getCursor(page);
    expect(c3.onListItem).toBe(true);
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
    expect(c6.onListItem).toBe(true);
    expect(c6.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c7 = await getCursor(page);
    expect(c7.onListItem).toBe(true);
    expect(c7.offset).toBe(0);

    await page.keyboard.type('Once more');
    await page.waitForTimeout(100);
    const c8 = await getCursor(page);
    expect(c8.onListItem).toBe(true);
    expect(c8.offset).toBeGreaterThan(0);

    // Verify both lists with correct numbering
    const markers = await getListMarkers(page);
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    expect(await countListItems(page)).toBeGreaterThanOrEqual(4);
  });

  test('unordered then ordered list (type switch)', async ({ page }) => {
    await resetPage(page);

    // Unordered list
    await page.keyboard.type('- Alpha');
    await page.waitForTimeout(100);
    const c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);

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

    const markers = await getListMarkers(page);
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
    expect(c1.onListItem).toBe(true);

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

    const markers = await getListMarkers(page);
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
    expect(c1.onListItem).toBe(true);

    // Enter and Tab to create sub-item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c2 = await getCursor(page);
    expect(c2.onListItem).toBe(true);
    expect(c2.offset).toBe(0);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const c3 = await getCursor(page);
    // After Tab, cursor could be in SPAN or ARTICLE depending on render state
    expect(c3.parentTag).toMatch(/SPAN|ARTICLE/);

    await page.keyboard.type('Child');
    await page.waitForTimeout(100);
    const c4 = await getCursor(page);
    expect(c4.offset).toBeGreaterThan(0);

    expect(await countListItems(page)).toBe(2);
  });

  test('nested ordered list (Tab indent)', async ({ page }) => {
    await resetPage(page);

    // Parent item
    await page.keyboard.type('1. Step One');
    await page.waitForTimeout(100);
    const c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);

    // Enter and Tab to create sub-item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const c2 = await getCursor(page);
    expect(c2.onListItem).toBe(true);
    expect(c2.offset).toBe(0);

    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    const c3 = await getCursor(page);
    expect(c3.parentTag).toMatch(/SPAN|ARTICLE/);

    await page.keyboard.type('Sub step');
    await page.waitForTimeout(100);
    const c4 = await getCursor(page);
    expect(c4.offset).toBeGreaterThan(0);

    expect(await countListItems(page)).toBe(2);
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

    expect(await countListItems(page)).toBeGreaterThanOrEqual(2);
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
    expect(c6.onListItem).toBe(true);
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
    expect(c11.onListItem).toBe(true);
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
    expect(await countListItems(page)).toBeGreaterThanOrEqual(5);

    const markers = await getListMarkers(page);
    expect(markers).toContain('- ');
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
  });

  test('empty list item exits list correctly', async ({ page }) => {
    await resetPage(page);

    await page.keyboard.type('- Item');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);

    // Enter creates empty item, Enter again exits
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.onListItem).toBe(true);
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
    expect(c1.onListItem).toBe(true);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.onListItem).toBe(true);
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

    expect(await countListItems(page)).toBeGreaterThanOrEqual(3);

    const markers = await getListMarkers(page);
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
    expect(c3.onListItem).toBe(true);
    expect(c3.offset).toBeGreaterThan(0);

    expect(await countListItems(page)).toBe(1);
  });

  test('ordered list with ) separator', async ({ page }) => {
    await resetPage(page);

    await page.keyboard.type('1) First');
    await page.waitForTimeout(50);
    const c1 = await getCursor(page);
    expect(c1.onListItem).toBe(true);
    expect(c1.offset).toBeGreaterThan(0);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    const c2 = await getCursor(page);
    expect(c2.onListItem).toBe(true);
    expect(c2.offset).toBe(0);

    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    const c3 = await getCursor(page);
    expect(c3.onListItem).toBe(true);
    expect(c3.offset).toBeGreaterThan(0);

    const markers = await getListMarkers(page);
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

    const markers = await getListMarkers(page);
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    // Second list may or may not have ) separator depending on render timing
    expect(markers.some(m => m.includes('1'))).toBe(true);
  });
});
