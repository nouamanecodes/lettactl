---
name: release-cycle
description: Use when releasing features - covers issues, branches, tests, commits, PRs, versioning, and publishing
---

## Workflow

1. **Issue** - Every feature needs a GitHub issue first
2. **Branch** - Create feature branch from main
3. **Implement** - Build and test the feature
4. **E2E Test** - Write test in `tests/e2e/tests/`
5. **README** - Update if feature changes CLI usage or adds commands
6. **Commit** - Conventional commit format
7. **PR** - Create, merge, delete branch, close issue
8. **Version** - Bump package.json, tag, release
9. **Roadmap** - Update issue #2 with completed feature

## E2E Tests

Modular test runner that auto-discovers and runs all tests from `tests/e2e/tests/`.

```bash
# Run ALL tests (discovers .sh and .js automatically)
LETTA_BASE_URL=http://localhost:8283 ./tests/e2e/script.sh

# Run single test
./tests/e2e/run-single.sh XX-test-name

# Run filtered subset
./tests/e2e/script.sh --filter "4*"      # Tests 40-49
./tests/e2e/script.sh --filter "block*"  # Tests matching "block*"
```

### Test Structure

Tests live in `tests/e2e/tests/` with naming convention `XX-name.sh` or `XX-sdk-name.js`.

**CLI Tests (`.sh`)** - For commands and UX:

```bash
#!/bin/bash
set -e
source "$(dirname "$0")/../lib/common.sh"
AGENT="e2e-XX-name"
section "Test: Feature Name"
preflight_check
mkdir -p "$LOG_DIR"

delete_agent_if_exists "$AGENT"
$CLI apply -f "$FIXTURES/fleet.yml" --root "$FIXTURES" --agent "$AGENT" > $OUT 2>&1
agent_exists "$AGENT" && pass "Agent created" || fail "Agent not created"

delete_agent_if_exists "$AGENT"
print_summary
```

**SDK Tests (`.js`)** - For programmatic API (`src/sdk.ts`):

```javascript
#!/usr/bin/env node
const path = require('path');
const { pass, fail, info, section, printSummary, preflightCheck } = require('../lib/common');
const { LettaCtl } = require(path.join(__dirname, '..', '..', '..', 'dist', 'sdk'));

async function run() {
  section('Test: SDK Feature Name');
  preflightCheck();
  const ctl = new LettaCtl({ root: tmpDir });
  await ctl.deployFleet(config);
  pass('Feature works');
  printSummary();
}
run().catch(err => { console.error('FATAL:', err); process.exit(1); });
```

### Test Helpers

From `tests/e2e/lib/common.sh`:
- `pass "message"` / `fail "message"` - Record test result
- `agent_exists "name"` - Check if agent exists
- `output_contains "text"` - Check $OUT contains text
- `output_not_contains "text"` - Check $OUT doesn't contain text
- `delete_agent_if_exists "name"` - Cleanup helper
- `preflight_check` - Verify server and CLI ready
- `print_summary` - Show pass/fail counts

### Fixture Conventions

Fixtures in `tests/e2e/fixtures/`:
- `fleet.yml` - Initial state for most tests
- `fleet-updated.yml` - Modified state for update/diff tests

**Memory block value sync** requires `agent_owned: false`:
```yaml
memory_blocks:
  - name: policies
    value: "Policy content..."
    agent_owned: false  # Required for lettactl to sync value on apply
```

Without `agent_owned: false`, block values won't sync (agent owns and could have modified them).

### Test Output

The runner aggregates results:
```
[1/48] 01-minimal (CLI) ... PASS (4 checks, 9s)
[2/48] 42-sdk-fleet (SDK) ... PASS (15 checks, 7s)
...
Summary:
  Tests run:       48
  Checks passed:   336
  Checks failed:   0
```

## README Updates

Update `README.md` when the feature:
- Adds new CLI commands or flags
- Changes default behavior
- Adds new configuration options

Skip README update for:
- Internal refactors
- Bug fixes that don't change usage
- Performance improvements

## Pre-Commit Checks

```bash
# Run unit tests before committing
pnpm test

# Run single e2e test if applicable (works for both .sh and .js tests)
LETTA_BASE_URL=http://localhost:8283 ./tests/e2e/run-single.sh XX-test-name
```

## Commit Format

```bash
# Features (use --no-verify ONLY after tests pass)
git commit -m "feat: add async polling for send command" --no-verify

# Fixes
git commit -m "fix: prevent timeout on long responses" --no-verify

# Build/release
git commit -m "build: bump v0.9.2" --no-verify
```

Rules:
- 5-7 words max
- NO Co-Authored-By or any author attribution
- No emojis
- Lowercase start
- Run `pnpm test` before committing
- Use `--no-verify` only AFTER tests pass

## PR & Merge

```bash
# Create PR
gh pr create --fill

# Merge and delete branch (use --admin to bypass branch protection)
gh pr merge --squash --delete-branch --admin

# Close the issue
gh issue close <issue-number>
```

Always close the related issue after merging the PR.

## Git Safety

NEVER use destructive git commands:
- `git reset --hard`
- `git clean -f`
- `git push --force`
- `git checkout .`

Use safe alternatives:
- `git pull` to sync with remote
- `git stash` to save uncommitted changes
- `gh pr merge` handles local sync automatically

## Version & Release

```bash
# 1. Bump version in package.json (x.x.x → x.x.x+1)
# 2. Commit
git add package.json
git commit -m "build: bump v0.9.2"

# 3. Tag
git tag v0.9.2

# 4. Push
git push && git push --tags

# 5. Create release with auto-generated notes
gh release create v0.9.2 --generate-notes
```

## Roadmap Update

After release, add completed feature to issue #2:

```bash
# View current roadmap
gh issue view 2

# Edit to add new completed item at top of Completed section
gh issue edit 2 --body "..."
```

Format: `- [x] Feature description (#issue-number)`

## Quick Reference

| Step | Command |
|------|---------|
| New branch | `git checkout -b feat/issue-name` |
| Run single test | `./tests/e2e/run-single.sh XX-test-name` |
| Run all CLI tests | `./tests/e2e/script.sh` |
| Create PR | `gh pr create --fill` |
| Merge PR | `gh pr merge --squash --delete-branch --admin` |
| Close issue | `gh issue close <number>` |
| Tag release | `git tag vX.X.X && git push --tags` |
| Publish release | `gh release create vX.X.X --generate-notes` |
| Update roadmap | `gh issue edit 2 --body "..."` |
