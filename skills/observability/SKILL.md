---
name: observability
description: Use when checking server health, viewing context window usage, or managing async runs
---

## Entry Points
- `src/commands/health.ts` - Server health check
- `src/commands/context.ts` - Context window analysis
- `src/commands/runs.ts` - Async job management

## Commands

```bash
# Health check
lettactl health [-q] [-v]

# Context usage
lettactl context <agent> [-o table|json|yaml]

# Async runs
lettactl runs <agent> [--limit <n>] [--status pending|running|completed|failed] [-o table|json]
```

## Key Types

```typescript
ContextUsage {
  total_tokens: number
  max_tokens: number
  usage_percent: number
  breakdown: { system_prompt, memory_blocks, tool_definitions, conversation: number }
}

Run {
  id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  created_at: string
  completed_at?: string
}
```

## Examples

```bash
# Check server
lettactl health

# View context usage
lettactl context my-agent

# Get usage as JSON
lettactl context my-agent -o json

# List recent runs
lettactl runs my-agent

# Show only failed runs
lettactl runs my-agent --status failed

# Show last 50 runs
lettactl runs my-agent --limit 50
```

## Exit Codes
- `0` - Success
- `1` - General error
- `2` - Connection failed
- `3` - Auth failed
- `4` - Agent not found
