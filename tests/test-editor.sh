#!/usr/bin/env bash
# E2E tests for the Notes editor (non-folder-sync features)
# Uses agent-browser for browser automation
#
# Usage: ./tests/test-editor.sh [filter]

set -euo pipefail

export AGENT_BROWSER_ARGS="--no-sandbox"

SERVER_PORT="${TEST_PORT:-8900}"
BASE_URL="http://localhost:$SERVER_PORT/index.html"

PASSED=0
FAILED=0
TOTAL=0

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

cleanup() {
  agent-browser close 2>/dev/null || true
}
trap cleanup EXIT

pass() { PASSED=$((PASSED+1)); TOTAL=$((TOTAL+1)); echo -e "  ${GREEN}✓${NC} $1"; }
fail() { FAILED=$((FAILED+1)); TOTAL=$((TOTAL+1)); echo -e "  ${RED}✗${NC} $1 ${RED}(${2:-})${NC}"; }

# Wait for a JS condition to become truthy (with timeout)
wait_fn() {
  timeout 8 agent-browser wait --fn "$1" >/dev/null 2>&1 || true
}

# Open the app once at the start
open_app() {
  # Use cache-busting query param to ensure fresh HTML load
  local url="${BASE_URL}?_t=$(date +%s%N)"
  timeout 10 agent-browser open "$url" >/dev/null 2>&1 || true
  wait_fn 'document.querySelector("article")'
}

# Reset localStorage and reload (bypass cache with unique URL)
reset_state() {
  local ts
  ts=$(date +%s%N)
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<HEREDOC
localStorage.clear();
location.href = location.pathname + '?_t=${ts}';
HEREDOC
  wait_fn 'document.querySelector("article")'
}

# Inject markdown content and render it via parseMarkdown
inject_md() {
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1
}

# ============================================================
# TESTS
# ============================================================

test_page_load() {
  reset_state

  local title
  title=$(timeout 5 agent-browser eval 'document.title')
  [[ "$title" == '"New Document 1"' ]] && pass "Default title is New Document 1" || fail "Default title" "got: $title"

  local editable
  editable=$(timeout 5 agent-browser eval 'document.querySelector("article").contentEditable')
  [[ "$editable" == '"plaintext-only"' ]] && pass "Editor is contenteditable" || fail "contenteditable" "got: $editable"
}

test_typing() {
  reset_state

  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# My Heading

Some paragraph text here.' >/dev/null 2>&1
  wait_fn "document.querySelector('article').textContent.includes('My Heading')"

  local content
  content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content" | grep -q "My Heading" && pass "Typed content appears" || fail "Content missing" "got: ${content:0:40}"

  local title
  title=$(timeout 5 agent-browser eval 'document.title')
  [[ "$title" == '"My Heading"' ]] && pass "Title extracted from heading" || fail "Title" "got: $title"
}

test_autosave() {
  reset_state

  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Auto Save Test

Content that should persist.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  local saved
  saved=$(timeout 5 agent-browser eval "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length")
  [[ "$saved" -ge 1 ]] && pass "Content saved to localStorage" || fail "No docs saved" "count: $saved"

  # Reload and verify
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
location.reload();
EOF
  wait_fn "document.querySelector('article').textContent.includes('Auto Save Test')"

  local content
  content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content" | grep -q "Auto Save Test" && pass "Content persists after reload" || fail "Content lost" "got: ${content:0:40}"
}

test_new_document() {
  reset_state

  # Create content
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# First Doc

Original content' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  # Open menu and click New document
  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'
  timeout 5 agent-browser click '#new-document' >/dev/null 2>&1
  wait_fn 'document.querySelector("article").textContent === ""'

  local content
  content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  [[ -z "$content" || "$content" == '""' ]] && pass "New document starts empty" || fail "Should be empty" "got: ${content:0:30}"

  local count
  count=$(timeout 5 agent-browser eval "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length")
  [[ "$count" -ge 2 ]] && pass "Two documents exist" || fail "Expected >=2 docs" "got: $count"
}

test_menu_toggle() {
  reset_state

  local visible
  visible=$(timeout 5 agent-browser eval 'document.getElementById("menu").classList.contains("visible")')
  [[ "$visible" == 'false' ]] && pass "Menu hidden on load" || fail "Menu should be hidden" "got: $visible"

  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'

  visible=$(timeout 5 agent-browser eval 'document.getElementById("menu").classList.contains("visible")')
  [[ "$visible" == 'true' ]] && pass "Menu opens on click" || fail "Menu should open" "got: $visible"

  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn '!document.getElementById("menu").classList.contains("visible")'

  visible=$(timeout 5 agent-browser eval 'document.getElementById("menu").classList.contains("visible")')
  [[ "$visible" == 'false' ]] && pass "Menu closes on second click" || fail "Menu should close" "got: $visible"
}

