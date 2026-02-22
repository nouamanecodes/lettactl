#!/bin/bash
# Test: Model/embedding provider prefix normalization (#252)
# Letta strips provider prefixes (e.g. "anthropic/claude-..." → "claude-...")
# Re-apply should detect no drift after normalization
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-62-model-drift"
section "Test: Model Drift Normalization (#252)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with provider-prefixed model
info "Creating agent with anthropic/claude-haiku model..."
$CLI apply -f "$FIXTURES/fleet-model-drift-test.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Re-apply same config — should be idempotent (0 changes)
info "Re-applying same config..."
$CLI apply -f "$FIXTURES/fleet-model-drift-test.yml" --dry-run > $OUT 2>&1
cat $OUT
output_contains "0 changes" && pass "No phantom drift on re-apply" || fail "Phantom drift detected on re-apply"
output_not_contains "model:" && pass "No model field change" || fail "Model field flagged as changed"
output_not_contains "embedding_config:" && pass "No embedding_config drift" || fail "embedding_config flagged as changed"

delete_agent_if_exists "$AGENT"
print_summary
