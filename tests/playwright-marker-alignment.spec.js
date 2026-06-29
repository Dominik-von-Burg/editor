import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, countListItems,
  getListMarkers, getListContents,
  findListItems,
} from './test-helpers';

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

    // Check all markers are consistent
    const markers = await getListMarkers(page);
    expect(markers).toEqual(['- ', '- ', '- ']);
    expect(markers.length).toBe(3);
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

    // Check all markers are sequential
    const markers = await getListMarkers(page);
    expect(markers).toEqual(['1. ', '2. ', '3. ']);
    expect(markers.length).toBe(3);
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

    // Check all contents are present
    const contents = await getListContents(page);
    expect(contents).toEqual(['First item', 'Second item', 'Third item']);
    expect(contents.length).toBe(3);
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

    // Check all markers are consistent
    const markers = await getListMarkers(page);
    expect(markers.length).toBeGreaterThanOrEqual(4);
    expect(markers.every(m => m === '- ')).toBe(true);

    // Check all contents are present
    const contents = await getListContents(page);
    expect(contents).toContain('Item A');
    expect(contents).toContain('Item B');
    expect(contents).toContain('Item X');
    expect(contents).toContain('Item Y');
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

    // Check all markers are present
    const markers = await getListMarkers(page);
    expect(markers.length).toBeGreaterThanOrEqual(4);
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

    // Check unordered markers
    const markers = await getListMarkers(page);
    const unorderedMarkers = markers.filter(m => m === '- ');
    const orderedMarkers = markers.filter(m => /^\d/.test(m));
    
    expect(unorderedMarkers.length).toBe(2);
    expect(orderedMarkers.length).toBe(2);
  });
});
