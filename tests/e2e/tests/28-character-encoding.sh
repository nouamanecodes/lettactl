#!/bin/bash
# Test: Character encoding — special chars and unicode/international content
# Merged from: 28-special-chars, 29-unicode-content
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-28-special-chars"
AGENT_B="e2e-29-unicode-content"

section "Test: Character Encoding"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# --- Special characters ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Special-chars agent created" || fail "Agent not created"

$CLI describe agent "$AGENT_A" > $OUT 2>&1
output_contains "quotes" && pass "Quotes preserved" || fail "Quotes not preserved"
output_contains "ampersands" && pass "Ampersands preserved" || fail "Ampersands not preserved"

$CLI get blocks --agent "$AGENT_A" > $OUT 2>&1
output_contains "special_data" && pass "Special block attached" || fail "Special block missing"

$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
$CLI describe agent "$AGENT_A" > $OUT 2>&1
output_contains "UPDATED" && pass "Description updated with special chars" || fail "Update failed"

# --- Unicode content ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_B" > $OUT 2>&1
agent_exists "$AGENT_B" && pass "Unicode agent created" || fail "Agent not created"

$CLI describe agent "$AGENT_B" > $OUT 2>&1
output_contains "Multilingual" && pass "Multilingual prompt preserved" || fail "Multilingual prompt lost"

$CLI get blocks --agent "$AGENT_B" > $OUT 2>&1
output_contains "unicode_notes" && pass "Unicode block attached" || fail "Unicode block missing"

$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT_B" > $OUT 2>&1
$CLI describe agent "$AGENT_B" > $OUT 2>&1
output_contains "UPDATED" && pass "Description updated" || fail "Update failed"
output_contains "Korean" && pass "Korean added in update" || fail "Korean not added"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
print_summary
