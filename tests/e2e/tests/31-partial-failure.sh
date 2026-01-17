#!/bin/bash
# Test: Partial failure handling (kubectl-style continue on error)
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

    # Verify summary output
    if output_contains "Succeeded:" && output_contains "Failed:"; then
        pass "Summary shows succeeded/failed counts"
    else
        fail "Missing summary output"
        cat $OUT
    fi
fi

# Cleanup
delete_agents_matching "e2e-partial-"
pass "Cleanup complete"
