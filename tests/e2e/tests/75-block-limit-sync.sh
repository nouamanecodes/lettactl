#!/bin/bash
# Test: Block limit auto-sync for agent_owned: false blocks
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-75-block-limit"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/75-block-limit"

section "Test: Block Limit Auto-Sync"
preflight_check
mkdir -p "$LOG_DIR" "$FIXTURE_DIR"

# Create initial fixture with limit 2000
cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
agents:
- name: e2e-75-block-limit
  description: Block limit sync test
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Agent for block limit test.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  memory_blocks:
  - name: policies
    description: Synced policies
    limit: 2000
    value: "Short initial policy content."
    agent_owned: false
EOF

delete_agent_if_exists "$AGENT"

# Step 1: Create agent with limit 2000
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created with initial limit" || fail "Agent not created"

# Verify initial block
$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains '"limit": 2000' && pass "Initial limit is 2000" || fail "Initial limit wrong"

# Step 2: Update fixture with larger limit and longer value
cat > "$FIXTURE_DIR/fleet-updated.yml" <<'EOF'
agents:
- name: e2e-75-block-limit
  description: Block limit sync test
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Agent for block limit test.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  memory_blocks:
  - name: policies
    description: Updated synced policies
    limit: 5000
    value: "This is a much longer policy document that would exceed the original 2000 character limit. It contains detailed guidelines, procedures, and rules that the agent must follow. Section 1: Communication Guidelines - Always be professional and courteous. Section 2: Data Handling - Never share sensitive information. Section 3: Escalation Procedures - When in doubt, escalate to a human supervisor."
    agent_owned: false
EOF

# Step 3: Dry run — should detect limit and value drift
$CLI apply -f "$FIXTURE_DIR/fleet-updated.yml" --root "$FIXTURE_DIR" --dry-run > $OUT 2>&1
output_contains "Block" && pass "Dry run detects block drift" || fail "Dry run missed block drift"
output_contains "limit" && pass "Dry run shows limit change" || fail "Dry run missed limit change"
output_contains "5000" && pass "Dry run shows new limit value" || fail "Dry run missing new limit"

# Step 4: Apply the update
$CLI apply -f "$FIXTURE_DIR/fleet-updated.yml" --root "$FIXTURE_DIR" > $OUT 2>&1
output_contains "e2e-75-block-limit" && pass "Apply succeeded" || fail "Apply failed"

# Step 5: Verify limit was updated
$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains '"limit": 5000' && pass "Limit updated to 5000" || fail "Limit not updated"

# Step 6: Verify value was updated
output_contains "much longer policy" && pass "Value updated" || fail "Value not updated"

# Step 7: Verify description was updated
output_contains "Updated synced policies" && pass "Description updated" || fail "Description not updated"

# Step 8: Re-apply should be no-op (no drift)
$CLI apply -f "$FIXTURE_DIR/fleet-updated.yml" --root "$FIXTURE_DIR" --dry-run > $OUT 2>&1
output_not_contains "Block [~]" && pass "No drift after apply" || fail "Unexpected drift after apply"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -rf "$FIXTURE_DIR"
print_summary
