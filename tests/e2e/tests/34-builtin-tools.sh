#!/bin/bash
# Test: Builtin tools — protected memory/file tools and idempotent re-apply
# Merged from: 34-protected-memory-tools, 51-builtin-tool-idempotent
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-memory-tools-test"
section "Test: Builtin Tools (#130, #137, #221)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# --- Create agent with all memory and file tools ---
info "Creating agent with memory and file tools..."
$CLI apply -f "$FIXTURES/fleet-memory-tools-test.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify all memory tools attached
$CLI get tools --agent "$AGENT" > $OUT 2>&1
output_contains "memory_insert" && pass "memory_insert attached" || fail "memory_insert missing"
output_contains "memory_replace" && pass "memory_replace attached" || fail "memory_replace missing"
output_contains "memory_rethink" && pass "memory_rethink attached" || fail "memory_rethink missing"
output_contains "memory" && pass "memory (omni) attached" || fail "memory (omni) missing"
output_contains "open_files" && pass "open_files attached" || fail "open_files missing"
output_contains "grep_files" && pass "grep_files attached" || fail "grep_files missing"

# --- Idempotent re-apply (#221) ---
info "Re-applying same config..."
$CLI apply -f "$FIXTURES/fleet-memory-tools-test.yml" > $OUT 2>&1
output_not_contains "modified" && pass "Re-apply shows no modifications" || fail "Builtin tools incorrectly marked as modified"

# --- Apply reduced config WITHOUT memory/file tools ---
info "Applying config WITHOUT memory/file tools listed..."
$CLI apply -f "$FIXTURES/fleet-memory-tools-reduced.yml" > $OUT 2>&1

$CLI get tools --agent "$AGENT" > $OUT 2>&1
output_contains "memory_insert" && pass "memory_insert preserved" || fail "memory_insert incorrectly removed"
output_contains "memory_replace" && pass "memory_replace preserved" || fail "memory_replace incorrectly removed"
output_contains "memory_rethink" && pass "memory_rethink preserved" || fail "memory_rethink incorrectly removed"
output_contains "memory" && pass "memory (omni) preserved" || fail "memory (omni) incorrectly removed"
output_contains "conversation_search" && pass "conversation_search preserved" || fail "conversation_search incorrectly removed"
output_contains "open_files" && pass "open_files preserved" || fail "open_files incorrectly removed"
output_contains "grep_files" && pass "grep_files preserved" || fail "grep_files incorrectly removed"

# --- With --force: protected tools STILL stay ---
info "Applying config with --force..."
$CLI apply -f "$FIXTURES/fleet-memory-tools-reduced.yml" --force > $OUT 2>&1

$CLI get tools --agent "$AGENT" > $OUT 2>&1
output_contains "memory_insert" && pass "memory_insert preserved with --force" || fail "memory_insert removed with --force"
output_contains "memory_replace" && pass "memory_replace preserved with --force" || fail "memory_replace removed with --force"
output_contains "memory_rethink" && pass "memory_rethink preserved with --force" || fail "memory_rethink removed with --force"
output_contains "memory" && pass "memory (omni) preserved with --force" || fail "memory (omni) removed with --force"
output_contains "conversation_search" && pass "conversation_search preserved with --force" || fail "conversation_search removed with --force"
output_contains "open_files" && pass "open_files preserved with --force" || fail "open_files removed with --force"
output_contains "grep_files" && pass "grep_files preserved with --force" || fail "grep_files removed with --force"

delete_agent_if_exists "$AGENT"
print_summary
