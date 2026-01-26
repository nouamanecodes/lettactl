---
name: fleet-deployment
description: Use when deploying agents from YAML configuration files
---

## Entry Points
- `src/commands/apply.ts` - Deploy fleet from YAML
- `src/commands/validate.ts` - Validate config syntax
- `src/lib/fleet-parser.ts` - YAML parsing & content resolution
- `src/lib/diff-engine.ts` - Change detection
- `src/lib/diff-applier.ts` - Apply changes to Letta

## Commands

```bash
lettactl apply -f <file> [--dry-run] [--force] [-q] [-v]
lettactl apply-template -f <file> --template <pattern> [--dry-run]
lettactl validate -f <file>
```

## Key Types

```typescript
FleetConfig {
  root_path?: string
  shared_blocks?: SharedBlock[]
  mcp_servers?: McpServerConfig[]
  agents: AgentConfig[]
}

AgentConfig {
  name: string
  description: string
  system_prompt: { value?: string; from_file?: string; from_bucket?: BucketConfig }
  llm_config: { model: string; context_window: number }
  tools?: string[]
  shared_blocks?: string[]
  memory_blocks?: MemoryBlock[]
  folders?: FolderConfig[]
}

MemoryBlock {
  name: string
  description: string
  limit: number
  value?: string
  from_file?: string
  mutable?: boolean  // default: true
}
```

## Examples

```bash
# Deploy fleet
lettactl apply -f fleet.yaml

# Preview changes
lettactl apply -f fleet.yaml --dry-run

# Remove resources not in config
lettactl apply -f fleet.yaml --force

# Apply template to existing agents
lettactl apply-template -f template.yaml --template "^prod-.*"
```

## Environment
- `LETTA_BASE_URL` - Letta server URL (required)
- `LETTA_API_KEY` - API key (optional for self-hosted)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` - For cloud storage
