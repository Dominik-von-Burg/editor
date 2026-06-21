import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8901';

test.describe('List split with real keyboard events', () => {
  test('split unordered list item on Enter, cursor at start of new line', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    // Focus the article
    await page.click('article');
    await page.waitForTimeout(100);
    
    // Type list item
    await page.keyboard.type('- Hello World');
    await page.waitForTimeout(100);
    
    // Verify list item rendered
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
    
    // Move cursor to position 6 (between "Hello " and "World")
    await page.evaluate(() => {
      const sel = window.getSelection();
      const range = document.createRange();
      const content = document.querySelector('.md-listcontent');
      range.setStart(content.firstChild, 6);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    });
    
    // Press Enter (fires real keydown/keyup/beforeinput)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    // Verify split
    await expect(items).toHaveCount(2);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('- Hello \n- World\n');
    
    // Verify cursor position - should be in second item's content at offset 0
    const cursorInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      return {
        parentClass: sel.anchorNode?.parentElement?.className,
        offset: sel.anchorOffset,
        text: sel.anchorNode?.textContent,
      };
    });
    
    expect(cursorInfo.parentClass).toBe('md-listcontent');
    expect(cursorInfo.offset).toBe(0);
    expect(cursorInfo.text).toBe('World');
  });
  
  test('split ordered list item on Enter, cursor at start of new line', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('1. Hello World');
    await page.waitForTimeout(100);
    
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
    
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
    
    await expect(items).toHaveCount(2);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. Hello \n2. World\n');
    
    // Verify cursor
    const cursorInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      return {
        parentClass: sel.anchorNode?.parentElement?.className,
        offset: sel.anchorOffset,
      };
    });
    
    expect(cursorInfo.parentClass).toBe('md-listcontent');
    expect(cursorInfo.offset).toBe(0);
  });
  
  test('continue list on Enter at end, cursor at start of new item', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('- First');
    await page.waitForTimeout(100);
    
    // Move cursor to end
    await page.keyboard.press('End');
    await page.waitForTimeout(50);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(2);
    
    // Type in new item
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('- First\n- Second\n');
  });
  
  test('numbered list creation and auto-increment', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('1. Alpha');
    await page.waitForTimeout(100);
    
    let items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await expect(items).toHaveCount(2);
    
    await page.keyboard.type('Beta');
    await page.waitForTimeout(50);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    await expect(items).toHaveCount(3);
    
    await page.keyboard.type('Gamma');
    await page.waitForTimeout(50);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. Alpha\n2. Beta\n3. Gamma\n');
    
    const markers = await page.locator('.md-listmarker').allTextContents();
    expect(markers).toContain('1. ');
    expect(markers).toContain('2. ');
    expect(markers).toContain('3. ');
  });
  
  test('numbered list cursor after Enter at end', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('1. First');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    // Cursor should be in second item's content at offset 0
    const cursorInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      return {
        parentClass: sel.anchorNode?.parentElement?.className,
        offset: sel.anchorOffset,
      };
    });
    expect(cursorInfo.parentClass).toBe('md-listcontent');
    expect(cursorInfo.offset).toBe(0);
    
    // Typing should go into new item
    await page.keyboard.type('Second');
    await page.waitForTimeout(50);
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. First\n2. Second\n');
  });
  
  test('numbered list split mid-content with cursor check', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('1. Hello World');
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
    
    // Cursor should be in second item's content at offset 0
    const cursorInfo = await page.evaluate(() => {
      const sel = window.getSelection();
      return {
        parentClass: sel.anchorNode?.parentElement?.className,
        offset: sel.anchorOffset,
        text: sel.anchorNode?.textContent,
      };
    });
    expect(cursorInfo.parentClass).toBe('md-listcontent');
    expect(cursorInfo.offset).toBe(0);
    expect(cursorInfo.text).toBe('World');
    
    const textContent = await page.locator('article').textContent();
    expect(textContent).toBe('1. Hello \n2. World\n');
  });
  
  test('numbered list double Enter exits', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('1. Only');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
  });
  
  test('numbered list Tab indent', async ({ page }) => {
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
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
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
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
    await page.goto(`${BASE_URL}/index.html`);
    
    await page.click('article');
    await page.waitForTimeout(100);
    
    await page.keyboard.type('- Only');
    await page.waitForTimeout(100);
    
    // Double Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(50);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    
    const items = page.locator('.md-listitem');
    await expect(items).toHaveCount(1);
  });
});
