# LettaCTL

[![CI](https://github.com/nouamanecodes/lettactl/actions/workflows/ci.yml/badge.svg)](https://github.com/nouamanecodes/lettactl/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Socket Badge](https://socket.dev/api/badge/npm/package/lettactl)](https://socket.dev/npm/package/lettactl)

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

### Minimal Config

The minimum required fields for an agent:

```yaml
agents:
  - name: my-agent                      # Required
    description: "My AI assistant"      # Required
    llm_config:                         # Required
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:                      # Required
      value: "You are a helpful assistant."
```

Memory blocks require `agent_owned`:

```yaml
    memory_blocks:
      - name: notes                     # Required
        description: "Agent notes"      # Required
        limit: 2000                     # Required
        agent_owned: true               # Required (true or false)
        value: "Initial notes"          # Required (or from_file)
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
    agent_owned: true
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
    embedding: "openai/text-embedding-3-small"

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
        agent_owned: true
        from_bucket:  # Load content from cloud storage
          provider: supabase
          bucket: test-bucket
          path: knowledge/example.md
    embedding: "openai/text-embedding-3-small"
```

Deploy the entire fleet:

```bash
lettactl apply -f agents.yml  # Deploy all agents and shared resources
```

That's it! Your entire fleet is now running with shared resources and cloud storage.

## Multi-Tenancy with Tags

Tags let you organize and filter agents for multi-tenant applications. Apply tags in your YAML and filter with `--tags` on the CLI.

### B2B: One Tenant = One Set of Agents

Tag each tenant's agents and filter when querying:

```yaml
agents:
- name: acme-support
  description: Support agent for Acme Corp
  tags: ["tenant:acme", "role:support"]
  # ... llm_config, system_prompt, etc.

- name: acme-research
  description: Research agent for Acme Corp
  tags: ["tenant:acme", "role:research"]
  # ... llm_config, system_prompt, etc.

- name: globex-support
  description: Support agent for Globex
  tags: ["tenant:globex", "role:support"]
  # ...
```

```bash
# Get all agents for a specific tenant
lettactl get agents --tags "tenant:acme"

# Get support agents across all tenants
lettactl get agents --tags "role:support"
```

Or via the SDK:

```typescript
const ctl = new LettaCtl();
const fleet = ctl.createFleetConfig()
  .addAgent({
    name: 'acme-support',
    description: 'Support agent for Acme Corp',
    tags: ['tenant:acme', 'role:support'],
    llm_config: { model: 'openai/gpt-4o', context_window: 128000 },
    system_prompt: { value: 'You are a support agent for Acme Corp.' }
  })
  .build();
```

### B2B2C: M Users × N Clients × Y Agents

For platforms where your users each have their own clients, use composite tags:

```yaml
agents:
- name: user-42-client-7-support
  description: Support agent
  tags: ["user:42", "client:7", "role:support"]
  # ...

- name: user-42-client-7-research
  description: Research agent
  tags: ["user:42", "client:7", "role:research"]
  # ...
```

```bash
# All agents for user 42
lettactl get agents --tags "user:42"

# All agents for a specific client of user 42
lettactl get agents --tags "user:42,client:7"

# All support agents across the platform
lettactl get agents --tags "role:support"
```

### Key Considerations

| Aspect | How It Works |
|--------|-------------|
| **Scope** | Tags apply to agents only — tools, blocks, and folders are already scoped through the agent relationship |
| **Filtering** | `--tags` uses AND logic: `--tags "a,b"` returns agents with both tags |
| **Naming** | Use `key:value` format for structured filtering |
| **Shared resources** | Use `shared_blocks` and `shared_folders` for resources shared across the entire fleet |
| **App layer** | Your application is responsible for generating the correct YAML or SDK calls per tenant |

## Memory Reports

Monitor memory block usage across your fleet and let agents self-diagnose their own memory health.

### Usage Report (API only, instant)

```bash
lettactl report memory my-agent              # single agent
lettactl report memory --all                 # entire fleet
lettactl report memory --match "acme-*"      # wildcard
lettactl report memory --tags "tenant:acme"  # by tags
lettactl report memory my-agent -o json      # JSON output
```

Shows fill %, limits, usage, and content preview per block. Shared blocks are deduplicated and marked with `*`. Fill percentages are color-coded: green (<50%), yellow (50-79%), red (80%+). For single agents, the AGENT column is hidden.

### Analyze Mode (LLM-powered)

```bash
lettactl report memory my-agent --analyze
lettactl report memory --tags "tenant:acme" --analyze --confirm
```

Messages each agent asking it to evaluate its own memory blocks. The agent reports on:

- **Topic count** per block — signals when a block should be split
- **Space status** — healthy, crowded, near-full, or empty
- **Split recommendation** — should this block be broken up?
- **Stale info** — outdated facts, old dates, deprecated references
- **Missing context** — topics the agent gets asked about but has no block for
- **Redundancy** — duplicate info across blocks
- **Contradictions** — conflicting info between blocks
- **Suggested actions** — what the agent would change about its memory layout

The agent is uniquely positioned to judge its own memory — the API tells you fill percentages, but only the agent knows "this pricing data is from last year" or "I keep getting asked about competitor analysis and have nowhere to store it."

## Commands

### Deploy Configuration
```bash
lettactl apply -f agents.yml           # Deploy all agents
lettactl apply -f agents.yml --agent my-agent  # Deploy specific agent
lettactl apply -f agents.yml --dry-run # See what would change
lettactl apply -f agents.yml --root . # Specify root directory for file resolution
lettactl apply -f agents.yml -v       # Verbose output
lettactl apply -f agents.yml -q       # Quiet mode (for CI pipelines)
lettactl apply -f agents.yml --manifest  # Generate manifest with all resource IDs
lettactl apply -f agents.yml --manifest output.json  # Custom manifest path

# Template mode: apply config to existing agents matching a glob pattern
lettactl apply -f template.yaml --match "*-assistant"  # All agents ending in -assistant
lettactl apply -f template.yaml --match "user-*"       # All agents starting with user-
lettactl apply -f template.yaml --match "*" --dry-run  # Preview changes to all agents
```

**Template Mode (`--match`):**
Apply a template configuration to multiple existing agents at once. Uses merge semantics - adds/updates tools, blocks, and prompts without removing existing resources. Perfect for propagating tool updates or shared config changes across agent fleets.

**Agent Manifests (`--manifest`):**
Generate a JSON manifest with all resolved resource IDs after deployment. Useful for CI/CD pipelines that need to track what was deployed:
```bash
lettactl apply -f agents.yml --manifest
# Generates agents.manifest.json with agent IDs, tool IDs, block IDs, etc.
```

### Create Agents from CLI without Files

You can also create agents directly from the CLI

```bash
# Create basic agent
lettactl create agent my-agent --description "My helpful assistant"

# Create with more configuration
lettactl create agent advanced-agent \
  --description "Advanced AI assistant" \
  --model "google_ai/gemini-2.5-pro" \
  --system "You are an expert assistant." \
  --context-window 32000 \
  --embedding "openai/text-embedding-3-small" \
  --tags "production,assistant"
```

### Update Agents from CLI without files
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
# Export agent to JSON (Letta native format, includes conversation history)
lettactl export agent my-agent -o my-agent-backup.json

# Export agent to YAML (git-trackable config format)
lettactl export agent my-agent -f yaml -o agents.yml

# Export with legacy format
lettactl export agent my-agent --legacy-format -o legacy-backup.json

# Import agent from file
lettactl import my-agent-backup.json

# Import with custom name and copy suffix
lettactl import my-agent-backup.json \
  --name restored-agent \
  --append-copy
```

### Git-Native Versioning & Rollback

lettactl is designed to work with git for version control. Your YAML config IS your version history.

```bash
# 1. Capture current server state to git
lettactl export agent my-agent -f yaml -o agents.yml
git add agents.yml && git commit -m "snapshot: current config"

# 2. Check for drift (server vs config)
lettactl apply -f agents.yml --dry-run

# 3. Make changes and deploy
vim agents.yml  # edit config
lettactl apply -f agents.yml
git commit -am "feat: updated system prompt"

# 4. Rollback if needed
git revert HEAD
lettactl apply -f agents.yml
```

![Drift Detection](assets/drift-detection.png)

**Workflow:**
| Need | Command |
|------|---------|
| Check drift | `lettactl apply --dry-run` |
| Capture server state | `lettactl export agent <name> -f yaml` |
| Deploy config | `lettactl apply -f agents.yml` |
| Rollback | `git revert` + `lettactl apply` |
| Version history | `git log agents.yml` |
| Compare versions | `git diff HEAD~1 agents.yml` |

### Message Operations
![Message Operations](assets/messages.png)
```bash
# View conversation history (last 10 messages by default)
lettactl messages my-agent
lettactl messages my-agent -l 50    # Last 50 messages
lettactl messages my-agent --all    # Full history

# Send a message to an agent (async by default, polls until complete)
lettactl send my-agent "Hello, how are you?"

# Send with streaming response
lettactl send my-agent "Tell me about Tokyo" --stream

# Send and return immediately (fire-and-forget, prints run ID)
lettactl send my-agent "Plan a 7-day itinerary" --no-wait

# Send synchronously (old behavior, may timeout on long responses)
lettactl send my-agent "Quick question" --sync

# Reset agent's conversation history
lettactl reset-messages my-agent --add-default

# Compact agent's message history (summarize)
lettactl compact-messages my-agent

# Cancel running message processes
lettactl cancel-messages my-agent --run-ids "run1,run2"
```

### Fleet Reports
```bash
# Memory usage report
lettactl report memory my-agent              # single agent
lettactl report memory --all                 # all agents
lettactl report memory --match "acme-*"      # wildcard filter
lettactl report memory --tags "tenant:acme"  # tag filter
lettactl report memory my-agent -o json      # JSON output

# LLM-powered memory analysis (messages agents, costs tokens)
lettactl report memory my-agent --analyze
lettactl report memory --all --analyze --confirm  # skip prompt
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
- Agent archival memory archives
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
lettactl cleanup archives              # Find orphaned archives
lettactl cleanup all                   # Find all orphaned resources

# Actually delete orphaned resources
lettactl cleanup blocks --force        # Delete orphaned blocks
lettactl cleanup folders --force       # Delete orphaned folders (cascades to files)
lettactl cleanup archives --force      # Delete orphaned archives (and their passages)
lettactl cleanup all --force           # Delete all orphaned resources
```

**What gets cleaned up:**
- **Orphaned blocks**: Memory blocks attached to 0 agents
- **Orphaned folders**: Folders attached to 0 agents (files inside are also deleted)
- **Orphaned archives**: Archives attached to 0 agents

**Safety Features:**
- Dry-run by default - shows what would be deleted
- Requires `--force` to actually delete
- Shows file counts for orphaned folders
- Uses API's native orphan detection for efficiency

### Archival Memory (Archives)
Archives are the archival memory stores attached to agents.

**Key points:**
- Archives are **per-agent** and **one per agent** (validated).
- `apply` will create and attach the archive if it does not exist.
- Removing an archive from config only detaches it when `--force` is used.
- Passages are managed by the agent/tools (`archival_memory_insert/search`), not by lettactl.
- Export/import includes archives and passages via Letta server export/import.

**Example:**
```yaml
agents:
  - name: my-agent
    archives:
      - name: my-archive
        description: "Long-term knowledge base"
        embedding: "openai/text-embedding-3-small"
        # embedding_config: {}   # Optional provider-specific config
```

### View Resources
```bash
# List resources
lettactl get agents                    # List all agents
lettactl get agents --tags "tenant:user-123"  # Filter by tags
lettactl get agents --tags "tenant:user-123,role:support"  # Multiple tags (AND)
lettactl get blocks                    # List all memory blocks
lettactl get archives                  # List all archives (archival memory stores)
lettactl get tools                     # List all tools
lettactl get folders                   # List all folders (with file counts)
lettactl get files                     # List all files (deduplicated by name)
lettactl get mcp-servers               # List all MCP servers
lettactl get archival my-agent         # List archival memory entries (truncated)
lettactl get archival my-agent --full  # Full archival entry text
lettactl get archival my-agent --query "pricing"  # Semantic search

# Wide output with extra columns (agent counts, sizes, models)
lettactl get agents -o wide            # +folders, MCP servers, files columns
lettactl get blocks -o wide
lettactl get tools -o wide
lettactl get files -o wide             # Shows every file instance per folder

# Scoped to specific agent
lettactl get blocks -a my-agent        # Blocks attached to my-agent
lettactl get archives -a my-agent      # Archives attached to my-agent
lettactl get tools -a my-agent         # Tools attached to my-agent
lettactl get folders -a my-agent       # Folders attached to my-agent
lettactl get files -a my-agent         # Files accessible to my-agent

# Fleet analysis
lettactl get tools --shared            # Tools used by 2+ agents
lettactl get blocks --orphaned         # Blocks not attached to any agent
lettactl get archives --orphaned       # Archives not attached to any agent
lettactl get folders --shared          # Shared folders with agent counts
lettactl get files --shared            # Files in folders used by 2+ agents
lettactl get files --orphaned          # Files in folders not used by any agent

# Detailed resource info
lettactl describe agent my-agent       # Agent details + blocks/tools/folders/messages/archival
lettactl describe block persona        # Block details + attached agents + value preview
lettactl describe archive kb-store     # Archive details + attached agents
lettactl describe tool my-tool         # Tool details + attached agents + source code
lettactl describe folder docs          # Folder details + files + attached agents
lettactl describe file report.pdf      # File details + which folders contain it
lettactl describe mcp-servers my-mcp   # MCP server details + tools

# JSON output for scripting
lettactl get agents -o json
lettactl describe tool my-tool -o json

# Conversation history (last 10 by default)
lettactl messages my-agent             # Last 10 messages
lettactl messages my-agent --all       # Full history
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

MCP servers are created/updated automatically during `lettactl apply` when defined in your configuration. MCP servers are **global resources** — defined once and shared across all agents. Each agent picks which tools it needs via `mcp_tools`.

**Using MCP Tools in Agents:**

```yaml
mcp_servers:
  # Remote server (recommended for production)
  - name: weather-api
    type: streamable_http
    server_url: "https://weather.example.com/mcp"
    auth_token: "${WEATHER_API_KEY}"

  # Local server (for development/self-hosted only)
  - name: filesystem
    type: stdio
    command: npx
    args: ["-y", "@anthropic/mcp-filesystem"]

agents:
  - name: agent-a
    mcp_tools:
      - server: weather-api
        tools: all                    # All tools from server
      - server: filesystem
        tools: [read_file, list_dir]  # Specific tools only

  - name: agent-b
    mcp_tools:
      - server: weather-api
        tools: [get_forecast]         # Different subset, same server
```

During `apply`, `mcp_tools` declarations are expanded into concrete tool names and merged into the agent's tool list. Two agents can reference the same MCP server with different tool subsets.

**Transport types:**

| Type | Use Case | Platform |
|------|----------|----------|
| `streamable_http` | Production remote servers | Cloud + self-hosted |
| `sse` | Legacy (deprecated) | Cloud + self-hosted |
| `stdio` | Local dev/testing | Self-hosted only |

Use `streamable_http` for remote MCP servers. `sse` still works but is deprecated by Letta. `stdio` runs a local subprocess, so it only works on self-hosted.

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

## SDK Options

```typescript
import { LettaCtl } from 'lettactl';

const lettactl = new LettaCtl({
  lettaBaseUrl: 'http://localhost:8283',
  lettaApiKey: 'optional-api-key',      // For Letta Cloud
  root: '/path/to/project',             // Where .lettactl/fleet.yaml is stored (defaults to cwd)
});
```

The SDK automatically manages a `.lettactl/fleet.yaml` file in the `root` directory to track deployed agents.

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
    embedding: "openai/text-embedding-3-small"
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
  .addSharedFolder({  // Shared folder across agents
    name: 'company-docs',
    files: ['docs/handbook.pdf', 'docs/policies.pdf']
  })
  .addAgent({  // Simple document-focused agent
    name: 'user-123-document-assistant',
    description: 'Document assistant for user 123',
    llm_config: { model: 'google_ai/gemini-2.5-pro', context_window: 32000 },
    system_prompt: { value: 'You analyze documents for user 123.' },
    shared_folders: ['company-docs'],  // Shared docs, no duplicate uploads
    folders: [{ name: 'user-docs', files: ['files/*'] }]  // Agent-specific files
  })
  .addAgent({  // Cloud-powered agent with shared memory
    name: 'user-123-cloud-assistant',
    description: 'Cloud assistant for user 123',
    llm_config: { model: 'google_ai/gemini-2.5-pro', context_window: 32000 },
    system_prompt: { value: 'You are a cloud-powered assistant for user 123.' },
    shared_blocks: ['shared-guidelines'],  // Use shared memory
    shared_folders: ['company-docs'],  // Same shared docs
    memory_blocks: [{
      name: 'user-knowledge',
      description: 'User-specific knowledge base',
      limit: 8000,
      agent_owned: true,
      value: 'User 123 knowledge and preferences.'
    }]
  })
  .build();

await lettactl.deployFleet(fleet);  // Deploy entire fleet
```

### Agent Deletion

Delete agents programmatically with full resource cleanup:

```typescript
// Delete a single agent (cleans up blocks, folders, and updates .lettactl/fleet.yaml)
await lettactl.deleteAgent('user-123-assistant');

// Safe to call even if .lettactl/fleet.yaml doesn't exist
await lettactl.deleteAgent('orphaned-agent');
```

`deleteAgent()` performs the same cleanup as the CLI `delete` command:
- Removes agent-specific memory blocks (preserves shared blocks)
- Removes agent-specific folders (preserves shared folders)
- Deletes the agent from the Letta server
- Updates `.lettactl/fleet.yaml` (removes the agent entry, or deletes the file if no agents remain)

### Messaging

Send messages to agents programmatically:

```typescript
import { LettaCtl, isRunTerminal, getEffectiveRunStatus } from 'lettactl';

// Send a message (async - returns immediately with run ID)
const run = await lettactl.sendMessage(agentId, 'Hello, how are you?');
console.log(run.id); // run-abc123...

// Wait for completion (polls with robust stop_reason detection)
const completed = await lettactl.waitForRun(run.id);
console.log(completed.status); // 'completed'

// With timeout (in seconds)
const completed = await lettactl.waitForRun(run.id, { timeout: 120 });

// Fire-and-forget with callback (for background processing)
const run = await lettactl.sendMessage(agentId, 'Calibrate yourself', {
  onComplete: (completedRun) => {
    const status = getEffectiveRunStatus(completedRun);
    db.update({ agentId, status: status === 'completed' ? 'deployed' : 'failed' });
  },
  onError: (err) => console.error('Calibration failed:', err),
  timeout: 120
});
// Returns immediately, callback fires in background when done

// Manual polling (if you need custom logic)
const run = await lettactl.sendMessage(agentId, 'Hello');
const status = await lettactl.getRun(run.id);
if (isRunTerminal(status)) {
  console.log(getEffectiveRunStatus(status)); // 'completed' | 'failed' | 'cancelled'
}
```

`sendMessage()` returns a `Run` immediately. Use `onComplete` for fire-and-forget with background notification.

`waitForRun()` polls until terminal state using robust `status` + `stop_reason` detection.

`isRunTerminal()` and `getEffectiveRunStatus()` are exported for custom polling.

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
    agent_owned: true
    value: "User prefers short, direct answers."
```

**Option 2: File-based content (recommended for large content)**
```yaml
memory_blocks:
  - name: company_knowledge
    description: "Company knowledge base"
    limit: 10000
    agent_owned: true
    from_file: "memory-blocks/company-info.md"
```

**Controlling Block Ownership (required):**

The `agent_owned` field is **required** on all memory blocks:

```yaml
memory_blocks:
  # Agent-owned: Agent can modify, changes preserved on re-apply
  - name: learned_preferences
    description: "User preferences the agent learns over time"
    limit: 2000
    agent_owned: true  # Required - agent controls this block
    value: "No preferences yet"

  # YAML-owned: YAML value syncs to server on every apply
  - name: policies
    description: "Agent policies from config"
    limit: 2000
    agent_owned: false  # Required - YAML controls this block
    value: "Always be helpful and concise."
```

Use `agent_owned: false` for:
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
    reasoning: true                     # Optional: enable reasoning (default: true)
    tags: ["tenant:user-123", "role:support"]  # Optional: tags for filtering/multi-tenancy

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

    # MCP tools (optional) - reference tools from MCP servers
    mcp_tools:
      - server: my-mcp-server           # MCP server name (defined in mcp_servers)
        tools: all                      # Include all tools from server
      - server: another-server
        tools:                          # Or specify individual tools
          - specific_tool_1
          - specific_tool_2
    
    # Shared blocks (optional)
    shared_blocks:
      - shared_block_name
    
    # Agent-specific memory blocks (optional)
    memory_blocks:
      - name: block_name
        description: "What this block stores"
        limit: 5000                     # Character limit
        version: "optional-tag"         # Optional: your version tag
        agent_owned: true               # Required: true = agent owns, false = YAML syncs on apply
        value: "Direct content"         # Option 1: inline
        from_file: "blocks/file.md"    # Option 2: from file

    # Archives (archival memory store) (optional)
    archives:
      # Note: only one archive is supported per agent
      - name: knowledge-archive
        description: "Long-term knowledge base"
        embedding: "letta/letta-free"
    
    # Shared folders (optional) - references top-level shared_folders
    shared_folders:
      - shared_folder_name

    # Agent-specific file attachments (optional)
    folders:
      - name: folder_name
        files:
          - "files/*"                   # Auto-discover files
          - "files/specific-file.pdf"   # Specific files

    embedding: "openai/text-embedding-3-small"       # Optional: embedding model
```

### Shared Blocks Schema

Shared blocks are always agent_owned - their values are only set on initial creation. Once created, lettactl will never overwrite the block content on subsequent applies. This prevents accidentally wiping shared state that multiple agents depend on.

```yaml
shared_blocks:
  - name: block_name
    description: "Shared across agents"
    limit: 10000
    version: "optional-tag"             # Optional: your version tag
    value: "Content here"               # Option 1: inline
    from_file: "shared/file.md"        # Option 2: from file
```

### Shared Folders Schema

Define folders once at the top level and reference them by name across agents. Files are uploaded once and attached to all referencing agents - no duplicate uploads.

```yaml
shared_folders:
  - name: company-docs
    files:
      - docs/handbook.pdf
      - docs/policies.pdf
      - from_bucket:
          provider: supabase
          bucket: my-bucket
          path: docs/*.pdf

agents:
  - name: agent-a
    shared_folders:
      - company-docs
  - name: agent-b
    shared_folders:
      - company-docs
```

### MCP Servers Schema

MCP (Model Context Protocol) servers provide external tool capabilities to your agents. Define them at the top level of your configuration:

```yaml
mcp_servers:
  # Streamable HTTP (recommended for production)
  - name: my-remote-server
    type: streamable_http
    server_url: https://mcp.example.com/api
    auth_header: Authorization           # Optional (header name)
    auth_token: "${MY_API_KEY}"          # Optional (supports env vars)
    custom_headers:                      # Optional
      X-Custom-Header: value

  # Stdio (local development / self-hosted only)
  - name: my-local-server
    type: stdio
    command: /usr/bin/python3
    args:
      - "-m"
      - "mcp_server"
    env:                                 # Optional
      DEBUG: "true"
      LOG_LEVEL: "info"

  # SSE (deprecated — use streamable_http instead)
  - name: my-legacy-server
    type: sse
    server_url: http://localhost:3001/sse
```

**Transport types:**

| Type | Status | Platform | Use Case |
|------|--------|----------|----------|
| `streamable_http` | **Recommended** | Cloud + self-hosted | Remote MCP servers with auth |
| `stdio` | Supported | Self-hosted only | Local dev, subprocess-based servers |
| `sse` | **Deprecated** | Cloud + self-hosted | Legacy — migrate to `streamable_http` |

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
        description: "Company knowledge base"
        limit: 10000
        agent_owned: true
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

### Stateless CLI, Managed SDK

The **CLI** is completely stateless like kubectl:
- No local configuration files or session data stored
- Each command is independent and relies on remote APIs (Letta, Supabase)
- Consistent behavior across different machines and environments

The **SDK** optionally manages a `.lettactl/fleet.yaml` file to track deployed agents:
- Written after `deployFleet()` for fleet file persistence
- Updated by `deleteAgent()` to keep the file in sync
- Location controlled by the `root` option
- All agent state is still managed by the Letta server

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

# Archival memory inspection
lettactl get archival my-agent         # Truncated entry list
lettactl get archival my-agent --full  # Full entry text
lettactl get archival my-agent --query "topic"  # Semantic search

# Deep inspection
lettactl describe agent my-agent       # Full agent config + resources + recent messages + archival count
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
