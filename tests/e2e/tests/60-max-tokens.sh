#!/bin/bash
# Test: max_tokens in llm_config (#239)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-60-max-tokens"
section "Test: max_tokens in llm_config"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# 1. Create agent with max_tokens
CONFIG="$LOG_DIR/60-max-tokens.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Max tokens test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
      max_tokens: 16384
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created with max_tokens" || fail "Agent not created"

# 2. Export and verify max_tokens round-trips
$CLI export agent "$AGENT" -f yaml > $OUT 2>&1
output_contains "max_tokens: 16384" && pass "max_tokens in export" || fail "max_tokens missing from export"

# 3. Update max_tokens — should show diff
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Max tokens test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
      max_tokens: 32768
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
output_contains "Max tokens" && pass "max_tokens change detected" || fail "max_tokens change not shown"

# Final cleanup
delete_agent_if_exists "$AGENT"
rm -f "$CONFIG"

print_summary
