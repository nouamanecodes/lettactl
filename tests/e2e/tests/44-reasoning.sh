#!/bin/bash
# Test: Reasoning configuration for agents
# Note: reasoning is write-only in the API - we can set it but not read it back
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

section "Test: Reasoning Configuration"
preflight_check
mkdir -p "$LOG_DIR"

AGENT="e2e-44-reasoning"

# Cleanup
delete_agent_if_exists "$AGENT"

# Create agent with reasoning=false (non-default)
info "Creating agent with reasoning=false..."
cat > /tmp/fleet-reasoning.yml << 'EOF'
agents:
  - name: e2e-44-reasoning
    description: "Agent for reasoning test"
    system_prompt:
      value: "You are a helpful assistant."
    llm_config:
      model: openai/gpt-4o
      context_window: 28000
    embedding: openai/text-embedding-3-small
    reasoning: false
EOF

$CLI apply -f /tmp/fleet-reasoning.yml > $OUT 2>&1
cat $OUT
agent_exists "$AGENT" && pass "Agent with reasoning=false created" || fail "Agent not created"

# Re-apply same config - should be idempotent
# Note: Since reasoning isn't returned by API, lettactl assumes default (true)
# This means re-apply will always try to "update" to the configured value
# But the server should handle this gracefully
info "Re-applying same config..."
$CLI apply -f /tmp/fleet-reasoning.yml > $OUT 2>&1
cat $OUT
output_contains "applied" && pass "Re-apply completed" || fail "Re-apply failed"

# Test that reasoning field is accepted in YAML validation
info "Verifying reasoning field is valid in YAML..."
$CLI validate -f /tmp/fleet-reasoning.yml > $OUT 2>&1
output_contains "valid" && pass "Reasoning field accepted in validation" || fail "Reasoning field rejected"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -f /tmp/fleet-reasoning.yml

print_summary
