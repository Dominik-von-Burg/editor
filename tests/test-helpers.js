import { test, expect } from '@playwright/test';

export const BASE_URL = 'http://localhost:8901';

// Inject browser-side helper functions
export async function injectHelpers(page) {
  await page.evaluate(() => {
    if (!window.__findListItems) {
      window.__findListItems = function() {
        const text = document.querySelector('article')?.textContent || '';
        const items = [];
        const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
        let m;
        while ((m = re.exec(text)) !== null) {
          items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
        }
        return items;
      };
    }
  });
}

// ============================================================
// In-page helpers (called via page.evaluate)
// ============================================================

// Find all list items in article textContent
// Returns: [{ text, start, end }, ...]
export async function findListItems(page) {
  return page.evaluate(() => {
    const text = document.querySelector('article').textContent || '';
    const items = [];
    const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return items;
  });
}

// Place cursor at content offset within a list item (0-based index)
export async function placeCursorInListItem(page, itemIndex, contentOffset) {
  return page.evaluate(({ itemIndex, contentOffset }) => {
    const text = document.querySelector('article').textContent || '';
    const items = [];
    const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    if (itemIndex >= items.length) return;
    const item = items[itemIndex];
    const markerMatch = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
    const markerLen = markerMatch ? markerMatch[0].length : 0;
    const targetOffset = item.start + markerLen + contentOffset;
    const art = document.querySelector('article');
    
    // Navigate to the text node at the target offset
    let current = 0;
    let found = false;
    let targetNode = null;
    let targetOffsetInNode = 0;
    
    const visit = (parent) => {
      for (const child of parent.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const len = child.textContent.length;
          if (current + len > targetOffset) {
            targetNode = child;
            targetOffsetInNode = targetOffset - current;
            found = true;
            return 'stop';
          }
          current += len;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const result = visit(child);
          if (result === 'stop') return 'stop';
        }
      }
    };
    visit(art);
    
    if (found && targetNode) {
      const range = document.createRange();
      range.setStart(targetNode, Math.min(targetOffsetInNode, targetNode.textContent.length));
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, { itemIndex, contentOffset });
}

// Place cursor at end of list item content (before trailing \n)
export async function placeCursorAtEndOfListItem(page, itemIndex) {
  return page.evaluate(({ itemIndex }) => {
    const text = document.querySelector('article').textContent || '';
    const items = [];
    const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    if (itemIndex >= items.length) return;
    const item = items[itemIndex];
    const endOffset = item.text.endsWith('\n') ? item.end - 1 : item.end;
    const art = document.querySelector('article');

    // Traverse text nodes to find the correct position
    let charIndex = 0;
    const walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
    let node = walker.currentNode;
    while (node) {
      const nodeLen = (node.nodeValue || '').length;
      if (charIndex + nodeLen >= endOffset) {
        const range = document.createRange();
        range.setStart(node, Math.min(endOffset - charIndex, node.length));
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      charIndex += nodeLen;
      node = walker.nextNode();
    }
  }, { itemIndex });
}

// Place cursor at start of list item content (right after marker)
export async function placeCursorAtStartOfListItem(page, itemIndex) {
  await placeCursorInListItem(page, itemIndex, 0);
}

// Get text content of a list item (after the marker, without trailing \n)
export async function getListItemContent(page, itemIndex) {
  return page.evaluate(({ itemIndex }) => {
    const text = document.querySelector('article').textContent || '';
    const items = [];
    const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
    let m;
    while ((m = re.exec(text)) !== null) {
      items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    if (itemIndex >= items.length) return '';
    const item = items[itemIndex];
    const m2 = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
    return m2 ? item.text.slice(m2[0].length).replace(/\n$/, '') : item.text.replace(/\n$/, '');
  }, { itemIndex });
}

// Check if cursor is on a list item line
export function isCursorOnListItem() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const art = document.querySelector('article');
  const range = document.createRange();
  range.setStart(art, 0);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  const offset = range.toString().length;
  const items = findListItems();
  for (const item of items) {
    // Effective end: exclude trailing newline so cursor on blank line after item is not "on" it
    const effectiveEnd = item.text.endsWith('\n') ? item.end - 1 : item.end;
    if (offset >= item.start && offset <= effectiveEnd) return true;
  }
  return false;
}

// Get cursor offset as integer within article
export function getCursorOffset() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const art = document.querySelector('article');
  const range = document.createRange();
  range.setStart(art, 0);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  return range.toString().length;
}

// Get list item marker text (e.g., "- ", "1. ", "2. ")
export function getListItemMarker(itemIndex) {
  const items = findListItems();
  if (itemIndex >= items.length) return '';
  const item = items[itemIndex];
  const m = item.text.match(/^[ \t]*(-|\d+[.)]) */);
  return m ? m[1] + ' ' : '';
}

// Get all markers
export function getAllMarkers() {
  return findListItems().map((item, i) => getListItemMarker(i));
}

// Get all contents
export function getAllContents() {
  return findListItems().map((item, i) => getListItemContent(i));
}

// Get list item indentation (number of leading spaces/tabs)
export function getListItemIndent(itemIndex) {
  const items = findListItems();
  if (itemIndex >= items.length) return 0;
  const item = items[itemIndex];
  const m = item.text.match(/^([ \t]*)/);
  return m ? m[1].length : 0;
}

// ============================================================
// Page-level helpers (called from test code)
// ============================================================

