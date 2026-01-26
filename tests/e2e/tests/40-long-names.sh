#!/bin/bash
# Test: Long agent names should display fully without truncation
# Regression test for issue #132
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

LONG_NAME="e2e-40-this-is-a-very-long-agent-name-that-should-not-be-truncated"
section "Test: Long Names Display (Issue #132 Regression)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$LONG_NAME"

# Create agent with long name
$CLI create agent "$LONG_NAME" -d "Test agent with long name" -s "You are a test agent." > $OUT 2>&1
agent_exists "$LONG_NAME" && pass "Agent with long name created" || fail "Agent not created"

# Verify full name appears in get agents output (not truncated)
$CLI get agents --no-ux > $OUT 2>&1
output_contains "$LONG_NAME" && pass "Full name displayed in get agents" || fail "Name was truncated"

# Cleanup
delete_agent_if_exists "$LONG_NAME"
print_summary
