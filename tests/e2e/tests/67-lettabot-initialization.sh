#!/bin/bash
# Test: Unified LettaBot initialization via lettactl
#
# Verifies that lettactl can fully replace lettabot's own config generation.
# The workflow is:
#   1. User defines agent in agents.yml with full lettabot: section
#   2. lettactl apply creates the agent
#   3. lettactl export lettabot emits a complete lettabot.yaml
#   4. The exported config contains all fields LettaBot needs to start
#
# This test covers the new expanded LettaBotConfig fields:
# - server (mode, baseUrl, apiKey, logLevel, api.*)
# - displayName
# - conversations (mode, heartbeat, perChannel)
# - providers (BYOK)
# - features.memfs, features.display, features.sendFile*
# - features.heartbeat.target
# - channel-specific advanced fields (signal.cliPath, whatsapp.sessionPath, etc.)
# - transcription with mistral provider

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-67-lettabot-init"
section "Test: Unified LettaBot Initialization"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT"

# ============================================================================
# Phase 1: Create agent with FULL lettabot config (all new fields)
# ============================================================================
section "Phase 1: Apply Full LettaBot Config"

FULL_CONFIG="$LOG_DIR/67-full.yml"
cat > "$FULL_CONFIG" << 'EOF'
agents:
  - name: e2e-67-lettabot-init
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
# Phase 2: Export as agents.yml and verify lettabot section round-trips
# ============================================================================
section "Phase 2: YAML Export Round-Trip"

SNAPSHOT="$LOG_DIR/67-snapshot.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT" > $OUT 2>&1
[ -f "$SNAPSHOT" ] && pass "YAML export created" || fail "YAML export failed"

# Verify lettabot section exists in export
grep -q "lettabot:" "$SNAPSHOT" && pass "Export has lettabot section" || fail "Missing lettabot section"

# Verify new fields are preserved
grep -q "displayName:" "$SNAPSHOT" && pass "Export has displayName" || fail "Missing displayName"
grep -q "conversations:" "$SNAPSHOT" && pass "Export has conversations" || fail "Missing conversations"
grep -q "mode: shared" "$SNAPSHOT" && pass "Export has conversations.mode" || fail "Missing conversations.mode"
grep -q "perChannel:" "$SNAPSHOT" && pass "Export has conversations.perChannel" || fail "Missing perChannel"
grep -q "providers:" "$SNAPSHOT" && pass "Export has providers" || fail "Missing providers"
grep -q "anthropic" "$SNAPSHOT" && pass "Export has anthropic provider" || fail "Missing anthropic provider"

# Verify features
grep -q "memfs:" "$SNAPSHOT" && pass "Export has memfs" || fail "Missing memfs"
grep -q "sendFileDir:" "$SNAPSHOT" && pass "Export has sendFileDir" || fail "Missing sendFileDir"
grep -q "display:" "$SNAPSHOT" && pass "Export has display config" || fail "Missing display config"
grep -q "showToolCalls:" "$SNAPSHOT" && pass "Export has showToolCalls" || fail "Missing showToolCalls"
grep -q "target:" "$SNAPSHOT" && pass "Export has heartbeat.target" || fail "Missing heartbeat.target"

# Verify channels
grep -q "telegram:" "$SNAPSHOT" && pass "Export has telegram" || fail "Missing telegram"
grep -q "discord:" "$SNAPSHOT" && pass "Export has discord" || fail "Missing discord"
grep -q "slack:" "$SNAPSHOT" && pass "Export has slack" || fail "Missing slack"
grep -q "signal:" "$SNAPSHOT" && pass "Export has signal" || fail "Missing signal"
grep -q "whatsapp:" "$SNAPSHOT" && pass "Export has whatsapp" || fail "Missing whatsapp"

# Verify channel-specific advanced fields
grep -q "cliPath:" "$SNAPSHOT" && pass "Export has signal.cliPath" || fail "Missing signal.cliPath"
grep -q "httpPort:" "$SNAPSHOT" && pass "Export has signal.httpPort" || fail "Missing signal.httpPort"
grep -q "sessionPath:" "$SNAPSHOT" && pass "Export has whatsapp.sessionPath" || fail "Missing whatsapp.sessionPath"
grep -q "receiveBotMessages:" "$SNAPSHOT" && pass "Export has group receiveBotMessages" || fail "Missing receiveBotMessages"

# ============================================================================
# Phase 3: Export as lettabot.yaml and verify it's ready-to-use
# ============================================================================
section "Phase 3: Export as lettabot.yaml"

LETTABOT_YAML="$LOG_DIR/67-lettabot.yaml"
$CLI export lettabot "$AGENT" -o "$LETTABOT_YAML" > $OUT 2>&1
[ -f "$LETTABOT_YAML" ] && pass "lettabot.yaml exported" || fail "lettabot.yaml not created"

# Verify server block (critical for LettaBot to know where to connect)
grep -q "server:" "$LETTABOT_YAML" && pass "Has server block" || fail "Missing server block"
grep -q "mode:" "$LETTABOT_YAML" && pass "Has server.mode" || fail "Missing server.mode"

# Verify agent block with ID (critical for LettaBot to skip creation)
grep -q "agent:" "$LETTABOT_YAML" && pass "Has agent block" || fail "Missing agent block"
grep -q "name: e2e-67-lettabot-init" "$LETTABOT_YAML" && pass "Has correct agent name" || fail "Wrong agent name"
grep -q "id:" "$LETTABOT_YAML" && pass "Has agent ID (for skip-creation)" || fail "Missing agent ID"

