#!/bin/bash
# Test: Builtin tools should not be re-added on idempotent re-apply (#221)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-memory-tools-test"
section "Test: Builtin tool idempotent re-apply (#221)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# First apply — creates agent with builtin tools
$CLI apply -f "$FIXTURES/fleet-memory-tools-test.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created with builtin tools" || fail "Agent not created"

# Second apply — same YAML, should show unchanged
$CLI apply -f "$FIXTURES/fleet-memory-tools-test.yml" > $OUT 2>&1
output_not_contains "modified" && pass "Re-apply shows no modifications" || fail "Builtin tools incorrectly marked as modified"

delete_agent_if_exists "$AGENT"
print_summary
