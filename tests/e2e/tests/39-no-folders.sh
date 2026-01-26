#!/bin/bash
# Test: Apply with tools and memory blocks but NO folders
# Regression test for issue #146 - folders hang on processing
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT1="e2e-39-agent-one"
AGENT2="e2e-39-agent-two"
section "Test: No Folders (Issue #146 Regression)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT1"
delete_agent_if_exists "$AGENT2"

# Apply config with tools/* glob and memory blocks but NO folders
# Before fix: this would hang indefinitely on "Processing folders..."
# After fix: should complete quickly
$CLI apply -f "$FIXTURES/fleet-no-folders-test.yml" --root "$FIXTURES" > $OUT 2>&1
agent_exists "$AGENT1" && pass "Agent 1 created" || fail "Agent 1 not created"
agent_exists "$AGENT2" && pass "Agent 2 created" || fail "Agent 2 not created"

# Verify tools were attached
$CLI describe agent "$AGENT1" -o json > $OUT 2>&1
output_contains "end_conversation" && pass "Tools attached to agent 1" || fail "Tools not attached to agent 1"

# Verify memory blocks exist
output_contains "persona" && pass "Memory blocks created for agent 1" || fail "Memory blocks not created for agent 1"

# Cleanup
delete_agent_if_exists "$AGENT1"
delete_agent_if_exists "$AGENT2"
print_summary
