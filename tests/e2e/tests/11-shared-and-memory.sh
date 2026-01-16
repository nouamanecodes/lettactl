#!/bin/bash
# Test: Both shared and memory blocks
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-11-shared-and-memory"
section "Test: Shared + Memory Blocks"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-shared-inline" && pass "Shared block attached" || fail "Missing shared block"
output_contains "private_notes" && pass "Private block attached" || fail "Missing private block"

delete_agent_if_exists "$AGENT"
print_summary
