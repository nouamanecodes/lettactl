#!/bin/bash
# Test: Base Letta instructions disabled
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-03-no-base-prompt"
section "Test: Disable Base Prompt"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "complete system prompt" && pass "Custom prompt present" || fail "Custom prompt missing"

delete_agent_if_exists "$AGENT"
print_summary
