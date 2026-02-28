#!/bin/bash
# Test: Conversations with recalibration and template mode
#
# Covers two gaps:
#   1. Agents with conversation-only changes are included in recalibration
#   2. Template mode (--match) applies conversations from the template
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-71-conv-recal"
AGENT2="e2e-71-conv-tmpl"
section "Test: Conversation Recalibration & Template Mode"
preflight_check
mkdir -p "$LOG_DIR"

count_conversations() {
    local agent_name="$1"
    local count
    count=$($CLI get conversations "$agent_name" -o json 2>/dev/null | grep -c '"summary"') || true
    echo "${count:-0}"
}

# Cleanup
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$AGENT2"

CONFIG="$LOG_DIR/71-conv-recal.yml"
TEMPLATE="$LOG_DIR/71-conv-template.yml"

# ============================================================================
# Phase 1: Deploy agent WITHOUT conversations, then add conversations only
# This tests that conversation-only changes trigger an update (not skipped)
# ============================================================================
section "Phase 1: Conversation-only change detection"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Recalibration test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    embedding: "openai/text-embedding-3-small"
    system_prompt:
      value: "You are a test agent."
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created without conversations" || fail "Agent not created"

COUNT=$(count_conversations "$AGENT")
[[ "$COUNT" -eq 0 ]] && pass "No conversations initially" || fail "Expected 0 conversations, got $COUNT"

# Now add conversations to the YAML and re-apply
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Recalibration test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    embedding: "openai/text-embedding-3-small"
    system_prompt:
      value: "You are a test agent."
    conversations:
      - summary: "Ticket Alpha"
      - summary: "Ticket Beta"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
# The agent should NOT be skipped — conversations are a real change
output_not_contains "already up to date" && pass "Agent not skipped (conversation change detected)" || fail "Agent incorrectly skipped"

COUNT=$(count_conversations "$AGENT")
[[ "$COUNT" -eq 2 ]] && pass "2 conversations created on update" || fail "Expected 2 conversations, got $COUNT"

# ============================================================================
# Phase 2: Recalibration includes agents with conversation-only changes
# ============================================================================
section "Phase 2: Recalibration with conversation-only changes"

# Add a third conversation and apply with --recalibrate
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Recalibration test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    embedding: "openai/text-embedding-3-small"
    system_prompt:
      value: "You are a test agent."
    conversations:
      - summary: "Ticket Alpha"
      - summary: "Ticket Beta"
      - summary: "Ticket Gamma"
EOF

$CLI apply -f "$CONFIG" --recalibrate --no-wait > $OUT 2>&1
output_not_contains "already up to date" && pass "Agent updated with new conversation" || fail "Agent skipped on conversation add"
output_contains "ecalibrat" && pass "Recalibration triggered" || fail "Recalibration not triggered for conversation-only change"

COUNT=$(count_conversations "$AGENT")
[[ "$COUNT" -eq 3 ]] && pass "3 conversations after recalibration apply" || fail "Expected 3 conversations, got $COUNT"

# ============================================================================
# Phase 3: Template mode applies conversations to matching agents
# ============================================================================
section "Phase 3: Template mode with conversations"

# Create a second agent without conversations
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT2
    description: "Template target"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    embedding: "openai/text-embedding-3-small"
    system_prompt:
      value: "You are a template target."
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT2" && pass "Template target agent created" || fail "Template target not created"

COUNT=$(count_conversations "$AGENT2")
[[ "$COUNT" -eq 0 ]] && pass "Template target has no conversations" || fail "Expected 0 conversations, got $COUNT"

# Apply template with conversations to matching agents
cat > "$TEMPLATE" << EOF
agents:
  - name: template
    description: "Template with conversations"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    embedding: "openai/text-embedding-3-small"
    system_prompt:
      value: "You are a template target."
    conversations:
      - summary: "Template Conv A"
      - summary: "Template Conv B"
EOF

$CLI apply -f "$TEMPLATE" --match "e2e-71-conv-tmpl" > $OUT 2>&1

COUNT=$(count_conversations "$AGENT2")
[[ "$COUNT" -eq 2 ]] && pass "Template conversations applied to target" || fail "Expected 2 conversations from template, got $COUNT"

# Re-apply template — should be idempotent
$CLI apply -f "$TEMPLATE" --match "e2e-71-conv-tmpl" > $OUT 2>&1

COUNT=$(count_conversations "$AGENT2")
[[ "$COUNT" -eq 2 ]] && pass "Template re-apply idempotent" || fail "Expected 2 conversations after re-apply, got $COUNT"

# ============================================================================
# Cleanup
# ============================================================================
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$AGENT2"

print_summary
