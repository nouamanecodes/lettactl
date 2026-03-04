#!/bin/bash
# Test: LettaBot config — CRUD, export, validation, fleet export, initialization
# Merged from: 56-lettabot-config, 67-lettabot-initialization
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-56-lettabot"
AGENT_B="e2e-56-lettabot-b"

section "Test: LettaBot Config & Initialization"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$AGENT_B"

# ============================================================================
# Phase 1: Create agent with FULL lettabot config (all fields)
# ============================================================================
section "Phase 1: Apply Full LettaBot Config"

FULL_CONFIG="$LOG_DIR/56-full.yml"
cat > "$FULL_CONFIG" << 'EOF'
agents:
  - name: e2e-56-lettabot
    description: "Fully configured LettaBot agent via lettactl"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a lettabot-managed assistant."
    embedding: "openai/text-embedding-3-small"
    lettabot:
      server:
        mode: docker
        baseUrl: "http://localhost:8283"
        logLevel: info
        api:
          port: 8080
          host: "0.0.0.0"
          corsOrigin: "*"
      displayName: "TestBot"
      conversations:
        mode: shared
        heartbeat: last-active
        perChannel:
          - slack
      channels:
        telegram:
          enabled: true
          token: "test-telegram-token"
          dmPolicy: pairing
          groupDebounceSec: 3
          groups:
            "*":
              mode: listen
            "-1001234567890":
              mode: open
              allowedUsers:
                - "123456"
              receiveBotMessages: true
          mentionPatterns:
            - "@testbot"
        discord:
          enabled: true
          token: "test-discord-token"
          dmPolicy: allowlist
          allowedUsers:
            - "987654321"
          groupDebounceSec: 5
        slack:
          enabled: true
          appToken: "xapp-test-token"
          botToken: "xoxb-test-token"
          dmPolicy: open
        signal:
          enabled: false
          phone: "+15551234567"
          selfChat: true
          cliPath: "/usr/local/bin/signal-cli"
          httpHost: "127.0.0.1"
          httpPort: 8090
        whatsapp:
          enabled: false
          selfChat: false
          sessionPath: "./data/whatsapp-session"
      features:
        cron: true
        heartbeat:
          enabled: true
          intervalMin: 45
          skipRecentUserMin: 10
          prompt: "Check in with the user"
          target: "telegram:123456"
        inlineImages: true
        memfs: true
        maxToolCalls: 15
        sendFileDir: "./data/outbound"
        sendFileMaxSize: 52428800
        sendFileCleanup: false
        display:
          showToolCalls: true
          showReasoning: false
          reasoningMaxChars: 500
      providers:
        - id: anthropic
          name: lc-anthropic
          type: anthropic
          apiKey: "sk-ant-test-key"
        - id: openai
          name: lc-openai
          type: openai
          apiKey: "sk-test-key"
      polling:
        enabled: true
        intervalMs: 30000
        gmail:
          enabled: true
          account: "bot@example.com"
          accounts:
            - "bot@example.com"
            - "backup@example.com"
      transcription:
        provider: openai
        apiKey: "sk-whisper-test"
        model: "whisper-1"
      attachments:
        maxMB: 50
        maxAgeDays: 30
EOF

$CLI apply -f "$FULL_CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent with full lettabot config created" || fail "Agent not created"

# ============================================================================
# Phase 2: YAML export round-trip — verify all fields preserved
# ============================================================================
section "Phase 2: YAML Export Round-Trip"

SNAPSHOT="$LOG_DIR/56-snapshot.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT" > $OUT 2>&1
[ -f "$SNAPSHOT" ] && pass "YAML export created" || fail "YAML export failed"

