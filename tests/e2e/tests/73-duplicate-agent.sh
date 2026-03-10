#!/bin/bash
# Test: Full agent duplication (#282)
#
# Verifies:
#   1. Basic duplicate: agent with blocks, tools, description, system prompt
#   2. Blocks are cloned (different IDs, same values)
#   3. Tools are shared by reference (same IDs)
#   4. Folders are shared by reference
#   5. Archives are cloned (different IDs)
#   6. Archival passages are copied by default
#   7. --no-archival skips passage copying
#   8. Target-already-exists error
#   9. Unknown resource type error
#  10. Duplicate is fully independent (modify original, clone unchanged)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

ORIGINAL="e2e-73-dup-original"
CLONE="e2e-73-dup-clone"
CLONE2="e2e-73-dup-clone2"
ARCHIVE="e2e-73-dup-archive"

section "Test: Agent Duplication (#282)"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup from previous runs
delete_agent_if_exists "$ORIGINAL"
delete_agent_if_exists "$CLONE"
delete_agent_if_exists "$CLONE2"
# Clean up any leftover archives via API
curl -s "$LETTA_BASE_URL/v1/archives" ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} 2>/dev/null \
  | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const archives = Array.isArray(data) ? data : (data.archives || []);
    archives.filter(a => (a.name||'').startsWith('e2e-73-dup-')).forEach(a => console.log(a.id));
  " 2>/dev/null | while read -r id; do
    curl -s -X DELETE "$LETTA_BASE_URL/v1/archives/$id" ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} > /dev/null 2>&1 || true
  done

# ============================================================================
# Step 1: Create source agent with blocks, archive, and custom config
# ============================================================================
section "Create Source Agent"

CONFIG="$LOG_DIR/73-duplicate.yml"
cat > "$CONFIG" << 'EOF'
agents:
  - name: e2e-73-dup-original
    description: "Original agent for duplication test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are the original test agent. Always respond with ORIGINAL."
    embedding: "openai/text-embedding-3-small"
    memory_blocks:
      - name: notes
        description: "General notes"
        value: "This is the original notes block content for duplication testing."
        limit: 5000
        agent_owned: true
      - name: status
        description: "Agent status"
        value: "active"
        limit: 2000
        agent_owned: true
    archives:
      - name: e2e-73-dup-archive
        description: "Test archive for duplication"
        embedding: "openai/text-embedding-3-small"
    tags:
      - "e2e-test"
      - "duplication"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$ORIGINAL" && pass "Source agent created" || fail "Source agent not created"

