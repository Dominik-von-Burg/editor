#!/usr/bin/env bash
# E2E tests for the Notes editor (non-folder-sync features)
# Uses agent-browser for browser automation
#
# Usage: ./tests/test-editor.sh [filter]

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

# ============================================================
# RUN
# ============================================================
main() {
  local filter="${1:-}"

  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}  Notes Editor E2E Tests (agent-browser)${NC}"
  echo -e "${CYAN}========================================${NC}"

  # Check server
  if ! curl -s -o /dev/null "http://localhost:$SERVER_PORT/notes.html" 2>/dev/null; then
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
    recent_docs
    save_buttons_exist
    folder_sync_available
    doc_dialog_open
    doc_dialog_list
    doc_dialog_search
    doc_dialog_switch
    doc_dialog_close_escape
    doc_dialog_close_button
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