test_markdown_rendering() {
  reset_state

  # Inject content directly via parseMarkdown to test rendering
  inject_md <<'EOF'
const el = document.querySelector('article');
el.textContent = '# Heading One\n## Heading Two\n\n**bold text** and *italic text*\n\n- list item one\n- list item two';
parseMarkdown(el);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  local has_h1
  has_h1=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-h1")')
  [[ "$has_h1" == 'true' ]] && pass "H1 rendered" || fail "H1 missing"

  local has_h2
  has_h2=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-h2")')
  [[ "$has_h2" == 'true' ]] && pass "H2 rendered" || fail "H2 missing"

  local has_bold
  has_bold=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-bold")')
  [[ "$has_bold" == 'true' ]] && pass "Bold rendered" || fail "Bold missing"

  local has_italic
  has_italic=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-italic")')
  [[ "$has_italic" == 'true' ]] && pass "Italic rendered" || fail "Italic missing"

  local has_list
  has_list=$(timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length >= 2')
  [[ "$has_list" == 'true' ]] && pass "List items rendered" || fail "List missing"
}

test_bullet_lists() {
  reset_state

  # Test nested bullets (sub-bullets with 2-space indent)
  inject_md <<'EOF'
const el = document.querySelector('article');
el.textContent = '- Top level\n  - Sub item\n  - Another sub\n- Second top';
parseMarkdown(el);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 4'

  local total_items
  total_items=$(timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length')
  [[ "$total_items" -eq 4 ]] && pass "Nested bullets: 4 items total" || fail "Expected 4 items" "got=$total_items"

  local sub_items
  sub_items=$(timeout 5 agent-browser eval 'Array.from(document.querySelectorAll("article .md-listitem")).filter(el => el.style.getPropertyValue("--list-level") == "1").length')
  [[ "$sub_items" -eq 2 ]] && pass "Nested bullets: 2 sub-items at level 1" || fail "Expected 2 sub-items" "got=$sub_items"

  # Test ordered list (reset state to start fresh)
  reset_state
  inject_md <<'EOF'
const el = document.querySelector('article');
var nl = String.fromCharCode(10);
el.textContent = '1. First' + nl + '2. Second' + nl + '3. Third';
parseMarkdown(el);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length === 3'

  local ordered_markers
  ordered_markers=$(timeout 5 agent-browser eval 'JSON.stringify(Array.from(document.querySelectorAll("article .md-listmarker")).map(m => m.textContent))' | tr -d '"')
  echo "$ordered_markers" | grep -qF '1.' && pass "Ordered list: shows 1." || fail "Ordered marker 1. missing"
  echo "$ordered_markers" | grep -qF '2.' && pass "Ordered list: shows 2." || fail "Ordered marker 2. missing"
  echo "$ordered_markers" | grep -qF '3.' && pass "Ordered list: shows 3." || fail "Ordered marker 3. missing"

  # Test mixed ordered + unordered
  reset_state
  inject_md <<'EOF'
const el = document.querySelector('article');
var nl = String.fromCharCode(10);
el.textContent = '- Bullet' + nl + '1. Numbered' + nl + '- Another bullet';
parseMarkdown(el);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length === 3'

  local mixed_count
  mixed_count=$(timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length')
  [[ "$mixed_count" -eq 3 ]] && pass "Mixed list: 3 items" || fail "Expected 3 mixed items" "got=$mixed_count"

  # Test deeply nested (4-space indent = level 2)
  reset_state
  inject_md <<'EOF'
const el = document.querySelector('article');
var nl = String.fromCharCode(10);
el.textContent = '- Level 0' + nl + '  - Level 1' + nl + '    - Level 2';
parseMarkdown(el);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length === 3'

  local level2_items
  level2_items=$(timeout 5 agent-browser eval 'Array.from(document.querySelectorAll("article .md-listitem")).filter(el => el.style.getPropertyValue("--list-level") == "2").length')
  [[ "$level2_items" -eq 1 ]] && pass "Deep nesting: 1 item at level 2" || fail "Expected 1 level-2 item" "got=$level2_items"
}

test_bullet_enter() {
  reset_state

  # --- Unordered list: Enter continues, double-Enter exits ---
  inject_md <<'EOF'
var nl = String.fromCharCode(10);
article.textContent = '- First' + nl + '- Second';
parseMarkdown(article);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length === 2'

  local initial_count
  initial_count=$(timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length')
  [[ "$initial_count" -eq 2 ]] && pass "Initial bullet list has 2 items" || fail "Expected 2 bullets" "got=$initial_count"

  # Place cursor at end of second bullet content, press Enter to continue
  timeout 5 agent-browser eval '
    var sel = window.getSelection();
    var range = document.createRange();
    var items = document.querySelectorAll("article .md-listitem");
    if (items.length >= 2) {
      var cs = items[1].querySelector(".md-listcontent");
      if (cs && cs.firstChild) {
        range.setStart(cs.firstChild, cs.firstChild.textContent.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  ' >/dev/null 2>&1

  timeout 5 agent-browser eval '
    var e = new KeyboardEvent("keydown", {key: "Enter", code: "Enter", bubbles: true, cancelable: true});
    article.dispatchEvent(e);
  ' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 3'

  local continued_count
  continued_count=$(timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length')
  [[ "$continued_count" -ge 3 ]] && pass "Enter continues bullet list (3 items)" || fail "Expected 3+ bullets after Enter" "got=$continued_count"

  # Press Enter on empty bullet to exit list
  timeout 5 agent-browser eval '
    var sel = window.getSelection();
    var range = document.createRange();
    var items = document.querySelectorAll("article .md-listitem");
    if (items.length >= 3) {
      var cs = items[2].querySelector(".md-listcontent");
      if (cs && cs.firstChild) {
        range.setStart(cs.firstChild, cs.firstChild.textContent.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  ' >/dev/null 2>&1

  timeout 5 agent-browser eval '
    var e = new KeyboardEvent("keydown", {key: "Enter", code: "Enter", bubbles: true, cancelable: true});
    article.dispatchEvent(e);
  ' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length <= 2'

  local exit_count
  exit_count=$(timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length')
  [[ "$exit_count" -le 2 ]] && pass "Double Enter exits bullet list" || fail "Expected <=2 bullets after exit" "got=$exit_count"

  # --- Ordered list: Enter increments number ---
  reset_state
  inject_md <<'EOF'
var nl = String.fromCharCode(10);
article.textContent = '1. First' + nl + '2. Second';
parseMarkdown(article);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length === 2'

  # Place cursor at end of second ordered item, press Enter
  timeout 5 agent-browser eval '
    var sel = window.getSelection();
    var range = document.createRange();
    var items = document.querySelectorAll("article .md-listitem");
    if (items.length >= 2) {
      var cs = items[1].querySelector(".md-listcontent");
      if (cs && cs.firstChild) {
        range.setStart(cs.firstChild, cs.firstChild.textContent.length);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  ' >/dev/null 2>&1

  timeout 5 agent-browser eval '
    var e = new KeyboardEvent("keydown", {key: "Enter", code: "Enter", bubbles: true, cancelable: true});
    article.dispatchEvent(e);
  ' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 3'

  local ordered_count
  ordered_count=$(timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length')
  [[ "$ordered_count" -ge 3 ]] && pass "Enter continues ordered list (3 items)" || fail "Expected 3+ ordered items" "got=$ordered_count"

  # Verify the third item has marker "3."
  local third_marker
  third_marker=$(timeout 5 agent-browser eval 'var items = document.querySelectorAll("article .md-listitem"); items.length >= 3 ? items[2].querySelector(".md-listmarker").textContent : ""' | tr -d '"')
  [[ "$third_marker" == "3. " || "$third_marker" == "3." ]] && pass "Ordered list increments to 3." || fail "Expected marker 3." "got=$third_marker"
}

test_recent_docs() {
  reset_state

  # Create two docs
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Doc Alpha

Alpha content' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'
  timeout 5 agent-browser click '#new-document' >/dev/null 2>&1
  wait_fn 'document.querySelector("article").textContent === ""'

  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Doc Beta

Beta content' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 2"

  # Open menu and check recent docs
  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'
  wait_fn 'document.querySelectorAll(".recent-doc").length >= 2'

  local menu_visible
  menu_visible=$(timeout 5 agent-browser eval 'document.getElementById("menu").classList.contains("visible")')

  local count
  count=$(timeout 5 agent-browser eval 'document.querySelectorAll(".recent-doc").length' 2>&1)
  [[ "$count" =~ ^[0-9]+$ ]] && [[ "$count" -ge 2 ]] && pass "Recent docs shows 2 items" || fail "Expected >=2 recent" "menu=$menu_visible count=$count"
}

test_save_buttons_exist() {
  reset_state

  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'

  local has_html
  has_html=$(timeout 5 agent-browser eval '!!document.getElementById("save-as-html")')
  [[ "$has_html" == 'true' ]] && pass "Save as HTML button exists" || fail "Save HTML missing"

  local has_text
  has_text=$(timeout 5 agent-browser eval '!!document.getElementById("save-as-text")')
  [[ "$has_text" == 'true' ]] && pass "Save as TEXT button exists" || fail "Save TEXT missing"

  local has_copy
  has_copy=$(timeout 5 agent-browser eval '!!document.getElementById("copy-rendered")')
  [[ "$has_copy" == 'true' ]] && pass "Copy rendered button exists" || fail "Copy rendered missing"

  local has_folder
  has_folder=$(timeout 5 agent-browser eval '!!document.getElementById("link-folder")')
  [[ "$has_folder" == 'true' ]] && pass "Link folder button exists" || fail "Link folder missing"

  local has_refresh
  has_refresh=$(timeout 5 agent-browser eval '!!document.getElementById("refresh-folder")')
  [[ "$has_refresh" == 'true' ]] && pass "Refresh folder button exists" || fail "Refresh folder missing"
}

test_folder_sync_available() {
  reset_state

  local blocker
  blocker=$(timeout 5 agent-browser eval --stdin 2>/dev/null <<'EOF'
if (typeof window.showDirectoryPicker !== 'function') {
  'API not available';
} else if (!window.isSecureContext) {
  'Not secure context';
} else {
  'available';
}
EOF
  )
  [[ "$blocker" == '"available"' ]] && pass "Folder sync API available on localhost" || fail "Folder sync blocked" "got: $blocker"
}

test_doc_dialog_open() {
  reset_state

  # Create a document first
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Dialog Test Doc

Some content for testing.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  # Open menu and click More docs
  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'
  timeout 5 agent-browser eval 'document.querySelector("#browse-docs").click()' >/dev/null 2>&1
  wait_fn 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  local visible
  visible=$(timeout 5 agent-browser eval 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")')
  [[ "$visible" == 'true' ]] && pass "Dialog opens from More docs button" || fail "Dialog should open" "got: $visible"

  # Menu should be closed
  local menu_visible
  menu_visible=$(timeout 5 agent-browser eval 'document.getElementById("menu").classList.contains("visible")')
  [[ "$menu_visible" == 'false' ]] && pass "Menu closes when dialog opens" || fail "Menu should close" "got: $menu_visible"
}

test_doc_dialog_list() {
  reset_state

  # Create two documents
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# First Doc

First content here.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'
  timeout 5 agent-browser click '#new-document' >/dev/null 2>&1
  wait_fn 'document.querySelector("article").textContent === ""'

  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Second Doc

Second content here.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 2"

  # Open dialog
  timeout 5 agent-browser eval 'document.querySelector("#browse-docs").click()' >/dev/null 2>&1
  wait_fn 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  local count
  count=$(timeout 5 agent-browser eval 'document.querySelectorAll("#doc-dialog-list .doc-item").length')
  [[ "$count" -ge 2 ]] && pass "Dialog lists 2 documents" || fail "Expected >=2 items" "got: $count"
}

test_doc_dialog_search() {
  reset_state

  # Create two documents with distinct titles
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Apple Project

Apple related content.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'
  timeout 5 agent-browser click '#new-document' >/dev/null 2>&1
  wait_fn 'document.querySelector("article").textContent === ""'

  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Banana Project

Banana related content.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 2"

  # Open dialog
  timeout 5 agent-browser eval 'document.querySelector("#browse-docs").click()' >/dev/null 2>&1
  wait_fn 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  # Search for "Apple"
  timeout 5 agent-browser eval 'document.querySelector("#doc-dialog-search").value = "Apple"; renderDocDialogList("Apple")' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("#doc-dialog-list .doc-item").length === 1'

  local count
  count=$(timeout 5 agent-browser eval 'document.querySelectorAll("#doc-dialog-list .doc-item").length')
  [[ "$count" -eq 1 ]] && pass "Search filters to 1 result" || fail "Expected 1 item" "got: $count"

  local title
  title=$(timeout 5 agent-browser eval 'document.querySelector("#doc-dialog-list .doc-item .doc-item-title")?.textContent')
  echo "$title" | grep -q "Apple" && pass "Filtered result shows Apple" || fail "Expected Apple" "got: $title"
}

test_doc_dialog_switch() {
  reset_state

  # Create two documents
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Doc Alpha

Alpha content.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  local alpha_id
  alpha_id=$(timeout 5 agent-browser eval --stdin 2>/dev/null <<'EOF'
const docs = JSON.parse(localStorage.getItem('textarea-docs') || '{}');
Object.keys(docs)[0];
EOF
  )
  alpha_id=$(echo "$alpha_id" | tr -d '"')

  timeout 5 agent-browser click '#button' >/dev/null 2>&1
  wait_fn 'document.getElementById("menu").classList.contains("visible")'
  timeout 5 agent-browser click '#new-document' >/dev/null 2>&1
  wait_fn 'document.querySelector("article").textContent === ""'

  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser keyboard type '# Doc Beta

Beta content.' >/dev/null 2>&1
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 2"

  # Open dialog and click on Alpha
  timeout 5 agent-browser eval 'document.querySelector("#browse-docs").click()' >/dev/null 2>&1
  wait_fn 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  # Click the first doc item
  timeout 5 agent-browser eval 'document.querySelector("#doc-dialog-list .doc-item").click()' >/dev/null 2>&1
  wait_fn 'document.querySelector("#doc-dialog-overlay").classList.contains("visible") === false'

  # Dialog should be closed
  local dialog_visible
  dialog_visible=$(timeout 5 agent-browser eval 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")')
  [[ "$dialog_visible" == 'false' ]] && pass "Dialog closes after doc switch" || fail "Dialog should close" "got: $dialog_visible"

  # Content should have changed
  local content
  content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content" | grep -q "Alpha\|Beta" && pass "Switched to a document" || fail "No content" "got: ${content:0:30}"
}

test_doc_dialog_close_escape() {
  reset_state

  # Open dialog
  timeout 5 agent-browser eval 'document.querySelector("#browse-docs").click()' >/dev/null 2>&1
  wait_fn 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  # Dispatch Escape key event
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
EOF
  wait_fn '!document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  local visible
  visible=$(timeout 5 agent-browser eval 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")')
  [[ "$visible" == 'false' ]] && pass "Dialog closes on Escape" || fail "Dialog should close" "got: $visible"
}

test_doc_dialog_close_button() {
  reset_state

  # Open dialog
  timeout 5 agent-browser eval 'document.querySelector("#browse-docs").click()' >/dev/null 2>&1
  wait_fn 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  # Click close button
  timeout 5 agent-browser click '#doc-dialog-close' >/dev/null 2>&1
  wait_fn '!document.querySelector("#doc-dialog-overlay").classList.contains("visible")'

  local visible
  visible=$(timeout 5 agent-browser eval 'document.querySelector("#doc-dialog-overlay").classList.contains("visible")')
  [[ "$visible" == 'false' ]] && pass "Dialog closes on close button" || fail "Dialog should close" "got: $visible"
}

test_markdown_features() {
  reset_state

  # 1. Underline: ++underlined text++ -> .md-underline
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "++underlined text++";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-underline")'
  local has_underline
  has_underline=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-underline")')
  [[ "$has_underline" == 'true' ]] && pass "Underline: .md-underline span" || fail "Underline" "md-underline missing"

  # 2. Inline code: `code here` -> .md-code
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "`code here`";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-code")'
  local has_code
  has_code=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-code")')
  [[ "$has_code" == 'true' ]] && pass "Inline code: .md-code span" || fail "Inline code" "md-code missing"

  # 3. Codeblock: ```...``` -> .md-codeblock
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
var nl = String.fromCharCode(10);
el.textContent = "```" + nl + "code block" + nl + "```";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-codeblock")'
  local has_codeblock
  has_codeblock=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-codeblock")')
  [[ "$has_codeblock" == 'true' ]] && pass "Codeblock: .md-codeblock span" || fail "Codeblock" "md-codeblock missing"

  # 4. Strikethrough: ~~deleted text~~ -> .md-strike
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "~~deleted text~~";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-strike")'
  local has_strike
  has_strike=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-strike")')
  [[ "$has_strike" == 'true' ]] && pass "Strikethrough: .md-strike span" || fail "Strikethrough" "md-strike missing"

  # 5. URL auto-link: https://example.com -> .md-url anchor
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "Visit https://example.com today";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-url")'
  local has_url
  has_url=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-url")')
  [[ "$has_url" == 'true' ]] && pass "URL auto-link: .md-url anchor" || fail "URL auto-link" "md-url missing"

  # 6. Link: [click here](https://example.com) -> .md-link-source
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "[click here](https://example.com)";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-link-source")'
  local has_link
  has_link=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-link-source")')
  [[ "$has_link" == 'true' ]] && pass "Link: .md-link-source span" || fail "Link" "md-link-source missing"

  # 7. H3-H6 headings
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
var nl = String.fromCharCode(10);
el.textContent = "### H3" + nl + "#### H4" + nl + "##### H5" + nl + "###### H6";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-h3")'
  local has_h3
  has_h3=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-h3")')
  [[ "$has_h3" == 'true' ]] && pass "H3: .md-h3" || fail "H3" "md-h3 missing"

  local has_h4
  has_h4=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-h4")')
  [[ "$has_h4" == 'true' ]] && pass "H4: .md-h4" || fail "H4" "md-h4 missing"

  local has_h5
  has_h5=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-h5")')
  [[ "$has_h5" == 'true' ]] && pass "H5: .md-h5" || fail "H5" "md-h5 missing"

  local has_h6
  has_h6=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-h6")')
  [[ "$has_h6" == 'true' ]] && pass "H6: .md-h6" || fail "H6" "md-h6 missing"

  # 8. Bold alternate: __bold text__ -> .md-bold
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "__bold text__";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-bold")'
  local has_bold_alt
  has_bold_alt=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-bold")')
  [[ "$has_bold_alt" == 'true' ]] && pass "Bold alternate: __bold__ -> .md-bold" || fail "Bold alternate" "md-bold missing"

  # 9. Italic alternate: _italic text_ -> .md-italic
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "_italic text_";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-italic")'
  local has_italic_alt
  has_italic_alt=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-italic")')
  [[ "$has_italic_alt" == 'true' ]] && pass "Italic alternate: _italic_ -> .md-italic" || fail "Italic alternate" "md-italic missing"

  # 10. Ordered ) separator: 1) First, 2) Second
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
var nl = String.fromCharCode(10);
el.textContent = "1) First" + nl + "2) Second";
parseMarkdown(el);
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length === 2'
  local markers
  markers=$(timeout 5 agent-browser eval 'JSON.stringify(Array.from(document.querySelectorAll("article .md-listmarker")).map(m => m.textContent))' | tr -d '"')
  echo "$markers" | grep -qF '1)' && pass "Ordered ) separator: marker 1)" || fail "Ordered ) marker 1)" "got: $markers"
  echo "$markers" | grep -qF '2)' && pass "Ordered ) separator: marker 2)" || fail "Ordered ) marker 2)" "got: $markers"
}

test_undo_redo() {
  reset_state

  # agent-browser keyboard type fires only 'input' events (no keydown/keyup).
  # The editor's history system needs keydown to set the recording flag.
  # We simulate typing by dispatching keydown + input + keyup manually.

  # Type first batch: "Hello"
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
function simType(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    article.dispatchEvent(new KeyboardEvent('keydown', {
      key: c, code: c === ' ' ? 'Space' : 'Key' + c.toUpperCase(),
      bubbles: true, cancelable: true
    }));
    article.textContent += c;
    article.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText', data: c, bubbles: true
    }));
    article.dispatchEvent(new KeyboardEvent('keyup', {
      key: c, code: c === ' ' ? 'Space' : 'Key' + c.toUpperCase(),
      bubbles: true, cancelable: true
    }));
  }
}
simType('Hello');
EOF
  sleep 0.5  # wait for debounceRecordHistory (300ms)

  local content1
  content1=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content1" | grep -q "Hello" && pass "First batch typed" || fail "First batch missing" "got: ${content1:0:30}"

  # Type second batch: " World"
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
function simType(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    article.dispatchEvent(new KeyboardEvent('keydown', {
      key: c, code: c === ' ' ? 'Space' : 'Key' + c.toUpperCase(),
      bubbles: true, cancelable: true
    }));
    article.textContent += c;
    article.dispatchEvent(new InputEvent('input', {
      inputType: 'insertText', data: c, bubbles: true
    }));
    article.dispatchEvent(new KeyboardEvent('keyup', {
      key: c, code: c === ' ' ? 'Space' : 'Key' + c.toUpperCase(),
      bubbles: true, cancelable: true
    }));
  }
}
simType(' World');
EOF
  sleep 0.5

  local content2
  content2=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content2" | grep -q "World" && pass "Second batch appended" || fail "Second batch missing" "got: ${content2:0:40}"

  # Ctrl+Z should undo to "Hello" only
  timeout 5 agent-browser press Control+z >/dev/null 2>&1
  sleep 0.2

  local content_after_undo
  content_after_undo=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content_after_undo" | grep -q "Hello" && \
    ! echo "$content_after_undo" | grep -q "World" && \
    pass "Ctrl+Z undoes second batch" || \
    fail "Undo failed" "got: ${content_after_undo:0:40}"

  # Ctrl+Shift+Z should redo to "Hello World"
  timeout 5 agent-browser press Control+Shift+z >/dev/null 2>&1
  sleep 0.2

  local content_after_redo
  content_after_redo=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content_after_redo" | grep -q "World" && pass "Ctrl+Shift+Z redoes second batch" || fail "Redo failed" "got: ${content_after_redo:0:40}"
}

test_persistence() {
  reset_state

  # Inject content via parseMarkdown
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "# Persisted Heading\n\nThis content should survive a reload.";
parseMarkdown(el);
EOF
  wait_fn "document.querySelector('article').textContent.includes('Persisted Heading')"

  local content_before
  content_before=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content_before" | grep -q "Persisted Heading" && pass "Content injected before reload" || fail "Inject failed" "got: ${content_before:0:40}"

  # Wait for autosave to localStorage
  wait_fn "Object.keys(JSON.parse(localStorage.getItem('textarea-docs') || '{}')).length >= 1"

  # Reload the page
  timeout 5 agent-browser eval 'location.reload()' >/dev/null 2>&1
  wait_fn "document.querySelector('article').textContent.includes('Persisted Heading')"

  local content_after
  content_after=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$content_after" | grep -q "Persisted Heading" && pass "Content survives reload" || fail "Content lost after reload" "got: ${content_after:0:40}"
}

test_mixed_content() {
  reset_state

  # Inject mixed markdown: heading, list, bold, italic
  inject_md <<'EOF'
var el = document.querySelector("article");
var nl = String.fromCharCode(10);
el.textContent = "# Heading" + nl + "- Item" + nl + "**bold** and *italic*";
parseMarkdown(el);
EOF
  wait_fn '!!document.querySelector("article .md-h1")'

  local has_h1
  has_h1=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-h1")')
  [[ "$has_h1" == 'true' ]] && pass "Mixed: .md-h1 present" || fail "Mixed: .md-h1 missing"

  local has_listitem
  has_listitem=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-listitem")')
  [[ "$has_listitem" == 'true' ]] && pass "Mixed: .md-listitem present" || fail "Mixed: .md-listitem missing"

  local has_bold
  has_bold=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-bold")')
  [[ "$has_bold" == 'true' ]] && pass "Mixed: .md-bold present" || fail "Mixed: .md-bold missing"

  local has_italic
  has_italic=$(timeout 5 agent-browser eval '!!document.querySelector("article .md-italic")')
  [[ "$has_italic" == 'true' ]] && pass "Mixed: .md-italic present" || fail "Mixed: .md-italic missing"
}

test_paste_handling() {
  reset_state

  # Focus the editor so paste has a target
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1

  # Simulate a paste event with HTML content: <b>bold</b> and <u>underline</u>
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const a = document.querySelector("article");
  const dt = new DataTransfer();
  dt.setData("text/html", "<b>bold</b> and <u>underline</u>");
  dt.setData("text/plain", "bold and underline");
  const e = new ClipboardEvent("paste", { clipboardData: dt });
  a.dispatchEvent(e);
})()
EOF
  # After paste the editor should have converted HTML to markdown syntax
  wait_fn "document.querySelector('article').textContent.includes('**bold**')"

  local content
  content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')

  # Verify bold was converted to **bold**
  echo "$content" | grep -q '\*\*bold\*\*' && pass "Paste: HTML <b> converted to **bold**" || fail "Paste bold" "got: ${content:0:60}"

  # Verify underline was converted to ++underline++
  echo "$content" | grep -q '++underline++' && pass "Paste: HTML <u> converted to ++underline++" || fail "Paste underline" "got: ${content:0:60}"

  # Verify raw textContent does NOT contain HTML tags
  ! echo "$content" | grep -q '<b>' && pass "Paste: no raw <b> tag in textContent" || fail "Paste raw <b>" "got: ${content:0:60}"
  ! echo "$content" | grep -q '<u>' && pass "Paste: no raw <u> tag in textContent" || fail "Paste raw <u>" "got: ${content:0:60}"
}

test_edge_cases() {
  reset_state

  # --- Empty lines: multiple blank lines between paragraphs ---
  inject_md <<'EOF'
var el = document.querySelector("article");
var nl = String.fromCharCode(10);
el.textContent = "First paragraph" + nl + nl + nl + "Second paragraph" + nl + nl + nl + nl + "Third paragraph";
parseMarkdown(el);
EOF
  wait_fn "document.querySelector('article').textContent.includes('Third paragraph')"

  local empty_lines_content
  empty_lines_content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$empty_lines_content" | grep -q "First paragraph" && pass "Empty lines: first paragraph present" || fail "Empty lines first" "got: ${empty_lines_content:0:60}"
  echo "$empty_lines_content" | grep -q "Second paragraph" && pass "Empty lines: second paragraph present" || fail "Empty lines second" "got: ${empty_lines_content:0:60}"
  echo "$empty_lines_content" | grep -q "Third paragraph" && pass "Empty lines: third paragraph present" || fail "Empty lines third" "got: ${empty_lines_content:0:60}"

  # --- Special characters: XSS prevention ---
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = 'Hello <world> & "quotes"';
parseMarkdown(el);
EOF
  wait_fn "document.querySelector('article').textContent.includes('Hello')"

  local special_content
  special_content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$special_content" | grep -q 'Hello' && pass "Special chars: text rendered" || fail "Special chars text" "got: ${special_content:0:60}"
  echo "$special_content" | grep -q 'world' && pass "Special chars: <world> text present" || fail "Special chars <world>" "got: ${special_content:0:60}"

  # Verify no raw script or dangerous tags in the DOM
  local has_script
  has_script=$(timeout 5 agent-browser eval '!!document.querySelector("article script")')
  [[ "$has_script" == 'false' ]] && pass "Special chars: no <script> in DOM" || fail "XSS risk" "script tag found"

  # --- Unicode: café ñ 你好 🎉 ---
  reset_state
  inject_md <<'EOF'
var el = document.querySelector("article");
el.textContent = "café \u00f1 \u4f60\u597d \ud83c\udf89";
parseMarkdown(el);
EOF
  wait_fn "document.querySelector('article').textContent.includes('café')"

  local unicode_content
  unicode_content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$unicode_content" | grep -q 'café' && pass "Unicode: café present" || fail "Unicode café" "got: ${unicode_content:0:60}"
  echo "$unicode_content" | grep -q 'ñ' && pass "Unicode: ñ present" || fail "Unicode ñ" "got: ${unicode_content:0:60}"
  echo "$unicode_content" | grep -q '你好' && pass "Unicode: 你好 present" || fail "Unicode 你好" "got: ${unicode_content:0:60}"
  echo "$unicode_content" | grep -q '🎉' && pass "Unicode: 🎉 present" || fail "Unicode 🎉" "got: ${unicode_content:0:60}"

  # --- Long content: 100 lines ---
  reset_state
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  const nl = String.fromCharCode(10);
  let lines = [];
  for (let i = 1; i <= 100; i++) {
    lines.push("Line " + i + ": This is content for line number " + i);
  }
  el.textContent = lines.join(nl);
  parseMarkdown(el);
})()
EOF
  wait_fn "document.querySelector('article').textContent.includes('Line 100')"

  local long_content
  long_content=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$long_content" | grep -q 'Line 1:' && pass "Long content: Line 1 present" || fail "Long Line 1" "got: ${long_content:0:60}"
  echo "$long_content" | grep -q 'Line 50:' && pass "Long content: Line 50 present" || fail "Long Line 50" "got: ${long_content:0:60}"
  echo "$long_content" | grep -q 'Line 100:' && pass "Long content: Line 100 present" || fail "Long Line 100" "got: ${long_content:0:60}"

  # Count occurrences of "Line N:" using grep -o (one match per line)
  local line_count
  line_count=$(echo "$long_content" | grep -o 'Line [0-9]*:' | wc -l)
  [[ "$line_count" -eq 100 ]] && pass "Long content: all 100 lines rendered" || fail "Long content count" "expected 100 got $line_count"
}

test_clickable_link_url() {
  # Markdown links [text](url) should have clickable URL part
  # while preserving [text](url) in textContent for persistence.
  reset_state

  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  el.textContent = "[click here](https://example.com) and [another](https://google.com)";
  parseMarkdown(el);
})()
EOF
  wait_fn "document.querySelectorAll('.md-link-source').length >= 2"

  # Check link sources exist
  local src_count
  src_count=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-link-source").length')
  [[ "$src_count" -ge 2 ]] && pass "Link sources: 2 present" || fail "Link sources" "got $src_count"

  # Check URLs are clickable <a> tags
  local url_count
  url_count=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-link-source .md-url").length')
  [[ "$url_count" -ge 2 ]] && pass "Clickable URLs: 2 <a> tags inside link sources" || fail "Clickable URLs" "got $url_count"

  # Check hrefs are correct
  local hrefs
  hrefs=$(timeout 5 agent-browser eval 'Array.from(document.querySelectorAll(".md-link-source .md-url")).map(a=>a.href).join("|")')
  echo "$hrefs" | grep -q 'example.com' && pass "URL href: example.com" || fail "URL href example" "got: $hrefs"
  echo "$hrefs" | grep -q 'google.com' && pass "URL href: google.com" || fail "URL href google" "got: $hrefs"

  # Check textContent is still raw markdown
  local tc
  tc=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent')
  echo "$tc" | grep -q '\[click here\]' && pass "textContent: [click here] preserved" || fail "textContent label" "got: ${tc:0:60}"
  echo "$tc" | grep -q 'https://example.com' && pass "textContent: URL preserved" || fail "textContent URL" "got: ${tc:0:60}"
}

test_outlook_paste() {
  # Paste bullet list from Outlook (MsoListParagraph format) renders as markdown list.
  reset_state
  timeout 5 agent-browser eval 'document.querySelector("article").textContent = ""' >/dev/null 2>&1

  # Test 1: Outlook MsoListParagraph unordered list
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  const html = '<p class="MsoListParagraph" style="margin-left:0.5in"><span style="font-family:Symbol">•</span> First item</p><p class="MsoListParagraph" style="margin-left:1in"><span style="font-family:Symbol">•</span> Sub item</p><p class="MsoListParagraph" style="margin-left:0.5in"><span style="font-family:Symbol">•</span> Third item</p>';
  const e = new ClipboardEvent("paste", { clipboardData: new DataTransfer() });
  e.clipboardData.setData("text/html", html);
  e.clipboardData.setData("text/plain", "First item Sub item Third item");
  el.dispatchEvent(e);
})()
EOF
  wait_fn "document.querySelectorAll('.md-listitem').length >= 3"

  local o_items
  o_items=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-listitem").length')
  [[ "$o_items" -eq 3 ]] && pass "Outlook MsoListParagraph: 3 items" || fail "Outlook items" "got $o_items"

  local o_markers
  o_markers=$(timeout 5 agent-browser eval 'Array.from(document.querySelectorAll(".md-listmarker")).map(m=>m.textContent).join("|")')
  echo "$o_markers" | grep -q '\-\|-' && pass "Outlook MsoListParagraph: markers are -" || fail "Outlook markers" "got: $o_markers"

  # Test 2: Outlook numbered list
  reset_state
  timeout 5 agent-browser eval 'document.querySelector("article").textContent = ""' >/dev/null 2>&1
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  const html = '<p class="MsoListParagraph" style="margin-left:0.5in">1. First task</p><p class="MsoListParagraph" style="margin-left:0.5in">2. Second task</p><p class="MsoListParagraph" style="margin-left:0.5in">3. Third task</p>';
  const e = new ClipboardEvent("paste", { clipboardData: new DataTransfer() });
  e.clipboardData.setData("text/html", html);
  e.clipboardData.setData("text/plain", "1. First task 2. Second task 3. Third task");
  el.dispatchEvent(e);
})()
EOF
  wait_fn "document.querySelectorAll('.md-listitem').length >= 3"

  local n_items
  n_items=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-listitem").length')
  [[ "$n_items" -eq 3 ]] && pass "Outlook numbered: 3 items" || fail "Outlook numbered items" "got $n_items"

  local n_markers
  n_markers=$(timeout 5 agent-browser eval 'Array.from(document.querySelectorAll(".md-listmarker")).map(m=>m.textContent).join("|")')
  echo "$n_markers" | grep -q '1.' && pass "Outlook numbered: marker 1." || fail "Outlook numbered 1." "got: $n_markers"
  echo "$n_markers" | grep -q '2.' && pass "Outlook numbered: marker 2." || fail "Outlook numbered 2." "got: $n_markers"
  echo "$n_markers" | grep -q '3.' && pass "Outlook numbered: marker 3." || fail "Outlook numbered 3." "got: $n_markers"

  # Test 3: Standard <ul> list paste
  reset_state
  timeout 5 agent-browser eval 'document.querySelector("article").textContent = ""' >/dev/null 2>&1
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  const html = '<ul><li>Apple</li><li>Banana</li><li>Cherry</li></ul>';
  const e = new ClipboardEvent("paste", { clipboardData: new DataTransfer() });
  e.clipboardData.setData("text/html", html);
  e.clipboardData.setData("text/plain", "Apple Banana Cherry");
  el.dispatchEvent(e);
})()
EOF
  wait_fn "document.querySelectorAll('.md-listitem').length >= 3"

  local s_items
  s_items=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-listitem").length')
  [[ "$s_items" -eq 3 ]] && pass "Standard <ul>: 3 items" || fail "Standard ul items" "got $s_items"
}

test_list_no_extra_space() {
  # After Enter to continue a list, the new item should NOT have an extra
  # leading space. Typing the first character should be at column 0 of content.
  reset_state

  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  el.textContent = "- Apple\n";
  parseMarkdown(el);
  // Simulate Enter: insertListPrefix("- ")
  const listItem = el.querySelector('.md-listitem');
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEndBefore(listItem);
  const textBefore = range.toString();
  range.setStartAfter(listItem);
  range.setEndAfter(el.lastChild);
  const textAfter = range.toString();
  const newRaw = textBefore + listItem.textContent + '\n' + '- ' + textAfter;
  el.textContent = newRaw;
  parseMarkdown(el);
})()
EOF
  wait_fn "document.querySelectorAll('.md-listitem').length >= 2"

  # Check second item content is empty (no extra space)
  local content2
  content2=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-listcontent")[1].textContent' | tr -d '"')
  [[ -z "$content2" ]] && pass "New list item content is empty (no extra space)" || fail "Extra space" "content2=|${content2}|"

  # Check marker includes the space (not content)
  local marker2
  marker2=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-listmarker")[1].textContent' | tr -d '"')
  [[ "$marker2" == "- " ]] && pass "Marker includes spacing: '- '" || fail "Marker spacing" "marker2=|${marker2}|"
}

