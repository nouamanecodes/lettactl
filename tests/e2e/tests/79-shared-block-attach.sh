#!/bin/bash
# Test: Shared block attachment — new shared block gets attached to existing agent
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-79-attach"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/79-shared-attach"

section "Test: Shared Block Attachment"
preflight_check
mkdir -p "$LOG_DIR" "$FIXTURE_DIR"

# Step 1: Deploy agent with 1 shared block
cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-79-existing
  description: Existing shared block
  limit: 2000
  value: "Existing block content."
  agent_owned: false
agents:
- name: e2e-79-attach
  description: Shared block attach test
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Test agent.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  shared_blocks:
  - e2e-79-existing
EOF

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created with 1 shared block" || fail "Agent not created"

# Step 2: Add a NEW shared block to the YAML
cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-79-existing
  description: Existing shared block
  limit: 2000
  value: "Existing block content."
  agent_owned: false
- name: e2e-79-new
  description: New shared block to attach
  limit: 1500
  value: "New block content that should be attached."
  agent_owned: false
agents:
- name: e2e-79-attach
  description: Shared block attach test
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Test agent.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  shared_blocks:
  - e2e-79-existing
  - e2e-79-new
EOF

# Step 3: Apply — should attach the new shared block
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message -v > $OUT 2>&1
cat $OUT

# Step 4: Verify new block is attached
$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains "e2e-79-new" && pass "New shared block attached" || fail "New shared block NOT attached"
output_contains "e2e-79-existing" && pass "Existing shared block still attached" || fail "Existing shared block missing"

# Step 5: Run apply again — should be idempotent
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
output_not_contains "Attaching shared block" && pass "Idempotent on re-apply" || fail "Re-attached on second apply"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -rf "$FIXTURE_DIR"
print_summary
