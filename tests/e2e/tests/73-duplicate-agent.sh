#!/bin/bash
# Test: Agent duplication with archival memory (#286, #282)
#
# Verifies:
#   1. Create agent with archival archive
#   2. Send message that triggers archival_memory_insert
#   3. Export with --include-archival includes passages
#   4. Duplicate command clones agent with archival memory
#   5. Duplicate --no-archival skips passages
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-73-archival-src"
CLONE="e2e-73-archival-clone"
CLONE_NOARCH="e2e-73-archival-clone-noarch"
ARCHIVE_NAME="e2e-73-knowledge"
section "Test: Duplicate Agent with Archival Memory"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup from previous runs
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$CLONE"
delete_agent_if_exists "$CLONE_NOARCH"

# --- Step 1: Deploy agent with archive ---
CONFIG="$LOG_DIR/73-duplicate.yml"
cat > "$CONFIG" << EOF
agents:
  - name: $AGENT
    description: "Archival duplication test agent"
    llm_config:
      model: "google_ai/gemini-2.0-flash-lite"
      context_window: 32000
    system_prompt:
      value: "You are a test assistant. When the user asks you to remember something, use archival_memory_insert to store it."
    embedding: "openai/text-embedding-3-small"
    archives:
      - name: $ARCHIVE_NAME
        description: "Knowledge archive for testing"
EOF

$CLI apply -f "$CONFIG" > $OUT 2>&1
agent_exists "$AGENT" && pass "Source agent created" || fail "Source agent not created"

# --- Step 2: Insert archival passage via API ---
# Use the REST API directly for reliability (model may not always call the tool)
info "Inserting archival passage via API..."
AGENT_ID=$(curl -s "$LETTA_BASE_URL/v1/agents/?name=$AGENT" | python3 -c "import sys,json; agents=json.load(sys.stdin); print(agents[0]['id'] if agents else '')" 2>/dev/null || true)
if [ -n "$AGENT_ID" ]; then
  ARCHIVE_ID=$(curl -s "$LETTA_BASE_URL/v1/archives/?agent_id=$AGENT_ID" | python3 -c "import sys,json; archives=json.load(sys.stdin); print(archives[0]['id'] if archives else '')" 2>/dev/null || true)
  if [ -n "$ARCHIVE_ID" ]; then
    curl -s -L -X POST "$LETTA_BASE_URL/v1/archives/$ARCHIVE_ID/passages" \
      -H "Content-Type: application/json" \
      -d '{"text":"The capital of France is Paris."}' > /dev/null 2>&1
    pass "Inserted passage via API"
  else
    fail "Could not find archive ID"
  fi
else
  fail "Could not find agent ID"
fi

# Verify archival entry was created
$CLI get archival "$AGENT" --full > $OUT 2>&1
if output_contains "Paris"; then
  pass "Archival memory contains passage"
else
  fail "Archival memory missing passage"
fi

# --- Step 3: Export with --include-archival ---
EXPORT_FILE="$LOG_DIR/73-export-archival.yml"
$CLI export agent "$AGENT" -f yaml --include-archival -o "$EXPORT_FILE" > $OUT 2>&1

if grep -q "passages:" "$EXPORT_FILE" 2>/dev/null; then
  pass "Export with --include-archival includes passages"
else
  fail "Export missing passages section"
fi

if grep -q "Paris" "$EXPORT_FILE" 2>/dev/null; then
  pass "Exported passages contain correct text"
else
  fail "Exported passages missing expected text"
fi

# --- Step 4: Duplicate agent (full clone with archival) ---
$CLI duplicate "$AGENT" "$CLONE" > $OUT 2>&1
if agent_exists "$CLONE"; then
  pass "Duplicate agent created"
else
  fail "Duplicate agent not created"
fi

# Verify clone has archival passages
$CLI get archival "$CLONE" --full > $OUT 2>&1
if output_contains "Paris"; then
  pass "Cloned agent has archival passages"
else
  fail "Cloned agent missing archival passages"
fi

# --- Step 5: Duplicate with --no-archival skips passages ---
$CLI duplicate "$AGENT" "$CLONE_NOARCH" --no-archival > $OUT 2>&1
if agent_exists "$CLONE_NOARCH"; then
  pass "No-archival duplicate created"
else
  fail "No-archival duplicate not created"
fi

# Verify no-archival clone has no passages
$CLI get archival "$CLONE_NOARCH" --full > $OUT 2>&1
if output_not_contains "Paris"; then
  pass "No-archival clone has no passages"
else
  fail "No-archival clone unexpectedly has passages"
fi

# --- Cleanup ---
delete_agent_if_exists "$AGENT"
delete_agent_if_exists "$CLONE"
delete_agent_if_exists "$CLONE_NOARCH"
rm -f "$EXPORT_FILE" "$CONFIG"

print_summary
