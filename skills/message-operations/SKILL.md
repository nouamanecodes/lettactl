---
name: message-operations
description: Use when sending messages to agents, viewing conversation history, or managing message state
---

## Entry Points
- `src/commands/messages.ts` - All message commands
- `src/lib/message-sender.ts` - Single agent messaging
- `src/lib/bulk-messenger.ts` - Multi-agent messaging

## Commands

```bash
# Send message
lettactl send <agent> <message> [--async] [--stream] [-o text|json]

# Bulk send
lettactl send --all <message> [--pattern <regex>] [--timeout <ms>]

# View history (default: last 10 messages)
lettactl messages <agent> [-l <n>] [--all] [-o table|json|yaml]

# Manage state
lettactl reset-messages <agent> [-y]
lettactl compact-messages <agent>
lettactl cancel-messages <agent>
```

## Key Types

```typescript
Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string
  created_at: string
  tool_calls?: ToolCall[]
}
```

## Examples

```bash
# Send and get response
lettactl send my-agent "Hello"

# Send without waiting
lettactl send my-agent "Process this" --async

# Stream response
lettactl send my-agent "Tell me a story" --stream

# Bulk message all agents
lettactl send --all "System update"

# Message agents matching pattern
lettactl send --pattern "^prod-" "Health check"

# View last 10 messages (default)
lettactl messages my-agent

# View last 50 messages
lettactl messages my-agent -l 50

# View all messages
lettactl messages my-agent --all

# Clear conversation
lettactl reset-messages my-agent -y

# Reduce context usage
lettactl compact-messages my-agent
```
