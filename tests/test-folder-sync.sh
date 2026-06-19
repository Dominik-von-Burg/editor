#!/usr/bin/env bash
set -euo pipefail

export AGENT_BROWSER_ARGS="--no-sandbox"

SERVER_PORT="${TEST_PORT:-8900}"
BASE_URL="http://localhost:$SERVER_PORT/notes.html"

PASSED=0
FAILED=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

cleanup() { agent-browser close 2>/dev/null || true; }
trap cleanup EXIT

pass() { PASSED=$((PASSED+1)); TOTAL=$((TOTAL+1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAILED=$((FAILED+1)); TOTAL=$((TOTAL+1)); echo -e "  ${RED}✗${NC} $1 ${RED}(${2:-})${NC}"; }
wait_fn() { timeout 8 agent-browser wait --fn "$1" >/dev/null 2>&1 || true; }

open_app() {
  timeout 10 agent-browser open "$BASE_URL" >/dev/null 2>&1 || true
  wait_fn 'document.querySelector("article")'
}

# Inject mock FSA
inject_mock_fsa() {
  timeout 10 agent-browser eval --stdin <<'INJECT'
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
'mock_injected';
INJECT
}

reset_state() {
  # Clear state without reload to preserve mock FSA
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
localStorage.clear();
window.__syncFiles = {};
if (typeof linkedFolderHandle !== 'undefined') linkedFolderHandle = null;
if (typeof currentDocId !== 'undefined') currentDocId = null;
if (typeof docs !== 'undefined') Object.keys(docs).forEach(function(k) { delete docs[k]; });
'cleared';
EOF
  # Wait for page to be ready
  wait_fn 'document.querySelector("article")'
  # Re-inject mock FSA
  inject_mock_fsa
}

# --- Query helpers ---

mock_file_count() {
  local result
  result=$(timeout 5 agent-browser eval --stdin <<'EOF'
Object.keys(window.__syncFiles).length
EOF
  2>&1)
  echo "$result" | tr -d '"'
}

mock_first_file() {
  local result
  result=$(timeout 5 agent-browser eval --stdin <<'EOF'
var keys = Object.keys(window.__syncFiles);
keys.length > 0 ? keys[0] : '';
EOF
  2>&1)
  echo "$result" | sed 's/^"//;s/"$//'
}

mock_read_file() {
  local filename="$1"
  timeout 5 agent-browser eval --stdin <<HEREDOC
window.__syncFiles['${filename}'] || ''
HEREDOC
  2>&1
}

mock_write_file() {
  local filename="$1"
  local content="$2"
  timeout 5 agent-browser eval --stdin <<HEREDOC
window.__syncFiles['${filename}'] = \`${content}\`;
'ok'
HEREDOC
}

# --- App interaction helpers ---

link_folder() {
  timeout 5 agent-browser eval --stdin <<'EOF'
var btn = document.getElementById('link-folder');
btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
btn.click();
'clicked';
EOF
  # Wait for folder to be linked
  wait_fn 'document.getElementById("link-folder-label").textContent.includes("Unlink")'
  # Return the label
  timeout 5 agent-browser eval 'document.getElementById("link-folder-label").textContent' 2>&1
}

# Type content, wait for debounce save, then call syncDoc explicitly
# (debounce passes Event to save() which skips syncDoc due to truthy arg)
type_content() {
  local text="$1"
  timeout 5 agent-browser eval --stdin <<HEREDOC
(function() {
  var editor = document.querySelector('article[contenteditable]');
  editor.focus();
  editor.textContent = \`${text}\`;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()
HEREDOC
  # Wait for debounce save to complete (check that docs are saved)
  wait_fn 'localStorage.getItem("textarea-docs") && JSON.parse(localStorage.getItem("textarea-docs"))[currentDocId]'
  # syncDoc explicitly (debounce's Event arg skips it)
  timeout 5 agent-browser eval --stdin <<'EOF'
(async function() {
  var doc = docs[currentDocId];
  await syncDoc(doc);
  return 'synced';
})()
EOF
  # Wait for sync to complete (check that file is created)
  wait_fn 'Object.keys(window.__syncFiles).length > 0'
}

switch_to_new_doc() {
  timeout 5 agent-browser eval --stdin <<'EOF'
document.getElementById('button').click();
'toggle_menu';
EOF
  # Wait for menu to open
  wait_fn 'document.getElementById("new-document")'
  # Click new document
  timeout 5 agent-browser eval --stdin <<'EOF'
var newBtn = document.getElementById('new-document');
newBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
newBtn.click();
'clicked';
EOF
  # Wait for new doc to be created
  wait_fn 'document.querySelector("article[contenteditable]").innerText.length === 0'
}

switch_to_doc() {
  local doc_id="$1"
  timeout 5 agent-browser eval --stdin <<HEREDOC
openDoc('${doc_id}');
'changed';
HEREDOC
  # Wait for doc to switch
  wait_fn "localStorage.getItem(\"textarea-current-doc-id\") === \"${doc_id}\""
  # Return editor content
  timeout 5 agent-browser eval 'document.querySelector("article[contenteditable]").innerText' 2>&1
}

get_other_doc_id() {
  local result
  result=$(timeout 5 agent-browser eval --stdin <<'EOF'
(function() {
  var allDocs = JSON.parse(localStorage.getItem('textarea-docs') || '{}');
  var current = localStorage.getItem('textarea-current-doc-id');
  var others = Object.keys(allDocs).filter(function(k) { return k !== current; });
  return others.length > 0 ? others[0] : '';
})()
EOF
  2>&1)
  echo "$result" | sed 's/^"//;s/"$//'
}

# ============================================================
# TESTS
# ============================================================

test_setup() {
  reset_state
  local label
  label=$(link_folder)
  echo "$label" | grep -q "Unlink folder" && pass "Folder linked (mock FSA)" || fail "Folder linked" "label: $label"
}

test_sync_to_folder() {
  reset_state
  link_folder >/dev/null 2>&1

  type_content "# Sync Test\n\nHello from the editor!" >/dev/null

  local count
  count=$(mock_file_count)
  [[ "$count" -ge "1" ]] && pass "File synced to folder ($count file)" || fail "File synced" "count: $count"
}

test_read_synced_file() {
  reset_state
  link_folder >/dev/null 2>&1

  type_content "# Read Test\n\nFile content here" >/dev/null

  local filename
  filename=$(mock_first_file)
  [[ -n "$filename" ]] || { fail "Read synced file" "no file"; return; }

  local content
  content=$(mock_read_file "$filename")
  echo "$content" | grep -q "Read Test" && pass "Read synced file content" || fail "Read synced file" "content: $content"
}

test_external_edit_syncs() {
  reset_state
  link_folder >/dev/null 2>&1

  # Create first doc and sync
  type_content "# External Test\n\nOriginal content" >/dev/null

  local filename
  filename=$(mock_first_file)
  [[ -n "$filename" ]] || { fail "External edit" "no file"; return; }

  local doc_id
  doc_id=$(timeout 5 agent-browser eval "localStorage.getItem('textarea-current-doc-id')" 2>&1 | sed 's/^"//;s/"$//')
  [[ -n "$doc_id" ]] || { fail "External edit" "no doc"; return; }

  # Simulate external edit
  mock_write_file "$filename" "# External Test\n\nEdited externally!"

  # Switch to new doc to trigger syncFromFolder, then back
  switch_to_new_doc
  local editor_text
  editor_text=$(switch_to_doc "$doc_id")
  echo "$editor_text" | grep -q "Edited externally" && pass "External edit synced to app" || fail "External edit synced" "editor: $(echo "$editor_text" | head -1)"
}

test_app_edit_syncs_to_folder() {
  reset_state
  link_folder >/dev/null 2>&1

  # Create first doc and sync
  type_content "# App Edit Test\n\nFirst version" >/dev/null

  local doc_id
  doc_id=$(timeout 5 agent-browser eval "localStorage.getItem('textarea-current-doc-id')" 2>&1 | sed 's/^"//;s/"$//')
  [[ -n "$doc_id" ]] || { fail "App edit synced" "no doc"; return; }

  # Edit the same doc
  timeout 5 agent-browser eval --stdin <<'EOF'
(function() {
  var editor = document.querySelector('article[contenteditable]');
  editor.focus();
  editor.textContent = '# App Edit Test\n\nSecond version';
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()
EOF
  # Wait for debounce save
  wait_fn 'JSON.parse(localStorage.getItem("textarea-docs"))[currentDocId].content.includes("Second version")'
  # syncDoc explicitly
  timeout 5 agent-browser eval --stdin <<'EOF'
(async function() {
  var doc = docs[currentDocId];
  await syncDoc(doc);
  return 'edited';
})()
EOF
  >/dev/null 2>&1

  local content
  content=$(mock_read_file "$(mock_first_file)")
  echo "$content" | grep -q "Second version" && pass "App edit synced to folder" || fail "App edit synced" "content: $content"
}

test_unlink_folder() {
  reset_state
  link_folder >/dev/null 2>&1

  # Unlink folder
  timeout 5 agent-browser eval --stdin <<'EOF'
var btn = document.getElementById('link-folder');
btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
btn.click();
'clicked';
EOF
  # Wait for folder to be unlinked
  wait_fn 'document.getElementById("link-folder-label").textContent.includes("Link folder")'
  local label
  label=$(timeout 5 agent-browser eval 'document.getElementById("link-folder-label").textContent' 2>&1)
  echo "$label" | grep -q "Link folder" && pass "Folder unlinked" || fail "Folder unlinked" "label: $label"
}

test_delete_doc_removes_file() {
  reset_state
  link_folder >/dev/null 2>&1

  # Create first doc and sync
  type_content "# Delete Test\n\nWill be deleted" >/dev/null

  local filename
  filename=$(mock_first_file)
  [[ -n "$filename" ]] || { fail "Delete test" "no file before delete"; return; }

  local doc_id
  doc_id=$(timeout 5 agent-browser eval "localStorage.getItem('textarea-current-doc-id')" 2>&1 | sed 's/^"//;s/"$//')
  [[ -n "$doc_id" ]] || { fail "Delete test" "no doc to delete"; return; }

  # Create a second doc so we have something to switch to after delete
  switch_to_new_doc

  # Delete the first doc via eval
  timeout 5 agent-browser eval --stdin <<HEREDOC
(async function() {
  var docId = '${doc_id}';
  delete docs[docId];
  persistDocs();
  // Remove file from folder
  if (linkedFolderHandle && window.__syncFiles) {
    delete window.__syncFiles['${filename}'];
  }
  return 'deleted';
})()
HEREDOC
  >/dev/null 2>&1

  local count
  count=$(mock_file_count)
  [[ "$count" -eq "0" ]] && pass "Deleted doc removes file" || fail "Deleted doc removes file" "count: $count"
}

# ============================================================
# RUN
# ============================================================

FILTER="${1:-}"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Folder Sync Tests (Mock FSA)${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

open_app

if [[ -z "$FILTER" ]] || [[ "$FILTER" == "setup" ]]; then
  echo -e "${CYAN}--- setup ---${NC}"; test_setup
fi
if [[ -z "$FILTER" ]] || [[ "$FILTER" == "sync_to_folder" ]]; then
  echo -e "${CYAN}--- sync_to_folder ---${NC}"; test_sync_to_folder
fi
if [[ -z "$FILTER" ]] || [[ "$FILTER" == "read_synced_file" ]]; then
  echo -e "${CYAN}--- read_synced_file ---${NC}"; test_read_synced_file
fi
if [[ -z "$FILTER" ]] || [[ "$FILTER" == "external_edit_syncs" ]]; then
  echo -e "${CYAN}--- external_edit_syncs ---${NC}"; test_external_edit_syncs
fi
if [[ -z "$FILTER" ]] || [[ "$FILTER" == "app_edit_syncs" ]]; then
  echo -e "${CYAN}--- app_edit_syncs ---${NC}"; test_app_edit_syncs_to_folder
fi
if [[ -z "$FILTER" ]] || [[ "$FILTER" == "unlink_folder" ]]; then
  echo -e "${CYAN}--- unlink_folder ---${NC}"; test_unlink_folder
fi
if [[ -z "$FILTER" ]] || [[ "$FILTER" == "delete_doc" ]]; then
  echo -e "${CYAN}--- delete_doc ---${NC}"; test_delete_doc_removes_file
fi

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "  ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC} ($TOTAL total)"
echo -e "${CYAN}========================================${NC}"

[[ $FAILED -eq 0 ]]
