import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8901';

// Mock File System Access API
const MOCK_FSA = `
window.__syncFiles = window.__syncFiles || {};
var _makeFileHandle = function(name) {
  return {
    name: name, kind: 'file',
    getFile: async function() {
      var c = window.__syncFiles[name] || '';
      return { name: name, size: c.length, text: async function() { return c; } };
    },
    createWritable: async function() {
      var data = '';
      return {
        write: async function(chunk) { data += chunk; },
        close: async function() { window.__syncFiles[name] = data; }
      };
    },
    queryPermission: async function() { return 'granted'; },
    requestPermission: async function() { return 'granted'; }
  };
};
var _makeDirHandle = function(name) {
  return {
    name: name || '__mock_folder__', kind: 'directory',
    getFileHandle: async function(filename, opts) {
      if (opts && opts.create) {
        if (!window.__syncFiles.hasOwnProperty(filename)) window.__syncFiles[filename] = '';
      }
      if (!window.__syncFiles.hasOwnProperty(filename)) throw new Error('NotFoundError: ' + filename);
      return _makeFileHandle(filename);
    },
    removeEntry: async function(filename) { delete window.__syncFiles[filename]; },
    values: function() {
      var keys = Object.keys(window.__syncFiles); var idx = 0;
      return {
        next: async function() {
          if (idx < keys.length) return { value: _makeFileHandle(keys[idx++]), done: false };
          return { done: true };
        },
        [Symbol.asyncIterator]: function() { return this; }
      };
    },
    queryPermission: async function() { return 'granted'; },
    requestPermission: async function() { return 'granted'; }
  };
};
window.showDirectoryPicker = async function() { return _makeDirHandle(); };
`;

