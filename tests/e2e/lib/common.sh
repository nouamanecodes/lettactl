#!/bin/bash

# Shared functions for lettactl E2E tests

# Counters (can be overridden by sourcing script)
PASSED=${PASSED:-0}
FAILED=${FAILED:-0}

# Paths - calculate from this file's location
COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "$COMMON_DIR/.." && pwd)"
ROOT_DIR="$(cd "$E2E_DIR/../.." && pwd)"
FIXTURES="$E2E_DIR/fixtures"
LOG_DIR="$ROOT_DIR/logs"
OUT="$LOG_DIR/e2e-out.txt"

# CLI command
QUIET_FLAG="${QUIET_FLAG:-}"
CLI="node $ROOT_DIR/dist/index.js $QUIET_FLAG"

# ============================================================================
# Test Helper Functions
# ============================================================================

pass() {
    echo "[PASS] $1"
    PASSED=$((PASSED + 1))
}

fail() {
    echo "[FAIL] $1"
    FAILED=$((FAILED + 1))
}

info() {
    echo "[INFO] $1"
}

warn() {
    echo "[WARN] $1"
}

section() {
    echo ""
    echo "================================================================"
    echo " $1"
    echo "================================================================"
}

# Check if agent exists by name
agent_exists() {
    $CLI get agents > "$OUT" 2>&1 && grep -q "$1" "$OUT"
}

# Check output contains string
output_contains() {
    grep -q "$1" "$OUT"
}

# Check output does NOT contain string
output_not_contains() {
    ! grep -q "$1" "$OUT"
}

# Delete agent if exists (silent)
delete_agent_if_exists() {
    local name="$1"
    if agent_exists "$name"; then
        $CLI delete agent "$name" --force > /dev/null 2>&1 || true
    fi
}

# Delete all agents matching pattern
delete_agents_matching() {
    local pattern="$1"
    $CLI get agents 2>/dev/null | grep -o "$pattern[^ ]*" | while read -r agent; do
        $CLI delete agent "$agent" --force > /dev/null 2>&1 || true
    done
}

# ============================================================================
# Pre-flight Check
# ============================================================================

preflight_check() {
    if [ -z "$LETTA_BASE_URL" ]; then
        echo "ERROR: LETTA_BASE_URL not set"
        echo ""
        echo "E2E tests require a running Letta server."
        echo ""
        echo "  1. Start server:  letta server"
        echo "  2. Set URL:       export LETTA_BASE_URL=http://localhost:8283"
        echo "  3. Run tests:     ./tests/e2e/run-all.sh"
        echo ""
        exit 1
    fi

    info "LETTA_BASE_URL: $LETTA_BASE_URL"

    # Check server is reachable
    if curl -s "$LETTA_BASE_URL/v1/health" > /dev/null 2>&1; then
        pass "Server reachable"
    else
        fail "Cannot reach server at $LETTA_BASE_URL"
        exit 1
    fi

    # Check CLI is built
    if [ -f "$ROOT_DIR/dist/index.js" ]; then
        pass "CLI built"
    else
        fail "CLI not built - run 'pnpm build' first"
        exit 1
    fi
}

# ============================================================================
# Summary
# ============================================================================

print_summary() {
    section "Summary"
    echo ""
    echo "  Passed: $PASSED"
    echo "  Failed: $FAILED"
    echo "  Total:  $((PASSED + FAILED))"
    echo ""

    if [ $FAILED -eq 0 ]; then
        echo "ALL TESTS PASSED"
        return 0
    else
        echo "TESTS FAILED"
        return 1
    fi
}

# ============================================================================
# Setup / Teardown
# ============================================================================

setup_logging() {
    mkdir -p "$LOG_DIR"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    LOG_FILE="$LOG_DIR/e2e-$TIMESTAMP.log"
    exec > >(tee -a "$LOG_FILE") 2>&1
    echo "Log file: $LOG_FILE"
}
