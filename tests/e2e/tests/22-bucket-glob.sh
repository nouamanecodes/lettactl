#!/bin/bash
# Test: Bucket glob files - idempotence (no duplicates on re-apply)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-22-bucket-glob"
section "Test: Bucket Glob Files Idempotence"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Re-apply should show no file changes
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" --dry-run > $OUT 2>&1
if output_not_contains "Added file" && output_not_contains "Removed file"; then
    pass "Re-apply shows no file changes (idempotent)"
else
    fail "Re-apply incorrectly shows file changes"
    cat $OUT
fi

delete_agent_if_exists "$AGENT"
print_summary
