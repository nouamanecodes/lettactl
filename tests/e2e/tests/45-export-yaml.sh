#!/bin/bash
# Test: YAML export and git-native rollback workflow
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-45-export-yaml"
section "Test: YAML Export & Rollback Workflow"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT"

# Create test-specific config
INITIAL_CONFIG="$LOG_DIR/45-initial-config.yml"
cat > "$INITIAL_CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Initial description for export test"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are the ORIGINAL assistant for testing exports."
    embedding: "openai/text-embedding-3-small"
EOF

# ============================================================================
# Phase 1: Basic YAML export
# ============================================================================
section "Phase 1: Basic YAML Export"

# Create agent with initial config
$CLI apply -f "$INITIAL_CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Export to YAML
SNAPSHOT_A="$LOG_DIR/snapshot-a.yml"
$CLI export agent "$AGENT" -f yaml -o "$SNAPSHOT_A" > $OUT 2>&1
[ -f "$SNAPSHOT_A" ] && pass "YAML export created" || fail "YAML export failed"

# Verify YAML structure
grep -q "name: $AGENT" "$SNAPSHOT_A" && pass "YAML contains agent name" || fail "YAML missing agent name"
grep -q "system_prompt:" "$SNAPSHOT_A" && pass "YAML contains system_prompt" || fail "YAML missing system_prompt"
grep -q "llm_config:" "$SNAPSHOT_A" && pass "YAML contains llm_config" || fail "YAML missing llm_config"

# ============================================================================
# Phase 2: Modify agent (simulate change)
# ============================================================================
section "Phase 2: Modify Agent"

# Create a modified config
MODIFIED_CONFIG="$LOG_DIR/modified-config.yml"
cat > "$MODIFIED_CONFIG" << EOF
agents:
  - name: $AGENT
    description: "MODIFIED DESCRIPTION"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a MODIFIED assistant with different behavior."
    embedding: "openai/text-embedding-3-small"
EOF

# Apply modified config
$CLI apply -f "$MODIFIED_CONFIG" > $OUT 2>&1
cat $OUT  # Debug output
grep -qi "update\|unchanged" $OUT && pass "Agent updated with new config" || fail "Agent update failed"

# Verify modification took effect
$CLI describe agent "$AGENT" > $OUT 2>&1
grep -q "MODIFIED" "$OUT" && pass "Agent shows modified description" || fail "Modification not applied"

# ============================================================================
# Phase 3: Drift detection
# ============================================================================
section "Phase 3: Drift Detection"

# Dry-run with original snapshot should show drift
$CLI apply -f "$SNAPSHOT_A" --dry-run > $OUT 2>&1
cat $OUT  # Debug output
# Should show update needed (drift from snapshot)
grep -qi "update\|DRIFT\|changes" $OUT && pass "Dry-run detects drift from snapshot" || fail "Drift not detected"

# ============================================================================
# Phase 4: Rollback using exported YAML
# ============================================================================
section "Phase 4: Rollback"

# Apply the original snapshot (rollback)
$CLI apply -f "$SNAPSHOT_A" > $OUT 2>&1
grep -qi "update\|unchanged" $OUT && pass "Rollback applied" || fail "Rollback failed"

# Verify rollback - description should NOT be "MODIFIED DESCRIPTION" anymore
$CLI describe agent "$AGENT" > $OUT 2>&1
! grep -q "MODIFIED DESCRIPTION" "$OUT" && pass "Rollback restored original config" || fail "Rollback did not restore config"

# ============================================================================
# Phase 5: Round-trip (delete and recreate)
# ============================================================================
section "Phase 5: Round-trip Recreation"

# Delete agent
delete_agent_if_exists "$AGENT"
agent_exists "$AGENT" && fail "Agent should be deleted" || pass "Agent deleted"

# Recreate from exported YAML
$CLI apply -f "$SNAPSHOT_A" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent recreated from YAML export" || fail "Recreation failed"

# ============================================================================
# Phase 6: Export to stdout
# ============================================================================
section "Phase 6: Stdout Export"

$CLI export agent "$AGENT" -f yaml > $OUT 2>&1
grep -q "name: $AGENT" "$OUT" && pass "YAML export to stdout works" || fail "Stdout export failed"

# ============================================================================
# Cleanup
# ============================================================================
delete_agent_if_exists "$AGENT"
rm -f "$SNAPSHOT_A" "$MODIFIED_CONFIG" "$INITIAL_CONFIG"

print_summary
