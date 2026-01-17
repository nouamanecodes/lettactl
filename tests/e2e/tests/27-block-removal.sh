#!/bin/bash
# Test: Block removal - all blocks removed from agent
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-27-block-removal"
section "Test: Block Removal"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Apply initial config with blocks
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify blocks exist initially
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "temp_block_a" && pass "Block A attached" || fail "Block A missing"
output_contains "temp_block_b" && pass "Block B attached" || fail "Block B missing"

# Apply update - ALL blocks removed
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1

# Verify blocks are gone (only core_memory and recall_memory should remain)
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_not_contains "temp_block_a" && pass "Block A removed" || fail "Block A still present"
output_not_contains "temp_block_b" && pass "Block B removed" || fail "Block B still present"

# Verify agent still works
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "blocks removed" && pass "Description updated" || fail "Description not updated"

delete_agent_if_exists "$AGENT"
print_summary
