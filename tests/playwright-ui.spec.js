import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, injectMd, pasteText,
  countListItems, getListMarkers, getListContents,
  findListItems, placeCursorInListItem, placeCursorAtEndOfListItem,
  placeCursorAtStartOfListItem, getListItemContent, isCursorOnListItem,
} from './test-helpers';
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
