#!/bin/bash

# Test: agent_owned: false blocks sync value from YAML on every apply
# Issue: #101

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_NAME="e2e-25-immutable-block"

section "Test: Immutable Block Value Sync (#101)"

# Setup
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup before test
info "Cleaning up $AGENT_NAME if exists..."
delete_agent_if_exists "$AGENT_NAME"

# Apply initial config
section "Apply Initial Config"
if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_NAME" > $OUT 2>&1; then
    pass "Applied fleet.yml for $AGENT_NAME"
else
    fail "Failed to apply fleet.yml"
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

# Verify initial block value (41 chars for "Policy version 1: Be helpful and concise.")
section "Verify Initial Block Value"
if $CLI describe block policies > $OUT 2>&1; then
    if output_contains "version 1"; then
        pass "Initial block value contains 'version 1'"
    else
        fail "Initial block value doesn't contain 'version 1'"
        cat $OUT
    fi
else
    fail "Failed to describe block policies"
    cat $OUT
fi

# Apply updated config
section "Apply Updated Config"
if $CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT_NAME" > $OUT 2>&1; then
    pass "Applied fleet-updated.yml for $AGENT_NAME"
else
    fail "Failed to apply fleet-updated.yml"
    cat $OUT
    exit 1
fi

# Verify block value synced (agent_owned: false should sync to "version 2")
section "Verify Block Value Synced"
if $CLI describe block policies > $OUT 2>&1; then
    if output_contains "version 2"; then
        pass "Block value synced to 'version 2' (agent_owned: false works)"
    else
        fail "Block value not synced (should contain 'version 2')"
        cat $OUT
    fi
else
    fail "Failed to describe block policies"
    cat $OUT
fi

# Verify idempotent (re-apply should show no changes)
section "Verify Idempotent"
if $CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT_NAME" --dry-run > $OUT 2>&1; then
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

# Cleanup
section "Cleanup"
delete_agent_if_exists "$AGENT_NAME"
pass "Cleaned up $AGENT_NAME"

# Summary
print_summary