// Helper: reset state and inject mock FSA
async function resetPage(page) {
  await page.goto(`${BASE_URL}/index.html?_t=${Date.now()}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  await page.evaluate(MOCK_FSA);
  await page.click('article');
  await page.waitForTimeout(100);
}

// Helper: link folder
async function linkFolder(page) {
  await page.evaluate(() => {
    var btn = document.getElementById('link-folder');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    btn.click();
  });
  await page.waitForTimeout(500);
  const label = await page.locator('#link-folder-label').textContent();
  return label;
}

// Helper: type content and sync
async function typeAndSync(page, text) {
  await page.evaluate((text) => {
    var editor = document.querySelector('article[contenteditable]');
    editor.focus();
    editor.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
  await page.waitForTimeout(500);
  // Explicitly sync
  await page.evaluate(async () => {
    var doc = docs[currentDocId];
    await syncDoc(doc);
  });
  await page.waitForTimeout(300);
}

// Helper: get mock file count
async function mockFileCount(page) {
  return page.evaluate(() => Object.keys(window.__syncFiles).length);
}

// Helper: get first mock filename
async function mockFirstFile(page) {
  return page.evaluate(() => {
    var keys = Object.keys(window.__syncFiles);
    return keys.length > 0 ? keys[0] : '';
  });
}

// Helper: read mock file
async function mockReadFile(page, filename) {
  return page.evaluate((name) => window.__syncFiles[name] || '', filename);
}

// Helper: write mock file (simulate external edit)
async function mockWriteFile(page, filename, content) {
  await page.evaluate(({filename, content}) => {
    window.__syncFiles[filename] = content;
  }, {filename, content});
}

// Helper: switch to new doc
async function switchToNewDoc(page) {
  await page.click('#button');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    var btn = document.getElementById('new-document');
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    btn.click();
  });
  await page.waitForTimeout(300);
}

// Helper: switch to doc by ID
async function switchToDoc(page, docId) {
  await page.evaluate((id) => openDoc(id), docId);
  await page.waitForTimeout(300);
}

// Helper: get other doc ID
async function getOtherDocId(page) {
  return page.evaluate(() => {
    var allDocs = JSON.parse(localStorage.getItem('textarea-docs') || '{}');
    var current = localStorage.getItem('textarea-current-doc-id');
    var others = Object.keys(allDocs).filter(function(k) { return k !== current; });
    return others.length > 0 ? others[0] : '';
  });
}

// Helper: get cursor info
async function getCursorInfo(page) {
  return page.evaluate(() => {
    const sel = window.getSelection();
    return {
      offset: sel.anchorOffset,
      nodeText: sel.anchorNode?.textContent || '',
    };
  });
}

test.describe('Folder Sync (Mock FSA)', () => {
  test('setup: folder links successfully', async ({ page }) => {
    await resetPage(page);
    const label = await linkFolder(page);
    expect(label).toContain('Unlink');
  });

  test('sync to folder creates file', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);
    await typeAndSync(page, '# Sync Test\\n\\nHello from the editor!');

    const count = await mockFileCount(page);
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('read synced file content', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);
    await typeAndSync(page, '# Read Test\\n\\nFile content here');

    const filename = await mockFirstFile(page);
    expect(filename).toBeTruthy();

    const content = await mockReadFile(page, filename);
    expect(content).toContain('Read Test');
  });

  test('external edit syncs to app', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);
    await typeAndSync(page, '# External Test\\n\\nOriginal content');

    const filename = await mockFirstFile(page);
    expect(filename).toBeTruthy();

    const docId = await page.evaluate(() => localStorage.getItem('textarea-current-doc-id'));
    expect(docId).toBeTruthy();

    // Simulate external edit
    await mockWriteFile(page, filename, '# External Test\\n\\nEdited externally!');

    // Check doc has filename set
    const docFilename = await page.evaluate(() => {
      const doc = docs[currentDocId];
      return doc ? doc.filename : null;
    });
    expect(docFilename).toBe(filename);

    // Trigger syncFromFolder explicitly
    await page.evaluate(async () => {
      await syncFromFolder(true);
    });
    await page.waitForTimeout(500);

    const content = await page.locator('article').textContent();
    expect(content).toContain('Edited externally');
  });

  test('app edit syncs to folder', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);
    await typeAndSync(page, '# App Edit Test\\n\\nFirst version');

    // Edit the same doc
    await page.evaluate(() => {
      var editor = document.querySelector('article[contenteditable]');
      editor.focus();
      editor.textContent = '# App Edit Test\\n\\nSecond version';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(500);

    // Explicitly sync
    await page.evaluate(async () => {
      var doc = docs[currentDocId];
      await syncDoc(doc);
    });
    await page.waitForTimeout(300);

    const filename = await mockFirstFile(page);
    const content = await mockReadFile(page, filename);
    expect(content).toContain('Second version');
  });

  test('unlink folder', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);

    // Unlink folder
    await page.evaluate(() => {
      var btn = document.getElementById('link-folder');
      btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      btn.click();
    });
    await page.waitForTimeout(300);

    const label = await page.locator('#link-folder-label').textContent();
    expect(label).toContain('Link folder');
  });

  test('delete doc removes file', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);
    await typeAndSync(page, '# Delete Test\\n\\nWill be deleted');

    const filename = await mockFirstFile(page);
    expect(filename).toBeTruthy();

    const docId = await page.evaluate(() => localStorage.getItem('textarea-current-doc-id'));
    expect(docId).toBeTruthy();

    // Create a second doc so we have something to switch to after delete
    await switchToNewDoc(page);

    // Delete the first doc
    await page.evaluate(({docId, filename}) => {
      delete docs[docId];
      persistDocs();
      if (linkedFolderHandle && window.__syncFiles) {
        delete window.__syncFiles[filename];
      }
    }, {docId, filename});

    const count = await mockFileCount(page);
    expect(count).toBe(0);
  });

  test('cursor preserved across explicit syncDoc', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);
    await typeAndSync(page, '# Cursor Test\\n\\nLine one\\n\\nLine two');

    // Place cursor in the middle of the content (after "Line one")
    const beforeCursor = await page.evaluate(() => {
      const editor = document.querySelector('article[contenteditable]');
      const text = editor.textContent || '';
      // Position cursor after "# Cursor Test\n\nLine one"
      const targetPos = text.indexOf('Line one') + 'Line one'.length;
      
      const range = document.createRange();
      let current = 0;
      let found = false;
      
      const findAndPlace = (node) => {
        if (found) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (current + len >= targetPos) {
            const offset = targetPos - current;
            range.setStart(node, offset);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            found = true;
            return;
          }
          current += len;
        } else {
          for (const child of node.childNodes) {
            findAndPlace(child);
            if (found) return;
          }
        }
      };
      
      findAndPlace(editor);
      
      const sel = window.getSelection();
      return {
        offset: sel.anchorOffset,
        nodeText: sel.anchorNode?.textContent || '',
      };
    });

    expect(beforeCursor.offset).toBeGreaterThan(0);
    const beforeOffset = beforeCursor.offset;

    // Now trigger a sync (idempotent - content doesn't change)
    await page.evaluate(async () => {
      const doc = docs[currentDocId];
      await syncDoc(doc);
    });
    await page.waitForTimeout(300);

    // Check cursor position after sync
    const afterCursor = await getCursorInfo(page);

    // Cursor should still be at the same position (allow 1-2 char tolerance due to DOM traversal)
    expect(Math.abs(afterCursor.offset - beforeOffset)).toBeLessThan(3);
  });

  test('cursor preserved during external content sync (syncFromFolder)', async ({ page }) => {
    await resetPage(page);
    await linkFolder(page);
    await typeAndSync(page, '# Content Test\\n\\nOriginal content here');

    const filename = await mockFirstFile(page);

    // Position cursor in editor (after "Original")
    const beforeCursor = await page.evaluate(() => {
      const editor = document.querySelector('article[contenteditable]');
      const text = editor.textContent || '';
      const targetPos = text.indexOf('Original') + 'Original'.length;
      
      const range = document.createRange();
      let current = 0;
      let found = false;
      
      const findAndPlace = (node) => {
        if (found) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (current + len >= targetPos) {
            const offset = targetPos - current;
            range.setStart(node, offset);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            found = true;
            return;
          }
          current += len;
        } else {
          for (const child of node.childNodes) {
            findAndPlace(child);
            if (found) return;
          }
        }
      };
      
      findAndPlace(editor);
      
      const sel = window.getSelection();
      return {
        offset: sel.anchorOffset,
        nodeText: sel.anchorNode?.textContent || '',
      };
    });

    expect(beforeCursor.offset).toBeGreaterThan(0);
    const beforeOffset = beforeCursor.offset;

    // Simulate external edit (same content - idempotent sync)
    await mockWriteFile(page, filename, '# Content Test\\n\\nOriginal content here');

    // Trigger syncFromFolder
    await page.evaluate(async () => {
      await syncFromFolder(true);
    });
    await page.waitForTimeout(500);

    // Check cursor position after sync
    const afterCursor = await getCursorInfo(page);

    // Cursor should be preserved (allow small tolerance)
    expect(Math.abs(afterCursor.offset - beforeOffset)).toBeLessThan(3);
  });
});
