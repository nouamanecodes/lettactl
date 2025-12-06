# LettaCTL

[![CI](https://github.com/nouamanecodes/lettactl/actions/workflows/ci.yml/badge.svg)](https://github.com/nouamanecodes/lettactl/actions)
[![npm version](https://badge.fury.io/js/lettactl.svg)](https://badge.fury.io/js/lettactl)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A kubectl-style CLI for managing stateful Letta AI agent fleets with declarative configuration. Think "Docker Compose" but for AI agents - define your entire agent setup in YAML and deploy with one command.

## Features

- 🚀 **Declarative Configuration** - Define agents in YAML, deploy with one command
- 🔄 **Smart Updates** - Only updates what actually changed, preserves conversation history
- 🎯 **Intelligent Change Detection** - Automatically detects file content changes, tool updates, and memory block modifications
- 🧠 **Fleet Management** - Deploy and manage multiple related agents together
- 💬 **Message Operations** - Send messages, stream responses, manage conversations
- 📦 **Resource Sharing** - Share memory blocks and tools across agents
- 🗑️ **Bulk Operations** - Pattern-based bulk delete with safety previews and shared resource preservation
- 🔧 **Tool And Documentation Discovery** - Auto-discover custom Python tools & all documents to be pushed to letta folders

## Installation & Setup

### Prerequisites
- Node.js 18+ 
- A running Letta server instance

### Install

```bash
# Install globally from npm
npm install -g lettactl

# Set up your environment
export LETTA_API_URL=http://localhost:8283  # For self-hosting
export LETTA_API_KEY=your_api_key           # Only needed for Letta Cloud
```

### Usage

After installation, you can use lettactl directly:

```bash
# List all agents
lettactl get agents

# Deploy agents from configuration
lettactl apply -f agents.yml

# Send a message to an agent
lettactl send my-agent "Hello, how are you?" --stream

# View agent details
lettactl describe agent my-agent
```


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

### Quick Start Example

The fastest way to get started is to create your own `agents.yml` file (see below) and deploy it:

### Your First Agent

Create a file called `agents.yml`:

```yaml
agents:
  - name: my-first-agent
    description: "A helpful AI assistant"
    llm_config:
      model: "google_ai/gemini-2.5-pro"
      context_window: 32000
    system_prompt:
      value: "You are a helpful AI assistant."
    tools:
      - archival_memory_insert
      - archival_memory_search
    memory_blocks:
      - name: user_preferences
        description: "Remembers what the user likes"
        limit: 2000
        value: "User prefers concise, direct answers."
    embedding: "letta/letta-free"
```

Deploy it:

```bash
lettactl apply -f agents.yml
```

That's it! Your agent is now running.

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

## Core Features

### Smart Versioning

lettactl automatically handles versioning when content changes:

```yaml
memory_blocks:
  - name: user_data
    description: "User information"
    value: "Updated content here"
    # lettactl creates: user_data__v__20241202-a1b2c3d4
```

**User-defined versions:**
```yaml
memory_blocks:
  - name: campaign_brief
    version: "summer-2024-launch"  # Your custom tag
    value: "Summer campaign details..."
    # Creates: campaign_brief__v__summer-2024-launch
```

### Diff-Based Updates

When you change system prompts or memory content, lettactl creates new versioned agents instead of overwriting existing ones:

```bash
# First apply creates: recipe-assistant
lettactl apply -f agents.yml

# After changing system prompt, creates: recipe-assistant__v__20241202-abc123
lettactl apply -f agents.yml

# Unchanged agents are left alone
```

### Shared Resources

Share memory blocks across multiple agents:

```yaml
shared_blocks:
  - name: company_guidelines
    description: "Company-wide AI guidelines"
    limit: 5000
    from_file: "shared/guidelines.md"

agents:
  - name: sales-agent
    shared_blocks:
      - company_guidelines
    # ... rest of config
    
  - name: support-agent  
    shared_blocks:
      - company_guidelines
    # ... rest of config
```

### Custom Tools

Auto-discover Python tools:

```yaml
tools:
  - tools/*                    # Auto-discover all .py files
  - specific_tool_name         # Or reference specific tools
```

Create `tools/my_tool.py`:
```python
from pydantic import BaseModel

def my_custom_tool(query: str) -> str:
    """Does something amazing with the query"""
    return f"Processed: {query}"
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

## Why lettactl?

Managing AI agents manually gets messy fast. You end up with:
- Inconsistent configurations across environments
- Lost work when recreating agents  
- No version control for agent setups
- Painful collaboration between team members

lettactl treats your AI agents like infrastructure - versionable, reproducible, and manageable at scale.

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

**File Processing:**

lettactl uses efficient metadata checking for cloud storage files:
- Reads file metadata (size, etc.) before downloading to detect issues early
- Warns about very small files (≤40 bytes) that may be effectively empty
- Warns about very large files (>50MB) that may cause memory or timeout issues  
- Only downloads file content when metadata checks pass

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