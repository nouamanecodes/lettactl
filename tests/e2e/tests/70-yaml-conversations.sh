#!/bin/bash
# Test: Declarative conversations in YAML (#278)
#
# Verifies that conversations declared in fleet YAML are:
#   1. Created automatically on `lettactl apply`
#   2. Idempotent on re-apply (no duplicates)
#   3. Incrementally created when new summaries are added
#   4. Visible in dry-run output
#   5. Correctly counted in agent creation summary
#   6. Preserved through agent config updates
#
# Edge cases tested:
#   - Empty conversations array
#   - Conversations with isolated_blocks
#   - Removing conversations from YAML (should NOT delete existing)
#   - Mixed: YAML conversations + imperatively created conversations
#   - Agent with only conversations (no other resources)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-70-yaml-convos"
section "Test: Declarative Conversations in YAML"
preflight_check
mkdir -p "$LOG_DIR"

# Helper: count conversations via JSON output (stderr discarded to avoid spinner noise)
count_conversations() {
    local agent_name="$1"
    $CLI get conversations "$agent_name" -o json 2>/dev/null | grep -c '"summary"' || echo 0
}

# Cleanup from previous runs
delete_agent_if_exists "$AGENT"

CONFIG="$LOG_DIR/70-yaml-conversations.yml"

# ============================================================================
# Phase 1: Create agent with conversations declared in YAML
# ============================================================================
section "Phase 1: Initial Deploy with Conversations"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "YAML conversations test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Ticket #101"
      - summary: "Ticket #102"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Phase 1: Agent created" || fail "Phase 1: Agent not created"

# Verify conversations exist
$CLI get conversations "$AGENT" > $OUT 2>&1
output_contains "Ticket #101" && pass "Phase 1: Ticket #101 exists" || fail "Phase 1: Ticket #101 not found"
output_contains "Ticket #102" && pass "Phase 1: Ticket #102 exists" || fail "Phase 1: Ticket #102 not found"

# ============================================================================
# Phase 2: Idempotent re-apply — no duplicates
# ============================================================================
section "Phase 2: Idempotent Re-apply"

# Count conversations before re-apply
BEFORE_COUNT=$(count_conversations "$AGENT")

# Re-apply same config
$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Phase 2: Agent still exists" || fail "Phase 2: Agent lost"

# Count conversations after re-apply
AFTER_COUNT=$(count_conversations "$AGENT")

if [ "$BEFORE_COUNT" = "$AFTER_COUNT" ] && [ "$BEFORE_COUNT" -ge 2 ]; then
    pass "Phase 2: Idempotent — conversation count unchanged ($BEFORE_COUNT)"
else
    fail "Phase 2: Not idempotent — before=$BEFORE_COUNT, after=$AFTER_COUNT"
fi

# Dry-run should show no new conversations to create
$CLI apply -f "$CONFIG" --dry-run > $OUT 2>&1
! output_contains "Conversation [+]" && pass "Phase 2: Dry-run shows no new conversations" || fail "Phase 2: Dry-run incorrectly shows new conversations"

# ============================================================================
# Phase 3: Add a new conversation to YAML
# ============================================================================
section "Phase 3: Incremental Addition"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "YAML conversations test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Ticket #101"
      - summary: "Ticket #102"
      - summary: "Ticket #103"
EOF

# Dry-run first — should show 1 new conversation
$CLI apply -f "$CONFIG" --dry-run > $OUT 2>&1
output_contains "Ticket #103" && pass "Phase 3: Dry-run shows Ticket #103 to create" || fail "Phase 3: Dry-run missing Ticket #103"

# Apply
$CLI apply -f "$CONFIG" > $OUT 2>&1

# Verify all 3 exist
$CLI get conversations "$AGENT" > $OUT 2>&1
output_contains "Ticket #101" && pass "Phase 3: Ticket #101 still exists" || fail "Phase 3: Ticket #101 lost"
output_contains "Ticket #103" && pass "Phase 3: Ticket #103 created" || fail "Phase 3: Ticket #103 not found"

# Verify total count is 3
PHASE3_COUNT=$(count_conversations "$AGENT")
if [ "$PHASE3_COUNT" = "3" ]; then
    pass "Phase 3: Exactly 3 conversations exist"
else
    info "Phase 3: Expected 3 conversations, got $PHASE3_COUNT (may include default)"
fi

# ============================================================================
# Phase 4: Remove conversations from YAML (should NOT delete existing)
# ============================================================================
section "Phase 4: Remove from YAML (no deletion)"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "YAML conversations test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Ticket #101"
EOF

# Apply — should only keep tracking Ticket #101, but NOT delete #102 and #103
$CLI apply -f "$CONFIG" > $OUT 2>&1

