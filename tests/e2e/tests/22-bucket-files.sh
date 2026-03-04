#!/bin/bash
# Test: Bucket file idempotence — glob and single file
# Merged from: 22-bucket-glob, 23-bucket-single
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-22-bucket-glob"
AGENT_B="e2e-23-bucket-single"

section "Test: Bucket File Idempotence"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# --- Glob bucket files ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Bucket-glob agent created" || fail "Agent not created"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_A" --dry-run > $OUT 2>&1
if output_not_contains "Added file" && output_not_contains "Removed file"; then
    pass "Bucket-glob re-apply idempotent"
else
    fail "Bucket-glob re-apply shows file changes"
    cat $OUT
fi

# --- Single bucket file ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_B" > $OUT 2>&1
agent_exists "$AGENT_B" && pass "Bucket-single agent created" || fail "Agent not created"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_B" --dry-run > $OUT 2>&1
if output_not_contains "Added file" && output_not_contains "Removed file"; then
    pass "Bucket-single re-apply idempotent"
else
    fail "Bucket-single re-apply shows file changes"
    cat $OUT
fi

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
print_summary
