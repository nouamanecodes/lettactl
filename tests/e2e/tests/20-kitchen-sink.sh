#!/bin/bash
# Test: Kitchen sink - every possible option enabled
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-20-kitchen-sink"
section "Test: Kitchen Sink (All Features)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify all blocks
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "core_memory" && pass "Core memory block" || fail "Missing core_memory"
output_contains "e2e-shared-inline" && pass "Shared inline block" || fail "Missing shared-inline"
output_contains "e2e-shared-fromfile" && pass "Shared fromfile block" || fail "Missing shared-fromfile"

# Verify folder
$CLI get folders --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-kitchen-docs" && pass "Folder attached" || fail "Missing folder"

# Verify tools
$CLI get tools --agent "$AGENT" > $OUT 2>&1
output_contains "archival_memory" && pass "Tools attached" || fail "Missing tools"

# Apply update and verify new block added
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "brand_new_block" && pass "New block added on update" || fail "Missing new block"

delete_agent_if_exists "$AGENT"
print_summary
