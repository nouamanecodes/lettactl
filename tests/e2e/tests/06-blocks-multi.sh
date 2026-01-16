#!/bin/bash
# Test: Multiple memory blocks and adding new blocks
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-06-blocks-multi"
section "Test: Multiple Memory Blocks"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify initial blocks
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "user_profile" && pass "Has user_profile block" || fail "Missing user_profile"
output_contains "preferences" && pass "Has preferences block" || fail "Missing preferences"
output_contains "history" && pass "Has history block" || fail "Missing history"

# Apply update and verify new block added
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "new_block" && pass "New block added" || fail "New block missing"

delete_agent_if_exists "$AGENT"
print_summary
