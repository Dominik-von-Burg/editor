import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  placeCursorInListItem, getListMarkers, getListItems,
} from './test-helpers';

test.describe('List split with real keyboard events', () => {
  test('split unordered list item on Enter, cursor at start of new line', async ({ page }) => {
    await resetPage(page);
    
    // Type list item
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(100);
    
    // Verify list item rendered
    expect(await countListItems(page)).toBe(1);
    
    // Move cursor to position 6 (between "Hello " and "World")
    await placeCursorInListItem(page, 0, 6);
    
    // Press Enter (fires real keydown/keyup/beforeinput)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    // Verify split
    expect(await countListItems(page)).toBe(2);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('- Hello \n- World\n');
    
    // Verify cursor position - should be in second item's content at offset 0
    const cursorInfo = await getCursor(page);
    expect(cursorInfo.onListItem).toBe(true);
    expect(cursorInfo.offset).toBe(0);
    expect(cursorInfo.text).toBe('World');
  });
  
  test('split ordered list item on Enter, cursor at start of new line', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('1. Hello World');
    await page.waitForTimeout(100);
    
    expect(await countListItems(page)).toBe(1);
    
    // Move cursor to position 6
    await placeCursorInListItem(page, 0, 6);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    expect(await countListItems(page)).toBe(2);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. Hello \n2. World\n');
    
    // Verify cursor
    const cursorInfo = await getCursor(page);
    expect(cursorInfo.onListItem).toBe(true);
    expect(cursorInfo.offset).toBe(0);
  });
  
  test('continue list on Enter at end, cursor at start of new item', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    
    // Move cursor to end
    await page.keyboard.press('End');
    await page.waitForTimeout(50);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    expect(await countListItems(page)).toBe(2);
    
    // Type in new item
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('- First\n- Second\n');
  });
  
  test('numbered list creation and auto-increment', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('1. Alpha');
    await page.waitForTimeout(100);
    
    expect(await countListItems(page)).toBe(1);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    expect(await countListItems(page)).toBe(2);
    
    await page.keyboard.type('Beta');
    await page.waitForTimeout(50);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    expect(await countListItems(page)).toBe(3);
    
    await page.keyboard.type('Gamma');
    await page.waitForTimeout(50);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. Alpha\n2. Beta\n3. Gamma\n');
    
    const markers = await getListMarkers(page);
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    expect(markers).toContain('3. ');
  });
  
  test('numbered list cursor after Enter at end', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    // Cursor should be in second item's content at offset 0
    const cursorInfo = await getCursor(page);
    expect(cursorInfo.onListItem).toBe(true);
    expect(cursorInfo.offset).toBe(0);
    
    // Typing should go into new item
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. First\n2. Second\n');
  });
  
  test('numbered list split mid-content with cursor check', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('1. Hello World');
    await page.waitForTimeout(100);
    
    // Move cursor to position 6
    await placeCursorInListItem(page, 0, 6);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    expect(await countListItems(page)).toBe(2);
    
    // Cursor should be in second item's content at offset 0
    const cursorInfo = await getCursor(page);
    expect(cursorInfo.onListItem).toBe(true);
    expect(cursorInfo.offset).toBe(0);
    expect(cursorInfo.text).toBe('World');
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. Hello \n2. World\n');
  });
  
  test('numbered list double Enter exits', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('1. Only');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    expect(await countListItems(page)).toBe(1);
  });
  
  test('numbered list Tab indent', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    
    // Tab to indent second item
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    
    const textContent = await page.locator('article').textContent();
    // Tab adds 2 spaces before marker; trailing may vary
    expect(textContent.startsWith('1. First\n  2. Second')).toBe(true);
  });
  
  test('numbered list Shift-Tab outdent', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    
    // Tab to indent
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);
    
    // Shift-Tab to outdent
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(100);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent.startsWith('1. First\n2. Second')).toBe(true);
  });
  
  test('double Enter exits list', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('- Only');
    await page.waitForTimeout(100);
    
    // Double Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    expect(await countListItems(page)).toBe(1);
  });

  test('double Enter exits list and cursor is on new line after list', async ({ page }) => {
    await resetPage(page);
    
    await page.keyboard.type('- Item');
    await page.waitForTimeout(100);
    
    // First Enter: creates new empty list item
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    
    // Second Enter: exits list
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    // Type content after the list
    await page.keyboard.type('After');
    await page.waitForTimeout(100);
    
    // Verify "After" is NOT inside a list item
    const textContent = await page.locator('article').textContent();
    expect(textContent).toContain('Item');
    expect(textContent).toContain('After');
    
    // The content "After" should not be inside any list item
    const listItems = await getListItems(page);
    const listTexts = listItems.map(item => item.text);
    for (const item of listTexts) {
      expect(item).not.toContain('After');
    }
    
    // Should have exactly 1 list item
    expect(await countListItems(page)).toBe(1);
  });
});
