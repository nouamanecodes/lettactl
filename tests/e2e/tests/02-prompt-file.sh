#!/bin/bash
# Test: System prompt loaded from file
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-02-prompt-file"
section "Test: System Prompt from File"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify system prompt was loaded
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "System Prompt" && pass "System prompt present" || fail "System prompt missing"

delete_agent_if_exists "$AGENT"
print_summary
