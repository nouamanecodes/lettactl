#!/bin/bash
# Test: Agent with archival memory tools
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-16-tools-archival"
section "Test: Archival Tools"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get tools --agent "$AGENT" > $OUT 2>&1
output_contains "archival_memory_insert" && pass "Insert tool attached" || fail "Missing insert tool"
output_contains "archival_memory_search" && pass "Search tool attached" || fail "Missing search tool"

delete_agent_if_exists "$AGENT"
print_summary
