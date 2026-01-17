#!/bin/bash
# Test: Special characters in prompts and blocks
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-28-special-chars"
section "Test: Special Characters"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Apply config with special characters
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify special chars in system prompt
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "quotes" && pass "Quotes preserved" || fail "Quotes not preserved"
output_contains "ampersands" && pass "Ampersands preserved" || fail "Ampersands not preserved"

# Verify block with special chars
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "special_data" && pass "Special block attached" || fail "Special block missing"

# Apply update with more special chars
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "UPDATED" && pass "Description updated with special chars" || fail "Update failed"

delete_agent_if_exists "$AGENT"
print_summary