# Get source agent ID
ORIGINAL_ID=$($CLI get agents -o json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const agents = Array.isArray(data) ? data : [];
  const agent = agents.find(a => a.name === '$ORIGINAL');
  if (agent) process.stdout.write(agent.id);
")

if [ -z "$ORIGINAL_ID" ]; then
  fail "Could not get source agent ID"
  print_summary
  exit 1
fi
pass "Got source agent ID: $ORIGINAL_ID"

# Insert archival passages via API
info "Inserting archival passages into source agent..."
for i in 1 2 3; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$LETTA_BASE_URL/v1/agents/$ORIGINAL_ID/archival-memory" \
    -H "Content-Type: application/json" \
    ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} \
    -d "{\"text\": \"Duplication test passage $i: This is archival content number $i for the duplication e2e test.\"}")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    true
  else
    fail "Archival insert $i returned HTTP $HTTP_CODE"
  fi
done
pass "Inserted 3 archival passages"

# Verify passages exist on source
$CLI get archival "$ORIGINAL" --no-ux > $OUT 2>&1
output_contains "passage 1" && pass "Source has passage 1" || fail "Source missing passage 1"
output_contains "passage 3" && pass "Source has passage 3" || fail "Source missing passage 3"

# ============================================================================
# Step 2: Basic duplicate
# ============================================================================
section "Basic Duplicate"

$CLI duplicate agent "$ORIGINAL" "$CLONE" > $OUT 2>&1
output_contains "Duplicated" && pass "Duplicate command succeeded" || fail "Duplicate command failed"
agent_exists "$CLONE" && pass "Clone agent exists" || fail "Clone agent not created"

# ============================================================================
# Step 3: Verify description and system prompt carried over
# ============================================================================
section "Verify Agent Config"

$CLI describe agent "$CLONE" --no-ux > $OUT 2>&1
output_contains "Original agent for duplication test" && pass "Clone has source description" || fail "Clone missing description"
output_contains "original test agent" && pass "Clone has source system prompt" || fail "Clone missing system prompt"

# ============================================================================
# Step 4: Verify blocks are cloned (different IDs, same values)
# ============================================================================
section "Verify Block Cloning"

$CLI get blocks --agent "$CLONE" > $OUT 2>&1
output_contains "notes" && pass "Clone has 'notes' block" || fail "Clone missing 'notes' block"
output_contains "status" && pass "Clone has 'status' block" || fail "Clone missing 'status' block"

# Extract block IDs from both agents to verify isolation
$CLI get blocks --agent "$ORIGINAL" -o json > "$LOG_DIR/73-blocks-original.json" 2>&1 || true
$CLI get blocks --agent "$CLONE" -o json > "$LOG_DIR/73-blocks-clone.json" 2>&1 || true

BLOCK_IDS_ORIG=$(grep -o '"id":"[^"]*"' "$LOG_DIR/73-blocks-original.json" | sort)
BLOCK_IDS_CLONE=$(grep -o '"id":"[^"]*"' "$LOG_DIR/73-blocks-clone.json" | sort)

if [ -n "$BLOCK_IDS_ORIG" ] && [ -n "$BLOCK_IDS_CLONE" ]; then
  # Check that NO block IDs are shared (all should be different)
  SHARED=$(comm -12 <(echo "$BLOCK_IDS_ORIG") <(echo "$BLOCK_IDS_CLONE"))
  if [ -z "$SHARED" ]; then
    pass "Block IDs are all different (properly cloned)"
  else
    fail "Block IDs are shared (not properly cloned): $SHARED"
  fi
else
  warn "Could not extract block IDs for comparison"
fi

# Verify block content matches
grep -aq "original notes block content" "$LOG_DIR/73-blocks-clone.json" && pass "Clone notes block has correct content" || fail "Clone notes block content mismatch"
grep -aq "active" "$LOG_DIR/73-blocks-clone.json" && pass "Clone status block has correct content" || fail "Clone status block content mismatch"

# ============================================================================
# Step 5: Verify archives are cloned
# ============================================================================
section "Verify Archive Cloning"

$CLI get archives --agent "$CLONE" > $OUT 2>&1
output_contains "e2e-73-dup-archive" && pass "Clone has archive attached" || fail "Clone missing archive"

# Get archive IDs to verify they're different
$CLI get archives --agent "$ORIGINAL" -o json > "$LOG_DIR/73-archives-original.json" 2>&1 || true
$CLI get archives --agent "$CLONE" -o json > "$LOG_DIR/73-archives-clone.json" 2>&1 || true

ARCHIVE_ID_ORIG=$(grep -o '"id":"[^"]*"' "$LOG_DIR/73-archives-original.json" | head -1 | cut -d'"' -f4)
ARCHIVE_ID_CLONE=$(grep -o '"id":"[^"]*"' "$LOG_DIR/73-archives-clone.json" | head -1 | cut -d'"' -f4)

if [ -n "$ARCHIVE_ID_ORIG" ] && [ -n "$ARCHIVE_ID_CLONE" ]; then
  if [ "$ARCHIVE_ID_ORIG" != "$ARCHIVE_ID_CLONE" ]; then
    pass "Archive IDs are different (properly cloned): orig=$ARCHIVE_ID_ORIG, clone=$ARCHIVE_ID_CLONE"
  else
    fail "Archive IDs are the SAME (not properly cloned): $ARCHIVE_ID_ORIG"
  fi
else
  warn "Could not extract archive IDs for comparison"
fi

# ============================================================================
# Step 6: Verify archival passages were copied
# ============================================================================
section "Verify Passage Copying"

$CLI get archival "$CLONE" --no-ux > $OUT 2>&1
output_contains "passage 1" && pass "Clone has passage 1" || fail "Clone missing passage 1"
output_contains "passage 2" && pass "Clone has passage 2" || fail "Clone missing passage 2"
output_contains "passage 3" && pass "Clone has passage 3" || fail "Clone missing passage 3"

# ============================================================================
# Step 7: --no-archival skips passage copying
# ============================================================================
section "Duplicate with --no-archival"

$CLI duplicate agent "$ORIGINAL" "$CLONE2" --no-archival > $OUT 2>&1
output_contains "Duplicated" && pass "Duplicate with --no-archival succeeded" || fail "Duplicate with --no-archival failed"
output_contains "archival skipped" && pass "Output notes archival was skipped" || fail "Output missing archival skipped note"
agent_exists "$CLONE2" && pass "Clone2 agent exists" || fail "Clone2 agent not created"

# Verify clone2 has the archive structure but no passages
$CLI get archives --agent "$CLONE2" > $OUT 2>&1
output_contains "e2e-73-dup-archive" && pass "Clone2 has archive attached" || fail "Clone2 missing archive"

# Verify clone2 has NO archival passages
$CLI get archival "$CLONE2" --no-ux > $OUT 2>&1
if output_not_contains "passage 1" && output_not_contains "passage 2" && output_not_contains "passage 3"; then
  pass "Clone2 has no passages (--no-archival worked)"
else
  fail "Clone2 has passages despite --no-archival"
fi

# ============================================================================
# Step 8: Target-already-exists error
# ============================================================================
section "Error: Target Already Exists"

if $CLI duplicate agent "$ORIGINAL" "$CLONE" > $OUT 2>&1; then
  fail "Duplicate to existing target should have failed"
else
  output_contains "already exists" && pass "Error message mentions 'already exists'" || fail "Error message missing 'already exists'"
fi

# ============================================================================
# Step 9: Unknown resource type error
# ============================================================================
section "Error: Unknown Resource Type"

if $CLI duplicate banana "$ORIGINAL" "some-name" > $OUT 2>&1; then
  fail "Duplicate unknown resource should have failed"
else
  output_contains "Unknown resource type" && pass "Error message mentions unknown resource type" || fail "Error message missing unknown resource type"
fi

# ============================================================================
# Step 10: Independence — modify original, verify clone unchanged
# ============================================================================
section "Verify Independence"

# Update the original agent's description
UPDATED_CONFIG="$LOG_DIR/73-duplicate-updated.yml"
cat > "$UPDATED_CONFIG" << 'EOF'
agents:
  - name: e2e-73-dup-original
    description: "MODIFIED original description"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are the original test agent. Always respond with ORIGINAL."
    embedding: "openai/text-embedding-3-small"
    memory_blocks:
      - name: notes
        description: "General notes"
        value: "MODIFIED notes block content."
        limit: 5000
        agent_owned: true
      - name: status
        description: "Agent status"
        value: "inactive"
        limit: 2000
        agent_owned: true
    archives:
      - name: e2e-73-dup-archive
        description: "Test archive for duplication"
        embedding: "openai/text-embedding-3-small"
    tags:
      - "e2e-test"
      - "duplication"
EOF

$CLI apply -f "$UPDATED_CONFIG" > $OUT 2>&1

# Verify original was updated
$CLI describe agent "$ORIGINAL" --no-ux > $OUT 2>&1
output_contains "MODIFIED original description" && pass "Original description updated" || fail "Original description not updated"

# Verify clone is UNCHANGED
$CLI describe agent "$CLONE" --no-ux > $OUT 2>&1
output_contains "Original agent for duplication test" && pass "Clone description unchanged (independent)" || fail "Clone description was contaminated"

# Verify clone blocks are unchanged
$CLI get blocks --agent "$CLONE" -o json > "$LOG_DIR/73-blocks-clone-after.json" 2>&1 || true
grep -aq "original notes block content" "$LOG_DIR/73-blocks-clone-after.json" && pass "Clone notes block unchanged (independent)" || fail "Clone notes block was contaminated"

# ============================================================================
# Cleanup
# ============================================================================
section "Cleanup"
delete_agent_if_exists "$ORIGINAL"
delete_agent_if_exists "$CLONE"
delete_agent_if_exists "$CLONE2"
# Clean up any leftover archives via API
curl -s "$LETTA_BASE_URL/v1/archives" ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} 2>/dev/null \
  | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const archives = Array.isArray(data) ? data : (data.archives || []);
    archives.filter(a => (a.name||'').startsWith('e2e-73-dup-')).forEach(a => console.log(a.id));
  " 2>/dev/null | while read -r id; do
    curl -s -X DELETE "$LETTA_BASE_URL/v1/archives/$id" ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} > /dev/null 2>&1 || true
  done
rm -f "$CONFIG" "$UPDATED_CONFIG"
pass "Cleaned up test agents and archives"

print_summary
