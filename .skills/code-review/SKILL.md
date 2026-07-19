---
name: code-review
description: Thorough code review covering architecture, code quality, and performance. Use when asked to "review this plan", "review code", "audit architecture", "check code quality", or "review for performance". Walks through issues interactively with tradeoff analysis and opinionated recommendations.
metadata:
  author: lettactl
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Code Review Skill

Review code thoroughly before making any changes. For every issue or recommendation, explain the concrete tradeoffs, give an opinionated recommendation, and ask for user input before assuming a direction.

## Engineering Preferences

Use these to guide all recommendations:

- **DRY is important** — flag repetition aggressively.
- **Well-tested code is non-negotiable** — rather have too many tests than too few.
- **"Engineered enough"** — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity).
- **Handle more edge cases, not fewer** — thoughtfulness > speed.
- **Bias toward explicit over clever.**

## Review Sections

### 1. Architecture Review

Evaluate:

- Overall system design and component boundaries.
- Dependency graph and coupling concerns.
- Data flow patterns and potential bottlenecks.
- Scaling characteristics and single points of failure.
- Security architecture (auth, data access, API boundaries).

### 2. Code Quality Review

Evaluate:

- Code organization and module structure.
- DRY violations — be aggressive here.
- SOLID violations - aggressive here too.
- Error handling patterns and missing edge cases (call these out explicitly).
- Technical debt hotspots.
- Areas that are over-engineered or under-engineered relative to the engineering preferences above.

### 3. Send subagents to the SDK

For all SDK related changes, always send a subagent to check node_modules for the SDK to check the proper usage of the libraries

### 4. Performance Review

Evaluate:

- N+1 queries and database access patterns.
- Memory-usage concerns.
- Caching opportunities.
- Slow or high-complexity code paths.

## For Each Issue Found

For every specific issue (bug, smell, design concern, or risk):

1. **Describe the problem concretely**, with file and line references.
2. **Present 2-3 options**, including "do nothing" where that's reasonable.
3. For each option, specify: **implementation effort, risk, impact on other code, and maintenance burden**.
4. **Give a recommended option and why**, mapped to the engineering preferences above.
5. Then **explicitly ask whether the user agrees or wants a different direction** before proceeding.

## Workflow and Interaction

- Do not assume priorities on timeline or scale.
- After each section, pause and ask for feedback before moving on.

## Before Starting

Ask if the user wants one of two modes:

1. **BIG CHANGE:** Work through interactively, one section at a time (Architecture -> Code Quality -> Performance) with **at most 4 top issues** in each section.
2. **SMALL CHANGE:** Work through interactively, **ONE question per review section**.

## Output Format Rules

For each stage of review:

- Output the explanation and pros/cons of each issue along with an opinionated recommendation and why.
- Use `AskUserQuestion` at the end of each section.
- **NUMBER issues** (1, 2, 3, 4) and give **LETTERS for options** (A, B, C).
- When using `AskUserQuestion`, each option must clearly label the **issue NUMBER and option LETTER** so the user doesn't get confused.
- **The recommended option is always the 1st option.**
