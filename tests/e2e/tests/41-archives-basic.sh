#!/bin/bash
# Test: Archives basic attach + describe
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-41-archives-basic"
ARCHIVE_ONE="e2e-archive-basic-1"

section "Test: Archives Basic"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURES/fleet-archives-test.yml" --root "$FIXTURES" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get archives --agent "$AGENT" > $OUT 2>&1
output_contains "$ARCHIVE_ONE" && pass "Archive attached" || fail "Archive missing"

$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "$ARCHIVE_ONE" && pass "Archive appears in agent details" || fail "Archive missing from agent details"

$CLI describe archive "$ARCHIVE_ONE" > $OUT 2>&1
output_contains "$AGENT" && pass "Archive shows attached agent" || fail "Archive missing attached agent"

delete_agent_if_exists "$AGENT"
$CLI delete-all archives --pattern "e2e-archive-basic-.*" --force > /dev/null 2>&1 || true
print_summary
