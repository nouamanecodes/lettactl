#!/bin/bash

# Test: Shared folder idempotency — repeated deploys must not hit duplicate constraint
# Issue: #259

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-65-shared-idem-a"
AGENT_B="e2e-65-shared-idem-b"

section "Test: Shared Folder Idempotent Deploy (#259)"

# Setup
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup before test
info "Cleaning up test agents if they exist..."
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# First apply — should create both agents and the shared folder
section "First Apply"
if $CLI apply -f "$FIXTURES/fleet-shared-folder-idempotent.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "First apply succeeded"
else
    fail "First apply failed"
    cat $OUT
    exit 1
fi

# Verify both agents created
if agent_exists "$AGENT_A"; then
    pass "Agent A exists: $AGENT_A"
else
    fail "Agent A not created: $AGENT_A"
fi

if agent_exists "$AGENT_B"; then
    pass "Agent B exists: $AGENT_B"
else
    fail "Agent B not created: $AGENT_B"
fi

# Second apply — must NOT fail with duplicate constraint error
section "Second Apply (idempotency)"
if $CLI apply -f "$FIXTURES/fleet-shared-folder-idempotent.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Second apply succeeded (no duplicate constraint error)"
else
    fail "Second apply failed — possible duplicate folder constraint"
    cat $OUT
    exit 1
fi

# Verify agents still exist after second apply
if agent_exists "$AGENT_A"; then
    pass "Agent A still exists after re-apply"
else
    fail "Agent A missing after re-apply"
fi

if agent_exists "$AGENT_B"; then
    pass "Agent B still exists after re-apply"
else
    fail "Agent B missing after re-apply"
fi

# Cleanup
section "Cleanup"
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
pass "Cleaned up test agents"

# Summary
print_summary
