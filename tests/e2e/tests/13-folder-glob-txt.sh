#!/bin/bash
# Test: Folder with txt glob pattern
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-13-folder-glob-txt"
section "Test: Folder with Glob Pattern"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get folders --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-docs-glob-txt" && pass "Folder attached" || fail "Folder missing"

delete_agent_if_exists "$AGENT"
print_summary
