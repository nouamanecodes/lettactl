#!/bin/bash
# Test: Archival memory viewing via get archival and describe agent
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-16-tools-archival"
section "Test: Archival Memory Viewer (#161)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with archival tools
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Get agent ID for direct API calls
AGENT_ID=$($CLI get agents -o json | node -e "
  const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const agents = Array.isArray(data) ? data : [];
  const agent = agents.find(a => a.name === '$AGENT');
  if (agent) process.stdout.write(agent.id);
")

if [ -z "$AGENT_ID" ]; then
  fail "Could not get agent ID"
  print_summary
  exit 1
fi
pass "Got agent ID: $AGENT_ID"

# Insert archival entries via Letta API (distinct topics for search testing)
info "Inserting archival entries via API..."
TOPICS=("pricing models and subscription tiers" "deployment strategies for kubernetes" "customer onboarding best practices")
for i in 1 2 3; do
  IDX=$((i - 1))
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$LETTA_BASE_URL/v1/agents/$AGENT_ID/archival-memory" \
    -H "Content-Type: application/json" \
    ${LETTA_API_KEY:+-H "Authorization: Bearer $LETTA_API_KEY"} \
    -d "{\"text\": \"E2E archival entry $i: This is test passage about ${TOPICS[$IDX]}.\"}")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    true
  else
    fail "Archival insert $i returned HTTP $HTTP_CODE"
  fi
done
pass "Inserted 3 archival entries"

# Test: get archival <agent> (table view)
info "Testing get archival (table view)..."
$CLI get archival "$AGENT" --no-ux > $OUT 2>&1
output_contains "pricing" && pass "Entry 1 in table" || fail "Entry 1 missing from table"
output_contains "kubernetes" && pass "Entry 2 in table" || fail "Entry 2 missing from table"
output_contains "onboarding" && pass "Entry 3 in table" || fail "Entry 3 missing from table"

# Test: get archival <agent> --full (content view)
info "Testing get archival --full (content view)..."
$CLI get archival "$AGENT" --full --no-ux > $OUT 2>&1
output_contains "pricing models and subscription tiers" && pass "Full text shown for entry 1" || fail "Full text missing for entry 1"
output_contains "customer onboarding best practices" && pass "Full text shown for entry 3" || fail "Full text missing for entry 3"

# Test: get archival <agent> --query (semantic search)
info "Testing get archival --query (semantic search)..."
$CLI get archival "$AGENT" --query "pricing" --no-ux > $OUT 2>&1
output_contains "pricing" && pass "Search returned pricing entry" || fail "Search missing pricing entry"

# Test: get archival <agent> -o json
info "Testing get archival JSON output..."
$CLI get archival "$AGENT" -o json > $OUT 2>&1
output_contains "archival entry" && pass "JSON output contains entries" || fail "JSON output missing entries"

# Test: describe agent shows archival count
info "Testing describe agent archival count..."
$CLI describe agent "$AGENT" --no-ux > $OUT 2>&1
output_contains "rchival" && pass "Describe shows archival section" || fail "Describe missing archival section"

# Cleanup
delete_agent_if_exists "$AGENT"
print_summary
