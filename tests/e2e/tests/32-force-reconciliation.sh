#!/bin/bash
# Test: --force flag for strict config reconciliation (#123)
# Without --force: resources not in config are retained
# With --force: resources not in config are detached
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-force-test"
section "Test: Force Reconciliation (--force flag)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with multiple blocks
info "Creating agent with block_keep and block_remove..."
$CLI apply -f "$FIXTURES/fleet-force-test.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify both blocks exist initially
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "block_keep" && pass "block_keep attached" || fail "block_keep missing"
output_contains "block_remove" && pass "block_remove attached" || fail "block_remove missing"

# Apply reduced config WITHOUT --force - block_remove should remain
info "Applying reduced config WITHOUT --force..."
$CLI apply -f "$FIXTURES/fleet-force-test-reduced.yml" > $OUT 2>&1

$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "block_remove" && pass "block_remove retained without --force" || fail "block_remove incorrectly removed"

# Verify dry-run shows "(requires --force)" for removals
info "Checking dry-run shows --force requirement..."
$CLI apply -f "$FIXTURES/fleet-force-test-reduced.yml" --dry-run > $OUT 2>&1
output_contains "requires --force" && pass "Dry-run shows --force required" || fail "Dry-run missing --force indicator"

# Apply reduced config WITH --force - block_remove should be detached
info "Applying reduced config WITH --force..."
$CLI apply -f "$FIXTURES/fleet-force-test-reduced.yml" --force > $OUT 2>&1

$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "block_keep" && pass "block_keep still present" || fail "block_keep incorrectly removed"
output_not_contains "block_remove" && pass "block_remove detached with --force" || fail "block_remove not removed with --force"

delete_agent_if_exists "$AGENT"
print_summary
