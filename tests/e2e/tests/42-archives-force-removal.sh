#!/bin/bash
# Test: Archives removal requires --force
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-42-archives-force"
ARCHIVE_KEEP="e2e-archive-force-keep"

section "Test: Archives Force Removal"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet-archives-force-test.yml" --root "$FIXTURES" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get archives --agent "$AGENT" > $OUT 2>&1
output_contains "$ARCHIVE_KEEP" && pass "Archive attached" || fail "Archive missing"

# Apply reduced config WITHOUT --force - archive should remain
$CLI apply -f "$FIXTURES/fleet-archives-force-test-reduced.yml" --root "$FIXTURES" > $OUT 2>&1
$CLI get archives --agent "$AGENT" > $OUT 2>&1
output_contains "$ARCHIVE_KEEP" && pass "Archive retained without --force" || fail "Archive incorrectly detached"

# Dry-run should indicate --force requirement
$CLI apply -f "$FIXTURES/fleet-archives-force-test-reduced.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1
output_contains "requires --force" && pass "Dry-run shows --force required" || fail "Dry-run missing --force indicator"

# Apply reduced config WITH --force - archive should detach
$CLI apply -f "$FIXTURES/fleet-archives-force-test-reduced.yml" --root "$FIXTURES" --force > $OUT 2>&1
$CLI get archives --agent "$AGENT" > $OUT 2>&1
output_not_contains "$ARCHIVE_KEEP" && pass "Archive detached with --force" || fail "Archive still attached"

# Orphaned archive should appear
$CLI get archives --orphaned > $OUT 2>&1
output_contains "$ARCHIVE_KEEP" && pass "Orphaned archive listed" || fail "Orphaned archive not listed"

delete_agent_if_exists "$AGENT"
$CLI delete-all archives --pattern "e2e-archive-force-.*" --force > /dev/null 2>&1 || true
print_summary
