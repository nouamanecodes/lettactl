#!/bin/bash
# Test: Partial failure handling (kubectl-style continue on error)
# Tests: invalid model, missing shared block, missing tool
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

FIXTURE="$SCRIPT_DIR/../fixtures/fleet-partial-failure.yml"

# Cleanup any existing test agents
delete_agents_matching "e2e-partial-"

# Apply should continue despite failures and exit non-zero
if $CLI apply -f "$FIXTURE" > $OUT 2>&1; then
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

# Cleanup
delete_agents_matching "e2e-partial-"
pass "Cleanup complete"
