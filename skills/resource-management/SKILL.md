---
name: resource-management
description: Use when managing resources like memory blocks, tools, folders, files, or MCP servers
---

## Entry Points
- `src/commands/get.ts` - List resources
- `src/commands/describe.ts` - Resource details
- `src/commands/delete.ts` - Delete resources
- `src/commands/files.ts` - Agent file state
- `src/lib/block-manager.ts` - Memory block ops
- `src/lib/resource-classifier.ts` - Shared/orphaned classification

## Commands

```bash
# List resources
lettactl get blocks [--shared] [--orphaned] [-o table|json|yaml]
lettactl get tools [--builtin] [--custom]
lettactl get folders [--orphaned]
lettactl get files
lettactl get mcp-servers

# Describe
lettactl describe block <name>
lettactl describe tool <name>
lettactl describe folder <name>

# Delete
lettactl delete block <name> [-y] [--force]
lettactl delete tool <name> [-y]
lettactl delete folder <name> [-y]

# Agent files
lettactl files <agent>
```

## Key Types

```typescript
Block { id: string; name: string; description: string; limit: number; value: string }
Tool { id: string; name: string; source_type: 'python' | 'builtin' }
Folder { id: string; name: string; files: FileInfo[] }
McpServer { id: string; name: string; type: 'sse' | 'stdio' | 'streamable_http' }
```

## Protected Resources
Cannot be deleted:
- Core memory tools: `memory_insert`, `memory_replace`, `memory_rethink`, `memory`, `conversation_search`
- File tools: `open_files`, `grep_files`, `semantic_search_files`

## Examples

```bash
# List orphaned blocks
lettactl get blocks --orphaned

# View block details
lettactl describe block company-info -o json

# Show agent's files
lettactl files my-agent

# Delete unused folder
lettactl delete folder old-docs -y
```