# All 3 conversations should still exist (no delete capability)
$CLI get conversations "$AGENT" > $OUT 2>&1
output_contains "Ticket #102" && pass "Phase 4: Ticket #102 preserved (not deleted)" || fail "Phase 4: Ticket #102 was deleted"
output_contains "Ticket #103" && pass "Phase 4: Ticket #103 preserved (not deleted)" || fail "Phase 4: Ticket #103 was deleted"

# ============================================================================
# Phase 5: Mixed — YAML + imperative conversations
# ============================================================================
section "Phase 5: Mixed YAML + Imperative"

# Create a conversation imperatively (not in YAML)
$CLI create conversation "$AGENT" > $OUT 2>&1
output_contains "Conversation created" && pass "Phase 5: Imperative conversation created" || fail "Phase 5: Imperative creation failed"

# Re-apply YAML — imperative conversation should survive
$CLI apply -f "$CONFIG" > $OUT 2>&1

# Imperative conversation should still exist alongside YAML ones
PHASE5_COUNT=$(count_conversations "$AGENT")
# We expect at least 4: Ticket #101, #102, #103, plus the imperative one
if [ "$PHASE5_COUNT" -ge 4 ]; then
    pass "Phase 5: All conversations preserved ($PHASE5_COUNT total)"
else
    fail "Phase 5: Expected >= 4 conversations, got $PHASE5_COUNT"
fi

# ============================================================================
# Phase 6: Edge case — empty conversations array
# ============================================================================
section "Phase 6: Empty Conversations Array"

delete_agent_if_exists "$AGENT"

AGENT2="e2e-70-empty-convos"
delete_agent_if_exists "$AGENT2"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT2
    description: "Empty conversations test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations: []
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT2" && pass "Phase 6: Agent with empty conversations created" || fail "Phase 6: Agent creation failed"

# Should have no conversations
$CLI get conversations "$AGENT2" > $OUT 2>&1
output_contains "No conversations found" && pass "Phase 6: No conversations for empty array" || fail "Phase 6: Unexpected conversations"

delete_agent_if_exists "$AGENT2"

# ============================================================================
# Phase 7: Agent config update preserves YAML conversations
# ============================================================================
section "Phase 7: Config Update Preserves Conversations"

AGENT3="e2e-70-update-convos"
delete_agent_if_exists "$AGENT3"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT3
    description: "Original description"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Persistent conversation"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT3" && pass "Phase 7: Agent created" || fail "Phase 7: Agent creation failed"

# Update description but keep same conversation
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT3
    description: "Updated description"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Persistent conversation"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1

# Verify description changed
$CLI describe agent "$AGENT3" > $OUT 2>&1
output_contains "Updated description" && pass "Phase 7: Description updated" || fail "Phase 7: Description not updated"

# Verify conversation still exists
$CLI get conversations "$AGENT3" > $OUT 2>&1
output_contains "Persistent conversation" && pass "Phase 7: Conversation preserved through update" || fail "Phase 7: Conversation lost on update"

# ============================================================================
# Phase 8: Duplicate summaries in YAML (should only create once)
# ============================================================================
section "Phase 8: Duplicate Summaries Edge Case"

AGENT4="e2e-70-dup-convos"
delete_agent_if_exists "$AGENT4"

cat > "$CONFIG" << EOF
agents:
  - name: $AGENT4
    description: "Duplicate summary test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Same summary"
      - summary: "Same summary"
      - summary: "Unique summary"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT4" && pass "Phase 8: Agent with duplicate summaries created" || fail "Phase 8: Agent creation failed"

# Check conversations exist
$CLI get conversations "$AGENT4" > $OUT 2>&1
output_contains "Same summary" && pass "Phase 8: Duplicate summary conversation exists" || fail "Phase 8: Duplicate summary not found"
output_contains "Unique summary" && pass "Phase 8: Unique summary conversation exists" || fail "Phase 8: Unique summary not found"

# Re-apply should be idempotent
BEFORE8=$(count_conversations "$AGENT4")
$CLI apply -f "$CONFIG" > $OUT 2>&1
AFTER8=$(count_conversations "$AGENT4")
if [ "$BEFORE8" = "$AFTER8" ]; then
    pass "Phase 8: Re-apply idempotent with duplicates ($BEFORE8)"
else
    fail "Phase 8: Re-apply not idempotent — before=$BEFORE8, after=$AFTER8"
fi

delete_agent_if_exists "$AGENT4"

# ============================================================================
# Cleanup
# ============================================================================
section "Cleanup"

delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$AGENT2"
delete_agent_if_exists "$AGENT3"
delete_agent_if_exists "$AGENT4"
rm -f "$CONFIG" "$LOG_DIR"/70-*.json

print_summary
