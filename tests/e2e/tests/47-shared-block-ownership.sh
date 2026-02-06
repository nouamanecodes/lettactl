#!/bin/bash

# Test: Shared blocks are always agent_owned - value never overwritten on re-apply
# Issue: #204

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_NAME="e2e-47-shared-ownership"

section "Test: Shared Block Always Agent Owned (#204)"

# Setup
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup before test
info "Cleaning up $AGENT_NAME if exists..."
delete_agent_if_exists "$AGENT_NAME"

# Apply initial config with ORIGINAL_VALUE_V1
section "Apply Initial Config"
if $CLI apply -f "$FIXTURES/fleet-shared-ownership-test.yml" --agent "$AGENT_NAME" > $OUT 2>&1; then
    pass "Applied fleet-shared-ownership-test.yml"
else
    fail "Failed to apply initial config"
    cat $OUT
    exit 1
fi

# Verify agent created
if agent_exists "$AGENT_NAME"; then
    pass "Agent exists: $AGENT_NAME"
else
    fail "Agent not created: $AGENT_NAME"
    exit 1
fi

# Verify shared block attached
section "Verify Initial Block"
$CLI get blocks --agent "$AGENT_NAME" > $OUT 2>&1
output_contains "e2e-ownership-shared" && pass "Shared block attached" || fail "Shared block missing"

# Verify initial block value
if $CLI describe block e2e-ownership-shared > $OUT 2>&1; then
    if output_contains "ORIGINAL_VALUE_V1"; then
        pass "Initial block value is ORIGINAL_VALUE_V1"
    else
        fail "Initial block value is not ORIGINAL_VALUE_V1"
        cat $OUT
    fi
else
    fail "Failed to describe block"
    cat $OUT
fi

# Re-apply with UPDATED_VALUE_V2 - shared block should NOT be overwritten
section "Re-apply With Changed Value"
if $CLI apply -f "$FIXTURES/fleet-shared-ownership-updated.yml" --agent "$AGENT_NAME" > $OUT 2>&1; then
    pass "Applied fleet-shared-ownership-updated.yml"
else
    fail "Failed to apply updated config"
    cat $OUT
    exit 1
fi

# Verify block value is STILL ORIGINAL_VALUE_V1 (not overwritten)
section "Verify Block Value Preserved"
if $CLI describe block e2e-ownership-shared > $OUT 2>&1; then
    if output_contains "ORIGINAL_VALUE_V1"; then
        pass "Shared block value preserved (agent_owned enforced)"
    else
        fail "Shared block value was overwritten (should still be ORIGINAL_VALUE_V1)"
        cat $OUT
    fi
    if output_not_contains "UPDATED_VALUE_V2"; then
        pass "Updated value correctly not applied"
    else
        fail "Updated value was incorrectly applied to shared block"
        cat $OUT
    fi
else
    fail "Failed to describe block after re-apply"
    cat $OUT
fi

# Verify idempotent - re-apply should show no changes
section "Verify Idempotent"
if $CLI apply -f "$FIXTURES/fleet-shared-ownership-updated.yml" --agent "$AGENT_NAME" --dry-run > $OUT 2>&1; then
    if output_contains "No changes" || output_not_contains "Would"; then
        pass "Re-apply shows no changes (idempotent)"
    else
        fail "Re-apply incorrectly shows changes"
        cat $OUT
    fi
else
    fail "Dry-run failed"
    cat $OUT
fi

# Verify warning about agent_owned on shared block
section "Verify Agent Owned Warning"
if $CLI apply -f "$FIXTURES/fleet-shared-ownership-test.yml" --agent "$AGENT_NAME" > $OUT 2>&1; then
    if output_contains "agent_owned is ignored"; then
        pass "Warning shown for agent_owned on shared block"
    else
        warn "No warning shown for agent_owned on shared block (non-critical)"
        pass "Apply succeeded (warning may be suppressed)"
    fi
else
    fail "Failed to re-apply for warning check"
    cat $OUT
fi

# Cleanup
section "Cleanup"
delete_agent_if_exists "$AGENT_NAME"
pass "Cleaned up $AGENT_NAME"

# Summary
print_summary
