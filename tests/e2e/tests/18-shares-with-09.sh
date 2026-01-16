#!/bin/bash
# Test: Shares block with agent 09 (tests block sharing)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-18-shares-with-09"
section "Test: Block Sharing Between Agents"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-shared-inline" && pass "Shared block attached" || fail "Missing shared block"

delete_agent_if_exists "$AGENT"
print_summary
