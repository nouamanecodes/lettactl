#!/bin/bash
# Test: --recalibrate flag on apply (#234)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-59-recalibrate"
section "Test: Recalibrate Flag"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup from previous runs
delete_agent_if_exists "$AGENT"

# Create initial config
CONFIG="$LOG_DIR/59-recalibrate.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Recalibrate test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
EOF

# 1. First deploy — create agent
$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# 2. Update config and apply with --recalibrate
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Recalibrate test agent - updated"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are an updated test assistant."
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" --recalibrate > $OUT 2>&1
output_contains "Recalibrating 1 updated agent" && pass "Recalibration triggered" || fail "Recalibration not triggered"
output_contains "Completed: 1/1" && pass "Recalibration completed" || fail "Recalibration did not complete"

# 3. Custom message with --no-wait
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Recalibrate test agent - v3"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a v3 test assistant."
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" --recalibrate --recalibrate-message "Tools updated." --no-wait > $OUT 2>&1
output_contains "not waiting for responses" && pass "No-wait mode works" || fail "No-wait message not shown"

# 4. Recalibrate-match filter (non-matching pattern should skip)
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Recalibrate test agent - v4"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a v4 test assistant."
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" --recalibrate --recalibrate-match "no-match-*" > $OUT 2>&1
! output_contains "Recalibrating" && pass "Recalibrate-match filters correctly" || fail "Should not recalibrate non-matching agents"

# Final cleanup
delete_agent_if_exists "$AGENT"
rm -f "$CONFIG"

print_summary
