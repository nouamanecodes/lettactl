#!/bin/bash
# Test: Bulk YAML export by --all, --match, and --tags
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-57-bulk-alpha"
AGENT_B="e2e-57-bulk-beta"
section "Test: Bulk Export"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# ============================================================================
# Setup: Create two test agents with different tags
# ============================================================================
section "Setup: Create Test Agents"

CONFIG="$LOG_DIR/57-config.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT_A
    description: "Bulk export test A"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are alpha."
    embedding: "openai/text-embedding-3-small"
    tags:
      - "tenant:e2e57"
      - "role:alpha"
  - name: $AGENT_B
    description: "Bulk export test B"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are beta."
    embedding: "openai/text-embedding-3-small"
    tags:
      - "tenant:e2e57"
      - "role:beta"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Agent A created" || fail "Agent A not created"
agent_exists "$AGENT_B" && pass "Agent B created" || fail "Agent B not created"

# ============================================================================
# Test 1: --all export
# ============================================================================
section "Test 1: Export --all"

EXPORT_ALL="$LOG_DIR/57-all.yml"
$CLI export agents --all -f yaml -o "$EXPORT_ALL" > $OUT 2>&1
grep -q "$AGENT_A" "$EXPORT_ALL" && pass "--all includes agent A" || fail "--all missing agent A"
grep -q "$AGENT_B" "$EXPORT_ALL" && pass "--all includes agent B" || fail "--all missing agent B"

# Verify valid fleet structure
grep -q "^agents:" "$EXPORT_ALL" && pass "Fleet config has agents: root key" || fail "Missing agents: key"

# ============================================================================
# Test 2: --match glob
# ============================================================================
section "Test 2: Export --match"

EXPORT_MATCH="$LOG_DIR/57-match.yml"
$CLI export agents --match "e2e-57-bulk-*" -f yaml -o "$EXPORT_MATCH" > $OUT 2>&1
grep -q "$AGENT_A" "$EXPORT_MATCH" && pass "--match includes agent A" || fail "--match missing agent A"
grep -q "$AGENT_B" "$EXPORT_MATCH" && pass "--match includes agent B" || fail "--match missing agent B"

# ============================================================================
# Test 3: --tags (single tag, both agents match)
# ============================================================================
section "Test 3: Export --tags (single)"

EXPORT_TAGS="$LOG_DIR/57-tags.yml"
$CLI export agents --tags "tenant:e2e57" -f yaml -o "$EXPORT_TAGS" > $OUT 2>&1
grep -q "$AGENT_A" "$EXPORT_TAGS" && pass "--tags includes agent A" || fail "--tags missing agent A"
grep -q "$AGENT_B" "$EXPORT_TAGS" && pass "--tags includes agent B" || fail "--tags missing agent B"

# ============================================================================
# Test 4: --tags (AND logic, only one agent matches)
# ============================================================================
section "Test 4: Export --tags (AND logic)"

EXPORT_TAGS_AND="$LOG_DIR/57-tags-and.yml"
$CLI export agents --tags "tenant:e2e57,role:alpha" -f yaml -o "$EXPORT_TAGS_AND" > $OUT 2>&1
grep -q "$AGENT_A" "$EXPORT_TAGS_AND" && pass "--tags AND includes agent A" || fail "--tags AND missing agent A"
! grep -q "$AGENT_B" "$EXPORT_TAGS_AND" && pass "--tags AND excludes agent B" || fail "--tags AND should not include agent B"

# ============================================================================
# Test 5: --skip-first-message works with bulk
# ============================================================================
section "Test 5: --skip-first-message"

$CLI export agents --match "e2e-57-bulk-*" --skip-first-message -f yaml -o "$LOG_DIR/57-skip.yml" > $OUT 2>&1
pass "--skip-first-message accepted with bulk"

# ============================================================================
# Test 6: JSON format rejects bulk
# ============================================================================
section "Test 6: JSON Bulk Rejection"

$CLI export agents --all -f json > $OUT 2>&1 && fail "JSON bulk should fail" || pass "JSON bulk correctly rejected"
grep -qi "yaml" $OUT && pass "Error message mentions YAML" || fail "Error should mention YAML"

# ============================================================================
# Test 7: Round-trip (export then apply)
# ============================================================================
section "Test 7: Round-Trip"

ROUNDTRIP="$LOG_DIR/57-roundtrip.yml"
$CLI export agents --match "e2e-57-bulk-*" -f yaml -o "$ROUNDTRIP" > $OUT 2>&1
# Delete and recreate from export
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
$CLI apply -f "$ROUNDTRIP" > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Round-trip: agent A recreated" || fail "Round-trip: agent A not recreated"
agent_exists "$AGENT_B" && pass "Round-trip: agent B recreated" || fail "Round-trip: agent B not recreated"

# ============================================================================
# Cleanup
# ============================================================================
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
rm -f "$CONFIG" "$EXPORT_ALL" "$EXPORT_MATCH" "$EXPORT_TAGS" "$EXPORT_TAGS_AND" \
      "$ROUNDTRIP" "$LOG_DIR/57-skip.yml"

print_summary
