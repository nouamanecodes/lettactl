#!/bin/bash
# Test: First message on agent creation (#134)
# Agent should receive calibration message and remember it
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-first-message-test"
section "Test: First Message on Creation (#134)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with first_message
info "Creating agent with first_message..."
$CLI apply -f "$FIXTURES/fleet-first-message-test.yml" > $OUT 2>&1

# Check that first message was sent
if output_contains "First message completed"; then
    pass "First message was sent and completed"
else
    fail "First message not sent or did not complete"
    cat $OUT
fi

# Verify agent exists
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Ask agent about the secret code from the first message
info "Verifying agent remembers first message content..."
$CLI send "$AGENT" "What secret code were you told to remember? Tell me the exact code." > $OUT 2>&1

if output_contains "CALIBRATION-99"; then
    pass "Agent remembers content from first_message"
else
    fail "Agent does not remember first_message content"
    cat $OUT
fi

delete_agent_if_exists "$AGENT"
print_summary
