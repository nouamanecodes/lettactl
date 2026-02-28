#!/bin/bash
# Test: Conversation lifecycle — create, send, list, describe, compact, delete (#276)
#
# Verifies:
#   1. Create agent via YAML apply
#   2. No conversations exist initially (get conversations shows hint)
#   3. Create conversation via CLI
#   4. Send message within conversation
#   5. List conversations shows the new conversation
#   6. Get messages --conversation-id returns conversation messages
#   7. Describe conversation shows details
#   8. Compact conversation messages works
#   9. Delete conversation removes it
#  10. Delete agent cascades conversation cleanup
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-68-conversations"
section "Test: Conversation Lifecycle"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup from previous runs
delete_agent_if_exists "$AGENT"

# --- Step 1: Deploy agent via YAML ---
CONFIG="$LOG_DIR/68-conversations.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Conversation lifecycle test agent"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant. Keep responses extremely brief — one sentence max."
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created via YAML" || fail "Agent not created"

# --- Step 2: No conversations initially ---
$CLI get conversations "$AGENT" > $OUT 2>&1
output_contains "No conversations found" && pass "No conversations initially" || fail "Expected no conversations"
output_contains "lettactl create conversation" && pass "Hint shown to create conversation" || fail "Missing creation hint"

# --- Step 3: Create conversation via CLI ---
$CLI create conversation "$AGENT" > $OUT 2>&1
output_contains "Conversation created" && pass "Conversation created" || fail "Conversation creation failed"
output_contains "Conversation ID:" && pass "Conversation ID returned" || fail "No conversation ID in output"

# Extract conversation ID
CONV_ID=$(grep "Conversation ID:" "$OUT" | awk '{print $NF}')
if [ -n "$CONV_ID" ]; then
    pass "Extracted conversation ID: ${CONV_ID:0:12}..."
else
    fail "Could not extract conversation ID"
    # Cannot continue without ID
    delete_agent_if_exists "$AGENT"
    rm -f "$CONFIG"
    print_summary
    exit 1
fi

# --- Step 4: Send message within conversation ---
$CLI send "$AGENT" "Say hello briefly." --conversation-id "$CONV_ID" > $OUT 2>&1
output_contains "Streaming response" && pass "Conversation message sent (streaming)" || fail "Conversation message send failed"

# --- Step 5: List conversations shows the conversation ---
$CLI get conversations "$AGENT" > $OUT 2>&1
output_contains "$CONV_ID" || output_contains "${CONV_ID:0:12}" && pass "Conversation appears in list" || fail "Conversation not in list"

# --- Step 6: Get messages via --conversation-id ---
$CLI get messages "$AGENT" --conversation-id "$CONV_ID" > $OUT 2>&1
# Should contain the user message or assistant response
output_contains "hello" || output_contains "Hello" || output_contains "user_message" && pass "Conversation messages returned" || fail "No messages from conversation"

# --- Step 7: Describe conversation ---
$CLI describe conversation "$CONV_ID" > $OUT 2>&1
output_contains "$CONV_ID" && pass "Describe shows conversation ID" || fail "Describe missing conversation ID"

# --- Step 8: Compact conversation messages ---
$CLI compact-messages "$AGENT" --conversation-id "$CONV_ID" > $OUT 2>&1
output_contains "compacted" && pass "Conversation compacted" || fail "Conversation compaction failed"

# --- Step 9: Delete conversation not supported ---
# The Letta API does not support deleting individual conversations.
# Conversations are cascade-deleted when the agent is deleted.
$CLI delete conversation "$CONV_ID" > $OUT 2>&1 || true
output_contains "does not support" && pass "Delete conversation shows unsupported message" || fail "Delete conversation should show unsupported message"

# --- Step 10: Cascade cleanup — delete agent removes conversations ---
$CLI delete agent "$AGENT" --force > $OUT 2>&1
output_contains "deleted successfully" && pass "Agent deleted (cascade)" || fail "Agent cascade delete failed"

# Agent should be gone
! agent_exists "$AGENT" && pass "Agent fully removed" || fail "Agent still exists after delete"

# === Phase 2: YAML-declared conversations ===
section "Test: YAML-Declared Conversations"

AGENT2="e2e-68-yaml-conversations"
delete_agent_if_exists "$AGENT2"

# --- Step 11: Deploy agent with conversations declared in YAML ---
CONFIG2="$LOG_DIR/68-yaml-conversations.yml"
cat > "$CONFIG2" << EOF
agents:
  - name: $AGENT2
    description: "YAML conversation test agent"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Test conversation A"
      - summary: "Test conversation B"
EOF

$CLI apply -f "$CONFIG2" > $OUT 2>&1
agent_exists "$AGENT2" && pass "Agent with YAML conversations created" || fail "Agent with YAML conversations not created"
output_contains "2 conversations" && pass "Creation summary shows conversation count" || fail "Missing conversation count in creation summary"

# --- Step 12: Verify conversations exist ---
$CLI get conversations "$AGENT2" > $OUT 2>&1
output_contains "Test conversation A" && pass "YAML conversation A exists" || fail "YAML conversation A not found"
output_contains "Test conversation B" && pass "YAML conversation B exists" || fail "YAML conversation B not found"

# --- Step 13: Re-apply should be idempotent ---
$CLI apply -f "$CONFIG2" --dry-run > $OUT 2>&1
# Should show unchanged or 0 conversation changes (no new conversations to create)
! output_contains "Conversation [+]" && pass "Re-apply is idempotent (no new conversations)" || fail "Re-apply incorrectly shows new conversations"

# --- Step 14: Add a new conversation and re-apply ---
cat > "$CONFIG2" << EOF
agents:
  - name: $AGENT2
    description: "YAML conversation test agent"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
    conversations:
      - summary: "Test conversation A"
      - summary: "Test conversation B"
      - summary: "Test conversation C"
EOF

$CLI apply -f "$CONFIG2" > $OUT 2>&1
$CLI get conversations "$AGENT2" > $OUT 2>&1
output_contains "Test conversation C" && pass "New YAML conversation C created on re-apply" || fail "YAML conversation C not found after re-apply"

# --- Cleanup ---
$CLI delete agent "$AGENT2" --force > $OUT 2>&1 || true
rm -f "$CONFIG" "$CONFIG2"

print_summary