grep -q "lettabot:" "$SNAPSHOT" && pass "Export has lettabot section" || fail "Missing lettabot section"
grep -q "displayName:" "$SNAPSHOT" && pass "Export has displayName" || fail "Missing displayName"
grep -q "conversations:" "$SNAPSHOT" && pass "Export has conversations" || fail "Missing conversations"
grep -q "mode: shared" "$SNAPSHOT" && pass "Export has conversations.mode" || fail "Missing conversations.mode"
grep -q "perChannel:" "$SNAPSHOT" && pass "Export has perChannel" || fail "Missing perChannel"
grep -q "providers:" "$SNAPSHOT" && pass "Export has providers" || fail "Missing providers"
grep -q "anthropic" "$SNAPSHOT" && pass "Export has anthropic provider" || fail "Missing anthropic provider"
grep -q "memfs:" "$SNAPSHOT" && pass "Export has memfs" || fail "Missing memfs"
grep -q "sendFileDir:" "$SNAPSHOT" && pass "Export has sendFileDir" || fail "Missing sendFileDir"
grep -q "display:" "$SNAPSHOT" && pass "Export has display config" || fail "Missing display config"
grep -q "showToolCalls:" "$SNAPSHOT" && pass "Export has showToolCalls" || fail "Missing showToolCalls"
grep -q "target:" "$SNAPSHOT" && pass "Export has heartbeat.target" || fail "Missing heartbeat.target"
grep -q "maxToolCalls:" "$SNAPSHOT" && pass "Export has maxToolCalls" || fail "Missing maxToolCalls"
grep -q "telegram:" "$SNAPSHOT" && pass "Export has telegram" || fail "Missing telegram"
grep -q "discord:" "$SNAPSHOT" && pass "Export has discord" || fail "Missing discord"
grep -q "slack:" "$SNAPSHOT" && pass "Export has slack" || fail "Missing slack"
grep -q "signal:" "$SNAPSHOT" && pass "Export has signal" || fail "Missing signal"
grep -q "whatsapp:" "$SNAPSHOT" && pass "Export has whatsapp" || fail "Missing whatsapp"
grep -q "cliPath:" "$SNAPSHOT" && pass "Export has signal.cliPath" || fail "Missing signal.cliPath"
grep -q "httpPort:" "$SNAPSHOT" && pass "Export has signal.httpPort" || fail "Missing signal.httpPort"
grep -q "sessionPath:" "$SNAPSHOT" && pass "Export has whatsapp.sessionPath" || fail "Missing whatsapp.sessionPath"
grep -q "receiveBotMessages:" "$SNAPSHOT" && pass "Export has receiveBotMessages" || fail "Missing receiveBotMessages"

# ============================================================================
# Phase 3: Export as lettabot.yaml — ready-to-use config
# ============================================================================
section "Phase 3: Export as lettabot.yaml"

LETTABOT_YAML="$LOG_DIR/56-lettabot.yaml"
$CLI export lettabot "$AGENT" -o "$LETTABOT_YAML" > $OUT 2>&1
[ -f "$LETTABOT_YAML" ] && pass "lettabot.yaml exported" || fail "lettabot.yaml not created"

grep -q "server:" "$LETTABOT_YAML" && pass "Has server block" || fail "Missing server block"
grep -q "mode:" "$LETTABOT_YAML" && pass "Has server.mode" || fail "Missing server.mode"
grep -q "agent:" "$LETTABOT_YAML" && pass "Has agent block" || fail "Missing agent block"
grep -q "name: e2e-56-lettabot" "$LETTABOT_YAML" && pass "Has correct agent name" || fail "Wrong agent name"
grep -q "id:" "$LETTABOT_YAML" && pass "Has agent ID" || fail "Missing agent ID"
grep -q "displayName:" "$LETTABOT_YAML" && pass "Has displayName" || fail "Missing displayName"
grep -q "conversations:" "$LETTABOT_YAML" && pass "Has conversations" || fail "Missing conversations"
grep -q "channels:" "$LETTABOT_YAML" && pass "Has channels" || fail "Missing channels"
grep -q "telegram:" "$LETTABOT_YAML" && pass "Has telegram" || fail "Missing telegram"
grep -q "features:" "$LETTABOT_YAML" && pass "Has features" || fail "Missing features"
grep -q "cron: true" "$LETTABOT_YAML" && pass "Has cron enabled" || fail "Missing cron"
grep -q "providers:" "$LETTABOT_YAML" && pass "Has providers" || fail "Missing providers"
grep -q "polling:" "$LETTABOT_YAML" && pass "Has polling" || fail "Missing polling"
grep -q "transcription:" "$LETTABOT_YAML" && pass "Has transcription" || fail "Missing transcription"
grep -q "attachments:" "$LETTABOT_YAML" && pass "Has attachments" || fail "Missing attachments"

