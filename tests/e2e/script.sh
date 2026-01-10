#!/bin/bash

# lettactl E2E Test Suite
# Tests fleet deployment, diff detection, and kubectl-style updates

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Parse flags
QUIET_FLAG=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -q|--quiet)
            QUIET_FLAG="-q"
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES="$SCRIPT_DIR/fixtures"
CLI="node $ROOT_DIR/dist/index.js $QUIET_FLAG"
LOG_DIR="$ROOT_DIR/logs"
OUT="$LOG_DIR/e2e-out.txt"

# Ensure logs dir exists
mkdir -p "$LOG_DIR"

# Timestamped log file - tee output to both console and file
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/e2e-$TIMESTAMP.log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "Log file: $LOG_FILE"

# ============================================================================
# Helpers
# ============================================================================

pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    FAILED=$((FAILED + 1))
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

section() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE} $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
}

# Check if agent exists by name
agent_exists() {
    $CLI get agents > "$OUT" 2>&1 && grep -q "$1" "$OUT"
}

# Check output contains string
output_contains() {
    grep -q "$1" $OUT
}

# ============================================================================
# Pre-flight
# ============================================================================

section "Pre-flight Checks"

# Check LETTA_BASE_URL
if [ -z "$LETTA_BASE_URL" ]; then
    echo -e "${RED}ERROR: LETTA_BASE_URL not set${NC}"
    echo ""
    echo "E2E tests require a running Letta server."
    echo ""
    echo "  1. Start server:  letta server"
    echo "  2. Set URL:       export LETTA_BASE_URL=http://localhost:8283"
    echo "  3. Run tests:     ./tests/e2e/script.sh"
    echo ""
    exit 1
fi
info "LETTA_BASE_URL: $LETTA_BASE_URL"

# Check server reachable
if ! $CLI health > $OUT 2>&1; then
    echo -e "${RED}ERROR: Cannot reach Letta server${NC}"
    cat $OUT
    exit 1
fi
pass "Server reachable"

# Check dist exists
if [ ! -f "$ROOT_DIR/dist/index.js" ]; then
    echo -e "${RED}ERROR: dist/index.js not found. Run 'pnpm build' first.${NC}"
    exit 1
fi
pass "CLI built"

# ============================================================================
# Cleanup any existing e2e agents
# ============================================================================

section "Cleanup Previous Test Agents"

info "Removing any existing e2e-* agents..."
$CLI delete-all agents --pattern "e2e-.*" --force > $OUT 2>&1 || true
pass "Cleanup complete"

# ============================================================================
# Test: Validate Fleet Config
# ============================================================================

section "Validate Fleet Configs"

if $CLI validate -f "$FIXTURES/fleet.yml" > $OUT 2>&1; then
    pass "fleet.yml validation"
else
    fail "fleet.yml validation"
    cat $OUT
fi

if $CLI validate -f "$FIXTURES/fleet-updated.yml" > $OUT 2>&1; then
    pass "fleet-updated.yml validation"
else
    fail "fleet-updated.yml validation"
    cat $OUT
fi

# ============================================================================
# Test: Dry Run (should show creates)
# ============================================================================

section "Dry Run - Initial Fleet"

if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1; then
    if output_contains "CREATE"; then
        pass "Dry run shows creates"
    else
        fail "Dry run missing CREATE"
        cat $OUT
    fi
else
    fail "Dry run command failed"
    cat $OUT
fi

# ============================================================================
# Test: Apply Initial Fleet (20 agents)
# ============================================================================

section "Apply Initial Fleet (20 agents)"

info "Applying fleet.yml..."
if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Apply fleet.yml succeeded"
else
    fail "Apply fleet.yml failed"
    cat $OUT
fi

# Verify all 20 agents exist
section "Verify All Agents Created"

AGENTS=(
    "e2e-01-minimal"
    "e2e-02-prompt-file"
    "e2e-03-no-base-prompt"
    "e2e-04-large-context"
    "e2e-05-block-single"
    "e2e-06-blocks-multi"
    "e2e-07-block-file"
    "e2e-08-block-versioned"
    "e2e-09-shared-single"
    "e2e-10-shared-multi"
    "e2e-11-shared-and-memory"
    "e2e-12-folder-explicit"
    "e2e-13-folder-glob-txt"
    "e2e-14-folder-glob-all"
    "e2e-15-folders-multi"
    "e2e-16-tools-archival"
    "e2e-17-full-local"
    "e2e-18-shares-with-09"
    "e2e-19-shares-folder"
    "e2e-20-kitchen-sink"
)

