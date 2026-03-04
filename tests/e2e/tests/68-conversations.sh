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

# --- Cleanup ---
rm -f "$CONFIG"

print_summary
