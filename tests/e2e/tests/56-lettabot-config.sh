#!/bin/bash
# Test: LettaBot configuration stored in agent metadata
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-56-lettabot"
section "Test: LettaBot Config in Agent Metadata"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT"

# ============================================================================
# Phase 1: Create agent with lettabot config
# ============================================================================
section "Phase 1: Create Agent with LettaBot Config"

INITIAL_CONFIG="$LOG_DIR/56-initial.yml"
cat > "$INITIAL_CONFIG" << 'EOF'
agents:
  - name: e2e-56-lettabot
    description: "Agent with LettaBot configuration"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a lettabot-managed assistant."
    embedding: "openai/text-embedding-3-small"
    lettabot:
      channels:
        telegram:
          enabled: true
          dmPolicy: pairing
        discord:
          enabled: false
      features:
        maxToolCalls: 5
        heartbeat:
          enabled: true
          intervalMin: 60
      attachments:
        maxMB: 10
EOF

$CLI apply -f "$INITIAL_CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent with lettabot config created" || fail "Agent not created"

# ============================================================================
# Phase 2: Export and verify lettabot config round-trips
# ============================================================================
section "Phase 2: YAML Export Round-Trip"

SNAPSHOT="$LOG_DIR/56-snapshot.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT" > $OUT 2>&1
[ -f "$SNAPSHOT" ] && pass "YAML export created" || fail "YAML export failed"

# Verify lettabot section exists in export
grep -q "lettabot:" "$SNAPSHOT" && pass "Export contains lettabot section" || fail "Export missing lettabot section"
grep -q "telegram:" "$SNAPSHOT" && pass "Export contains telegram channel" || fail "Export missing telegram channel"
grep -q "discord:" "$SNAPSHOT" && pass "Export contains discord channel" || fail "Export missing discord channel"
grep -q "maxToolCalls:" "$SNAPSHOT" && pass "Export contains maxToolCalls" || fail "Export missing maxToolCalls"

# ============================================================================
# Phase 3: Update lettabot config (add channel, change settings)
# ============================================================================
section "Phase 3: Update LettaBot Config"

UPDATED_CONFIG="$LOG_DIR/56-updated.yml"
cat > "$UPDATED_CONFIG" << 'EOF'
agents:
  - name: e2e-56-lettabot
    description: "Agent with LettaBot configuration"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a lettabot-managed assistant."
    embedding: "openai/text-embedding-3-small"
    lettabot:
      channels:
        telegram:
          enabled: true
          dmPolicy: open
        discord:
          enabled: true
        slack:
          enabled: true
      features:
        maxToolCalls: 10
        heartbeat:
          enabled: false
      attachments:
        maxMB: 25
EOF

$CLI apply -f "$UPDATED_CONFIG" > $OUT 2>&1
cat $OUT  # Debug
grep -qi "update\|LettaBot" $OUT && pass "LettaBot config update detected" || fail "Update not detected"

# Export again and verify changes
SNAPSHOT_B="$LOG_DIR/56-snapshot-b.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT_B" > $OUT 2>&1
grep -q "slack:" "$SNAPSHOT_B" && pass "Slack channel added" || fail "Slack channel not in export"
grep -q "maxToolCalls: 10" "$SNAPSHOT_B" && pass "maxToolCalls updated to 10" || fail "maxToolCalls not updated"

# ============================================================================
# Phase 4: Dry-run detects lettabot drift
# ============================================================================
section "Phase 4: Dry-Run Drift Detection"

$CLI apply -f "$INITIAL_CONFIG" --dry-run > $OUT 2>&1
cat $OUT  # Debug
grep -qi "lettabot\|update\|changes" $OUT && pass "Dry-run detects lettabot drift" || fail "Drift not detected"

# ============================================================================
# Phase 5: Remove lettabot config
# ============================================================================
section "Phase 5: Remove LettaBot Config"

NO_LETTABOT_CONFIG="$LOG_DIR/56-no-lettabot.yml"
cat > "$NO_LETTABOT_CONFIG" << 'EOF'
agents:
  - name: e2e-56-lettabot
    description: "Agent without LettaBot configuration"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a plain assistant."
    embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$NO_LETTABOT_CONFIG" > $OUT 2>&1

