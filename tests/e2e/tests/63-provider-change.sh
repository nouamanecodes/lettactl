#!/bin/bash
# Test: Model provider change detection (#255)
# Switching from anthropic/ to bedrock/ should be detected as drift
# even though the base model name is the same after normalization
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-63-provider-change"
section "Test: Provider Change Detection (#255)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with anthropic provider
info "Creating agent with anthropic/claude-haiku model..."
$CLI apply -f "$FIXTURES/fleet-provider-change-test.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Re-apply same config — should be idempotent
info "Re-applying same config (no change expected)..."
$CLI apply -f "$FIXTURES/fleet-provider-change-test.yml" --dry-run > $OUT 2>&1
cat $OUT
output_contains "0 changes" && pass "No drift on identical re-apply" || fail "Phantom drift on identical config"

# Switch to bedrock provider — should detect change
info "Switching to bedrock provider..."
$CLI apply -f "$FIXTURES/fleet-provider-change-updated.yml" --dry-run > $OUT 2>&1
cat $OUT
output_contains "model:" && pass "Provider change detected" || fail "Provider change NOT detected"

delete_agent_if_exists "$AGENT"
print_summary
