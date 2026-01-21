#!/bin/bash
# Test: Folder file change detection (#127)
# Only changed files should be marked as updated, not all files
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-folder-files-test"
section "Test: Folder File Change Detection (#127)"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Create agent with 2 files
info "Creating agent with doc1.txt and doc2.txt..."
$CLI apply -f "$FIXTURES/fleet-folder-files-test.yml" --root "$FIXTURES" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Re-apply same config - should show no file changes
info "Re-applying same config (should be idempotent)..."
$CLI apply -f "$FIXTURES/fleet-folder-files-test.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1
if output_contains "Updated file" || output_contains "Added file"; then
    fail "Idempotent re-apply incorrectly shows file changes"
    cat $OUT
else
    pass "Idempotent re-apply shows no file changes"
fi

# Apply config with added file - only new file should show as added
info "Applying config with additional file (data.json)..."
$CLI apply -f "$FIXTURES/fleet-folder-files-added.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1

# Dry-run shows "+1 files" format, actual apply shows "Added file:"
if output_contains "+1 files"; then
    pass "New file detected in dry-run (+1 files)"
else
    fail "New file not detected in dry-run"
    cat $OUT
fi

# Should NOT show any files as updated (would show "~X files" or "Updated file")
if output_contains "Updated file" || grep -q "~[0-9]* files" $OUT; then
    fail "Existing files incorrectly marked as updated"
    cat $OUT
else
    pass "Existing files not marked as updated"
fi

# Actually apply the change
info "Applying the change..."
$CLI apply -f "$FIXTURES/fleet-folder-files-added.yml" --root "$FIXTURES" > $OUT 2>&1

# Re-apply again - should be idempotent
info "Re-applying after change (should be idempotent)..."
$CLI apply -f "$FIXTURES/fleet-folder-files-added.yml" --root "$FIXTURES" --dry-run > $OUT 2>&1
if output_contains "Updated file" || output_contains "Added file"; then
    fail "Post-change re-apply incorrectly shows file changes"
    cat $OUT
else
    pass "Post-change re-apply shows no file changes"
fi

delete_agent_if_exists "$AGENT"
print_summary
