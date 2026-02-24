#!/bin/bash
# Test: Cross-tenant resource isolation (#267)
# Verifies that applying fleet configs for separate tenants in sequence
# does not leak blocks/resources across tenant boundaries.
#
# Scenario:
#   1. Deploy tenant A fleet (creates tenant_a_* blocks)
#   2. Deploy tenant B fleet (creates tenant_b_* blocks)
#   3. Re-deploy tenant A — should NOT show tenant B resources as drift
#   4. Dry-run tenant A — output must not mention tenant_b_*
#   5. Verify each agent only has its own blocks
#   6. Apply tenant A with --force — must not detach its own blocks
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT_A="e2e-66-tenant-a"
AGENT_B="e2e-66-tenant-b"

section "Test: Cross-Tenant Resource Isolation (#267)"
preflight_check
mkdir -p "$LOG_DIR"

# ============================================================================
# Cleanup
# ============================================================================
info "Cleaning up test agents..."
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"

# ============================================================================
# Step 1: Deploy tenant A
# ============================================================================
section "Step 1: Deploy tenant A"
$CLI apply -f "$FIXTURES/fleet-tenant-a.yml" --skip-first-message > $OUT 2>&1
agent_exists "$AGENT_A" && pass "Tenant A agent created" || fail "Tenant A agent not created"

# Verify tenant A blocks
$CLI get blocks --agent "$AGENT_A" > $OUT 2>&1
output_contains "tenant_a_context" && pass "Tenant A has tenant_a_context block" || fail "Missing tenant_a_context"
output_contains "tenant_a_policies" && pass "Tenant A has tenant_a_policies block" || fail "Missing tenant_a_policies"

# ============================================================================
# Step 2: Deploy tenant B (separate fleet config, same server)
# ============================================================================
section "Step 2: Deploy tenant B"
$CLI apply -f "$FIXTURES/fleet-tenant-b.yml" --skip-first-message > $OUT 2>&1
agent_exists "$AGENT_B" && pass "Tenant B agent created" || fail "Tenant B agent not created"

# Verify tenant B blocks
$CLI get blocks --agent "$AGENT_B" > $OUT 2>&1
output_contains "tenant_b_context" && pass "Tenant B has tenant_b_context block" || fail "Missing tenant_b_context"
output_contains "tenant_b_policies" && pass "Tenant B has tenant_b_policies block" || fail "Missing tenant_b_policies"

# ============================================================================
# Step 3: Re-apply tenant A — must be clean, no drift from tenant B
# ============================================================================
section "Step 3: Re-apply tenant A (no changes expected)"
$CLI apply -f "$FIXTURES/fleet-tenant-a.yml" --skip-first-message > $OUT 2>&1
output_not_contains "tenant_b" && pass "Re-apply output has no tenant_b references" || fail "Tenant B resources leaked into tenant A apply"
output_not_contains "Removed" && pass "No removal drift detected" || fail "Unexpected removal drift on re-apply"

# ============================================================================
# Step 4: Dry-run tenant A — must not show tenant B blocks as drift
# ============================================================================
section "Step 4: Dry-run tenant A"
$CLI apply -f "$FIXTURES/fleet-tenant-a.yml" --dry-run --skip-first-message > $OUT 2>&1
output_not_contains "tenant_b" && pass "Dry-run has no tenant_b references" || fail "Tenant B resources in tenant A dry-run"
output_not_contains "requires --force" && pass "No --force removal lines in dry-run" || fail "Unexpected --force removal lines in dry-run"

# ============================================================================
# Step 5: Verify agent blocks are isolated
# ============================================================================
section "Step 5: Verify block isolation"

$CLI get blocks --agent "$AGENT_A" > $OUT 2>&1
output_not_contains "tenant_b" && pass "Tenant A agent has no tenant_b blocks" || fail "CONTAMINATION: tenant_b blocks on tenant A agent"

$CLI get blocks --agent "$AGENT_B" > $OUT 2>&1
output_not_contains "tenant_a" && pass "Tenant B agent has no tenant_a blocks" || fail "CONTAMINATION: tenant_a blocks on tenant B agent"

# ============================================================================
# Step 6: --force apply tenant A should not detach its own blocks
# ============================================================================
section "Step 6: Force apply tenant A (should keep its own blocks)"
$CLI apply -f "$FIXTURES/fleet-tenant-a.yml" --force --skip-first-message > $OUT 2>&1

$CLI get blocks --agent "$AGENT_A" > $OUT 2>&1
output_contains "tenant_a_context" && pass "tenant_a_context survives --force" || fail "tenant_a_context lost after --force"
output_contains "tenant_a_policies" && pass "tenant_a_policies survives --force" || fail "tenant_a_policies lost after --force"

# ============================================================================
# Step 7: Dry-run tenant B unaffected by tenant A operations
# ============================================================================
section "Step 7: Dry-run tenant B (unaffected)"
$CLI apply -f "$FIXTURES/fleet-tenant-b.yml" --dry-run --skip-first-message > $OUT 2>&1
output_not_contains "tenant_a" && pass "Tenant B dry-run has no tenant_a references" || fail "Tenant A resources in tenant B dry-run"

# ============================================================================
# Cleanup
# ============================================================================
section "Cleanup"
delete_agent_if_exists "$AGENT_A"
delete_agent_if_exists "$AGENT_B"
pass "Cleaned up test agents"

print_summary