# Export and verify lettabot section is gone
SNAPSHOT_C="$LOG_DIR/56-snapshot-c.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT_C" > $OUT 2>&1
! grep -q "lettabot:" "$SNAPSHOT_C" && pass "LettaBot config removed from export" || fail "LettaBot config still present"

# ============================================================================
# Phase 6: Validate rejects bad lettabot config
# ============================================================================
section "Phase 6: Validation"

BAD_CONFIG="$LOG_DIR/56-bad-lettabot.yml"
cat > "$BAD_CONFIG" << 'EOF'
agents:
  - name: e2e-56-lettabot-bad
    description: "Agent with invalid lettabot config"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "test"
    embedding: "openai/text-embedding-3-small"
    lettabot:
      channels:
        teams:
          enabled: true
EOF

$CLI validate -f "$BAD_CONFIG" > $OUT 2>&1 && fail "Validate should reject unknown channel" || pass "Validate rejects unknown channel 'teams'"

# ============================================================================
# Phase 7: Export lettabot config (single agent)
# ============================================================================
section "Phase 7: Export LettaBot Config (Single Agent)"

# Re-apply with lettabot config for export testing
$CLI apply -f "$INITIAL_CONFIG" > $OUT 2>&1

LETTABOT_YAML="$LOG_DIR/56-lettabot.yaml"
$CLI export lettabot "$AGENT" -o "$LETTABOT_YAML" > $OUT 2>&1
[ -f "$LETTABOT_YAML" ] && pass "lettabot.yaml exported" || fail "lettabot.yaml not created"
grep -q "server:" "$LETTABOT_YAML" && pass "Export has server block" || fail "Export missing server block"
grep -q "agent:" "$LETTABOT_YAML" && pass "Export has agent block" || fail "Export missing agent block"
grep -q "name: e2e-56-lettabot" "$LETTABOT_YAML" && pass "Export has correct agent name" || fail "Wrong agent name"
grep -q "mode: docker" "$LETTABOT_YAML" && pass "Export has docker mode" || fail "Missing server mode"
grep -q "telegram:" "$LETTABOT_YAML" && pass "Export has telegram channel" || fail "Missing channels"

# ============================================================================
# Phase 8: Export lettabot fleet (multi-agent)
# ============================================================================
section "Phase 8: Export LettaBot Fleet (Multi-Agent)"

AGENT_B="e2e-56-lettabot-b"
delete_agent_if_exists "$AGENT_B"

FLEET_CONFIG="$LOG_DIR/56-fleet.yml"
cat > "$FLEET_CONFIG" << 'EOF'
agents:
  - name: e2e-56-lettabot-b
    description: "Second lettabot agent"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are agent B."
    embedding: "openai/text-embedding-3-small"
    lettabot:
      channels:
        slack:
          enabled: true
          botToken: "xoxb-test"
          appToken: "xapp-test"
      features:
        maxToolCalls: 20
EOF

$CLI apply -f "$FLEET_CONFIG" > $OUT 2>&1

LETTABOT_FLEET="$LOG_DIR/56-lettabot-fleet.yaml"
$CLI export lettabot --match "e2e-56-lettabot*" -o "$LETTABOT_FLEET" > $OUT 2>&1
[ -f "$LETTABOT_FLEET" ] && pass "Fleet lettabot.yaml exported" || fail "Fleet export failed"
grep -q "agents:" "$LETTABOT_FLEET" && pass "Fleet export has agents array" || fail "Missing agents array"
grep -q "e2e-56-lettabot" "$LETTABOT_FLEET" && pass "Fleet includes agent A" || fail "Agent A missing"
grep -q "e2e-56-lettabot-b" "$LETTABOT_FLEET" && pass "Fleet includes agent B" || fail "Agent B missing"
grep -q "slack:" "$LETTABOT_FLEET" && pass "Fleet has slack channel from agent B" || fail "Missing slack"

# ============================================================================
# Cleanup
# ============================================================================
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$AGENT_B"
rm -f "$INITIAL_CONFIG" "$UPDATED_CONFIG" "$NO_LETTABOT_CONFIG" "$BAD_CONFIG" \
      "$SNAPSHOT" "$SNAPSHOT_B" "$SNAPSHOT_C" "$LETTABOT_YAML" "$FLEET_CONFIG" "$LETTABOT_FLEET"

print_summary
