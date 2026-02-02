#!/bin/bash

# lettactl E2E Test Suite
# Modular test runner - discovers and runs tests from tests/e2e/tests/

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
DIM='\033[2m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
TESTS_RUN=0

# Parse flags
QUIET_FLAG=""
FILTER=""
while [[ $# -gt 0 ]]; do
    case $1 in
        -q|--quiet)
            QUIET_FLAG="-q"
            shift
            ;;
        --filter|-f)
            FILTER="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --filter, -f <pattern>  Run only tests matching pattern (e.g., '4*', 'block*')"
            echo "  -q, --quiet             Quiet mode"
            echo "  -h, --help              Show this help"
            echo ""
            echo "Examples:"
            echo "  $0                      # Run all tests"
            echo "  $0 --filter '45*'       # Run test 45 only"
            echo "  $0 --filter '4*'        # Run tests 40-49"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TESTS_DIR="$SCRIPT_DIR/tests"
FIXTURES="$SCRIPT_DIR/fixtures"
CLI="node $ROOT_DIR/dist/index.js $QUIET_FLAG"
LOG_DIR="$ROOT_DIR/logs"
OUT="$LOG_DIR/e2e-out.txt"

# Export for child test scripts
export QUIET_FLAG
export LETTA_BASE_URL

# Ensure logs dir exists
mkdir -p "$LOG_DIR"

# Timestamped log file
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/e2e-$TIMESTAMP.log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo -e "${DIM}Log: $LOG_FILE${NC}"

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
# Initial Cleanup
# ============================================================================

section "Cleanup Previous Test Agents"

info "Removing any existing e2e-* agents..."
$CLI delete-all agents --pattern "e2e-.*" --force > $OUT 2>&1 || true
pass "Cleanup complete"

# ============================================================================
# Discover and Run Tests
# ============================================================================

section "Running Tests"

# Find test files (.sh and .js)
if [ -n "$FILTER" ]; then
    info "Filter: $FILTER"
    TEST_FILES=$(find "$TESTS_DIR" -maxdepth 1 \( -name "${FILTER}.sh" -o -name "${FILTER}.js" \) 2>/dev/null | sort || true)
else
    TEST_FILES=$(find "$TESTS_DIR" -maxdepth 1 \( -name "*.sh" -o -name "*.js" \) 2>/dev/null | sort || true)
fi

if [ -z "$TEST_FILES" ]; then
    echo -e "${YELLOW}No tests found${NC}"
    exit 0
fi

# Count tests
TEST_COUNT=$(echo "$TEST_FILES" | wc -l)
info "Found $TEST_COUNT test(s)"
echo ""

# Run each test
for TEST_FILE in $TEST_FILES; do
    # Get test name without extension
    TEST_NAME=$(basename "$TEST_FILE" | sed -e 's/\.sh$//' -e 's/\.js$//')
    TESTS_RUN=$((TESTS_RUN + 1))

    # Determine test type
    if [[ "$TEST_FILE" == *.js ]]; then
        TEST_TYPE="SDK"
    else
        TEST_TYPE="CLI"
    fi

    echo -ne "${BLUE}[$TESTS_RUN/$TEST_COUNT]${NC} $TEST_NAME ${DIM}($TEST_TYPE)${NC} ... "

    # Create temp file for output
    TEST_OUT="$LOG_DIR/test-$TEST_NAME.out"

    # Run test and capture time
    START_TIME=$(date +%s)

    if [[ "$TEST_FILE" == *.js ]]; then
        # Run JS/SDK test with node
        if node "$TEST_FILE" > "$TEST_OUT" 2>&1; then
            TEST_EXIT=0
        else
            TEST_EXIT=$?
        fi
    else
        # Run bash test
        if bash "$TEST_FILE" > "$TEST_OUT" 2>&1; then
            TEST_EXIT=0
        else
            TEST_EXIT=$?
        fi
    fi

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))

    # Extract pass/fail counts from output
    TEST_PASSED=$(grep -c "^\[PASS\]" "$TEST_OUT" 2>/dev/null) || TEST_PASSED=0
    TEST_FAILED=$(grep -c "^\[FAIL\]" "$TEST_OUT" 2>/dev/null) || TEST_FAILED=0

    PASSED=$((PASSED + ${TEST_PASSED:-0}))
    FAILED=$((FAILED + ${TEST_FAILED:-0}))

    if [ $TEST_EXIT -eq 0 ] && [ "$TEST_FAILED" -eq 0 ]; then
        echo -e "${GREEN}PASS${NC} ${DIM}(${TEST_PASSED} checks, ${DURATION}s)${NC}"
    else
        echo -e "${RED}FAIL${NC} ${DIM}(${TEST_PASSED} pass, ${TEST_FAILED} fail, ${DURATION}s)${NC}"
        # Show failure details
        echo -e "${DIM}─── Failures ───${NC}"
        grep "^\[FAIL\]" "$TEST_OUT" 2>/dev/null | head -10 || true
        echo -e "${DIM}────────────────${NC}"
    fi
done

# ============================================================================
# Cleanup
# ============================================================================

section "Cleanup"

info "Removing all e2e-* agents..."
$CLI delete-all agents --pattern "e2e-.*" --force > $OUT 2>&1 || true
pass "Cleanup complete"

# ============================================================================
# Summary
# ============================================================================

section "Summary"

TOTAL=$((PASSED + FAILED))
echo ""
echo -e "  Tests run:       $TESTS_RUN"
echo -e "  ${GREEN}Checks passed:${NC} $PASSED"
echo -e "  ${RED}Checks failed:${NC} $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${RED}E2E TESTS FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}ALL E2E TESTS PASSED${NC}"
    exit 0
fi
