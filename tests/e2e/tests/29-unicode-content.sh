#!/bin/bash
# Test: Unicode and international character handling
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-29-unicode-content"
section "Test: Unicode Content"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Apply config with unicode
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify unicode in description
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "Multilingual" && pass "Multilingual prompt preserved" || fail "Multilingual prompt lost"

# Verify unicode block
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "unicode_notes" && pass "Unicode block attached" || fail "Unicode block missing"

# Apply update with more unicode
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "UPDATED" && pass "Description updated" || fail "Update failed"
output_contains "Korean" && pass "Korean added in update" || fail "Korean not added"

delete_agent_if_exists "$AGENT"
print_summary