for agent in "${AGENTS[@]}"; do
    if agent_exists "$agent"; then
        pass "Agent exists: $agent"
    else
        fail "Agent missing: $agent"
    fi
done

# ============================================================================
# Test: Verify Shared Blocks Created
# ============================================================================

section "Verify Shared Blocks"

if $CLI get blocks > $OUT 2>&1; then
    if output_contains "e2e-shared-inline"; then
        pass "Shared block: e2e-shared-inline"
    else
        fail "Missing shared block: e2e-shared-inline"
    fi

    if output_contains "e2e-shared-fromfile"; then
        pass "Shared block: e2e-shared-fromfile"
    else
        fail "Missing shared block: e2e-shared-fromfile"
    fi

    if output_contains "e2e-shared-versioned"; then
        pass "Shared block: e2e-shared-versioned"
    else
        fail "Missing shared block: e2e-shared-versioned"
    fi
else
    fail "Get blocks command failed"
fi

# ============================================================================
# Test: Idempotent Apply (no changes)
# ============================================================================

section "Idempotent Apply (No Changes Expected)"

if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1; then
    if output_contains "unchanged" || ! output_contains "Would"; then
        pass "Re-apply shows no changes needed"
    else
        fail "Re-apply incorrectly shows changes"
        cat $OUT
    fi
else
    fail "Idempotent dry-run failed"
    cat $OUT
fi

# ============================================================================
# Test: Describe Agents (spot check)
# ============================================================================

section "Describe Commands"

if $CLI describe agent e2e-01-minimal > $OUT 2>&1; then
    pass "Describe agent: e2e-01-minimal"
else
    fail "Describe agent failed"
fi

if $CLI describe agent e2e-20-kitchen-sink > $OUT 2>&1; then
    if output_contains "kitchen"; then
        pass "Describe agent: e2e-20-kitchen-sink"
    else
        fail "Describe missing expected content"
    fi
else
    fail "Describe kitchen-sink failed"
fi

# ============================================================================
# Test: Get Commands
# ============================================================================

section "Get Commands"

if $CLI get agents > $OUT 2>&1; then
    pass "Get agents (table)"
else
    fail "Get agents failed"
fi

if $CLI get agents -o json > $OUT 2>&1; then
    if grep -q '\[' "$OUT"; then
        pass "Get agents (json)"
    else
        fail "Get agents json format wrong"
    fi
else
    fail "Get agents json failed"
fi

if $CLI get blocks > $OUT 2>&1; then
    pass "Get blocks"
else
    fail "Get blocks failed"
fi

if $CLI get blocks --agent e2e-06-blocks-multi > $OUT 2>&1; then
    if output_contains "user_profile"; then
        pass "Get blocks filtered by agent"
    else
        fail "Get blocks filter missing expected block"
    fi
else
    fail "Get blocks --agent failed"
fi

if $CLI get tools > $OUT 2>&1; then
    pass "Get tools"
else
    fail "Get tools failed"
fi

if $CLI get folders > $OUT 2>&1; then
    pass "Get folders"
else
    fail "Get folders failed"
fi

# ============================================================================
# Test: Context and Files Commands
# ============================================================================

section "Context & Files Commands"

if $CLI context e2e-01-minimal > $OUT 2>&1; then
    pass "Context command"
else
    fail "Context command failed"
fi

if $CLI files e2e-12-folder-explicit > $OUT 2>&1; then
    pass "Files command"
else
    fail "Files command failed"
fi

# ============================================================================
# Test: Runs Commands
# ============================================================================

section "Runs Commands"

if $CLI runs > $OUT 2>&1; then
    pass "List runs"
else
    fail "List runs failed"
fi

if $CLI runs --limit 5 > $OUT 2>&1; then
    pass "List runs with limit"
else
    fail "List runs --limit failed"
