# Contributing to lettactl

## Setup

```bash
git clone https://github.com/nouamanecodes/lettactl.git
cd lettactl
pnpm install
pnpm build
```

## Development Workflow

1. Create a feature branch: `git checkout -b feat/123-description`
2. Make changes
3. Run tests (see below)
4. Commit with format: `fix: #123 brief description` or `feat: #123 brief description`
5. Push and create PR

## Testing

### Unit Tests

```bash
pnpm test
```

### E2E Tests

E2E tests require a running Letta server.

```bash
# Start Letta server
letta server

# In another terminal
export LETTA_BASE_URL=http://localhost:8283
pnpm test:e2e
```

### Running a Single E2E Test

```bash
LETTA_BASE_URL=http://localhost:8283 ./tests/e2e/run-single.sh 34-protected-memory-tools
```

### E2E Test Structure

Tests live in `tests/e2e/`:

```
tests/e2e/
  script.sh           # Main test suite (runs all tests)
  run-single.sh       # Runner for individual tests
  lib/common.sh       # Shared test utilities
  fixtures/           # YAML configs for test agents
  tests/              # Individual test files (01-*.sh, 02-*.sh, etc.)
```

Each test file:
- Sources `lib/common.sh` for helper functions
- Creates test agents from fixtures
- Verifies behavior with `pass`/`fail` assertions
- Cleans up after itself

### Adding a New E2E Test

1. Create fixture YAML in `tests/e2e/fixtures/` if needed
2. Create test script `tests/e2e/tests/XX-test-name.sh`
3. Make it executable: `chmod +x tests/e2e/tests/XX-test-name.sh`
4. Add test section to `tests/e2e/script.sh`

Example test structure:

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../lib/common.sh"

AGENT="e2e-test-name"
section "Test: Description"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"

# Test logic here
$CLI apply -f "$FIXTURES/your-fixture.yml" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

delete_agent_if_exists "$AGENT"
print_summary
```

## Pre-commit Hooks

Commits trigger:
1. TypeScript type checking
2. Build
3. Full E2E test suite (requires `LETTA_BASE_URL`)

## Commit Message Format

```
type: #issue brief description
```

Types: `fix`, `feat`, `build`, `docs`, `refactor`, `test`
