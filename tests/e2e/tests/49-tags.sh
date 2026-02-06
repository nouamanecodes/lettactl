#!/bin/bash

# Test: Agent tags - set via YAML, filter via get
# Issue: #212

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-49-tags-a"
AGENT_B="e2e-49-tags-b"
AGENT_C="e2e-49-tags-c"

section "Test: Agent Tags (#212)"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"

# Deploy agents with tags
$CLI apply -f "$FIXTURES/fleet-tags-test.yml" --root "$FIXTURES" > $OUT 2>&1
output_contains "created" && pass "Tagged agents deployed" || fail "Deploy failed"

# Verify agents exist
agent_exists "$AGENT_A" && pass "Agent A exists" || fail "Agent A missing"
agent_exists "$AGENT_B" && pass "Agent B exists" || fail "Agent B missing"
agent_exists "$AGENT_C" && pass "Agent C exists" || fail "Agent C missing"

# Filter by tenant tag
$CLI get agents --tags "tenant:acme" -o json > $OUT 2>&1
output_contains "$AGENT_A" && pass "Tag filter includes agent A" || fail "Tag filter missing agent A"
output_contains "$AGENT_B" && pass "Tag filter includes agent B" || fail "Tag filter missing agent B"
output_not_contains "$AGENT_C" && pass "Tag filter excludes untagged agent C" || fail "Tag filter should exclude agent C"

# Filter by role tag
$CLI get agents --tags "role:support" -o json > $OUT 2>&1
output_contains "$AGENT_A" && pass "Role filter includes support agent" || fail "Role filter missing support agent"
output_not_contains "$AGENT_B" && pass "Role filter excludes research agent" || fail "Role filter should exclude research agent"

# Filter by nonexistent tag
$CLI get agents --tags "tenant:nonexistent" -o json > $OUT 2>&1
output_not_contains "$AGENT_A" && pass "Nonexistent tag returns no matches" || fail "Should return no matches"

# Cleanup
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
delete_agent_if_exists "$AGENT_C"

print_summary
