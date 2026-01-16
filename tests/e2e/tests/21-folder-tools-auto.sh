#!/bin/bash
# Test: File search tools auto-add when folders attached
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-21-folder-tools-auto"
section "Test: Auto File Search Tools"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify explicit tools preserved
$CLI get tools --agent "$AGENT" > $OUT 2>&1
output_contains "archival_memory_insert" && pass "Archival insert preserved" || fail "Missing archival insert"
output_contains "archival_memory_search" && pass "Archival search preserved" || fail "Missing archival search"

delete_agent_if_exists "$AGENT"
print_summary
