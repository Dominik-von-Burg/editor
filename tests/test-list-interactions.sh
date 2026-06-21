#!/usr/bin/env bash
# Key-by-key E2E tests for list interactions in the Notes editor
# Uses agent-browser for browser automation
#
# Tests simulate real user typing: character-by-character input,
# Enter/Tab/Shift-Tab, then verify textContent and cursor position.
#
# Usage: ./tests/test-list-interactions.sh [filter]

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
  local url="${BASE_URL}?_t=$(date +%s%N)"
  timeout 10 agent-browser open "$url" >/dev/null 2>&1 || true
  wait_fn 'document.querySelector("article")'
}

# Reset localStorage and reload
reset_state() {
  local ts
  ts=$(date +%s%N)
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<HEREDOC
localStorage.clear();
sessionStorage.clear();
location.href = location.pathname + '?_t=${ts}';
HEREDOC
  # Wait for article AND for editor to initialize (parseMarkdown available)
  wait_fn 'document.querySelector("article") && typeof parseMarkdown === "function"'
  # Ensure editor content is clean
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const a = document.querySelector("article");
  if (a && a.textContent.trim()) {
    a.textContent = "";
  }
})()
EOF
  sleep 0.3
}

# Focus the editor and ensure it's ready
focus_editor() {
  timeout 5 agent-browser focus 'article' >/dev/null 2>&1
}

# Get the raw textContent of the editor
get_content() {
  timeout 5 agent-browser eval 'document.querySelector("article").textContent' 2>/dev/null | tr -d '"'
}

# Get cursor position as {start, end} in textContent
get_cursor() {
  timeout 5 agent-browser eval --stdin 2>/dev/null <<'EOF'
const sel = window.getSelection();
const article = document.querySelector("article");
if (!sel || !sel.rangeCount) { JSON.stringify({start:0, end:0}); return; }
const range = sel.getRangeAt(0);

// Walk text nodes to find character offset
let offset = 0;
const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
let node;
let startOff = -1, endOff = -1;

while (node = walker.nextNode()) {
  const len = node.textContent.length;
  if (startOff < 0 && range.startContainer === node) startOff = offset + range.startOffset;
  if (endOff < 0 && range.endContainer === node) endOff = offset + range.endOffset;
  offset += len;
}
if (startOff < 0) startOff = offset;
if (endOff < 0) endOff = offset;
JSON.stringify({start: startOff, end: endOff});
EOF
}

# Count list items
count_items() {
  timeout 5 agent-browser eval 'document.querySelectorAll("article .md-listitem").length' 2>/dev/null | tr -d '"'
}

# Get list markers as array
get_markers() {
  timeout 5 agent-browser eval 'JSON.stringify(Array.from(document.querySelectorAll("article .md-listmarker")).map(m => m.textContent))' 2>/dev/null | tr -d '"'
}

# Get list levels as array
get_levels() {
  timeout 5 agent-browser eval 'JSON.stringify(Array.from(document.querySelectorAll("article .md-listitem")).map(el => parseInt(el.style.getPropertyValue("--list-level"))))' 2>/dev/null | tr -d '"'
}

# ============================================================
# TESTS
# ============================================================

# --- Unordered list typing ---
test_unordered_type() {
  reset_state
  focus_editor

  # Type "- First" character by character
  timeout 5 agent-browser keyboard type '- First' >/dev/null 2>&1
  wait_fn 'document.querySelector("article .md-listitem")'

  local content
  content=$(get_content)
  echo "$content" | grep -q "First" && pass "Typed '- First' appears" || fail "Content missing" "got: ${content:0:40}"

  local items
  items=$(count_items)
  [[ "$items" -ge 1 ]] && pass "One list item rendered" || fail "Expected 1 item" "got=$items"

  local markers
  markers=$(get_markers)
  echo "$markers" | grep -q "\-" && pass "Marker is '-'" || fail "Expected '-' marker" "got=$markers"
}

# --- Unordered Enter continues list ---
test_unordered_enter_continue() {
  reset_state
  focus_editor

  # Type first item
  timeout 5 agent-browser keyboard type '- First' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  # Press Enter to add second item
  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.3
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  local items
  items=$(count_items)
  [[ "$items" -ge 2 ]] && pass "Enter adds second list item" || fail "Expected 2 items" "got=$items"

  # Type content in second item
  timeout 5 agent-browser keyboard type 'Second' >/dev/null 2>&1
  sleep 0.3

  local content
  content=$(get_content)
  echo "$content" | grep -q "Second" && pass "Second item has content" || fail "Second content missing" "got: ${content:0:50}"
}

