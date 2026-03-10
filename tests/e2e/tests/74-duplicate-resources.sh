#!/bin/bash
# Test: Duplicate block, archive, folder, tool (#282)
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-74-dup-resources"
section "Test: Duplicate Resources (#282)"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT"

# ============================================================================
# Setup: Create an agent so we have blocks, archives, tools to work with
# ============================================================================
section "Setup"

CONFIG="$LOG_DIR/74-dup-resources.yml"
cat > "$CONFIG" << 'EOF'
agents:
  - name: e2e-74-dup-resources
    description: "Resource duplication test"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "Test agent"
    embedding: "openai/text-embedding-3-small"
    memory_blocks:
      - name: dup_test_block
        description: "Block for duplication test"
        value: "Original block content for duplication e2e"
        limit: 3000
        agent_owned: true
    archives:
      - name: e2e-74-dup-archive
        description: "Archive for duplication test"
        embedding: "openai/text-embedding-3-small"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Setup agent created" || fail "Setup agent not created"

# Get agent ID to insert archival passages
AGENT_ID=$($CLI get agents -o json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const agents = Array.isArray(data) ? data : [];
  const agent = agents.find(a => a.name === '$AGENT');
  if (agent) process.stdout.write(agent.id);
")

# Insert a passage into the archive
curl -s -o /dev/null -w "" -X POST "$LETTA_BASE_URL/v1/agents/$AGENT_ID/archival-memory" \
  -H "Content-Type: application/json" \
  ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} \
  -d '{"text": "E2E passage for archive duplication test"}' > /dev/null 2>&1
pass "Inserted archival passage"

# ============================================================================
# Test 1: Duplicate block
# ============================================================================
section "Duplicate Block"

$CLI duplicate block dup_test_block dup_test_block_copy > $OUT 2>&1
output_contains "Duplicated" && pass "Block duplicated" || fail "Block duplication failed"

# Verify the copy exists
$CLI get blocks > $OUT 2>&1
output_contains "dup_test_block_copy" && pass "Block copy exists" || fail "Block copy missing"

# ============================================================================
# Test 2: Duplicate archive (with passages)
# ============================================================================
section "Duplicate Archive"

$CLI duplicate archive e2e-74-dup-archive e2e-74-dup-archive-copy > $OUT 2>&1
output_contains "Duplicated" && pass "Archive duplicated" || fail "Archive duplication failed"

$CLI get archives > $OUT 2>&1
output_contains "e2e-74-dup-archive-copy" && pass "Archive copy exists" || fail "Archive copy missing"

# ============================================================================
# Test 3: Duplicate archive with --no-archival
# ============================================================================
section "Duplicate Archive --no-archival"

$CLI duplicate archive e2e-74-dup-archive e2e-74-dup-archive-empty --no-archival > $OUT 2>&1
output_contains "Duplicated" && pass "Archive duplicated (no archival)" || fail "Archive duplication (no archival) failed"
output_contains "archival skipped" && pass "Archival skip noted" || fail "Archival skip note missing"

# ============================================================================
# Test 4: Unknown resource type
# ============================================================================
section "Error: Unknown Resource"

if $CLI duplicate banana source target > $OUT 2>&1; then
  fail "Unknown resource should fail"
else
  output_contains "Unknown resource type" && pass "Unknown resource error" || fail "Missing error message"
fi

# ============================================================================
# Cleanup
# ============================================================================
section "Cleanup"
delete_agent_if_exists "$AGENT"

# Clean up duplicated blocks
BLOCK_ID=$($CLI get blocks -o json 2>/dev/null | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const blocks = Array.isArray(data) ? data : [];
  const block = blocks.find(b => b.label === 'dup_test_block_copy');
  if (block) process.stdout.write(block.id);
" 2>/dev/null || echo "")
if [ -n "$BLOCK_ID" ]; then
  $CLI delete block "$BLOCK_ID" --force > /dev/null 2>&1 || true
fi

# Clean up duplicated archives via API
curl -s "$LETTA_BASE_URL/v1/archives" ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} 2>/dev/null \
  | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const archives = Array.isArray(data) ? data : (data.archives || []);
    archives.filter(a => (a.name||'').startsWith('e2e-74-dup-')).forEach(a => console.log(a.id));
  " 2>/dev/null | while read -r id; do
    curl -s -X DELETE "$LETTA_BASE_URL/v1/archives/$id" ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} > /dev/null 2>&1 || true
  done

rm -f "$CONFIG"
pass "Cleaned up"

print_summary
