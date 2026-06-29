import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
} from './test-helpers';

test.describe('Two Lists With Text Between', () => {
  test('cursor stays in content after Enter in second list', async ({ page }) => {
    await resetPage(page);

    // First list
    await page.keyboard.type('- First item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second item');
    await page.waitForTimeout(100);

    // Double Enter to exit list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Extra Enter for blank line
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type text between lists
    await page.keyboard.type('Text');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Second list
    await page.keyboard.type('- Third item');
    await page.waitForTimeout(200);

    // Press Enter to continue second list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Cursor should be on a list item at offset 0
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);

    // Type fourth item - should appear on the new line, not on a blank line
    await page.keyboard.type('Fourth item');
    await page.waitForTimeout(200);

    // Verify content structure
    const content = await page.locator('article').textContent();
    const lines = content.split('\n');
    // Expected: "- First item\n- Second item\n\nText\n- Third item\n- Fourth item"
    expect(lines).toContain('- First item');
    expect(lines).toContain('- Second item');
    expect(lines).toContain('- Third item');
    expect(lines).toContain('- Fourth item');
    expect(lines).toContain('Text');

    // Verify no blank lines in the second list
    expect(await countListItems(page)).toBe(4); // 2 in first list + 2 in second list
  });

  test('numbered list cursor after Enter in second list', async ({ page }) => {
    await resetPage(page);

    // First list
    await page.keyboard.type('1. First item');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.type('Second item');
    await page.waitForTimeout(100);

    // Double Enter to exit list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Extra Enter for blank line
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Type text between lists
    await page.keyboard.type('Text');
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);

    // Second list
    await page.keyboard.type('1. Third item');
    await page.waitForTimeout(200);

    // Press Enter to continue second list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Cursor should be on a list item at offset 0
    const cursor = await getCursor(page);
    expect(cursor.onListItem).toBe(true);
    expect(cursor.offset).toBe(0);

    // Type fourth item
    await page.keyboard.type('Fourth item');
    await page.waitForTimeout(200);

    // Verify content
    const content = await page.locator('article').textContent();
    const lines = content.split('\n');
    expect(lines).toContain('1. First item');
    expect(lines).toContain('2. Second item');
    expect(lines).toContain('1. Third item');
    expect(lines).toContain('2. Fourth item');

    expect(await countListItems(page)).toBe(4);
  });
});