fi

# ============================================================================
# Test: Apply Updated Fleet (Diff Detection)
# ============================================================================

section "Apply Updated Fleet (Diff Detection)"

info "Dry run to see what changes..."
if $CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1; then
    # Should show updates, not creates
    if output_contains "update" || output_contains "Update" || output_contains "~"; then
        pass "Dry run detects updates"
    else
        fail "Dry run not detecting updates"
        cat $OUT
    fi
else
    fail "Updated dry-run failed"
    cat $OUT
fi

info "Applying fleet-updated.yml..."
if $CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Apply fleet-updated.yml succeeded"
else
    fail "Apply fleet-updated.yml failed"
    cat $OUT
fi

# ============================================================================
# Test: Verify Diffs Applied
# ============================================================================

section "Verify Diffs Applied"

# Check agent 01 description changed
if $CLI describe agent e2e-01-minimal > $OUT 2>&1; then
    if output_contains "UPDATED"; then
        pass "Agent 01 description updated"
    else
        fail "Agent 01 description not updated"
    fi
else
    fail "Describe agent 01 failed"
fi

# Check agent 04 context window changed (200000 -> 180000)
if $CLI describe agent e2e-04-large-context > $OUT 2>&1; then
    if output_contains "180000"; then
        pass "Agent 04 context window updated"
    else
        fail "Agent 04 context window not updated"
    fi
else
    fail "Describe agent 04 failed"
fi

# Check agent 06 has new block
if $CLI get blocks --agent e2e-06-blocks-multi > $OUT 2>&1; then
    if output_contains "new_block"; then
        pass "Agent 06 new block added"
    else
        fail "Agent 06 new block missing"
    fi
else
    fail "Get blocks for agent 06 failed"
fi

# Check agent 20 has new memory block added
if $CLI get blocks --agent e2e-20-kitchen-sink > $OUT 2>&1; then
    if output_contains "brand_new_block"; then
        pass "Agent 20 new block added"
    else
        fail "Agent 20 new block missing"
    fi
else
    fail "Get blocks for agent 20 failed"
fi

# ============================================================================
# Test: Idempotent After Update
# ============================================================================

section "Idempotent After Update"

if $CLI apply -f "$FIXTURES/fleet-updated.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1; then
    if output_contains "unchanged" || ! output_contains "Would"; then
        pass "Post-update re-apply shows no changes"
    else
        fail "Post-update incorrectly shows changes"
        cat $OUT
    fi
else
    fail "Post-update idempotent check failed"
fi

# ============================================================================
# Test: Export Agent
# ============================================================================

section "Export Command"

EXPORT_FILE="$LOG_DIR/e2e-export-test.letta"
if $CLI export agent e2e-01-minimal -o "$EXPORT_FILE" > $OUT 2>&1; then
    if [ -f "$EXPORT_FILE" ]; then
        pass "Export agent created file"
        rm -f "$EXPORT_FILE"
    else
        fail "Export file not created"
    fi
else
    fail "Export command failed"
fi

# ============================================================================
# Test: Delete Single Agent
# ============================================================================

section "Delete Commands"

if $CLI delete agent e2e-01-minimal --force > $OUT 2>&1; then
    if ! agent_exists "e2e-01-minimal"; then
        pass "Delete single agent"
    else
        fail "Agent still exists after delete"
    fi
else
    fail "Delete command failed"
fi

# ============================================================================
# Cleanup
# ============================================================================

section "Cleanup"

info "Removing all e2e-* agents..."
$CLI delete-all agents --pattern "e2e-.*" --force > $OUT 2>&1 || true
pass "Cleanup complete"

# Verify cleanup
if $CLI get agents > $OUT 2>&1; then
    if output_contains "e2e-"; then
        fail "Some e2e agents remain"
    else
        pass "All e2e agents removed"
    fi
fi

# ============================================================================
# Summary
# ============================================================================

section "Summary"

TOTAL=$((PASSED + FAILED))
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASSED"
echo -e "  ${RED}Failed:${NC} $FAILED"
echo -e "  Total:  $TOTAL"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}E2E TESTS FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}ALL E2E TESTS PASSED${NC}"
    exit 0
fi