// Reset state and focus editor
export async function resetPage(page) {
  await page.goto(`${BASE_URL}/index.html?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await injectHelpers(page);
  await page.click('article');
  await page.waitForTimeout(100);
}

// Get cursor info (includes onListItem flag)
export async function getCursor(page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    let node = sel.anchorNode;
    let parentEl = null;
    while (node) {
      if (node.nodeType === 1) {
        parentEl = node;
        break;
      }
      node = node.parentElement;
    }
    
    // Inline helper: find all list items
    function findListItems() {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return items;
    }
    
    // Inline helper: check if cursor is on a list item
    function isCursorOnListItem() {
      const art = document.querySelector('article');
      const range = document.createRange();
      range.setStart(art, 0);
      range.setEnd(sel.anchorNode, sel.anchorOffset);
      const offset = range.toString().length;
      const items = findListItems();
      for (const item of items) {
        const effectiveEnd = item.text.endsWith('\n') ? item.end - 1 : item.end;
        if (offset >= item.start && offset <= effectiveEnd) return true;
      }
      return false;
    }
    
    // Inline helper: get cursor offset within the list item
    function getCursorOffset() {
      const items = findListItems();
      const art = document.querySelector('article');
      const range = document.createRange();
      range.setStart(art, 0);
      range.setEnd(sel.anchorNode, sel.anchorOffset);
      const offset = range.toString().length;
      
      // Find which list item contains the cursor
      for (const item of items) {
        if (offset >= item.start && offset <= item.end) {
          // Calculate offset within this list item
          const markerMatch = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
          const markerLen = markerMatch ? markerMatch[0].length : 0;
          return offset - item.start - markerLen;
        }
      }
      return offset;
    }
    
    // Inline helper: get current line text (without list marker)
    function getCurrentLineText() {
      const art = document.querySelector('article');
      const text = art.textContent || '';
      const range = document.createRange();
      range.setStart(art, 0);
      range.setEnd(sel.anchorNode, sel.anchorOffset);
      const offset = range.toString().length;
      
      // Find the start and end of the current line
      const beforeCursor = text.slice(0, offset);
      const afterCursor = text.slice(offset);
      const lineStart = beforeCursor.lastIndexOf('\n') + 1;
      const lineEnd = afterCursor.indexOf('\n');
      const lineEndPos = lineEnd === -1 ? text.length : offset + lineEnd;
      
      let line = text.slice(lineStart, lineEndPos);
      // Strip list marker (- or number.)
      line = line.replace(/^[ \t]*(-|\d+[.)]) */, '');
      return line;
    }
    
    return {
      parentClass: parentEl?.className || '',
      parentTag: parentEl?.tagName || '',
      offset: getCursorOffset(),
      text: getCurrentLineText(),
      onListItem: isCursorOnListItem(),
    };
  });
}

// Inject markdown text and trigger render
export async function injectMd(page, md) {
  await page.evaluate((text) => {
    const el = document.querySelector('article');
    el.textContent = text;
    parseMarkdown(el);
  }, md);
  await page.waitForTimeout(100);
}

// Paste text into editor
export async function pasteText(page, text) {
  await page.evaluate((t) => {
    const clipData = new DataTransfer();
    clipData.setData('text/plain', t);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: clipData,
      bubbles: true,
      cancelable: true,
    });
    const el = document.querySelector('article');
    el.dispatchEvent(pasteEvent);
  }, text);
  await page.waitForTimeout(150);
}

// Count list items
export async function countListItems(page) {
  return page.evaluate(() => {
    function findListItems() {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return items;
    }
    return findListItems().length;
  });
}

// Get list item markers
export async function getListMarkers(page) {
  return page.evaluate(() => {
    function findListItems() {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return items;
    }
    function getListItemMarker(itemIndex) {
      const items = findListItems();
      if (itemIndex >= items.length) return '';
      const item = items[itemIndex];
      const m = item.text.match(/^[ \t]*(-|\d+[.)]) */);
      return m ? m[1] + ' ' : '';
    }
    return findListItems().map((item, i) => getListItemMarker(i));
  });
}

// Get list item contents (after markers)
export async function getListContents(page) {
  return page.evaluate(() => {
    function findListItems() {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return items;
    }
    function getListItemContent(itemIndex) {
      const items = findListItems();
      if (itemIndex >= items.length) return '';
      const item = items[itemIndex];
      const m = item.text.match(/^[ \t]*(?:-|\d+[.)]) */);
      return m ? item.text.slice(m[0].length).replace(/\n$/, '') : item.text.replace(/\n$/, '');
    }
    return findListItems().map((item, i) => getListItemContent(i));
  });
}

// Get list item indents
export async function getListIndents(page) {
  return page.evaluate(() => {
    function findListItems() {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return items;
    }
    function getListItemIndent(itemIndex) {
      const items = findListItems();
      if (itemIndex >= items.length) return 0;
      const item = items[itemIndex];
      const m = item.text.match(/^([ \t]*)/);
      return m ? m[1].length : 0;
    }
    return findListItems().map((item, i) => getListItemIndent(i));
  });
}

// Get full list items (text, start, end)
export async function getListItems(page) {
  return page.evaluate(() => {
    function findListItems() {
      const text = document.querySelector('article').textContent || '';
      const items = [];
      const re = /^([ \t]{0,8})(-|\d+[.)])([ \t]*)([^\n]*)\n?/gm;
      let m;
      while ((m = re.exec(text)) !== null) {
        items.push({ text: m[0], start: m.index, end: m.index + m[0].length });
      }
      return items;
    }
    return findListItems();
  });
}

// Get article text content
export async function getArticleText(page) {
  return page.locator('article').textContent();
}

// Setup nested list: - A, - B (nested), - C (nested)
export async function setupNestedList(page) {
  await resetPage(page);
  await page.keyboard.type('- A');
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  await page.keyboard.type('B');
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(50);
  await page.keyboard.type('C');
  await page.waitForTimeout(100);
}
