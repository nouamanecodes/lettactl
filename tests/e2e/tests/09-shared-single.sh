#!/bin/bash
# Test: Single shared block reference
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-09-shared-single"
section "Test: Shared Block Reference"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify shared block attached
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-shared-inline" && pass "Shared block attached" || fail "Shared block missing"

# Verify shared block exists globally
$CLI get blocks > $OUT 2>&1
output_contains "e2e-shared-inline" && pass "Shared block exists" || fail "Shared block not created"

delete_agent_if_exists "$AGENT"
print_summary
