#!/usr/bin/env bash
# Master test runner for Notes editor E2E tests
#
# Usage:
#   ./tests/test.sh              # run all tests
#   ./tests/test.sh editor       # run only editor tests
#   ./tests/test.sh folder       # run only folder sync tests
#   ./tests/test.sh typing       # run editor tests matching "typing"
#
# Prerequisites:
#   - agent-browser (npm i -g agent-browser)
#   - python3 (for HTTP server)
#   - chromium/chrome

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVER_PORT="${TEST_PORT:-8900}"
SERVER_PID=""
FILTER="${1:-}"

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m'

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

start_server() {
  # Check if server is already running
  if curl -s -o /dev/null "http://localhost:$SERVER_PORT/notes.html" 2>/dev/null; then
    echo -e "${CYAN}Using existing server on port $SERVER_PORT${NC}"
    return 0
  fi

  echo -e "${CYAN}Starting HTTP server on port $SERVER_PORT...${NC}"
  nohup python3 -m http.server "$SERVER_PORT" --directory "$PROJECT_DIR" > /tmp/notes-test-server.log 2>&1 &
  SERVER_PID=$!
  sleep 1

  if ! curl -s -o /dev/null "http://localhost:$SERVER_PORT/notes.html" 2>/dev/null; then
    echo -e "${RED}Failed to start server${NC}"
    cat /tmp/notes-test-server.log 2>/dev/null || true
    exit 1
  fi
  echo -e "${GREEN}Server running (PID $SERVER_PID)${NC}"
}

run_editor_tests() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  PART 1: Editor Tests (agent-browser)${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  bash "$SCRIPT_DIR/test-editor.sh" "$FILTER"
  return ${PIPESTATUS[0]:-$?}
}

run_folder_sync_tests() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}  PART 2: Folder Sync Tests (OPFS)${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  bash "$SCRIPT_DIR/test-folder-sync.sh" "$FILTER"
  return ${PIPESTATUS[0]:-$?}
}

main() {
  echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   Notes Editor E2E Test Suite           ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"

  start_server

  local editor_result=0
  local folder_result=0

  # Run editor tests (always, unless filter is "folder")
  if [[ -z "$FILTER" ]] || [[ "$FILTER" != "folder" ]]; then
    run_editor_tests || editor_result=$?
  fi

  # Run folder sync tests (always, unless filter is "editor")
  if [[ -z "$FILTER" ]] || [[ "$FILTER" != "editor" ]]; then
    run_folder_sync_tests || folder_result=$?
  fi

  echo ""
  if [[ $editor_result -eq 0 ]] && [[ $folder_result -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
  else
    echo -e "${RED}Some tests failed.${NC}"
    exit 1
  fi
}

main
