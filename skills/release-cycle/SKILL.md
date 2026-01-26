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
7. **PR** - Create, merge, delete branch
8. **Version** - Bump package.json, tag, release
9. **Roadmap** - Update issue #2 with completed feature

## E2E Tests

Location: `tests/e2e/tests/XX-name.sh`

```bash
# Run single test
./tests/e2e/run-single.sh tests/XX-name.sh

# Run all tests
./tests/e2e/script.sh
```

Test structure (before/after pattern):
```bash
#!/bin/bash
set -e
source "$(dirname "$0")/../lib/common.sh"

# Setup - create agent WITHOUT feature
lettactl apply -f fixtures/before.yaml
# Verify before state
lettactl describe agent test-agent -o json | jq '.feature' | grep -q "null"

# Apply - create agent WITH feature
lettactl apply -f fixtures/after.yaml
# Verify after state
lettactl describe agent test-agent -o json | jq '.feature' | grep -q "expected"

# Cleanup
lettactl delete agent test-agent -y
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

# Run single e2e test if applicable
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
```

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
| Run single test | `./tests/e2e/run-single.sh tests/XX-name.sh` |
| Run all tests | `./tests/e2e/script.sh` |
| Create PR | `gh pr create --fill` |
| Merge PR | `gh pr merge --squash --delete-branch --admin` |
| Tag release | `git tag vX.X.X && git push --tags` |
| Publish release | `gh release create vX.X.X --generate-notes` |
| Update roadmap | `gh issue edit 2 --body "..."` |
