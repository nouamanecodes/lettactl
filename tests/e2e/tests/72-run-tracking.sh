#!/bin/bash
# Test: Run tracking — watch mode and track command (#283)
#
# Verifies:
#   1. Deploy two test agents
#   2. Send async messages (--no-wait) to both agents
#   3. get runs shows runs in table format
#   4. track command monitors runs to completion
#   5. Exit code 0 when all runs succeed
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT1="e2e-72-track-a"
AGENT2="e2e-72-track-b"
section "Test: Run Tracking"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup from previous runs
delete_agent_if_exists "$AGENT1"
delete_agent_if_exists "$AGENT2"

# --- Step 1: Deploy two agents ---
CONFIG="$LOG_DIR/72-run-tracking.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT1
    description: "Run tracking test agent A"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant. Reply with exactly one word: OK"
    embedding: "openai/text-embedding-3-small"
  - name: $AGENT2
    description: "Run tracking test agent B"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant. Reply with exactly one word: OK"
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT1" && pass "Agent A created" || fail "Agent A not created"
agent_exists "$AGENT2" && pass "Agent B created" || fail "Agent B not created"

# --- Step 2: Send async messages (--no-wait) ---
$CLI send "$AGENT1" "Say OK" --no-wait > $OUT 2>&1
grep -a "Run ID:" "$OUT" > /dev/null && pass "Agent A async send returned run ID" || fail "Agent A async send missing run ID"
RUN_ID1=$(grep -a "Run ID:" "$OUT" | grep -ao '[a-z0-9-]\{20,\}' | head -1)

$CLI send "$AGENT2" "Say OK" --no-wait > $OUT 2>&1
grep -a "Run ID:" "$OUT" > /dev/null && pass "Agent B async send returned run ID" || fail "Agent B async send missing run ID"
RUN_ID2=$(grep -a "Run ID:" "$OUT" | grep -ao '[a-z0-9-]\{20,\}' | head -1)

if [ -z "$RUN_ID1" ] || [ -z "$RUN_ID2" ]; then
    fail "Could not extract run IDs — skipping track tests"
    delete_agent_if_exists "$AGENT1"
    delete_agent_if_exists "$AGENT2"
    rm -f "$CONFIG"
    print_summary
    exit 1
fi

info "Run ID 1: $RUN_ID1"
info "Run ID 2: $RUN_ID2"

# --- Step 3: get runs shows table output ---
$CLI get runs --no-ux > $OUT 2>&1
grep -a "ID" "$OUT" > /dev/null && grep -a "AGENT" "$OUT" > /dev/null && grep -a "STATUS" "$OUT" > /dev/null && pass "get runs shows table headers" || fail "get runs missing table headers"

# --- Step 4: track command monitors runs to completion ---
$CLI track "$RUN_ID1" "$RUN_ID2" --no-ux > $OUT 2>&1
grep -a "completed" "$OUT" > /dev/null && pass "track shows completed status" || fail "track missing completed status"
grep -a "All 2 run(s) completed" "$OUT" > /dev/null && pass "track reports all runs completed" || fail "track missing completion summary"

# --- Step 5: Verify exit code ---
# track already exited 0 above (set -e would have failed otherwise)
pass "track exits with code 0 on success"

# --- Cleanup ---
delete_agent_if_exists "$AGENT1"
delete_agent_if_exists "$AGENT2"
rm -f "$CONFIG"

print_summary
