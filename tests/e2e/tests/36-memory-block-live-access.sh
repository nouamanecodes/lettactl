#!/bin/bash
# Test: Memory block is live and accessible by agent
# 1. Create agent without memory block
# 2. Add memory block via apply
# 3. Verify agent can access the block content
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-memory-live-test"
section "Test: Memory Block Live Access"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Step 1: Create agent without memory block
info "Creating agent without memory block..."
$CLI apply -f "$FIXTURES/fleet-memory-block-live-test.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify no memory blocks initially (except default ones)
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
if output_contains "secret_code"; then
    fail "secret_code block should not exist yet"
else
    pass "No secret_code block initially"
fi

# Step 2: Add memory block via apply
info "Adding memory block via apply..."
$CLI apply -f "$FIXTURES/fleet-memory-block-live-updated.yml" > $OUT 2>&1

# Verify memory block is attached
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "secret_code" && pass "secret_code block attached" || fail "secret_code block not attached"

# Step 3: Verify agent can access the block content
info "Sending message to agent to verify block access..."
$CLI send "$AGENT" "What is in your secret_code memory block? Tell me the exact value." > $OUT 2>&1

# Check if agent response contains the secret code
if output_contains "PHOENIX-42"; then
    pass "Agent can access memory block content"
else
    fail "Agent cannot access memory block content"
    cat $OUT
fi

delete_agent_if_exists "$AGENT"
print_summary
