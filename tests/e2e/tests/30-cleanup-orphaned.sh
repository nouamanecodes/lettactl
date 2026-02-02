#!/bin/bash
# Test: Cleanup command for orphaned resources
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-30-cleanup-test"
section "Test: Cleanup Orphaned Resources"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with block and folder
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify block and folder attached
$CLI get blocks --agent "$AGENT" > $OUT 2>&1
output_contains "cleanup_block" && pass "Block attached" || fail "Block missing"

$CLI get folders --agent "$AGENT" > $OUT 2>&1
output_contains "e2e-cleanup-folder" && pass "Folder attached" || fail "Folder missing"

# Delete agent (leaves orphaned block and folder)
$CLI delete agent "$AGENT" --force > $OUT 2>&1
! agent_exists "$AGENT" && pass "Agent deleted" || fail "Agent still exists"

# Dry-run cleanup - should find orphaned resources
section "Cleanup Dry Run"
$CLI cleanup all > $OUT 2>&1
output_contains "Orphaned" && pass "Cleanup found orphaned resources" || fail "Cleanup found nothing"
(output_contains "dry-run" || output_contains "Dry-run" || output_contains "Would") && pass "Dry-run mode active" || fail "Not in dry-run mode"

# Actually cleanup with --force
section "Cleanup Force"
$CLI cleanup all --force > $OUT 2>&1
output_contains "Deleted" && pass "Cleanup deleted resources" || fail "Cleanup didn't delete"

# Verify orphans gone
$CLI cleanup all > $OUT 2>&1
if output_contains "Would delete 0" || output_not_contains "cleanup_block"; then
    pass "Orphaned resources cleaned up"
else
    fail "Orphaned resources still exist"
fi

print_summary