# --- Unordered double Enter exits list ---
test_unordered_double_enter_exit() {
  reset_state
  focus_editor

  # Type two items
  timeout 5 agent-browser keyboard type '- First' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.3
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  # Press Enter again on empty item to exit
  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.5
  wait_fn 'document.querySelectorAll("article .md-listitem").length <= 1'

  local items
  items=$(count_items)
  [[ "$items" -le 1 ]] && pass "Double Enter exits list (1 item remains)" || fail "Expected <=1 item" "got=$items"
}

# --- Ordered list typing ---
test_ordered_type() {
  reset_state
  focus_editor

  # Type "1. First"
  timeout 5 agent-browser keyboard type '1. First' >/dev/null 2>&1
  wait_fn 'document.querySelector("article .md-listitem")'

  local items
  items=$(count_items)
  [[ "$items" -ge 1 ]] && pass "One ordered list item rendered" || fail "Expected 1 item" "got=$items"

  local markers
  markers=$(get_markers)
  echo "$markers" | grep -q "1\." && pass "Marker is '1.'" || fail "Expected '1.' marker" "got=$markers"
}

# --- Ordered Enter increments ---
test_ordered_enter_increment() {
  reset_state
  focus_editor

  # Type first ordered item
  timeout 5 agent-browser keyboard type '1. First' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  # Press Enter for second item
  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.3
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  local markers
  markers=$(get_markers)
  echo "$markers" | grep -q "2\." && pass "Second item marker is '2.'" || fail "Expected '2.' marker" "got=$markers"

  # Type in second item, then Enter for third (Enter on empty exits)
  timeout 5 agent-browser keyboard type 'Second' >/dev/null 2>&1
  sleep 0.3
  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.5
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 3'
  sleep 0.3

  markers=$(get_markers)
  echo "$markers" | grep -q "3\." && pass "Third item marker is '3.'" || fail "Expected '3.' marker" "got=$markers"
}

# --- Ordered double Enter exits list ---
test_ordered_double_enter_exit() {
  reset_state
  focus_editor

  timeout 5 agent-browser keyboard type '1. First' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.3
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  # Press Enter on empty item to exit
  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.5
  wait_fn 'document.querySelectorAll("article .md-listitem").length <= 1'

  local items
  items=$(count_items)
  [[ "$items" -le 1 ]] && pass "Double Enter exits ordered list" || fail "Expected <=1 item" "got=$items"
}

# --- Tab creates sub-bullet ---
test_tab_subbullet() {
  reset_state
  focus_editor

  # Type a list item
  timeout 5 agent-browser keyboard type '- First' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  # Press Enter for new item
  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.3
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  # Press Tab to indent (create sub-bullet)
  timeout 5 agent-browser press Tab >/dev/null 2>&1
  sleep 0.5

  # Check that we now have 2 items and one is at level 1
  local items
  items=$(count_items)
  [[ "$items" -ge 2 ]] && pass "Still have 2 items after Tab" || fail "Expected 2 items" "got=$items"

  local levels
  levels=$(get_levels)
  echo "$levels" | grep -q "1" && pass "One item at level 1 (sub-bullet)" || fail "Expected level 1" "got=$levels"
}

# --- Shift-Tab outdents sub-bullet ---
test_shift_tab_outdent() {
  reset_state
  focus_editor

  # Create a list with a sub-bullet by injecting raw text
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const a = document.querySelector("article");
  a.textContent = "- First\n  - Second";
  parseMarkdown(a);
})()
EOF
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  local levels
  levels=$(get_levels)
  echo "$levels" | grep -q "1" && pass "Sub-bullet at level 1 before Shift-Tab" || fail "Expected level 1" "got=$levels"

  # Focus the sub-bullet content and press Shift-Tab
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const sel = window.getSelection();
  const range = document.createRange();
  const items = document.querySelectorAll("article .md-listitem");
  if (items.length >= 2) {
    const cs = items[1].querySelector(".md-listcontent");
    if (cs && cs.firstChild) {
      range.setStart(cs.firstChild, cs.firstChild.textContent.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
})()
EOF

  timeout 5 agent-browser press Shift+Tab >/dev/null 2>&1
  sleep 0.5

  levels=$(get_levels)
  echo "$levels" | grep -q "1" && fail "Sub-bullet should be outdented" "still at level 1: $levels" || pass "Shift-Tab outdented sub-bullet"
}

# --- Cursor position after Enter in list ---
test_cursor_after_enter() {
  reset_state
  focus_editor

  timeout 5 agent-browser keyboard type '- First' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.3
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 2'

  # Cursor should be in the new (empty) list item, not at position 0
  local cursor
  cursor=$(get_cursor)
  echo "$cursor" | grep -q '"end":0' && fail "Cursor at start" "got=$cursor" || pass "Cursor not at start after Enter"
}