test_shift_enter_blank_line() {
  # Shift+Enter inside a list item inserts a blank line before the list.
  reset_state

  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  el.textContent = "- Apple\n";
  parseMarkdown(el);
})()
EOF
  wait_fn "document.querySelectorAll('.md-listitem').length >= 1"

  # Dispatch Shift+Enter
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const el = document.querySelector("article");
  const event = new KeyboardEvent("keydown", {
    key: "Enter", code: "Enter", shiftKey: true, bubbles: true, cancelable: true
  });
  el.dispatchEvent(event);
})()
EOF
  sleep 0.3

  # Check: blank line before the list (starts with newline)
  local starts_with_nl
  starts_with_nl=$(timeout 5 agent-browser eval 'document.querySelector("article").textContent.charCodeAt(0) === 10')
  [[ "$starts_with_nl" == "true" ]] && pass "Shift+Enter: blank line before list" || fail "Shift+Enter blank line" "starts_with_nl=$starts_with_nl"
}

# ============================================================
# RUN
# ============================================================
main() {
  local filter="${1:-}"

  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}  Notes Editor E2E Tests (agent-browser)${NC}"
  echo -e "${CYAN}========================================${NC}"

  # Check server
  if ! curl -s -o /dev/null "http://localhost:$SERVER_PORT/index.html" 2>/dev/null; then
    echo -e "${RED}Server not running on port $SERVER_PORT${NC}"
    exit 1
  fi

  # Open app once
  open_app

  declare -a TEST_NAMES=(
    page_load
    typing
    autosave
    new_document
    menu_toggle
    markdown_rendering
    markdown_features
    bullet_lists
    bullet_enter
    recent_docs
    save_buttons_exist
    folder_sync_available
    doc_dialog_open
    doc_dialog_list
    doc_dialog_search
    doc_dialog_switch
    doc_dialog_close_escape
    doc_dialog_close_button
    undo_redo
    persistence
    mixed_content
    paste_handling
    edge_cases
    clickable_link_url
    outlook_paste
    list_no_extra_space
    shift_enter_blank_line
  )

  for name in "${TEST_NAMES[@]}"; do
    if [[ -n "$filter" ]] && [[ "$name" != *"$filter"* ]]; then
      continue
    fi
    echo ""
    echo -e "${CYAN}--- $name ---${NC}"
    "test_$name" || true
  done

  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "  ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC} ($TOTAL total)"
  echo -e "${CYAN}========================================${NC}"

  [[ $FAILED -eq 0 ]]
}

main "$@"
