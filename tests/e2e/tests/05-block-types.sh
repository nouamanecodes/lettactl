#!/bin/bash
# Test: Memory block types — single, multi, from file, versioned
# Merged from: 05-block-single, 06-blocks-multi, 07-block-file, 08-block-versioned
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-05-block-single"
AGENT_B="e2e-06-blocks-multi"
AGENT_C="e2e-07-block-file"
AGENT_D="e2e-08-block-versioned"

section "Test: Memory Block Types"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"
delete_agent_if_exists "$AGENT_D"

# --- Single block ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Single-block agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT_A" > $OUT 2>&1
output_contains "notes" && pass "Single block attached" || fail "Single block missing"

# --- Multiple blocks + adding new block ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_B" > $OUT 2>&1
agent_exists "$AGENT_B" && pass "Multi-block agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT_B" > $OUT 2>&1
output_contains "user_profile" && pass "Has user_profile block" || fail "Missing user_profile"
output_contains "preferences" && pass "Has preferences block" || fail "Missing preferences"
output_contains "history" && pass "Has history block" || fail "Missing history"

$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT_B" > $OUT 2>&1
$CLI get blocks --agent "$AGENT_B" > $OUT 2>&1
output_contains "new_block" && pass "New block added" || fail "New block missing"

# --- Block from file ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_C" > $OUT 2>&1
agent_exists "$AGENT_C" && pass "Block-file agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT_C" > $OUT 2>&1
output_contains "file_content" && pass "Block from file attached" || fail "Block from file missing"

# --- Versioned block ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_D" > $OUT 2>&1
agent_exists "$AGENT_D" && pass "Versioned-block agent created" || fail "Agent not created"

$CLI get blocks --agent "$AGENT_D" > $OUT 2>&1
output_contains "versioned_data" && pass "Versioned block attached" || fail "Versioned block missing"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"
delete_agent_if_exists "$AGENT_D"
print_summary
