#!/bin/bash
# Test: Model normalization — drift detection and provider change
# Merged from: 62-model-drift, 63-provider-change
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-62-model-drift"
AGENT_B="e2e-63-provider-change"

section "Test: Model Normalization (#252, #255)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# --- Model drift normalization (#252) ---
info "Creating agent with anthropic/claude-haiku model..."
$CLI apply -f "$FIXTURES/fleet-model-drift-test.yml" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Model-drift agent created" || fail "Agent not created"

info "Re-applying same config..."
$CLI apply -f "$FIXTURES/fleet-model-drift-test.yml" --dry-run > $OUT 2>&1
cat $OUT
output_contains "0 changes" && pass "No phantom drift on re-apply" || fail "Phantom drift detected on re-apply"
output_not_contains "model:" && pass "No model field change" || fail "Model field flagged as changed"
output_not_contains "embedding_config:" && pass "No embedding_config drift" || fail "embedding_config flagged as changed"

# --- Provider change detection (#255) ---
info "Creating agent with anthropic/claude-haiku model..."
$CLI apply -f "$FIXTURES/fleet-provider-change-test.yml" > $OUT 2>&1
agent_exists "$AGENT_B" && pass "Provider-change agent created" || fail "Agent not created"

info "Re-applying same config (no change expected)..."
$CLI apply -f "$FIXTURES/fleet-provider-change-test.yml" --dry-run > $OUT 2>&1
cat $OUT
output_contains "0 changes" && pass "No drift on identical re-apply" || fail "Phantom drift on identical config"

info "Switching to bedrock provider..."
$CLI apply -f "$FIXTURES/fleet-provider-change-updated.yml" --dry-run > $OUT 2>&1
cat $OUT
output_contains "model:" && pass "Provider change detected" || fail "Provider change NOT detected"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
print_summary
