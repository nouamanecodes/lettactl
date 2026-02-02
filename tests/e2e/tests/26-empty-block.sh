#!/bin/bash
# Test: Minimal block value handling
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-26-empty-block"
section "Test: Minimal Block Value"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Apply initial config with minimal block value
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify both blocks exist
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "empty_notes" && pass "Minimal block attached" || fail "Minimal block missing"
output_contains "populated_notes" && pass "Populated block attached" || fail "Populated block missing"

# Apply update - minimal block gets real value
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "UPDATED" && pass "Description updated" || fail "Description not updated"

# Verify minimal block now has content
$CLI describe block empty_notes > $OUT 2>&1
output_contains "Now has content!" && pass "Minimal block populated" || fail "Minimal block still minimal"

delete_agent_if_exists "$AGENT"
print_summary
