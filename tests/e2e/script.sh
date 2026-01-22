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
# Test: Invalid Configs (should fail)
# ============================================================================

section "Invalid Config Validation"

# fleet-invalid.yml contains multiple invalid configs - any validation error is a pass
if $CLI apply -f "$FIXTURES/fleet-invalid.yml" --dry-run > $OUT 2>&1; then
    fail "fleet-invalid.yml should have failed validation"
    cat $OUT
else
    # Check for any expected validation error
    if output_contains "Self-hosted Letta requires explicit embedding" || \
       output_contains "Missing required fields in from_bucket" || \
       output_contains "unsupported provider"; then
        pass "Invalid config rejected"
    else
        fail "Unexpected error from invalid config"
        cat $OUT
    fi
fi

# ============================================================================
# Test: Partial Failure Handling (kubectl-style continue on error)
# ============================================================================

section "Partial Failure Handling"

# Cleanup any existing partial failure test agents
$CLI delete-all agents --pattern "e2e-partial-.*" --force > /dev/null 2>&1 || true

# Apply should continue despite failures and exit non-zero
if $CLI apply -f "$FIXTURES/fleet-partial-failure.yml" > $OUT 2>&1; then
    fail "Apply should have exited non-zero due to failures"
    cat $OUT
else
    # Verify we continued processing (both valid agents should exist)
    if $CLI get agents 2>/dev/null | grep -q "e2e-partial-valid-1" && \
       $CLI get agents 2>/dev/null | grep -q "e2e-partial-valid-2"; then
        pass "Continued after failure - both valid agents created"
    else
        fail "Did not continue after failure"
        cat $OUT
    fi

    # Verify summary output shows 2 succeeded, 3 failed
    if output_contains "Succeeded: 2" && output_contains "Failed: 3"; then
        pass "Summary shows correct counts (2 succeeded, 3 failed)"
    else
        fail "Incorrect summary counts"
        cat $OUT
    fi

    # Verify explicit error for missing shared block
    if output_contains "Shared block" && output_contains "not found"; then
        pass "Missing shared block error surfaced"
    else
        fail "Missing shared block error not shown"
        cat $OUT
    fi

    # Verify explicit error for missing tool
    if output_contains "Tool" && output_contains "not found"; then
        pass "Missing tool error surfaced"
    else
        fail "Missing tool error not shown"
        cat $OUT
    fi
fi

# Cleanup partial failure test agents
$CLI delete-all agents --pattern "e2e-partial-.*" --force > /dev/null 2>&1 || true

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
# Test: Apply Initial Fleet (30 agents)
# ============================================================================

section "Apply Initial Fleet (30 agents)"

info "Applying fleet.yml..."
if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Apply fleet.yml succeeded"
else
    fail "Apply fleet.yml failed"
    cat $OUT
fi

# Verify all 30 agents exist
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
    "e2e-21-folder-tools-auto"
    "e2e-22-bucket-glob"
    "e2e-23-bucket-single"
    "e2e-24-mixed-sources"
    "e2e-25-immutable-block"
    "e2e-26-empty-block"
    "e2e-27-block-removal"
    "e2e-28-special-chars"
    "e2e-29-unicode-content"
    "e2e-30-cleanup-test"
    "e2e-33-block-isolation-a"
    "e2e-33-block-isolation-b"
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

# Check agent 25 immutable block value synced (mutable: false)
# The policies block value should update from "Policy version 1..." to "Policy version 2..."
# describe block shows the actual value preview
if $CLI describe block policies > $OUT 2>&1; then
    if output_contains "version 2"; then
        pass "Agent 25 immutable block value synced"
    else
        fail "Agent 25 immutable block value not synced (should contain 'version 2')"
        cat $OUT
    fi
else
    fail "Describe block policies failed"
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
# Test: Bucket Files Idempotence (#98, #100)
# ============================================================================

section "Bucket Files Idempotence"

