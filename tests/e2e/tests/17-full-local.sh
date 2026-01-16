#!/bin/bash
# Test: All local features combined
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-17-full-local"
section "Test: Full Local Features"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify all components
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "working_memory" && pass "Memory block attached" || fail "Missing memory block"
output_contains "e2e-shared-inline" && pass "Shared block attached" || fail "Missing shared block"

$CLI get folders --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-full-docs" && pass "Folder attached" || fail "Missing folder"

$CLI get tools --agent "$AGENT" > $OUT 2>&1
output_contains "archival_memory" && pass "Tools attached" || fail "Missing tools"

delete_agent_if_exists "$AGENT"
print_summary
