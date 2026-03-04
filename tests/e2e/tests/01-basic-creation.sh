#!/bin/bash
# Test: Basic agent creation — minimal, prompt from file, no base prompt
# Merged from: 01-minimal, 02-prompt-file, 03-no-base-prompt
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-01-minimal"
AGENT_B="e2e-02-prompt-file"
AGENT_C="e2e-03-no-base-prompt"

section "Test: Basic Agent Creation"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"

# --- Minimal agent creation and update ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Minimal agent created" || fail "Minimal agent not created"

$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
$CLI describe agent "$AGENT_A" > $OUT 2>&1
output_contains "UPDATED" && pass "Description updated" || fail "Description not updated"

# --- System prompt loaded from file ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_B" > $OUT 2>&1
agent_exists "$AGENT_B" && pass "Prompt-file agent created" || fail "Prompt-file agent not created"

$CLI describe agent "$AGENT_B" > $OUT 2>&1
output_contains "System Prompt" && pass "System prompt present" || fail "System prompt missing"

# --- Base Letta instructions disabled ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_C" > $OUT 2>&1
agent_exists "$AGENT_C" && pass "No-base-prompt agent created" || fail "No-base-prompt agent not created"

$CLI describe agent "$AGENT_C" > $OUT 2>&1
output_contains "complete system prompt" && pass "Custom prompt present" || fail "Custom prompt missing"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"
print_summary
