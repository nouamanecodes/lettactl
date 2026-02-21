#!/bin/bash
# Test: Tools declared on one agent must NOT leak to another agent (#242)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-61-agent-a"
AGENT_B="e2e-61-agent-b"
section "Test: Tool isolation across multi-agent fleet (#242)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# Fleet with two agents, each with distinct tools
cat > "$LOG_DIR/fleet-tool-isolation.yml" <<'YAML'
agents:
- name: e2e-61-agent-a
  description: Agent A - has look_around and wave_at
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Agent A for tool isolation test.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  tools:
    - look_around
    - wave_at

- name: e2e-61-agent-b
  description: Agent B - has wander and start_conversation
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Agent B for tool isolation test.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  tools:
    - wander
    - start_conversation
YAML

$CLI apply -f "$LOG_DIR/fleet-tool-isolation.yml" --root "$FIXTURES" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Agent A created" || fail "Agent A not created"
agent_exists "$AGENT_B" && pass "Agent B created" || fail "Agent B not created"

# Check Agent A has its own tools
$CLI get tools --agent "$AGENT_A" > $OUT 2>&1
output_contains "look_around"  && pass "Agent A has look_around"  || fail "Agent A missing look_around"
output_contains "wave_at"      && pass "Agent A has wave_at"      || fail "Agent A missing wave_at"

# Check Agent A does NOT have Agent B's tools
output_not_contains "wander"             && pass "Agent A does NOT have wander"             || fail "Agent A has wander (leaked)"
output_not_contains "start_conversation" && pass "Agent A does NOT have start_conversation" || fail "Agent A has start_conversation (leaked)"

# Check Agent B has its own tools
$CLI get tools --agent "$AGENT_B" > $OUT 2>&1
output_contains "wander"             && pass "Agent B has wander"             || fail "Agent B missing wander"
output_contains "start_conversation" && pass "Agent B has start_conversation" || fail "Agent B missing start_conversation"

# Check Agent B does NOT have Agent A's tools
output_not_contains "look_around" && pass "Agent B does NOT have look_around" || fail "Agent B has look_around (leaked)"
output_not_contains "wave_at"     && pass "Agent B does NOT have wave_at"     || fail "Agent B has wave_at (leaked)"

delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
print_summary
