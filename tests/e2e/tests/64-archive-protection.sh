#!/bin/bash
# Test: Archives not detached when YAML omits archives section (#257)
# When an agent has archival tools but the YAML omits the archives: section,
# apply --force should NOT detach existing archives.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-64-archive-protection"
ARCHIVE="e2e-archive-protect-test"

section "Test: Archive Protection (#257)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Step 1: Create agent with archival tools AND an archive
info "Creating agent with archival tools and archive..."
$CLI apply -f "$FIXTURES/fleet-archive-protection-setup.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI get archives --agent "$AGENT" > $OUT 2>&1
output_contains "$ARCHIVE" && pass "Archive attached" || fail "Archive not attached"

# Step 2: Re-apply with YAML that has archival tools but NO archives section
# Dry-run with --force: should NOT show archive detach
info "Dry-run apply --force (no archives section)..."
$CLI apply -f "$FIXTURES/fleet-archive-protection.yml" --force --dry-run > $OUT 2>&1
output_not_contains "detach" && pass "Dry-run shows no archive detach" || fail "Dry-run incorrectly shows detach"

# Step 3: Apply --force with no archives section: archive should remain
info "Apply --force (no archives section)..."
$CLI apply -f "$FIXTURES/fleet-archive-protection.yml" --force > $OUT 2>&1
$CLI get archives --agent "$AGENT" > $OUT 2>&1
output_contains "$ARCHIVE" && pass "Archive preserved with --force" || fail "Archive incorrectly detached"

delete_agent_if_exists "$AGENT"
$CLI delete-all archives --pattern "e2e-archive-protect-.*" --force > /dev/null 2>&1 || true
print_summary
