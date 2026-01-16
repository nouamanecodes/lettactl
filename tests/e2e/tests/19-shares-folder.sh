#!/bin/bash
# Test: References same folder pattern as agent 12
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-19-shares-folder"
section "Test: Folder Sharing Between Agents"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get folders --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-docs-explicit" && pass "Shared folder attached" || fail "Missing folder"

delete_agent_if_exists "$AGENT"
print_summary
