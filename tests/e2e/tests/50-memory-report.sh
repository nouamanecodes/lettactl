#!/bin/bash

# Test: report memory command
# Issue: #215

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-50-report-a"

section "Test: Memory Report (#215)"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup
delete_agent_if_exists "$AGENT_A"

# Deploy agent with healthy + polluted blocks
$CLI apply -f "$FIXTURES/fleet-memory-report-test.yml" --root "$FIXTURES" > $OUT 2>&1
output_contains "created" && pass "Report agent deployed" || fail "Deploy failed"

# JSON report contains block usage data
$CLI report memory "$AGENT_A" -o json > $OUT 2>&1
output_contains "fillPct" && pass "Memory report shows fill percentage" || fail "Missing fillPct"
output_contains "client_info" && pass "Healthy block present" || fail "Missing healthy block"
output_contains "conversation_notes" && pass "Polluted block present" || fail "Missing polluted block"

# Cleanup
delete_agent_if_exists "$AGENT_A"

print_summary