# ============================================================================
# Phase 4: Re-apply from export (idempotent)
# ============================================================================
section "Phase 4: Re-apply from Export"

$CLI apply -f "$SNAPSHOT" > $OUT 2>&1
cat $OUT
grep -qi "unchanged\|no changes\|up to date" $OUT && pass "Re-apply is idempotent" || warn "Re-apply detected changes (may be expected for config normalization)"

# ============================================================================
# Phase 5: Update lettabot config
# ============================================================================
section "Phase 5: Update LettaBot Config"

UPDATED_CONFIG="$LOG_DIR/56-updated.yml"
cat > "$UPDATED_CONFIG" << 'EOF'
agents:
  - name: e2e-56-lettabot
    description: "Fully configured LettaBot agent via lettactl"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a lettabot-managed assistant."
    embedding: "openai/text-embedding-3-small"
    lettabot:
      server:
        mode: api
        logLevel: debug
      displayName: "UpdatedBot"
      conversations:
        mode: per-channel
      channels:
        telegram:
          enabled: true
          token: "test-telegram-token"
          dmPolicy: open
        discord:
          enabled: true
        slack:
          enabled: true
          botToken: "xoxb-test"
          appToken: "xapp-test"
      features:
        cron: false
        heartbeat:
          enabled: false
        maxToolCalls: 25
        display:
          showToolCalls: false
          showReasoning: true
      transcription:
        provider: mistral
        model: "voxtral-mini-latest"
      attachments:
        maxMB: 100
EOF

$CLI apply -f "$UPDATED_CONFIG" > $OUT 2>&1
cat $OUT
grep -qi "update\|lettabot" $OUT && pass "Config update detected" || fail "Update not detected"

SNAPSHOT_B="$LOG_DIR/56-snapshot-b.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT_B" > $OUT 2>&1
grep -q "displayName.*UpdatedBot" "$SNAPSHOT_B" && pass "displayName updated" || fail "displayName not updated"
grep -q "mode: per-channel" "$SNAPSHOT_B" && pass "Conversation mode updated" || fail "Conversation mode not updated"
grep -q "maxToolCalls: 25" "$SNAPSHOT_B" && pass "maxToolCalls updated to 25" || fail "maxToolCalls not updated"
grep -q "provider: mistral" "$SNAPSHOT_B" && pass "Transcription provider updated to mistral" || fail "Transcription not updated"
grep -q "slack:" "$SNAPSHOT_B" && pass "Slack channel present" || fail "Slack channel not in export"

# ============================================================================
# Phase 6: Dry-run drift detection
# ============================================================================
section "Phase 6: Dry-Run Drift Detection"

$CLI apply -f "$FULL_CONFIG" --dry-run > $OUT 2>&1
cat $OUT
grep -qi "lettabot\|update\|changes" $OUT && pass "Dry-run detects lettabot drift" || fail "Drift not detected"

# ============================================================================
# Phase 7: Remove lettabot config
# ============================================================================
section "Phase 7: Remove LettaBot Config"

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

SNAPSHOT_C="$LOG_DIR/56-snapshot-c.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT_C" > $OUT 2>&1
! grep -q "lettabot:" "$SNAPSHOT_C" && pass "LettaBot config removed from export" || fail "LettaBot config still present"

# ============================================================================
# Phase 8: Validation
# ============================================================================
section "Phase 8: Validation"

# Unknown channel
BAD_CONFIG="$LOG_DIR/56-bad-channel.yml"
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
$CLI validate -f "$BAD_CONFIG" > $OUT 2>&1 && fail "Should reject unknown channel" || pass "Rejects unknown channel 'teams'"

