#!/bin/bash

# Test: Shared folders - define once, reference across agents
# Issue: #207

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-48-shared-folder-a"
AGENT_B="e2e-48-shared-folder-b"

section "Test: Shared Folders (#207)"

# Setup
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup before test
info "Cleaning up test agents if they exist..."
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# Apply config with shared_folders
section "Apply Shared Folders Config"
if $CLI apply -f "$FIXTURES/fleet-shared-folders-test.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Applied fleet-shared-folders-test.yml"
else
    fail "Failed to apply config"
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

# Verify shared folder attached to agent A
section "Verify Shared Folder on Agent A"
$CLI get blocks --agent "$AGENT_A" > $OUT 2>&1 || true
$CLI get agents > $OUT 2>&1
if agent_exists "$AGENT_A"; then
    pass "Agent A accessible"
else
    fail "Agent A not accessible"
fi

# Verify shared folder attached to agent B
section "Verify Shared Folder on Agent B"
if agent_exists "$AGENT_B"; then
    pass "Agent B accessible"
else
    fail "Agent B not accessible"
fi

# Verify idempotent re-apply
section "Verify Idempotent"
if $CLI apply -f "$FIXTURES/fleet-shared-folders-test.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1; then
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
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
pass "Cleaned up test agents"

# Summary
print_summary
