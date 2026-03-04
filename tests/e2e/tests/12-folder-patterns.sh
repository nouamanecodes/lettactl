#!/bin/bash
# Test: Folder patterns — explicit file list, glob-txt, glob-all
# Merged from: 12-folder-explicit, 13-folder-glob-txt, 14-folder-glob-all
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-12-folder-explicit"
AGENT_B="e2e-13-folder-glob-txt"
AGENT_C="e2e-14-folder-glob-all"

section "Test: Folder Patterns"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"

# --- Explicit file list ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Explicit folder agent created" || fail "Agent not created"

$CLI get folders --agent "$AGENT_A" > $OUT 2>&1
output_contains "e2e-docs-explicit" && pass "Explicit folder attached" || fail "Folder missing"

$CLI files "$AGENT_A" > $OUT 2>&1
output_contains "doc1" && pass "File doc1 present" || fail "Missing doc1"
output_contains "doc2" && pass "File doc2 present" || fail "Missing doc2"

# --- Glob txt pattern ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_B" > $OUT 2>&1
agent_exists "$AGENT_B" && pass "Glob-txt folder agent created" || fail "Agent not created"

$CLI get folders --agent "$AGENT_B" > $OUT 2>&1
output_contains "e2e-docs-glob-txt" && pass "Glob-txt folder attached" || fail "Folder missing"

# --- Wildcard glob ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_C" > $OUT 2>&1
agent_exists "$AGENT_C" && pass "Glob-all folder agent created" || fail "Agent not created"

$CLI get folders --agent "$AGENT_C" > $OUT 2>&1
output_contains "e2e-docs-glob-all" && pass "Glob-all folder attached" || fail "Folder missing"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"
print_summary
