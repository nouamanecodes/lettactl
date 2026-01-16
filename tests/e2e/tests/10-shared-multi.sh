#!/bin/bash
# Test: Multiple shared block references
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-10-shared-multi"
section "Test: Multiple Shared Blocks"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-shared-inline" && pass "Shared inline attached" || fail "Missing shared-inline"
output_contains "e2e-shared-fromfile" && pass "Shared fromfile attached" || fail "Missing shared-fromfile"
output_contains "e2e-shared-versioned" && pass "Shared versioned attached" || fail "Missing shared-versioned"

delete_agent_if_exists "$AGENT"
print_summary