# --- Multiple items with content ---
test_multi_item_content() {
  reset_state
  focus_editor

  timeout 5 agent-browser keyboard type '- Apple' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.2
  timeout 5 agent-browser keyboard type 'Banana' >/dev/null 2>&1
  sleep 0.2

  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.2
  timeout 5 agent-browser keyboard type 'Cherry' >/dev/null 2>&1
  sleep 0.3

  local content
  content=$(get_content)
  echo "$content" | grep -q "Apple" && pass "Apple in content" || fail "Apple missing" "got: ${content:0:50}"
  echo "$content" | grep -q "Banana" && pass "Banana in content" || fail "Banana missing" "got: ${content:0:50}"
  echo "$content" | grep -q "Cherry" && pass "Cherry in content" || fail "Cherry missing" "got: ${content:0:50}"

  local items
  items=$(count_items)
  [[ "$items" -ge 3 ]] && pass "Three list items" || fail "Expected 3 items" "got=$items"
}

# --- textContent raw markdown format ---
test_raw_textcontent_format() {
  reset_state
  focus_editor

  timeout 5 agent-browser keyboard type '- Item One' >/dev/null 2>&1
  wait_fn 'document.querySelectorAll("article .md-listitem").length >= 1'

  timeout 5 agent-browser press Enter >/dev/null 2>&1
  sleep 0.2
  timeout 5 agent-browser keyboard type 'Item Two' >/dev/null 2>&1
  sleep 0.3

  local content
  content=$(get_content)

  # Raw textContent should contain "-" markers (not rendered bullets)
  local dash_count
  dash_count=$(echo "$content" | grep -o '^\-' | wc -l || true)
  [[ "$dash_count" -ge 1 ]] && pass "Raw textContent has '-' markers" || fail "No '-' in textContent" "got: ${content:0:60}"
}

test_split_list_item() {
  reset_state

  # Type a list item
  timeout 5 agent-browser keyboard type "- Hello World" >/dev/null 2>&1
  sleep 0.3

  # Move cursor to middle of "Hello World" (after "Hello ")
  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const s = window.getSelection();
  const range = document.createRange();
  const content = document.querySelector(".md-listcontent");
  range.setStart(content.firstChild, 6);
  range.collapse(true);
  s.removeAllRanges();
  s.addRange(range);
})()
EOF

  # Press Enter to split
  agent-browser press Enter >/dev/null 2>&1
  sleep 0.3

  # Should have 2 items: "Hello " and "World"
  local items
  items=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-listitem").length')
  [[ "$items" -eq 2 ]] && pass "Split created 2 items" || fail "Split items count" "got=$items"

  local contents
  contents=$(timeout 5 agent-browser eval 'Array.from(document.querySelectorAll(".md-listcontent")).map(c => c.textContent).join("|")' | tr -d '"')
  [[ "$contents" == "Hello |World" ]] && pass "Split at cursor: 'Hello |World'" || fail "Split content" "got=$contents"

  # Test ordered list split
  reset_state
  timeout 5 agent-browser keyboard type "1. Alpha Beta" >/dev/null 2>&1
  sleep 0.3

  timeout 5 agent-browser eval --stdin >/dev/null 2>&1 <<'EOF'
(function(){
  const s = window.getSelection();
  const range = document.createRange();
  const content = document.querySelector(".md-listcontent");
  range.setStart(content.firstChild, 6);
  range.collapse(true);
  s.removeAllRanges();
  s.addRange(range);
})()
EOF

  agent-browser press Enter >/dev/null 2>&1
  sleep 0.3

  local oitems
  oitems=$(timeout 5 agent-browser eval 'document.querySelectorAll(".md-listitem").length')
  [[ "$oitems" -eq 2 ]] && pass "Ordered split: 2 items" || fail "Ordered split count" "got=$oitems"

  local omarkers
  omarkers=$(timeout 5 agent-browser eval 'Array.from(document.querySelectorAll(".md-listmarker")).map(m => m.textContent.trim()).join("|")' | tr -d '"')
  [[ "$omarkers" == "1.|2." ]] && pass "Ordered split increments: 1.|2." || fail "Ordered split markers" "got=$omarkers"
}
main() {
  local filter="${1:-}"

  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}  List Interaction Tests (key-by-key)${NC}"
  echo -e "${CYAN}========================================${NC}"

  # Check server
  if ! curl -s -o /dev/null "http://localhost:$SERVER_PORT/index.html" 2>/dev/null; then
    echo -e "${RED}Server not running on port $SERVER_PORT${NC}"
    exit 1
  fi

  # Open app once
  open_app

  declare -a TEST_NAMES=(
    unordered_type
    unordered_enter_continue
    unordered_double_enter_exit
    ordered_type
    ordered_enter_increment
    ordered_double_enter_exit
    tab_subbullet
    shift_tab_outdent
    cursor_after_enter
    multi_item_content
    raw_textcontent_format
    split_list_item
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