# Test that bucket glob agents show no FILE changes on re-apply
# (tool changes may occur due to test flow but files should be stable)
if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent e2e-22-bucket-glob --dry-run > $OUT 2>&1; then
    if ! output_contains "Added file" && ! output_contains "Removed file" && ! output_contains "Updated file"; then
        pass "Bucket glob files idempotent"
    else
        fail "Bucket glob files showing changes on re-apply"
        cat $OUT
    fi
else
    fail "Bucket glob idempotence check failed"
    cat $OUT
fi

# Test single bucket file idempotence
if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent e2e-23-bucket-single --dry-run > $OUT 2>&1; then
    if ! output_contains "Added file" && ! output_contains "Removed file" && ! output_contains "Updated file"; then
        pass "Single bucket file idempotent"
    else
        fail "Single bucket file showing changes on re-apply"
        cat $OUT
    fi
else
    fail "Single bucket idempotence check failed"
    cat $OUT
fi

# Test mixed local + bucket idempotence
if $CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent e2e-24-mixed-sources --dry-run > $OUT 2>&1; then
    if ! output_contains "Added file" && ! output_contains "Removed file" && ! output_contains "Updated file"; then
        pass "Mixed local+bucket files idempotent"
    else
        fail "Mixed files showing changes on re-apply"
        cat $OUT
    fi
else
    fail "Mixed files idempotence check failed"
    cat $OUT
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
# Test: --force Reconciliation (#123)
# ============================================================================

section "Force Reconciliation (--force flag)"

# Cleanup any existing force test agent
$CLI delete agent e2e-force-test --force > /dev/null 2>&1 || true

# Create agent with multiple blocks and tools
info "Creating agent with block_keep, block_remove, send_message, conversation_search..."
if $CLI apply -f "$FIXTURES/fleet-force-test.yml" > $OUT 2>&1; then
    pass "Created force test agent"
else
    fail "Failed to create force test agent"
    cat $OUT
fi

# Verify both blocks exist
if $CLI get blocks --agent e2e-force-test > $OUT 2>&1; then
    if output_contains "block_keep" && output_contains "block_remove"; then
        pass "Both blocks attached initially"
    else
        fail "Initial blocks not attached"
        cat $OUT
    fi
fi

# Apply reduced config WITHOUT --force - blocks should remain
info "Applying reduced config WITHOUT --force..."
if $CLI apply -f "$FIXTURES/fleet-force-test-reduced.yml" > $OUT 2>&1; then
    # Check that block_remove is still attached (not removed without --force)
    if $CLI get blocks --agent e2e-force-test > $OUT 2>&1; then
        if output_contains "block_remove"; then
            pass "block_remove retained without --force"
        else
            fail "block_remove incorrectly removed without --force"
        fi
    fi
else
    fail "Apply reduced config failed"
    cat $OUT
fi

# Verify dry-run shows "(requires --force)" for removals
info "Checking dry-run shows --force requirement..."
if $CLI apply -f "$FIXTURES/fleet-force-test-reduced.yml" --dry-run > $OUT 2>&1; then
    if output_contains "requires --force"; then
        pass "Dry-run indicates --force required for removals"
    else
        # If block was already removed, this would fail - check if block still exists
        if $CLI get blocks --agent e2e-force-test 2>/dev/null | grep -q "block_remove"; then
            fail "Dry-run missing --force indicator"
            cat $OUT
        else
            pass "No removals pending (block already processed)"
        fi
    fi
fi

# Apply reduced config WITH --force - block_remove should be detached
info "Applying reduced config WITH --force..."
if $CLI apply -f "$FIXTURES/fleet-force-test-reduced.yml" --force > $OUT 2>&1; then
    # Check that block_remove is now gone
    if $CLI get blocks --agent e2e-force-test > $OUT 2>&1; then
        if output_contains "block_keep" && ! output_contains "block_remove"; then
            pass "block_remove detached with --force"
        else
            if output_contains "block_remove"; then
                fail "block_remove not removed with --force"
            else
                fail "block_keep also missing"
            fi
            cat $OUT
        fi
    fi
