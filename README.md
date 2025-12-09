# LettaCTL

[![CI](https://github.com/nouamanecodes/lettactl/actions/workflows/ci.yml/badge.svg)](https://github.com/nouamanecodes/lettactl/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A kubectl-style CLI for managing stateful Letta AI agent fleets with declarative configuration. Think "Docker Compose" but for AI agents - define your entire agent setup in YAML and deploy with one command.

## Two Ways to Use LettaCtl

| **CLI Tool** | **Programmatic SDK** |
|--------------|---------------------|
| Command-line interface | Library for applications |
| Automated fleet management | Dynamic agent creation |
| `npm install -g lettactl` | `npm install lettactl` |
| Perfect for DevOps workflows | Perfect for SaaS platforms |

## Features

- 🚀 **Declarative Configuration** - Define agents in YAML, deploy with one command
- 🔄 **Smart Updates** - Only updates what actually changed, preserves conversation history
- 🎯 **Intelligent Change Detection** - Automatically detects file content changes, tool updates, and memory block modifications
- 🧠 **Fleet Management** - Deploy and manage multiple related agents together
- 💬 **Message Operations** - Send messages, stream responses, manage conversations
- 📦 **Resource Sharing** - Share memory blocks and tools across agents
- 🗑️ **Bulk Operations** - Pattern-based bulk delete with safety previews and shared resource preservation
- 🔧 **Tool And Documentation Discovery** - Auto-discover custom Python tools & all documents to be pushed to letta folders
- 🛠️ **Programmatic SDK** - Use as a library for building multi-tenant applications
- ☁️ **Cloud Storage** - Supabase integration for fleet configurations and content

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

# Set up your environment
export LETTA_API_URL=http://localhost:8283  # For self-hosting
export LETTA_API_KEY=your_api_key           # Only needed for Letta Cloud
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
lettactl apply -f agents.yml -v       # Verbose output
```

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
- ✅ Agent-specific memory blocks
- ✅ Agent-specific folders (if not shared)
- ✅ Associated conversation history
- ❌ Shared blocks and folders (preserved)

**Safety Features:**
- Always shows preview before deletion
- Requires explicit `--force` confirmation
- Preserves shared resources used by other agents
- Pattern matching is case-insensitive
- Supports complex regex patterns

### View Resources
```bash
lettactl get agents                    # List all agents
lettactl describe agent my-agent       # Detailed agent info
lettactl messages my-agent            # View conversation history
```

### Validate Configuration
```bash
lettactl validate -f agents.yml       # Check config syntax
```

### Remove Resources
```bash
# Delete single agent
lettactl delete agent my-agent --force  # Delete agent

# Bulk delete with pattern matching
lettactl delete-all agents --pattern "test.*" --force    # Delete all agents matching "test*"
lettactl delete-all agents --pattern "(dev|staging).*"   # Complex regex patterns
lettactl delete-all agents --pattern ".*temp.*"          # Match anywhere in name/ID
lettactl delete-all agents --force                       # Delete ALL agents (dangerous!)

# Preview what will be deleted (without --force)
lettactl delete-all agents --pattern "test.*"            # Shows preview, asks for --force
```

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
  lettaApiUrl: 'http://localhost:8283'
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
    system_prompt: { value: `You are an AI assistant for ${userId}. Help with tasks and answer questions.` },
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
# Conversation history preserved! 🎉
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

### Fleet Cleanup Workflows

Common patterns for managing agent fleets at scale:

```bash
# Development workflow - clean up test agents after feature work
lettactl delete-all agents --pattern "feature-.*" --force

# Staging cleanup - remove old staging agents but keep current ones
lettactl delete-all agents --pattern "staging-old.*" --force

# Version cleanup - remove old versioned agents
lettactl delete-all agents --pattern ".*__v__2024.*" --force

# Emergency cleanup - remove all temporary/test agents
lettactl delete-all agents --pattern "(temp|test|debug).*" --force

# CI/CD cleanup - remove agents created by failed builds
lettactl delete-all agents --pattern ".*-pr-[0-9]+$" --force
```

### Environment Management

```bash
# Self-hosting Letta
export LETTA_API_URL=http://localhost:8283
# API key is optional for self-hosting

# Letta Cloud  
export LETTA_API_URL=https://api.letta.com
export LETTA_API_KEY=your_cloud_key  # Required for cloud
```

### Supabase Storage Integration

For cloud storage support, lettactl can read agent configuration files from Supabase buckets. More cloud storage options coming soon.

```bash
# Required environment variables
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_ANON_KEY=sb_publishable_your_anon_key
```

**⚠️ Important: Use the ANON key, not the service role key**
- Go to Supabase Dashboard > Settings > API
- Copy the "anon public" key (starts with `sb_publishable_...`)
- Do NOT use the "service role" key for lettactl

**Bucket Configuration:**

Your Supabase bucket must be either:
1. **Public bucket** (recommended for shared configurations)
2. **Private bucket with RLS policy** allowing anon key access

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
```

### Update Workflows

```bash
# Edit your configuration
vim agents.yml

# Preview changes
lettactl apply -f agents.yml --dry-run

# Deploy changes - only modified agents get new versions
lettactl apply -f agents.yml

# Check what was created
lettactl get agents
```

## Implementation Notes

### Stateless Design

Like kubectl, lettactl is completely stateless:
- No local configuration files or session data stored
- Each command is independent and relies on remote APIs (Letta, Supabase)
- All agent state is managed by the Letta server, not lettactl
- Consistent behavior across different machines and environments

### Troubleshooting

**Use verbose mode when debugging:**
```bash
lettactl apply -v -f agents.yml
```

**Check connection:**
```bash
lettactl get agents
```

**Validate config:**
```bash
lettactl validate -f agents.yml
```