# Verify displayName flows through
grep -q "displayName:" "$LETTABOT_YAML" && pass "Has displayName" || fail "Missing displayName"

# Verify conversations flows through
grep -q "conversations:" "$LETTABOT_YAML" && pass "Has conversations" || fail "Missing conversations"

# Verify channels flow through
grep -q "channels:" "$LETTABOT_YAML" && pass "Has channels" || fail "Missing channels"
grep -q "telegram:" "$LETTABOT_YAML" && pass "Has telegram" || fail "Missing telegram"

# Verify features flow through
grep -q "features:" "$LETTABOT_YAML" && pass "Has features" || fail "Missing features"
grep -q "cron: true" "$LETTABOT_YAML" && pass "Has cron enabled" || fail "Missing cron"

# Verify providers flow through
grep -q "providers:" "$LETTABOT_YAML" && pass "Has providers" || fail "Missing providers"

# Verify polling flows through
grep -q "polling:" "$LETTABOT_YAML" && pass "Has polling" || fail "Missing polling"

# Verify transcription flows through
grep -q "transcription:" "$LETTABOT_YAML" && pass "Has transcription" || fail "Missing transcription"

# Verify attachments flows through
grep -q "attachments:" "$LETTABOT_YAML" && pass "Has attachments" || fail "Missing attachments"

# ============================================================================
# Phase 4: Re-apply from exported YAML (idempotent round-trip)
# ============================================================================
section "Phase 4: Re-apply from Export (Idempotent)"

$CLI apply -f "$SNAPSHOT" > $OUT 2>&1
cat $OUT
# Should show no changes (idempotent)
grep -qi "unchanged\|no changes\|up to date" $OUT && pass "Re-apply is idempotent" || warn "Re-apply detected changes (may be expected for config normalization)"

# ============================================================================
# Phase 5: Update individual lettabot fields
# ============================================================================
section "Phase 5: Incremental Config Updates"

UPDATED_CONFIG="$LOG_DIR/67-updated.yml"
cat > "$UPDATED_CONFIG" << 'EOF'
agents:
  - name: e2e-67-lettabot-init
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

# Verify changes applied
SNAPSHOT_B="$LOG_DIR/67-snapshot-b.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT_B" > $OUT 2>&1

grep -q "displayName.*UpdatedBot" "$SNAPSHOT_B" && pass "displayName updated" || fail "displayName not updated"
grep -q "mode: per-channel" "$SNAPSHOT_B" && pass "Conversation mode updated" || fail "Conversation mode not updated"
grep -q "maxToolCalls: 25" "$SNAPSHOT_B" && pass "maxToolCalls updated" || fail "maxToolCalls not updated"
grep -q "provider: mistral" "$SNAPSHOT_B" && pass "Transcription provider updated to mistral" || fail "Transcription not updated"

# ============================================================================
# Phase 6: Validate rejects bad new fields
# ============================================================================
section "Phase 6: Validation of New Fields"

# Bad server mode
BAD_SERVER="$LOG_DIR/67-bad-server.yml"
cat > "$BAD_SERVER" << 'EOF'
agents:
  - name: e2e-67-bad
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

$CLI validate -f "$BAD_SERVER" > $OUT 2>&1 && fail "Should reject invalid server.mode" || pass "Rejects invalid server.mode"

# Bad conversation mode
BAD_CONV="$LOG_DIR/67-bad-conv.yml"
cat > "$BAD_CONV" << 'EOF'
agents:
  - name: e2e-67-bad
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

$CLI validate -f "$BAD_CONV" > $OUT 2>&1 && fail "Should reject invalid conversations.mode" || pass "Rejects invalid conversations.mode"

# Bad provider (missing fields)
BAD_PROV="$LOG_DIR/67-bad-prov.yml"
cat > "$BAD_PROV" << 'EOF'
agents:
  - name: e2e-67-bad
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

$CLI validate -f "$BAD_PROV" > $OUT 2>&1 && fail "Should reject incomplete provider" || pass "Rejects incomplete provider"

# Bad transcription provider
BAD_TRANS="$LOG_DIR/67-bad-trans.yml"
cat > "$BAD_TRANS" << 'EOF'
agents:
  - name: e2e-67-bad
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

$CLI validate -f "$BAD_TRANS" > $OUT 2>&1 && fail "Should reject invalid transcription provider" || pass "Rejects invalid transcription provider"

# Bad display config
BAD_DISPLAY="$LOG_DIR/67-bad-display.yml"
cat > "$BAD_DISPLAY" << 'EOF'
agents:
  - name: e2e-67-bad
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

$CLI validate -f "$BAD_DISPLAY" > $OUT 2>&1 && fail "Should reject negative reasoningMaxChars" || pass "Rejects negative reasoningMaxChars"

# ============================================================================
# Cleanup
# ============================================================================
delete_agent_if_exists "$AGENT"
rm -f "$FULL_CONFIG" "$UPDATED_CONFIG" "$SNAPSHOT" "$SNAPSHOT_B" "$LETTABOT_YAML" \
      "$BAD_SERVER" "$BAD_CONV" "$BAD_PROV" "$BAD_TRANS" "$BAD_DISPLAY"

print_summary