# Bad server mode
cat > "$BAD_CONFIG" << 'EOF'
agents:
  - name: e2e-56-bad
    description: "Bad config"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "test"
    embedding: "openai/text-embedding-3-small"
    lettabot:
      server:
        mode: invalid
EOF
$CLI validate -f "$BAD_CONFIG" > $OUT 2>&1 && fail "Should reject invalid server.mode" || pass "Rejects invalid server.mode"

# Bad conversation mode
cat > "$BAD_CONFIG" << 'EOF'
agents:
  - name: e2e-56-bad
    description: "Bad config"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "test"
    embedding: "openai/text-embedding-3-small"
    lettabot:
      conversations:
        mode: invalid
EOF
$CLI validate -f "$BAD_CONFIG" > $OUT 2>&1 && fail "Should reject invalid conversations.mode" || pass "Rejects invalid conversations.mode"

# Bad provider (missing fields)
cat > "$BAD_CONFIG" << 'EOF'
agents:
  - name: e2e-56-bad
    description: "Bad config"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "test"
    embedding: "openai/text-embedding-3-small"
    lettabot:
      providers:
        - id: anthropic
EOF
$CLI validate -f "$BAD_CONFIG" > $OUT 2>&1 && fail "Should reject incomplete provider" || pass "Rejects incomplete provider"

# Bad transcription provider
cat > "$BAD_CONFIG" << 'EOF'
agents:
  - name: e2e-56-bad
    description: "Bad config"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "test"
    embedding: "openai/text-embedding-3-small"
    lettabot:
      transcription:
        provider: whisper
EOF
$CLI validate -f "$BAD_CONFIG" > $OUT 2>&1 && fail "Should reject invalid transcription provider" || pass "Rejects invalid transcription provider"

# Bad display config
cat > "$BAD_CONFIG" << 'EOF'
agents:
  - name: e2e-56-bad
    description: "Bad config"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "test"
    embedding: "openai/text-embedding-3-small"
    lettabot:
      features:
        display:
          reasoningMaxChars: -1
EOF
$CLI validate -f "$BAD_CONFIG" > $OUT 2>&1 && fail "Should reject negative reasoningMaxChars" || pass "Rejects negative reasoningMaxChars"

# ============================================================================
# Phase 9: Export lettabot single agent
# ============================================================================
section "Phase 9: Export LettaBot (Single Agent)"

$CLI apply -f "$FULL_CONFIG" > $OUT 2>&1

LETTABOT_SINGLE="$LOG_DIR/56-lettabot-single.yaml"
$CLI export lettabot "$AGENT" -o "$LETTABOT_SINGLE" > $OUT 2>&1
[ -f "$LETTABOT_SINGLE" ] && pass "lettabot.yaml exported" || fail "lettabot.yaml not created"
grep -q "server:" "$LETTABOT_SINGLE" && pass "Export has server block" || fail "Export missing server block"
grep -q "agent:" "$LETTABOT_SINGLE" && pass "Export has agent block" || fail "Export missing agent block"
grep -q "name: e2e-56-lettabot" "$LETTABOT_SINGLE" && pass "Export has correct agent name" || fail "Wrong agent name"
grep -q "mode: docker" "$LETTABOT_SINGLE" && pass "Export has docker mode" || fail "Missing server mode"
grep -q "telegram:" "$LETTABOT_SINGLE" && pass "Export has telegram channel" || fail "Missing channels"

# ============================================================================
# Phase 10: Export lettabot fleet (multi-agent)
# ============================================================================
section "Phase 10: Export LettaBot Fleet"

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
grep -q "slack:" "$LETTABOT_FLEET" && pass "Fleet has slack channel" || fail "Missing slack"

# ============================================================================
# Cleanup
# ============================================================================
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$AGENT_B"
rm -f "$FULL_CONFIG" "$UPDATED_CONFIG" "$NO_LETTABOT_CONFIG" "$BAD_CONFIG" \
      "$SNAPSHOT" "$SNAPSHOT_B" "$SNAPSHOT_C" "$LETTABOT_YAML" "$LETTABOT_SINGLE" \
      "$FLEET_CONFIG" "$LETTABOT_FLEET"

print_summary