else
    fail "Apply with --force failed"
    cat $OUT
fi

# Cleanup force test agent
$CLI delete agent e2e-force-test --force > /dev/null 2>&1 || true

# ============================================================================
# Test: Protected Memory Tools (#130)
# ============================================================================

section "Protected Memory Tools (#130)"

# Cleanup any existing test agent
$CLI delete agent e2e-memory-tools-test --force > /dev/null 2>&1 || true

# Create agent with all memory tools
info "Creating agent with memory tools..."
if $CLI apply -f "$FIXTURES/fleet-memory-tools-test.yml" > $OUT 2>&1; then
    pass "Created memory tools test agent"
else
    fail "Failed to create memory tools test agent"
    cat $OUT
fi

# Verify all memory tools are attached
$CLI get tools --agent e2e-memory-tools-test > $OUT 2>&1
if output_contains "memory_insert"; then
    pass "memory_insert attached"
else
    fail "memory_insert not attached"
fi
if output_contains "memory_replace"; then
    pass "memory_replace attached"
else
    fail "memory_replace not attached"
fi
if output_contains "memory_rethink"; then
    pass "memory_rethink attached"
else
    fail "memory_rethink not attached"
fi

# Apply reduced config that doesn't list memory tools (no --force)
info "Applying config WITHOUT memory tools listed (no --force)..."
$CLI apply -f "$FIXTURES/fleet-memory-tools-reduced.yml" > $OUT 2>&1

# All protected tools should remain
$CLI get tools --agent e2e-memory-tools-test > $OUT 2>&1
if output_contains "memory_insert"; then
    pass "memory_insert preserved"
else
    fail "memory_insert incorrectly removed"
fi
if output_contains "memory_replace"; then
    pass "memory_replace preserved"
else
    fail "memory_replace incorrectly removed"
fi
if output_contains "memory_rethink"; then
    pass "memory_rethink preserved"
else
    fail "memory_rethink incorrectly removed"
fi
if output_contains "conversation_search"; then
    pass "conversation_search preserved"
else
    fail "conversation_search incorrectly removed"
fi

# With --force: ALL protected tools should STILL stay
info "Applying config with --force..."
$CLI apply -f "$FIXTURES/fleet-memory-tools-reduced.yml" --force > $OUT 2>&1

$CLI get tools --agent e2e-memory-tools-test > $OUT 2>&1
if output_contains "memory_insert"; then
    pass "memory_insert preserved with --force"
else
    fail "memory_insert removed despite being protected"
fi
if output_contains "memory_replace"; then
    pass "memory_replace preserved with --force"
else
    fail "memory_replace removed despite being protected"
fi
if output_contains "memory_rethink"; then
    pass "memory_rethink preserved with --force"
else
    fail "memory_rethink removed despite being protected"
fi
if output_contains "conversation_search"; then
    pass "conversation_search preserved with --force"
else
    fail "conversation_search removed despite being protected"
fi

# Cleanup
$CLI delete agent e2e-memory-tools-test --force > /dev/null 2>&1 || true

# ============================================================================
# Test: Folder File Change Detection (#127)
# ============================================================================

section "Folder File Change Detection (#127)"

# Cleanup any existing test agent
$CLI delete agent e2e-folder-files-test --force > /dev/null 2>&1 || true

# Create agent with 2 files
info "Creating agent with doc1.txt and doc2.txt..."
if $CLI apply -f "$FIXTURES/fleet-folder-files-test.yml" --root "$FIXTURES" > $OUT 2>&1; then
    pass "Created folder files test agent"
else
    fail "Failed to create folder files test agent"
    cat $OUT
fi

# Re-apply same config - should show no file changes
info "Re-applying same config (should be idempotent)..."
if $CLI apply -f "$FIXTURES/fleet-folder-files-test.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1; then
    if output_contains "Updated file" || output_contains "Added file"; then
        fail "Idempotent re-apply incorrectly shows file changes"
        cat $OUT
    else
        pass "Idempotent re-apply shows no file changes"
    fi
