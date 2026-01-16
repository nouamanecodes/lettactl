#!/bin/bash
# Test: Minimal agent configuration
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-01-minimal"
section "Test: Minimal Agent Configuration"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Apply and verify
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Apply updated and verify description change
$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "UPDATED" && pass "Description updated" || fail "Description not updated"

delete_agent_if_exists "$AGENT"
print_summary
