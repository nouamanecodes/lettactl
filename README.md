# LettaCTL

[![CI](https://github.com/nouamanecodes/lettactl/actions/workflows/ci.yml/badge.svg)](https://github.com/nouamanecodes/lettactl/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

![LettaCTL](assets/main.png)

> **Need help?** Join the [Letta Discord](https://discord.com/invite/letta) for support and discussions.

A kubectl-style CLI for managing stateful Letta AI agent fleets with declarative configuration. Think "Docker Compose" but for AI agents - define your entire agent setup in YAML and deploy with one command.

![lettactl demo](assets/lettactl_demo.gif)
## Two Ways to Use LettaCtl

| **CLI Tool** | **Programmatic SDK** |
|--------------|---------------------|
| Command-line interface | Library for applications |
| Automated fleet management | Dynamic agent creation |
| `npm install -g lettactl` | `npm install lettactl` |
| Perfect for DevOps workflows | Perfect for SaaS platforms |

## Prerequisites
- Node.js 18+ 
- A running Letta server instance

---

# CLI Usage

For DevOps workflows

## Installation

```bash
# Install globally from npm
npm install -g lettactl
```

### Shell Completions

Enable tab-completion for commands, resources, and options:

```bash
# Bash
lettactl completion bash >> ~/.bashrc

# Zsh
lettactl completion zsh >> ~/.zshrc

# Fish
lettactl completion fish > ~/.config/fish/completions/lettactl.fish
```

Restart your shell or source the file to activate.

### For Letta Cloud

```bash
export LETTA_BASE_URL=https://api.letta.com
export LETTA_API_KEY=your_api_key  # Get from https://app.letta.com
```

### For Self-Hosting

```bash
export LETTA_BASE_URL=http://localhost:8283
# API key is optional for self-hosting
```

### Your First Fleet

Create a file called `agents.yml`

```yaml
# Fleet configuration demonstrating lettactl's capabilities
# Two different agent types showing various features

shared_blocks:  # Memory blocks shared across agents
  - name: shared_guidelines
    description: "Shared operational guidelines for all agents"
    limit: 5000
    from_file: "memory-blocks/shared-guidelines.md"  # Load from file

agents:
  # 1. Simple agent with files only
  - name: document-assistant
    description: "AI assistant for document analysis and processing"
    llm_config:  # Required LLM settings
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a document assistant. Help users analyze, summarize, and understand documents."
    folders:  # Files attached to agent
      - name: documents
        files:
          - "files/*"  # Auto-discover all files in files/
    embedding: "letta/letta-free"

  # 2. Cloud-powered agent using Supabase storage  
  - name: cloud-assistant
    description: "AI assistant powered by cloud storage"
    llm_config:
      model: "google_ai/gemini-2.5-pro" 
      context_window: 32000
    system_prompt:
      from_bucket:  # Load prompt from cloud storage
        provider: supabase
        bucket: test-bucket
        path: prompts/system-prompt.md
    shared_blocks:  # Use shared memory blocks
      - shared_guidelines
    memory_blocks:  # Agent-specific memory
      - name: cloud_knowledge
        description: "Knowledge base from cloud storage"
        limit: 8000
        from_bucket:  # Load content from cloud storage
          provider: supabase
          bucket: test-bucket
          path: knowledge/example.md
    embedding: "letta/letta-free"
```

Deploy the entire fleet:

```bash
lettactl apply -f agents.yml  # Deploy all agents and shared resources
```

That's it! Your entire fleet is now running with shared resources and cloud storage.

## Commands

### Deploy Configuration
```bash
lettactl apply -f agents.yml           # Deploy all agents
lettactl apply -f agents.yml --agent my-agent  # Deploy specific agent
lettactl apply -f agents.yml --dry-run # See what would change
lettactl apply -f agents.yml --root . # Specify root directory for file resolution
lettactl apply -f agents.yml -v       # Verbose output
lettactl apply -f agents.yml -q       # Quiet mode (for CI pipelines)

# Template mode: apply config to existing agents matching a glob pattern
lettactl apply -f template.yaml --match "*-assistant"  # All agents ending in -assistant
lettactl apply -f template.yaml --match "user-*"       # All agents starting with user-
lettactl apply -f template.yaml --match "*" --dry-run  # Preview changes to all agents
```

**Template Mode (`--match`):**
Apply a template configuration to multiple existing agents at once. Uses merge semantics - adds/updates tools, blocks, and prompts without removing existing resources. Perfect for propagating tool updates or shared config changes across agent fleets.

### Create Agents
```bash
# Create basic agent
lettactl create agent my-agent --description "My helpful assistant"

# Create with full configuration
lettactl create agent advanced-agent \
  --description "Advanced AI assistant" \
  --model "google_ai/gemini-2.5-pro" \
  --system "You are an expert assistant." \
  --context-window 32000 \
  --embedding "letta/letta-free" \
  --tags "production,assistant"
```

### Update Agents
```bash
# Update description and model
lettactl update agent my-agent \
  --description "Updated description" \
  --model "google_ai/gemini-2.5-flash"

# Update system prompt and tags
lettactl update agent my-agent \
  --system "You are a specialized assistant." \
  --tags "updated,specialized"
```

### Export/Import Agents
```bash
# Export agent to file
lettactl export agent my-agent --output my-agent-backup.json

# Export with legacy format
lettactl export agent my-agent --legacy-format --output legacy-backup.json

# Import agent from file
lettactl import my-agent-backup.json

# Import with custom name and copy suffix
lettactl import my-agent-backup.json \
  --name restored-agent \
  --append-copy
```

### Message Operations
```bash
# List agent conversation history
lettactl messages my-agent --limit 10

# Send a message to an agent
lettactl send my-agent "Hello, how are you?"

# Send with streaming response
lettactl send my-agent "Tell me about Tokyo" --stream

# Send asynchronous message
lettactl send my-agent "Plan a 7-day itinerary" --async

# Reset agent's conversation history
lettactl reset-messages my-agent --add-default

# Compact agent's message history (summarize)
lettactl compact-messages my-agent

# Cancel running message processes
lettactl cancel-messages my-agent --run-ids "run1,run2"
```

### Bulk Delete Operations
```bash
# Preview agents to be deleted (safe mode)
lettactl delete-all agents --pattern "test.*"           # Shows what would be deleted
lettactl delete-all agents                              # Preview all agents

# Bulk delete with pattern matching
lettactl delete-all agents --pattern "test.*" --force   # Delete all test agents
lettactl delete-all agents --pattern "dev.*" --force    # Delete all dev agents
lettactl delete-all agents --pattern "(old|temp).*" --force  # Complex patterns

# Pattern matching by agent ID (useful for cleanup)
lettactl delete-all agents --pattern ".*abc123.*" --force    # Match partial IDs

# Nuclear option - delete everything (be careful!)
lettactl delete-all agents --force                      # Deletes ALL agents

# Case-insensitive matching
lettactl delete-all agents --pattern "PROD.*" --force   # Matches "prod-agent-1", etc.
```

**What gets deleted:**
- Agent-specific memory blocks
- Agent-specific folders (if not shared)
- Associated conversation history

**What gets preserved:**
- Shared blocks and folders used by other agents

**Safety Features:**
- Always shows preview before deletion
- Requires explicit `--force` confirmation
- Preserves shared resources used by other agents
- Pattern matching is case-insensitive
- Supports complex regex patterns

### Cleanup Orphaned Resources
```bash
# Preview orphaned resources (dry-run by default)
lettactl cleanup blocks                # Find orphaned blocks
lettactl cleanup folders               # Find orphaned folders (and their files)
lettactl cleanup all                   # Find all orphaned resources

# Actually delete orphaned resources
lettactl cleanup blocks --force        # Delete orphaned blocks
lettactl cleanup folders --force       # Delete orphaned folders (cascades to files)
lettactl cleanup all --force           # Delete all orphaned resources
```

**What gets cleaned up:**
- **Orphaned blocks**: Memory blocks attached to 0 agents
- **Orphaned folders**: Folders attached to 0 agents (files inside are also deleted)

**Safety Features:**
- Dry-run by default - shows what would be deleted
- Requires `--force` to actually delete
- Shows file counts for orphaned folders
- Uses API's native orphan detection for efficiency

### View Resources
```bash
# List resources
lettactl get agents                    # List all agents
lettactl get blocks                    # List all memory blocks
lettactl get tools                     # List all tools
lettactl get folders                   # List all folders (with file counts)
lettactl get files                     # List all files (deduplicated by name)
lettactl get mcp-servers               # List all MCP servers

# Wide output with extra columns (agent counts, sizes, models)
lettactl get agents -o wide            # +folders, MCP servers, files columns
lettactl get blocks -o wide
lettactl get tools -o wide
lettactl get files -o wide             # Shows every file instance per folder

# Scoped to specific agent
lettactl get blocks -a my-agent        # Blocks attached to my-agent
lettactl get tools -a my-agent         # Tools attached to my-agent
lettactl get folders -a my-agent       # Folders attached to my-agent
lettactl get files -a my-agent         # Files accessible to my-agent

# Fleet analysis
lettactl get tools --shared            # Tools used by 2+ agents
lettactl get blocks --orphaned         # Blocks not attached to any agent
lettactl get folders --shared          # Shared folders with agent counts
lettactl get files --shared            # Files in folders used by 2+ agents
lettactl get files --orphaned          # Files in folders not used by any agent

# Detailed resource info
lettactl describe agent my-agent       # Agent details + blocks/tools/folders/messages
lettactl describe block persona        # Block details + attached agents + value preview
lettactl describe tool my-tool         # Tool details + attached agents + source code
lettactl describe folder docs          # Folder details + files + attached agents
lettactl describe file report.pdf      # File details + which folders contain it
lettactl describe mcp-servers my-mcp   # MCP server details + tools

# JSON output for scripting
lettactl get agents -o json
lettactl describe tool my-tool -o json

# Conversation history
lettactl messages my-agent             # View conversation history
```

### Async Runs
```bash
lettactl runs                         # List async job runs
lettactl runs --active                # Show only active runs
lettactl runs -a my-agent             # Filter by agent
lettactl runs -o json                 # JSON output for scripting
lettactl run <run-id>                 # Get run details
lettactl run <run-id> --wait          # Wait for run to complete
lettactl run <run-id> --messages      # Show run messages
lettactl run <run-id> -o json         # JSON output
lettactl run-delete <run-id>          # Cancel/delete a run
```

### Observability
```bash
lettactl health                       # Check server connectivity
lettactl health -o json               # JSON output for CI/scripts
lettactl files my-agent               # Show attached files
lettactl files my-agent -o json       # JSON output
lettactl context my-agent             # Show context window usage
lettactl context my-agent -o json     # JSON output
```

### Validate Configuration
```bash
lettactl validate -f agents.yml       # Check config syntax
```

### MCP Server Operations
```bash
# List all MCP servers
lettactl get mcp-servers

# Get details about a specific MCP server
lettactl describe mcp-servers my-server

# Delete an MCP server
lettactl delete mcp-servers my-server --force
```

MCP servers are created/updated automatically during `lettactl apply` when defined in your configuration.

---

# SDK Usage

For building applications with dynamic agent creation.

## Installation

```bash
# Install locally for programmatic usage (choose your flavor)
npm install lettactl

# Or
yarn install lettactl 

# Or
pnpm install lettactl
```

## Three Usage Patterns

### 1. Dynamic YAML Generation
Write YAML configuration as strings and deploy directly:

```typescript
import { LettaCtl } from 'lettactl';

const lettactl = new LettaCtl({
  lettaBaseUrl: 'http://localhost:8283'
});

const userId = 'acme-corp';

// Write YAML configuration as a string with dynamic values
const yamlConfig = `
shared_blocks:  # Memory blocks shared across agents
  - name: shared-guidelines
    description: "Shared operational guidelines for all agents"
    limit: 5000
    value: "Common guidelines for all user agents."

agents:
  - name: user-${userId}-assistant  # Dynamic user ID
    description: "AI assistant for user ${userId}"
    llm_config:  # Required LLM settings
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:  # How the agent behaves
      value: "You are an assistant for user ${userId}."
    shared_blocks:  # Use shared memory blocks
      - shared-guidelines
    embedding: "letta/letta-free"
`;

// Deploy directly from YAML string (no file I/O needed)
await lettactl.deployFromYamlString(yamlConfig);
```

### 2. Existing YAML Deployment
Deploy existing YAML files programmatically:

```typescript
// Deploy existing configs
await lettactl.deployFromYaml('./configs/production.yaml');

// With filtering
await lettactl.deployFromYaml('./configs/all-agents.yaml', {
  agentPattern: 'user-123',  // Only deploy matching agents
  dryRun: true               // Preview changes
});
```

### 3. Direct Deployment
Build and deploy fleet configurations directly in memory:

```typescript
// Build a fleet with shared resources and multiple agent types
const fleet = lettactl.createFleetConfig()
  .addSharedBlock({  // Shared memory across agents
    name: 'shared-guidelines',
    description: 'Shared operational guidelines',
    limit: 5000,
    value: 'Common guidelines for all user agents.'
  })
  .addAgent({  // Simple document-focused agent
    name: 'user-123-document-assistant',
    description: 'Document assistant for user 123',
    llm_config: { model: 'google_ai/gemini-2.5-pro', context_window: 32000 },
    system_prompt: { value: 'You analyze documents for user 123.' },
    folders: [{ name: 'documents', files: ['files/*'] }]  // Auto-discover files
  })
  .addAgent({  // Cloud-powered agent with shared memory
    name: 'user-123-cloud-assistant', 
    description: 'Cloud assistant for user 123',
    llm_config: { model: 'google_ai/gemini-2.5-pro', context_window: 32000 },
    system_prompt: { value: 'You are a cloud-powered assistant for user 123.' },
    shared_blocks: ['shared-guidelines'],  // Use shared memory
    memory_blocks: [{
      name: 'user-knowledge',
      description: 'User-specific knowledge base',
      limit: 8000,
      value: 'User 123 knowledge and preferences.'
    }]
  })
  .build();

await lettactl.deployFleet(fleet);  // Deploy entire fleet
```

## Multi-Tenant SaaS Example

Create agents dynamically for different users:

```typescript
const lettactl = new LettaCtl();

// Single user onboarding
const userId = 'acme-corp';
const companyInfo = 'Acme Corp is a B2B software company specializing in CRM solutions.';

const fleet = lettactl.createFleetConfig()
  .addAgent({
    name: `${userId}-assistant`,
    description: `AI assistant for ${userId}`,
    llm_config: { model: 'google_ai/gemini-2.5-pro', context_window: 32000 },
    system_prompt: { 
      value: `You are an AI assistant for ${userId}. Help with tasks and answer questions.`,
      disable_base_prompt: false  // Optional: control base prompt combination
    },
    memory_blocks: [{
      name: 'company-info',
      description: 'User company information',
      limit: 8000,
      value: companyInfo
    }]
  })
  .build();

await lettactl.deployFleet(fleet);

// Batch user onboarding
const users = [
  { id: 'startup-1', info: 'Tech startup focused on AI tools' },
  { id: 'enterprise-2', info: 'Large enterprise with complex workflows' },
  { id: 'agency-3', info: 'Marketing agency serving B2B users' }
];

const batchFleet = lettactl.createFleetConfig();
for (const user of users) {
  batchFleet.addAgent({
    name: `${user.id}-assistant`,
    description: `AI assistant for ${user.id}`,
    llm_config: { model: 'google_ai/gemini-2.5-pro', context_window: 32000 },
    system_prompt: { value: `You are an AI assistant for ${user.id}.` },
    memory_blocks: [{ 
      name: 'company-info', 
      description: 'Company information', 
      limit: 8000, 
      value: user.info 
    }]
  });
}

await lettactl.deployFleet(batchFleet.build());
```

---

# Configuration Reference

## Essential Configuration

### LLM Configuration (Required)

Every agent needs an LLM configuration as the first key:

```yaml
agents:
  - name: my-agent
    llm_config:
      model: "google_ai/gemini-2.5-pro"     # Required: which model to use
      context_window: 32000                  # Required: context window size
```

### System Prompts

Define how your agent behaves with system prompts. You have two options:

**Option 1: Inline prompt**
```yaml
system_prompt:
  value: |
    You are a helpful AI assistant focused on...
```

**Option 2: File-based prompt (recommended)**
```yaml
system_prompt:
  from_file: "prompts/my-agent-prompt.md"
```

The system automatically combines your prompt with base Letta instructions for optimal behavior.

**Advanced Option: Disabling Base Prompt Combination**
```yaml
system_prompt:
  from_file: "prompts/my-custom-prompt.md"
  disable_base_prompt: true  # Use only your prompt, skip base Letta instructions
```

By default, lettactl prepends base Letta system instructions (memory management, tool usage patterns, etc.) to your custom prompt. Set `disable_base_prompt: true` to use only your prompt content - useful when you want complete control over the system prompt or are experimenting with custom agent behaviors.

### First Message (Auto-Calibration)

Send a message to the agent immediately after creation to prime or calibrate it:

```yaml
agents:
  - name: sales-bot
    system_prompt:
      value: You are a sales assistant.
    llm_config:
      model: openai/gpt-4o
      context_window: 128000
    first_message: |
      Review your memory blocks and confirm you understand your role.
      Summarize your capabilities in one sentence.
```

The `first_message` only runs on initial agent creation, not on updates. Useful for:
- Priming agents with initial context
- Having agents confirm their configuration
- Running setup tasks before user interaction

### Memory Blocks

Give your agents persistent memory with two content options:

**Option 1: Inline content**
```yaml
memory_blocks:
  - name: user_preferences
    description: "What the user likes and dislikes"
    limit: 2000
    value: "User prefers short, direct answers."
```

**Option 2: File-based content (recommended for large content)**
```yaml
memory_blocks:
  - name: company_knowledge
    description: "Company knowledge base"
    limit: 10000
    from_file: "memory-blocks/company-info.md"
```

**Controlling Block Mutability:**

By default, memory blocks are mutable - the agent can modify them and those changes persist across applies. Use `mutable: false` when you want the YAML to be the source of truth:

```yaml
memory_blocks:
  # Mutable (default): Agent can modify, changes preserved on re-apply
  - name: learned_preferences
    description: "User preferences the agent learns over time"
    limit: 2000
    value: "No preferences yet"
    # mutable: true (default, not needed)

  # Immutable: YAML value syncs to server on every apply
  - name: policies
    description: "Agent policies from config"
    limit: 2000
    value: "Always be helpful and concise."
    mutable: false  # Value resets to YAML on every apply
```

Use `mutable: false` for:
- Configuration/policies that should be version-controlled
- Content that needs to sync from YAML on every deploy
- Blocks where the developer, not the agent, controls the content

### File Attachments

Attach documents to your agents with powerful auto-discovery:

**Option 1: Auto-discover all files (recommended for large document sets)**
```yaml
folders:
  - name: documents
    files:
      - "files/*"      # All files in files/ directory
      - "files/**/*"   # All files recursively (subdirectories too)
```

**Option 2: Specific files and patterns**
```yaml
folders:
  - name: documents
    files:
      - "files/manual.pdf"
      - "files/guidelines.txt"
      - "files/specs/*.md"  # All markdown in specs/ subdirectory
```

**Auto-Discovery Features:**
- `files/*` - Discovers ALL files in the files/ directory automatically
- `files/**/*` - Recursively discovers files in subdirectories
- `tools/*` - Auto-discovers all Python tools in tools/ directory
- No need to manually list every file!

## Intelligent Updates

lettactl only updates what actually changed and preserves conversation history:

- **Edit tool source code** → Tools automatically re-registered
- **Change memory block files** → Content updated seamlessly  
- **Modify documents** → Files re-uploaded to folders
- **Update config** → Agent settings changed
- **No changes** → Nothing happens (fast!)

```bash
# Edit anything
vim tools/my_tool.py
vim memory-blocks/user-data.md
vim agents.yml

# Deploy - only changed parts update
lettactl apply -f agents.yml
# Conversation history preserved
```

## Complete Configuration Reference

### Agent Schema

```yaml
agents:
  - name: agent-name                    # Required: unique identifier
    description: "What this agent does" # Required: human description
    
    # LLM configuration (required, should be first)
    llm_config:
      model: "google_ai/gemini-2.5-pro" # Required
      context_window: 32000             # Required
    
    # System prompt (required)
    system_prompt:
      value: "Direct prompt text"       # Option 1: inline
      from_file: "prompts/agent.md"    # Option 2: from file
      disable_base_prompt: false       # Option 3: skip base Letta instructions (default: false)
    
    # Tools (optional)
    tools:
      - archival_memory_insert          # Built-in tools
      - archival_memory_search
      - tools/*                         # Auto-discover from tools/ folder
      - custom_tool_name                # Specific custom tools
    
    # Shared blocks (optional)
    shared_blocks:
      - shared_block_name
    
    # Agent-specific memory blocks (optional)
    memory_blocks:
      - name: block_name
        description: "What this block stores"
        limit: 5000                     # Character limit
        version: "optional-tag"         # Optional: your version tag
        mutable: true                   # Optional: if false, value syncs from YAML on every apply
        value: "Direct content"         # Option 1: inline
        from_file: "blocks/file.md"    # Option 2: from file
    
    # File attachments (optional)
    folders:
      - name: folder_name
        files:
          - "files/*"                   # Auto-discover files
          - "files/specific-file.pdf"   # Specific files
    
    embedding: "letta/letta-free"       # Optional: embedding model
```

### Shared Blocks Schema

```yaml
shared_blocks:
  - name: block_name
    description: "Shared across agents"
    limit: 10000
    version: "optional-tag"             # Optional: your version tag
    value: "Content here"               # Option 1: inline
    from_file: "shared/file.md"        # Option 2: from file
```

### MCP Servers Schema

MCP (Model Context Protocol) servers provide external tool capabilities to your agents. Define them at the top level of your configuration:

```yaml
mcp_servers:
  # SSE server (Server-Sent Events)
  - name: my-sse-server
    type: sse
    server_url: http://localhost:3001/sse
    auth_header: Authorization           # Optional
    auth_token: Bearer my-token          # Optional
    custom_headers:                      # Optional
      X-Custom-Header: value

  # Stdio server (local process)
  - name: my-stdio-server
    type: stdio
    command: /usr/bin/python3
    args:
      - "-m"
      - "mcp_server"
    env:                                 # Optional
      DEBUG: "true"
      LOG_LEVEL: "info"

  # Streamable HTTP server
  - name: my-http-server
    type: streamable_http
    server_url: https://mcp.example.com/api
    auth_header: Authorization           # Optional
    auth_token: Bearer my-token          # Optional
```

**MCP Server Types:**
- `sse` - Server-Sent Events for real-time communication
- `stdio` - Local process communication via stdin/stdout
- `streamable_http` - HTTP-based streaming protocol

**Automatic Updates:**
When you change an MCP server's URL, command, or args in your configuration and run `apply`, lettactl automatically detects the change and updates the server.

## File Organization

lettactl expects this folder structure:

```
your-project/
├── agents.yml              # Main configuration
├── config/                 # Base system configuration
│   └── base-letta-system.md
├── prompts/                 # System prompts
│   ├── agent1-prompt.md
│   └── agent2-prompt.md
├── memory-blocks/          # Memory block content
│   ├── shared/
│   ├── agent1/
│   └── agent2/
├── files/                  # Files to attach to agents
│   ├── document1.pdf
│   └── document2.md
└── tools/                  # Custom Python tools
    ├── tool1.py
    └── tool2.py
```

## Advanced Features

### Environment Management

```bash
# Self-hosting Letta
export LETTA_BASE_URL=http://localhost:8283
# API key is optional for self-hosting

# Letta Cloud
export LETTA_BASE_URL=https://api.letta.com
export LETTA_API_KEY=your_cloud_key  # Required for cloud
```

### Supabase Storage Integration

For cloud storage support, lettactl can read agent configuration files from Supabase buckets. More cloud storage options coming soon.

```bash
# Required environment variables
export SUPABASE_URL=https://your-project.supabase.co

# For public buckets - use anon key
export SUPABASE_ANON_KEY=your_anon_key

# For private buckets - use service role key (recommended)
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Choosing the right key:**
- **SUPABASE_ANON_KEY** - For public buckets or buckets with RLS policies allowing anon access
- **SUPABASE_SERVICE_ROLE_KEY** - For private buckets (bypasses RLS, recommended for server-side CLI tools)

If both keys are set, lettactl prefers the service role key.

**Example with cloud storage:**

```yaml
agents:
  - name: cloud-agent
    system_prompt:
      from_bucket:
        provider: supabase
        bucket: my-configs
        path: prompts/agent-prompt.md
    memory_blocks:
      - name: knowledge_base
        from_bucket:
          provider: supabase
          bucket: my-configs
          path: knowledge/company-info.md
    folders:
      - name: documents
        files:
          # Single file from bucket
          - from_bucket:
              provider: supabase
              bucket: my-bucket
              path: docs/manual.pdf
          # Glob pattern - downloads all matching files
          - from_bucket:
              provider: supabase
              bucket: my-bucket
              path: docs/guides/*
          # Mix local and bucket files
          - local-file.txt
```

**Glob patterns in bucket paths:**
- `path: docs/*` - Downloads all files in the docs/ folder
- `path: company-id/research/*` - Downloads all files matching the pattern

## Implementation Notes

### Stateless Design

Like kubectl, lettactl is completely stateless:
- No local configuration files or session data stored
- Each command is independent and relies on remote APIs (Letta, Supabase)
- All agent state is managed by the Letta server, not lettactl
- Consistent behavior across different machines and environments

### Debugging & Fleet Inspection

Comprehensive commands for understanding your agent fleet:

```bash
# Quick health check
lettactl get agents                    # Are agents running?
lettactl get agents -o wide            # Check models, block/tool/folder/file counts

# Find resource usage across fleet
lettactl get tools --shared            # Which tools are reused?
lettactl get blocks --shared           # Which blocks are shared?
lettactl get folders --shared          # Which folders are shared?
lettactl get files --shared            # Files in shared folders

# Find orphaned resources (cleanup candidates)
lettactl get blocks --orphaned         # Blocks attached to 0 agents
lettactl get tools --orphaned          # Tools attached to 0 agents
lettactl get folders --orphaned        # Folders attached to 0 agents
lettactl get files --orphaned          # Files in orphaned folders

# Inspect specific agent's resources
lettactl get blocks -a my-agent        # What memory does this agent have?
lettactl get tools -a my-agent         # What can this agent do?
lettactl get folders -a my-agent       # What folders can it access?
lettactl get files -a my-agent         # What files can it access?

# File deduplication analysis
lettactl get files                     # Deduplicated view (unique files)
lettactl get files -o wide             # All instances (files may exist in multiple folders)

# Deep inspection
lettactl describe agent my-agent       # Full agent config + resources + recent messages
lettactl describe tool my-tool         # Source code + which agents use it
lettactl describe block persona        # Value preview + which agents use it
lettactl describe folder docs          # File list + which agents use it
lettactl describe file report.pdf      # File size/type + which folders contain it

# Export for analysis
lettactl get tools --shared -o json | jq '.[] | .name'
lettactl describe agent my-agent -o json > agent-snapshot.json
```

### Troubleshooting

**Use verbose mode when debugging:**
```bash
lettactl apply -v -f agents.yml
```

**Check connection:**
```bash
lettactl health
```

**Validate config:**
```bash
lettactl validate -f agents.yml
```
