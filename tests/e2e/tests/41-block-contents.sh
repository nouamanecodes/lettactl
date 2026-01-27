#!/bin/bash
# Test: Full block content display with get blocks <agent>
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-41-block-contents"
section "Test: Block Content Display (#154)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with large memory block (5000+ chars)
info "Creating agent with 5000+ char memory block..."
$CLI apply -f "$FIXTURES/fleet-block-contents-test.yml" --root "$FIXTURES" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Full content view: get blocks <agent>
info "Testing full block content display..."
$CLI get blocks "$AGENT" --no-ux > $OUT 2>&1
output_contains "long_knowledge" && pass "Block label shown" || fail "Block label missing"
output_contains "MARKER_START_BLOCK_CONTENT" && pass "Beginning of block shown" || fail "Beginning of block missing"
output_contains "MARKER_MIDDLE_OF_CONTENT" && pass "Middle of block shown" || fail "Middle of block missing"
output_contains "MARKER_END_BLOCK_CONTENT" && pass "End of block shown" || fail "End of block missing"
output_contains "short_note" && pass "Second block shown" || fail "Second block missing"

# Short mode: get blocks <agent> --short
info "Testing --short truncation..."
$CLI get blocks "$AGENT" --short --no-ux > $OUT 2>&1
output_contains "long_knowledge" && pass "Block label shown in short mode" || fail "Block label missing in short mode"
output_contains "..." && pass "Truncation indicator present" || fail "Truncation indicator missing"
output_not_contains "MARKER_END_BLOCK_CONTENT" && pass "End marker correctly truncated" || fail "End marker should be truncated"

# JSON output still works with positional agent
info "Testing JSON output..."
$CLI get blocks "$AGENT" -o json > $OUT 2>&1
output_contains "long_knowledge" && pass "JSON output works" || fail "JSON output broken"

# Cleanup
delete_agent_if_exists "$AGENT"
print_summary
