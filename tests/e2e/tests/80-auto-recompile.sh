#!/bin/bash
# Test: Auto-recompile conversations when blocks change during apply
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-80-recompile"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/80-auto-recompile"

section "Test: Auto-Recompile on Block Drift"
preflight_check
mkdir -p "$LOG_DIR" "$FIXTURE_DIR"

# Step 1: Deploy agent with a shared block
cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-80-rules
  description: Rules v1
  limit: 3000
  value: "Version 1: Be helpful."
  agent_owned: false
agents:
- name: e2e-80-recompile
  description: Auto-recompile test
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Test agent.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  shared_blocks:
  - e2e-80-rules
EOF

delete_agent_if_exists "$AGENT"
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Step 2: Create a conversation so there's something to recompile
$CLI create conversation "$AGENT" > $OUT 2>&1
output_contains "Conversation ID" && pass "Conversation created" || fail "No conversation"

# Step 3: Change the block value and apply — should auto-recompile
sed -i 's/Version 1: Be helpful./Version 2: Be concise and direct./' "$FIXTURE_DIR/fleet.yml"
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
output_contains "conversation(s)" && pass "Auto-recompiled on block drift" || fail "No recompile triggered"

# Step 4: Apply again with no changes — should NOT recompile
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
output_not_contains "conversation(s)" && pass "No recompile when no drift" || fail "Spurious recompile"

# Step 5: Change block and apply with --skip-recompile
sed -i 's/Version 2: Be concise and direct./Version 3: Be thorough./' "$FIXTURE_DIR/fleet.yml"
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message --skip-recompile > $OUT 2>&1
output_not_contains "conversation(s)" && pass "Skip-recompile respected" || fail "Recompiled despite skip flag"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -rf "$FIXTURE_DIR"
print_summary
