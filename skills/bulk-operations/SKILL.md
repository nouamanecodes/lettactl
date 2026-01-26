---
name: bulk-operations
description: Use when performing bulk operations like cleanup, delete-all, or bulk messaging
---

## Entry Points
- `src/commands/delete.ts` - delete-all command
- `src/commands/cleanup.ts` - Orphaned resource cleanup
- `src/lib/bulk-messenger.ts` - Bulk messaging

## Commands

```bash
# Bulk delete agents
lettactl delete-all --pattern <regex> [-y]
lettactl delete-all --all [-y]  # Delete ALL agents

# Cleanup orphaned resources
lettactl cleanup [--blocks] [--folders] [--files] [--tools] [--dry-run] [-y]

# Bulk messaging (see message-operations skill)
lettactl send --all <message>
lettactl send --pattern <regex> <message>
```

## Pattern Matching
- Case-insensitive regex against agent names
- `^test-` - starts with "test-"
- `.*-dev$` - ends with "-dev"
- `prod` - contains "prod"

## Examples

```bash
# Delete test agents
lettactl delete-all --pattern "^test-" -y

# Preview cleanup
lettactl cleanup --dry-run

# Cleanup only orphaned blocks
lettactl cleanup --blocks -y

# Full cleanup
lettactl cleanup -y

# Broadcast to all agents
lettactl send --all "System maintenance at 2am UTC"

# Message production agents
lettactl send --pattern "^prod-" "Health check"
```

## Safety
- `delete-all` and `cleanup` require confirmation unless `-y`
- `--dry-run` previews without executing
- Protected tools cannot be deleted
