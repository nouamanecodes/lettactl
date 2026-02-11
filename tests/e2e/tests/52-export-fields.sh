#!/bin/bash
# Test: YAML export includes tags, reasoning, agent_owned (#223, #224)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-52-export-fields"
section "Test: Export YAML completeness"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with tags and reasoning
CONFIG="$LOG_DIR/52-config.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Export field test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    reasoning: true
    tags:
      - "tenant:acme"
      - "role:test"
    memory_blocks:
      - name: notes
        description: "Test notes"
        limit: 2000
        agent_owned: true
        value: "Some test notes"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Export and check tags + reasoning
EXPORT="$LOG_DIR/52-export.yml"
$CLI export agent "$AGENT" -f yaml -o "$EXPORT" > $OUT 2>&1
grep -q "tenant:acme" "$EXPORT" && pass "Export includes tags" || fail "Tags missing from export"
grep -q "reasoning: true" "$EXPORT" && pass "Export includes reasoning" || fail "Reasoning missing from export"
grep -q "agent_owned: true" "$EXPORT" && pass "Export includes agent_owned" || fail "agent_owned missing from export"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -f "$CONFIG" "$EXPORT"

print_summary
