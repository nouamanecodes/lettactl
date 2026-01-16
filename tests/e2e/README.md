# E2E Tests

End-to-end tests for lettactl fleet deployment, diff detection, and updates.

## Prerequisites

1. A running Letta server
2. Environment variables set:
   ```bash
   export LETTA_BASE_URL=http://localhost:8283
   # Optional for bucket tests:
   export SUPABASE_URL=...
   export SUPABASE_ANON_KEY=...
   ```
3. CLI built: `pnpm build`

## Running Tests

### Full Suite
```bash
pnpm test:e2e
# or
./tests/e2e/script.sh
```

### Single Test
```bash
./tests/e2e/run-single.sh 25-immutable-block
./tests/e2e/run-single.sh 01-minimal
```

### List Available Tests
```bash
./tests/e2e/run-single.sh
```

## Directory Structure

```
tests/e2e/
├── script.sh           # Full test suite (runs all tests together)
├── run-single.sh       # Run individual test by name
├── lib/
│   └── common.sh       # Shared test functions
├── tests/
│   ├── 01-minimal.sh   # Individual test scripts
│   ├── 02-prompt-file.sh
│   └── ...
└── fixtures/
    ├── fleet.yml       # Initial fleet configuration
    ├── fleet-updated.yml # Updated config for diff testing
    └── ...             # Supporting files
```

## Writing New Tests

### 1. Create a new test script

Create `tests/e2e/tests/XX-my-feature.sh`:

```bash
#!/bin/bash
# Test: Description of what this tests
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-XX-my-feature"
section "Test: My Feature"
preflight_check
mkdir -p "$LOG_DIR"

# Cleanup before test
delete_agent_if_exists "$AGENT"

# Apply config
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

# Run assertions
$CLI describe agent "$AGENT" > $OUT 2>&1
output_contains "expected text" && pass "Feature works" || fail "Feature broken"

# Cleanup
delete_agent_if_exists "$AGENT"
print_summary
```

### 2. Add agent to fleet.yml

Add your test agent to `fixtures/fleet.yml`:

```yaml
  - name: e2e-XX-my-feature
    description: Tests my new feature
    embedding: openai/text-embedding-3-small
    system_prompt:
      value: Test agent for my feature.
    llm_config:
      model: google_ai/gemini-2.5-pro
      context_window: 32000
    # Add feature-specific config here
```

### 3. Add updated config (if testing diffs)

Add to `fixtures/fleet-updated.yml` with changes to verify:

```yaml
  - name: e2e-XX-my-feature
    description: Tests my new feature - UPDATED
    # ... changed values
```

### 4. Make executable

```bash
chmod +x tests/e2e/tests/XX-my-feature.sh
```

### 5. Update script.sh (for full suite)

Add the agent to the `AGENTS` array in `script.sh`:

```bash
AGENTS=(
    ...
    "e2e-XX-my-feature"
)
```

## Available Helper Functions

From `lib/common.sh`:

| Function | Description |
|----------|-------------|
| `pass "message"` | Log a passing test |
| `fail "message"` | Log a failing test |
| `info "message"` | Log info message |
| `section "title"` | Print section header |
| `agent_exists "name"` | Check if agent exists |
| `output_contains "text"` | Check if $OUT contains text |
| `output_not_contains "text"` | Check if $OUT doesn't contain text |
| `delete_agent_if_exists "name"` | Delete agent if it exists |
| `preflight_check` | Verify server is reachable |
| `print_summary` | Print pass/fail summary |

## Variables

| Variable | Description |
|----------|-------------|
| `$CLI` | The lettactl command |
| `$OUT` | Output file for command results |
| `$FIXTURES` | Path to fixtures directory |
| `$ROOT_DIR` | Project root directory |

## Test Naming Convention

- `01-25`: Feature tests matching agent numbers in fleet.yml
- Use descriptive names: `XX-feature-name.sh`
- Keep tests focused on one feature each
