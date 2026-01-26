---
name: agent-management
description: Use when managing individual agents - creating, updating, deleting, listing, or describing
---

## Entry Points
- `src/commands/get.ts` - List agents
- `src/commands/describe.ts` - Agent details
- `src/commands/create.ts` - Create agent
- `src/commands/update.ts` - Update agent
- `src/commands/delete.ts` - Delete agent
- `src/commands/export.ts` - Export to JSON
- `src/commands/import.ts` - Import from JSON
- `src/lib/agent-resolver.ts` - Name to ID resolution

## Commands

```bash
# List
lettactl get agents [-o table|json|yaml] [--wide]

# Describe
lettactl describe agent <name> [-o table|json|yaml]

# Create
lettactl create <name> -d <description> -p <prompt> [-m <model>] [--context-window <n>] [--tools <list>]

# Update
lettactl update <name> [-p <prompt>] [-m <model>] [--add-tools <list>] [--remove-tools <list>]

# Delete
lettactl delete agent <name> [-y]

# Export/Import
lettactl export <name> [-o <file>]
lettactl import <file> [--name <new-name>]
```

## Key Types

```typescript
AgentState {
  id: string
  name: string
  description: string
  system: string  // system prompt
  llm_config: { model: string; context_window: number }
  tools: Tool[]
  memory: { blocks: Block[] }
}
```

## Examples

```bash
# List all agents
lettactl get agents

# Get agent details as JSON
lettactl describe agent my-agent -o json

# Create agent with tools
lettactl create my-agent -d "Helper" -p "You are helpful" --tools web_search

# Update system prompt
lettactl update my-agent -p "New prompt"

# Export and import
lettactl export my-agent -o backup.json
lettactl import backup.json --name my-agent-copy
```
