#!/bin/bash
# E2E Test Runner for lettactl
# Usage: ./tests/e2e/run-e2e-tests.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
E2E_DIR="$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
SKIPPED=0

# Check if LETTA_BASE_URL is set
if [ -z "$LETTA_BASE_URL" ]; then
    export LETTA_BASE_URL="http://localhost:8283"
    echo -e "${YELLOW}Using default LETTA_BASE_URL: $LETTA_BASE_URL${NC}"
fi

# Build the project first
echo "Building lettactl..."
cd "$PROJECT_ROOT"
pnpm build

# Function to run a test
run_test() {
    local test_name="$1"
    local yaml_file="$2"
    local expect_fail="${3:-false}"

    echo -n "Testing $test_name... "

    if [ "$expect_fail" = "true" ]; then
        if node "$PROJECT_ROOT/dist/index.js" apply -f "$yaml_file" 2>/dev/null; then
            echo -e "${RED}FAILED${NC} (expected failure but succeeded)"
            FAILED=$((FAILED + 1))
            return 1
        else
            echo -e "${GREEN}PASSED${NC} (failed as expected)"
            PASSED=$((PASSED + 1))
            return 0
        fi
    else
        if node "$PROJECT_ROOT/dist/index.js" apply -f "$yaml_file" 2>&1; then
            echo -e "${GREEN}PASSED${NC}"
            PASSED=$((PASSED + 1))
            return 0
        else
            echo -e "${RED}FAILED${NC}"
            FAILED=$((FAILED + 1))
            return 1
        fi
    fi
}

# Function to run validation test
run_validate_test() {
    local test_name="$1"
    local yaml_file="$2"
    local expect_fail="${3:-false}"

    echo -n "Validating $test_name... "

    if [ "$expect_fail" = "true" ]; then
        if node "$PROJECT_ROOT/dist/index.js" validate -f "$yaml_file" 2>/dev/null; then
            echo -e "${RED}FAILED${NC} (expected validation failure)"
            FAILED=$((FAILED + 1))
            return 1
        else
            echo -e "${GREEN}PASSED${NC} (validation failed as expected)"
            PASSED=$((PASSED + 1))
            return 0
        fi
    else
        if node "$PROJECT_ROOT/dist/index.js" validate -f "$yaml_file" 2>&1; then
            echo -e "${GREEN}PASSED${NC}"
            PASSED=$((PASSED + 1))
            return 0
        else
            echo -e "${RED}FAILED${NC}"
            FAILED=$((FAILED + 1))
            return 1
        fi
    fi
}

# Function to test get commands
run_get_test() {
    local resource="$1"
    echo -n "Testing get $resource... "

    if node "$PROJECT_ROOT/dist/index.js" get "$resource" 2>&1 >/dev/null; then
        echo -e "${GREEN}PASSED${NC}"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# Function to cleanup test agents
cleanup_e2e_agents() {
    echo "Cleaning up e2e test agents..."
    node "$PROJECT_ROOT/dist/index.js" delete-all agents --pattern "e2e-.*" --force 2>/dev/null || true
}

echo ""
echo "=========================================="
echo "  lettactl E2E Test Suite"
echo "=========================================="
echo ""

# Cleanup any previous test data
cleanup_e2e_agents

echo ""
echo "--- Apply Tests ---"
echo ""

# Run apply tests - minimal set for CI speed
cd "$E2E_DIR"
run_test "01-basic-agent" "01-basic-agent.yaml" || true
run_test "03-shared-blocks" "03-shared-blocks.yaml" || true
run_test "04-tools" "04-tools.yaml" || true
run_test "07-multi-agent" "07-multi-agent.yaml" || true
run_test "14-from-file" "14-from-file.yaml" || true

echo ""
echo "--- Idempotency Test ---"
echo ""

# Run same config twice to test idempotency
echo -n "Testing idempotency (re-apply 01-basic-agent)... "
if node "$PROJECT_ROOT/dist/index.js" apply -f "01-basic-agent.yaml" 2>&1 | grep -q "unchanged\|up to date\|No changes"; then
    echo -e "${GREEN}PASSED${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${YELLOW}WARNING${NC} (may have detected changes)"
fi

echo ""
echo "--- Validation Tests ---"
echo ""

run_validate_test "valid-config" "01-basic-agent.yaml" || true
run_validate_test "invalid-config" "13-validation-errors.yaml" true || true

echo ""
echo "--- Get Command Tests ---"
echo ""

cd "$PROJECT_ROOT"
run_get_test "agents" || true
run_get_test "tools" || true

echo ""
echo "--- Delete Tests ---"
echo ""

echo -n "Testing delete agent... "
if node "$PROJECT_ROOT/dist/index.js" delete agent e2e-basic-agent --force 2>&1; then
    echo -e "${GREEN}PASSED${NC}"
    PASSED=$((PASSED + 1))
else
    echo -e "${RED}FAILED${NC}"
    FAILED=$((FAILED + 1))
fi

echo ""
echo "--- Cleanup ---"
echo ""

cleanup_e2e_agents

echo ""
echo "=========================================="
echo "  E2E Test Results"
echo "=========================================="
echo -e "  ${GREEN}Passed:${NC}  $PASSED"
echo -e "  ${RED}Failed:${NC}  $FAILED"
echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
echo "=========================================="
echo ""

if [ $FAILED -gt 0 ]; then
    exit 1
fi

exit 0
