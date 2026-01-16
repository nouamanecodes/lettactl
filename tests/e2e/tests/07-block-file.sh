#!/bin/bash
# Test: Memory block from file
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-07-block-file"
section "Test: Memory Block from File"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "file_content" && pass "Block from file attached" || fail "Block missing"

delete_agent_if_exists "$AGENT"
print_summary
