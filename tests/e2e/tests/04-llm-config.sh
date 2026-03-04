#!/bin/bash
# Test: LLM config — large context window and max_tokens
# Merged from: 04-large-context, 60-max-tokens
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-04-large-context"
AGENT_B="e2e-60-max-tokens"

section "Test: LLM Config"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# --- Large context window ---
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Large-context agent created" || fail "Agent not created"

$CLI describe agent "$AGENT_A" > $OUT 2>&1
output_contains "200000" && pass "Context window 200000" || fail "Wrong context window"

$CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --agent "$AGENT_A" > $OUT 2>&1
$CLI describe agent "$AGENT_A" > $OUT 2>&1
output_contains "180000" && pass "Context updated to 180000" || fail "Context not updated"

# --- max_tokens ---
CONFIG="$LOG_DIR/04-max-tokens.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT_B
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
agent_exists "$AGENT_B" && pass "Max-tokens agent created" || fail "Agent not created"

$CLI export agent "$AGENT_B" -f yaml > $OUT 2>&1
output_contains "max_tokens: 16384" && pass "max_tokens in export" || fail "max_tokens missing from export"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT_B
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

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
rm -f "$CONFIG"
print_summary
