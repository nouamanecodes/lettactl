#!/bin/bash
# Test: Shared block value sync with agent_owned: false
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-77-shared"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/77-shared-block"

section "Test: Shared Block Sync (agent_owned: false)"
preflight_check
mkdir -p "$LOG_DIR" "$FIXTURE_DIR"

cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-77-guidelines
  description: Company guidelines v1
  limit: 3000
  value: "Guidelines version 1: Be helpful."
  agent_owned: false
agents:
- name: e2e-77-shared
  description: Shared block test
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Test agent.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  shared_blocks:
  - e2e-77-guidelines
EOF

delete_agent_if_exists "$AGENT"

# Deploy with v1
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains "Guidelines version 1" && pass "Shared block v1 present" || fail "Wrong initial value"

# Update to v2
sed -i 's/Guidelines version 1: Be helpful./Guidelines version 2: Be concise./' "$FIXTURE_DIR/fleet.yml"
sed -i 's/Company guidelines v1/Company guidelines v2/' "$FIXTURE_DIR/fleet.yml"

$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" -v > $OUT 2>&1
output_contains "Syncing shared block" && pass "Shared block synced" || fail "Not synced"

$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains "Guidelines version 2" && pass "Value updated to v2" || fail "Still v1"

# Switch to agent_owned: true, change value — should NOT overwrite
sed -i 's/agent_owned: false/agent_owned: true/' "$FIXTURE_DIR/fleet.yml"
sed -i 's/Guidelines version 2: Be concise./Guidelines version 3: Should not apply./' "$FIXTURE_DIR/fleet.yml"

$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" > $OUT 2>&1
$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains "Guidelines version 2" && pass "agent_owned: true preserves value" || fail "Overwrote with v3"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -rf "$FIXTURE_DIR"
print_summary
