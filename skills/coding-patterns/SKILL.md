---
name: coding-patterns
description: Architecture and design patterns for lettactl. Reference when building new features, displays, or commands.
---

## Display Architecture

All UX/display code lives in `src/lib/ux/display/`. Commands never format output directly — they transform data into typed interfaces and call display functions.

### Entry List Pattern

For any list of entries shown chronologically (messages, archival memory, etc.), use the shared `entry-list.ts` module:

```typescript
import { displayEntryList, EntryListItem } from './entry-list';

const items: EntryListItem[] = data.map(d => ({
  metaLine: chalk.dim(d.timestamp) + purple(` [${d.label}]`),
  content: d.text,
}));

return displayEntryList('Title (N)', items, optionalNote);
```

- `metaLine`: pre-formatted metadata (timestamp, role, tags, score, etc.)
- `content`: text body — truncated for summary views, full for `--full` views
- The module handles fancy/plain switching internally via `shouldUseFancyUx()`

Used by: `messages.ts`, `archival.ts`

### Box Pattern

For detail views and structured data (describe command output), use `box.ts`:

```typescript
import { createBox, createBoxWithRows, BoxRow } from '../box';

// Key-value box
const rows: BoxRow[] = [
  { key: 'ID', value: data.id },
  { key: 'Name', value: data.name },
];
lines.push(...createBox('Title', rows, width));

// Free-form rows box
const items = data.map(d => chalk.white(d.name));
lines.push(...createBoxWithRows('Section (N)', items, width));
```

Used by: `details.ts` (describe command)

### Table Pattern

For resource listings (get agents, get blocks, etc.), use the table helpers in `resources.ts`:

- Header row with column names
- Status dot + padded columns
- Fancy mode uses colored box frame, plain mode uses dashes

Used by: `resources.ts` (get command list views)

### When to Use Which

| View Type | Pattern | Example |
|-----------|---------|---------|
| Chronological entries | Entry List | messages, archival memory |
| Resource listing | Table | get agents, get blocks, get tools |
| Single resource detail | Box | describe agent, describe block |
| Full content dump | Entry List (`--full`) | get archival --full |

## Display Module Structure

Every display file follows the same structure:

1. Export a typed data interface (e.g., `AgentData`, `ArchivalEntryData`)
2. Export a display function that checks `shouldUseFancyUx()`
3. Fancy variant uses chalk colors, box drawing, purple branding
4. Plain variant uses simple text — no colors, no box chars

New display modules go in `src/lib/ux/display/` with a re-export in `index.ts`.

## Command → Display Flow

```
Command (get.ts, describe.ts)
  → Fetches raw data from LettaClientWrapper
  → Transforms to typed display interface
  → Calls OutputFormatter adapter (output-formatter.ts)
    → Calls display function (display/*.ts)
      → Returns formatted string
  → output() to stdout
```

Commands never import chalk or format strings. OutputFormatter adapters transform raw SDK responses to typed display data.

## LettaClientWrapper

All SDK calls go through `src/lib/letta-client.ts`. Never call the SDK directly from commands. Wrapper methods handle:

- Normalizing response shapes
- Consistent error surfaces
- Single place to update when SDK changes

## File Organization Rules

- **Commands** (`src/commands/`): orchestration only — parse args, call client, call display
- **Display** (`src/lib/ux/display/`): all formatting, one file per domain
- **Client** (`src/lib/letta-client.ts`): all SDK calls
- **Resolver** (`src/lib/agent-resolver.ts`): agent name → ID resolution
- **Shared logic** (`src/lib/`): validators, error handling, resource utilities

## Flags Convention

- `--no-ux`: plain output, no colors/boxes (CI/CD mode)
- `--no-spinner`: disable loading spinners
- `-o json`: JSON output (bypasses all display formatting)
- `--full`: show full content instead of truncated (entry list views)
- `--short`: truncate content more aggressively (block content views)
- `--query <text>`: semantic search (archival memory)
