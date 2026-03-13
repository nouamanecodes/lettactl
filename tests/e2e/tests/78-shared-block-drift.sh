#!/bin/bash
# Test: Dry-run detects value drift on shared blocks with agent_owned: false
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-78-drift"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/78-shared-drift"

section "Test: Shared Block Value Drift Detection"
preflight_check
mkdir -p "$LOG_DIR" "$FIXTURE_DIR"

cat > "$FIXTURE_DIR/fleet.yml" <<'EOF'
shared_blocks:
- name: e2e-78-rules
  description: Rules v1
  limit: 3000
  value: "Version 1: Be helpful and concise."
  agent_owned: false
agents:
- name: e2e-78-drift
  description: Shared block drift test
  embedding: openai/text-embedding-3-small
  system_prompt:
    value: Test agent.
  llm_config:
    model: google_ai/gemini-2.5-pro
    context_window: 32000
  shared_blocks:
  - e2e-78-rules
EOF

delete_agent_if_exists "$AGENT"

# Deploy v1
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Update value in YAML
sed -i 's/Version 1: Be helpful and concise./Version 2: Be detailed and thorough./' "$FIXTURE_DIR/fleet.yml"

# Dry-run should detect drift
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --dry-run --skip-first-message -v > $OUT 2>&1
output_contains "sync value" && pass "Dry-run detects shared block value drift" || fail "Drift not detected"
output_not_contains "No changes needed" && pass "Not reported as no changes" || fail "Falsely reported no changes"

# Apply the change
$CLI apply -f "$FIXTURE_DIR/fleet.yml" --root "$FIXTURE_DIR" --skip-first-message > $OUT 2>&1
output_contains "$AGENT" && pass "Apply completed" || fail "Apply failed"

# Verify value updated
$CLI describe agent "$AGENT" -o json > $OUT 2>&1
output_contains "Version 2" && pass "Value updated to v2" || fail "Still v1"

# Cleanup
delete_agent_if_exists "$AGENT"
rm -rf "$FIXTURE_DIR"
print_summary
