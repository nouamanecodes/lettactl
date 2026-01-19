#!/bin/bash

# Test: Agent-specific blocks are isolated (not shared across agents)
# Issue: #128
# Bug: Blocks with same name were shared globally, causing cross-agent contamination

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-33-block-isolation-a"
AGENT_B="e2e-33-block-isolation-b"

section "Test: Block Isolation Between Agents (#128)"

# Setup
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup before test
info "Cleaning up test agents..."
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# Apply both agents (they have same block name but different values)
section "Create Two Agents with Same Block Name"
if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "e2e-33-block-isolation" > $OUT 2>&1; then
    pass "Applied fleet.yml for both isolation test agents"
else
    fail "Failed to apply fleet.yml"
    cat $OUT
    exit 1
fi

# Verify both agents exist
if agent_exists "$AGENT_A"; then
    pass "Agent A exists: $AGENT_A"
else
    fail "Agent A not created: $AGENT_A"
    exit 1
fi

if agent_exists "$AGENT_B"; then
    pass "Agent B exists: $AGENT_B"
else
    fail "Agent B not created: $AGENT_B"
    exit 1
fi

# Verify Agent A has correct block value
section "Verify Agent A Block Value"
if $CLI get blocks --agent "$AGENT_A" > $OUT 2>&1; then
    if output_contains "brand_identity"; then
        pass "Agent A has brand_identity block"
    else
        fail "Agent A missing brand_identity block"
        cat $OUT
    fi
fi

# Send message to Agent A to print its block
if $CLI send "$AGENT_A" "Print the exact content of your brand_identity memory block" > $OUT 2>&1; then
    if output_contains "Alpha Corp"; then
        pass "Agent A block contains 'Alpha Corp' (correct)"
    else
        if output_contains "Beta Inc"; then
            fail "Agent A has Agent B's block content (CROSS-CONTAMINATION BUG)"
        else
            fail "Agent A block content unexpected"
        fi
        cat $OUT
    fi
else
    fail "Failed to send message to Agent A"
    cat $OUT
fi

# Verify Agent B has correct block value
section "Verify Agent B Block Value"
if $CLI get blocks --agent "$AGENT_B" > $OUT 2>&1; then
    if output_contains "brand_identity"; then
        pass "Agent B has brand_identity block"
    else
        fail "Agent B missing brand_identity block"
        cat $OUT
    fi
fi

# Send message to Agent B to print its block
if $CLI send "$AGENT_B" "Print the exact content of your brand_identity memory block" > $OUT 2>&1; then
    if output_contains "Beta Inc"; then
        pass "Agent B block contains 'Beta Inc' (correct)"
    else
        if output_contains "Alpha Corp"; then
            fail "Agent B has Agent A's block content (CROSS-CONTAMINATION BUG)"
        else
            fail "Agent B block content unexpected"
        fi
        cat $OUT
    fi
else
    fail "Failed to send message to Agent B"
    cat $OUT
fi

# Verify blocks are actually different IDs (not shared)
section "Verify Blocks Are Separate Entities"
$CLI get blocks --agent "$AGENT_A" -o json > "$LOG_DIR/blocks-a.json" 2>&1 || true
$CLI get blocks --agent "$AGENT_B" -o json > "$LOG_DIR/blocks-b.json" 2>&1 || true

# Extract brand_identity block IDs
BLOCK_ID_A=$(grep -o '"id":"[^"]*"' "$LOG_DIR/blocks-a.json" | head -1 | cut -d'"' -f4)
BLOCK_ID_B=$(grep -o '"id":"[^"]*"' "$LOG_DIR/blocks-b.json" | head -1 | cut -d'"' -f4)

if [ -n "$BLOCK_ID_A" ] && [ -n "$BLOCK_ID_B" ]; then
    if [ "$BLOCK_ID_A" != "$BLOCK_ID_B" ]; then
        pass "Block IDs are different (not shared): A=$BLOCK_ID_A, B=$BLOCK_ID_B"
    else
        fail "Block IDs are SAME (shared incorrectly): $BLOCK_ID_A"
    fi
else
    warn "Could not extract block IDs for comparison"
fi

# Cleanup
section "Cleanup"
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
pass "Cleaned up test agents"

# Summary
print_summary