fi

# Apply config with added file - only new file should show as added
info "Applying config with additional file (data.json)..."
$CLI apply -f "$FIXTURES/fleet-folder-files-added.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1

# Dry-run shows "+1 files" format
if output_contains "+1 files"; then
    pass "New file detected in dry-run"
else
    fail "New file not detected in dry-run"
    cat $OUT
fi

# Should NOT show any files as updated
if output_contains "Updated file" || grep -q "~[0-9]* files" $OUT; then
    fail "Existing files incorrectly marked as updated"
    cat $OUT
else
    pass "Existing files not marked as updated"
fi

# Actually apply and verify idempotence
$CLI apply -f "$FIXTURES/fleet-folder-files-added.yml" --root "$FIXTURES" > $OUT 2>&1
$CLI apply -f "$FIXTURES/fleet-folder-files-added.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1
if output_contains "Updated file" || output_contains "Added file" || output_contains "+1 files"; then
    fail "Post-change re-apply incorrectly shows file changes"
    cat $OUT
else
    pass "Post-change re-apply shows no file changes"
fi

# Cleanup
$CLI delete agent e2e-folder-files-test --force > /dev/null 2>&1 || true

# ============================================================================
# Test: Memory Block Live Access
# ============================================================================

section "Memory Block Live Access"

# Cleanup any existing test agent
$CLI delete agent e2e-memory-live-test --force > /dev/null 2>&1 || true

# Create agent without memory block
info "Creating agent without memory block..."
if $CLI apply -f "$FIXTURES/fleet-memory-block-live-test.yml" > $OUT 2>&1; then
    pass "Created agent without memory block"
else
    fail "Failed to create agent"
    cat $OUT
fi

# Verify no secret_code block initially
$CLI get blocks --agent e2e-memory-live-test > $OUT 2>&1
if output_contains "secret_code"; then
    fail "secret_code block should not exist yet"
else
    pass "No secret_code block initially"
fi

# Add memory block via apply
info "Adding memory block via apply..."
$CLI apply -f "$FIXTURES/fleet-memory-block-live-updated.yml" > $OUT 2>&1

# Verify memory block is attached
$CLI get blocks --agent e2e-memory-live-test > $OUT 2>&1
if output_contains "secret_code"; then
    pass "secret_code block attached"
else
    fail "secret_code block not attached"
fi

# Verify agent can access the block content
info "Sending message to verify block access..."
$CLI send e2e-memory-live-test "What is in your secret_code memory block? Tell me the exact value." > $OUT 2>&1
if output_contains "PHOENIX-42"; then
    pass "Agent can access memory block content"
else
    fail "Agent cannot access memory block content"
    cat $OUT
fi

# Cleanup
$CLI delete agent e2e-memory-live-test --force > /dev/null 2>&1 || true

# ============================================================================
# Test: First Message on Creation (#134)
# ============================================================================

section "First Message on Creation (#134)"

# Cleanup any existing test agent
$CLI delete agent e2e-first-message-test --force > /dev/null 2>&1 || true

# Create agent with first_message
info "Creating agent with first_message..."
if $CLI apply -f "$FIXTURES/fleet-first-message-test.yml" > $OUT 2>&1; then
    if output_contains "First message completed"; then
        pass "First message sent and completed"
    else
        fail "First message not sent"
        cat $OUT
    fi
else
    fail "Failed to create agent with first_message"
    cat $OUT
fi

# Verify agent remembers first message content
info "Verifying agent remembers first message content..."
$CLI send e2e-first-message-test "What secret code were you told to remember? Tell me the exact code." > $OUT 2>&1
if output_contains "CALIBRATION-99"; then
    pass "Agent remembers content from first_message"
else
    fail "Agent does not remember first_message content"
    cat $OUT
fi

# Cleanup
$CLI delete agent e2e-first-message-test --force > /dev/null 2>&1 || true

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
