#!/bin/bash
# Test: conversation_search is auto-attached to all agents (#232)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-58-default-tools"
section "Test: Default tools auto-attached (#232)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create a minimal fleet with NO tools specified
cat > "$LOG_DIR/fleet-no-tools.yml" <<'YAML'
agents:
- name: e2e-58-default-tools
  description: Agent with no explicit tools
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Agent for testing default tool injection.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
YAML

# Apply — agent should get conversation_search automatically
$CLI apply -f "$LOG_DIR/fleet-no-tools.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Verify conversation_search is attached
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "conversation_search" && pass "conversation_search auto-attached" || fail "conversation_search missing"

# Re-apply — should be idempotent
$CLI apply -f "$LOG_DIR/fleet-no-tools.yml" > $OUT 2>&1
output_not_contains "modified" && pass "Re-apply is idempotent" || fail "Default tool caused modification on re-apply"

delete_agent_if_exists "$AGENT"
print_summary
