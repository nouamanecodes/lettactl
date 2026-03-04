#!/bin/bash
# Test: Shared folders — define once, reference across agents + idempotent deploy
# Merged from: 48-shared-folders, 65-shared-folder-idempotent
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-48-shared-folder-a"
AGENT_B="e2e-48-shared-folder-b"
AGENT_C="e2e-65-shared-idem-a"
AGENT_D="e2e-65-shared-idem-b"

section "Test: Shared Folders (#207, #259)"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"
delete_agent_if_exists "$AGENT_D"

# === Part 1: Shared folders basic (#207) ===
section "Shared Folders — Basic"

if $CLI apply -f "$FIXTURES/fleet-shared-folders-test.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Applied fleet-shared-folders-test.yml"
else
    fail "Failed to apply config"
    cat $OUT
    exit 1
fi

agent_exists "$AGENT_A" && pass "Agent A exists" || fail "Agent A not created"
agent_exists "$AGENT_B" && pass "Agent B exists" || fail "Agent B not created"

# Verify idempotent re-apply
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

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# === Part 2: Shared folder idempotent deploy — no duplicate constraint (#259) ===
section "Shared Folders — Idempotent Deploy"

if $CLI apply -f "$FIXTURES/fleet-shared-folder-idempotent.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "First apply succeeded"
else
    fail "First apply failed"
    cat $OUT
    exit 1
fi

agent_exists "$AGENT_C" && pass "Agent C exists" || fail "Agent C not created"
agent_exists "$AGENT_D" && pass "Agent D exists" || fail "Agent D not created"

# Second apply — must NOT fail with duplicate constraint error
if $CLI apply -f "$FIXTURES/fleet-shared-folder-idempotent.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Second apply succeeded (no duplicate constraint error)"
else
    fail "Second apply failed — possible duplicate folder constraint"
    cat $OUT
    exit 1
fi

agent_exists "$AGENT_C" && pass "Agent C still exists after re-apply" || fail "Agent C missing after re-apply"
agent_exists "$AGENT_D" && pass "Agent D still exists after re-apply" || fail "Agent D missing after re-apply"

# Cleanup
delete_agent_if_exists "$AGENT_C"
delete_agent_if_exists "$AGENT_D"
print_summary
