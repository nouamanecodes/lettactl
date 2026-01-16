#!/bin/bash
# Test: Large context window configuration
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-04-large-context"
section "Test: Large Context Window"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify initial context window
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "200000" && pass "Context window 200000" || fail "Wrong context window"

# Apply update and verify context window changed
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "180000" && pass "Context updated to 180000" || fail "Context not updated"

delete_agent_if_exists "$AGENT"
print_summary
