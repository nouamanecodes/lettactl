#!/bin/bash
# Test: Folder with explicit file list
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-12-folder-explicit"
section "Test: Folder with Explicit Files"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get folders --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-docs-explicit" && pass "Folder attached" || fail "Folder missing"

$CLI files "$AGENT" > $OUT 2>&1
output_contains "doc1" && pass "File doc1 present" || fail "Missing doc1"
output_contains "doc2" && pass "File doc2 present" || fail "Missing doc2"

delete_agent_if_exists "$AGENT"
print_summary
