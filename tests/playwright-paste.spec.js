import { test, expect } from '@playwright/test';
import {
  BASE_URL, resetPage, getCursor, countListItems,
  findListItems, placeCursorInListItem, placeCursorAtEndOfListItem,
} from './test-helpers';

// Helper: paste text at current cursor position
async function pasteText(page, text, html = null) {
  await page.evaluate(({text, html}) => {
    const el = document.querySelector('article');
    const event = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
      bubbles: true,
      cancelable: true,
    });
    event.clipboardData.setData('text/plain', text);
    if (html) {
      event.clipboardData.setData('text/html', html);
    }
    el.dispatchEvent(event);
  }, {text, html});
  await page.waitForTimeout(300);
}

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

    const count = await countListItems(page);
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

test.describe('Paste Tests', () => {
  test('paste list into empty paragraph creates list', async ({ page }) => {
    await resetPage(page);
    await pasteText(page, '- A\n- B\n- C');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('A');
    expect(content).toContain('B');
    expect(content).toContain('C');

    expect(await countListItems(page)).toBe(3);
  });

  test('paste list into existing list item appends items', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('- Existing');
    await page.waitForTimeout(100);

    // Move cursor to end of existing item
    await placeCursorAtEndOfListItem(page, 0);

    await pasteText(page, '\n- Pasted1\n- Pasted2');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Existing');
    expect(content).toContain('Pasted1');
    expect(content).toContain('Pasted2');

    expect(await countListItems(page)).toBe(3);
  });

  test('paste multi-line text into paragraph preserves newlines', async ({ page }) => {
    await resetPage(page);
    await page.keyboard.type('Before');
    await page.waitForTimeout(50);

    await pasteText(page, '\nLine1\nLine2\nLine3');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Before');
    expect(content).toContain('Line1');
    expect(content).toContain('Line2');
    expect(content).toContain('Line3');
  });

  test('paste ordered list creates numbered items', async ({ page }) => {
    await resetPage(page);
    await pasteText(page, '1. First\n2. Second\n3. Third');
    await page.waitForTimeout(200);

    expect(await countListItems(page)).toBe(3);

    const content = await page.locator('article').textContent();
    expect(content).toContain('First');
    expect(content).toContain('Second');
    expect(content).toContain('Third');
  });

  test('paste into nested list item preserves nesting context', async ({ page }) => {
    await resetPage(page);
    await page.evaluate(() => {
      const el = document.querySelector('article');
      el.textContent = '- Parent\n  - Child1\n  - Child2\n';
      parseMarkdown(el);
    });
    await page.waitForTimeout(100);

    // Move cursor to end of Child1
    await placeCursorAtEndOfListItem(page, 1);

    await pasteText(page, ' more text');
    await page.waitForTimeout(200);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Child1 more text');
  });

  test('paste HTML list converts to markdown', async ({ page }) => {
    await resetPage(page);
    await pasteText(page, 'A\nB', '<ul><li>A</li><li>B</li></ul>');
    await page.waitForTimeout(300);

    const content = await page.locator('article').textContent();
    expect(content).toContain('A');
    expect(content).toContain('B');
  });
});
