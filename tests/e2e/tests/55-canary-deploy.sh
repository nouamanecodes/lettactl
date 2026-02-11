#!/bin/bash
# Test: Canary deployment workflow (#226)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-55-canary"
CANARY="CANARY-e2e-55-canary"
section "Test: Canary Deployment"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup from previous runs
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$CANARY"

# Create config
CONFIG="$LOG_DIR/55-canary.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Canary test agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant."
    embedding: "openai/text-embedding-3-small"
EOF

# 1. Deploy canary — should create CANARY- prefixed agent, not production
$CLI apply -f "$CONFIG" --canary > $OUT 2>&1
agent_exists "$CANARY" && pass "Canary agent created" || fail "Canary agent not created"
# Check production doesn't exist (grep -v CANARY to exclude canary match)
! ($CLI get agents 2>/dev/null | grep -v "CANARY" | grep -q "$AGENT") && pass "Production not touched" || fail "Production should not exist"

# 2. Idempotent re-apply — should update, not duplicate
$CLI apply -f "$CONFIG" --canary > $OUT 2>&1
COUNT=$($CLI get agents 2>/dev/null | grep -c "$CANARY" || true)
[ "$COUNT" -eq 1 ] && pass "Canary idempotent" || fail "Expected 1 canary, found $COUNT"

# 3. Get agents --canary should show canary
$CLI get agents --canary > $OUT 2>&1
output_contains "$CANARY" && pass "Canary visible with --canary filter" || fail "Canary not in filtered list"

# 4. Promote — deploy to production names
$CLI apply -f "$CONFIG" --canary --promote > $OUT 2>&1
agent_exists "$AGENT" && pass "Production created via promote" || fail "Production not created"

# 5. Cleanup canary
$CLI apply -f "$CONFIG" --canary --cleanup > $OUT 2>&1
! agent_exists "$CANARY" && pass "Canary cleaned up" || fail "Canary should be deleted"
agent_exists "$AGENT" && pass "Production preserved after cleanup" || fail "Production should still exist"

# Final cleanup
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$CANARY"
rm -f "$CONFIG"

print_summary
