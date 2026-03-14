#!/bin/bash
# Test: Shared block attachment — block already exists on server but not on agent
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-79-attach"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/79-shared-attach"

section "Test: Shared Block Attachment"
preflight_check
mkdir -p "$LOG_DIR" "$FIXTURE_DIR"

# Step 1: Deploy with 2 shared blocks — creates both blocks AND attaches them
cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-79-existing
  description: Existing shared block
  limit: 2000
  value: "Existing block content."
  agent_owned: false
- name: e2e-79-later
  description: Block created now but attached later
  limit: 1500
  value: "This block exists on server."
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
  - e2e-79-later
EOF

delete_agent_if_exists "$AGENT"

$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created with 2 shared blocks" || fail "Agent not created"

# Step 2: Remove e2e-79-later from agent (simulate the bug: block exists but not attached)
# Deploy without the block in the agent's shared_blocks list, then re-add it
cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-79-existing
  description: Existing shared block
  limit: 2000
  value: "Existing block content."
  agent_owned: false
- name: e2e-79-later
  description: Block created now but attached later
  limit: 1500
  value: "This block exists on server."
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

# Apply with --force to detach the block
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message --force > $OUT 2>&1
$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_not_contains "e2e-79-later" && pass "Block detached from agent" || fail "Block still attached"

# Step 3: Re-add the block — it already exists on server, just needs attachment
cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-79-existing
  description: Existing shared block
  limit: 2000
  value: "Existing block content."
  agent_owned: false
- name: e2e-79-later
  description: Block created now but attached later
  limit: 1500
  value: "This block exists on server."
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
  - e2e-79-later
EOF

# Apply — block exists on server, should be attached to agent
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message -v > $OUT 2>&1
cat $OUT

# Step 4: Verify block is attached
$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains "e2e-79-later" && pass "Existing block re-attached" || fail "Existing block NOT re-attached"
output_contains "e2e-79-existing" && pass "Other shared block still attached" || fail "Other shared block missing"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -rf "$FIXTURE_DIR"
print_summary
