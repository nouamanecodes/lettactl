# Issue #161: View archival memory in get operations

## What
Add `lettactl get archival <agent>` to list/search archival memory entries, and add an archival summary to `describe agent`.

## Command UX
```bash
lettactl get archival my-agent              # Truncated table of entries
lettactl get archival my-agent --full       # Full text in boxes (like get blocks <agent>)
lettactl get archival my-agent --query "pricing"  # Semantic search
lettactl get archival my-agent -o json      # JSON output
lettactl describe agent my-agent            # Now includes archival count
```

## Files to modify

### 1. `src/lib/letta-client.ts`
Add two wrapper methods:
```typescript
async listAgentArchival(agentId: string, limit?: number) {
  return await this.client.agents.passages.list(agentId, { limit: limit || 100, ascending: false });
}

async searchAgentArchival(agentId: string, query: string, limit?: number) {
  return await this.client.agents.passages.search(agentId, { query, top_k: limit || 50 });
}
```

### 2. `src/lib/ux/display/archival.ts` (NEW FILE)
Interfaces and display functions:

**`ArchivalEntryData`** — `id, text, created, tags?, source?`

**`displayArchival(entries, agentName)`** — table view with columns: TEXT (truncated ~80 chars), TAGS, SOURCE, CREATED

**`displayArchivalContents(entries, agentName)`** — full content boxes (like block-contents.ts), each entry in a box with meta line + full text

Both with fancy/plain variants via `shouldUseFancyUx()`.

### 3. `src/lib/ux/display/index.ts`
Re-export `displayArchival`, `displayArchivalContents`, `ArchivalEntryData`.

### 4. `src/lib/ux/output-formatter.ts`
Add two adapter methods:
- `createArchivalTable(passages, agentName)` — transforms raw passages to `ArchivalEntryData[]`, calls `displayArchival()`
- `createArchivalContentView(passages, agentName)` — transforms and calls `displayArchivalContents()`

### 5. `src/commands/get.ts`
- Add `'archival'` to `SUPPORTED_RESOURCES` (line 11)
- Add `query?: string` and `full?: boolean` to `GetOptions`
- Add positional name resolution for archival (like blocks at line 60)
- Add `case 'archival':` in switch (line 74)
- Add `getArchival()` function:
  - Requires agent (positional or --agent flag)
  - If `--query`: calls `client.searchAgentArchival()`, shows results
  - Else: calls `client.listAgentArchival()`, shows table or full content
  - If `--full`: uses `createArchivalContentView()`
  - Default: uses `createArchivalTable()`

### 6. `src/index.ts`
- Update get command description to include `archival`
- Add `--full` option: `.option('--full', 'show full archival entry text')`
- Add `--query` option: `.option('-q, --query <text>', 'search archival memory by semantic similarity')`
  - NOTE: `-q` conflicts with `--quiet` global option? Check — no, `--quiet` is on the program level, `--query` would be on the get subcommand.

### 7. `src/commands/describe.ts`
- After messages section (~line 115), fetch archival count:
  ```typescript
  let archivalCount = 0;
  try {
    const archival = normalizeToArray(await client.listAgentArchival(agentDetails.id, 1));
    // Use total count if available, otherwise indicate presence
    archivalCount = archival.length > 0 ? -1 : 0; // -1 = "has entries"
  } catch {}
  ```
  Actually — the `list` API returns an array of passages. We can call with a small limit to get a count preview. Add `archivalCount` to `AgentDetailsData`.

### 8. `src/lib/ux/display/details.ts`
- Add `archivalCount?: number` to `AgentDetailsData`
- In `displayAgentDetails()`: add "Archival Memory" row showing count or "none"

## Passage data shape (from Letta SDK)
```typescript
{
  id: string,
  text: string,
  created_at: string,
  tags?: string[],
  file_name?: string,
  file_id?: string,
  metadata?: Record<string, unknown>,
}
```
Search response shape:
```typescript
{ count: number, results: [{ id, content, timestamp, tags }] }
```

## Verification
- `pnpm run build` compiles
- `pnpm test` passes
- Manual: `lettactl get archival <agent>` shows truncated table
- Manual: `lettactl get archival <agent> --full` shows full boxes
- Manual: `lettactl get archival <agent> --query "search term"` shows results
- Manual: `lettactl describe agent <agent>` shows archival count
