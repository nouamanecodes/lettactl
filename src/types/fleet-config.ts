export interface FleetConfig {
  root_path?: string;
  'global-secrets'?: Record<string, SecretConfig>;
  /** Secret names `--prune secrets` must never delete. For values injected by a
   *  runtime rather than declared here, which would otherwise be wiped every apply. */
  preserve_secrets?: string[];
  providers?: ProviderConfig[];
  prune_missing_providers?: boolean;
  shared_blocks?: SharedBlock[];
  shared_folders?: SharedFolderConfig[];
  mcp_servers?: McpServerConfig[];
  agents: AgentConfig[];
}

export type SecretConfig =
  | { from_env: string; value?: never; preserve_existing?: boolean }
  | { value: string; from_env?: never; preserve_existing?: never };

export interface ProviderConfig {
  name: string;
  provider_type: string;
  api_key: SecretConfig;
  access_key?: SecretConfig;
  region?: string;
  profile?: string;
  refresh?: boolean;
}

export interface McpServerConfig {
  name: string;
  type: 'sse' | 'stdio' | 'streamable_http';
  // SSE / Streamable HTTP
  server_url?: string;
  auth_header?: string;
  auth_token?: string;
  custom_headers?: Record<string, string>;
  // Stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SharedBlock {
  name: string;
  description: string;
  limit: number;
  value?: string;
  from_file?: string;
  version?: string; // Optional user-defined version tag
  agent_owned?: boolean; // Ignored for shared blocks - always agent_owned
}

export interface AgentConfig {
  name: string;
  description: string;
  system_prompt: PromptConfig;
  llm_config: LLMConfig;
  tools?: string[];
  include_base_tools?: boolean; // Default: false for memory.mode=memfs, true otherwise.
  include_base_tool_rules?: boolean; // Passed to Letta on create/update when supported.
  mcp_tools?: McpToolConfig[];
  shared_blocks?: string[];
  memory_blocks?: MemoryBlock[];
  archives?: ArchiveConfig[];
  conversations?: ConversationConfig[];
  folders?: FolderConfig[];
  shared_folders?: string[];
  embedding?: string;
  embedding_config?: Record<string, any>;
  compaction_settings?: CompactionSettingsConfig;
  first_message?: string; // Message sent to agent on first creation for auto-calibration
  reasoning?: boolean; // Enable reasoning for models that support it (default: true)
  tags?: string[]; // Tags for filtering and multi-tenancy (e.g., ["tenant:user-123", "role:support"])
  lettabot?: LettaBotConfig; // LettaBot runtime configuration (channels, features, polling, etc.)
  memory?: AgentMemoryConfig; // memFS migration config — see AgentMemoryConfig. Absent = block-mode (default).
  secrets?: Record<string, SecretConfig>; // Agent-scoped Letta Code secrets. Values are resolved by lettactl and stored in agent API state.
}

// Per-agent memFS migration config. When `mode: memfs`, lettactl apply will
// migrate this agent's blocks into git-backed memfs files, push to the bare
// repo, and flip the `git-memory-enabled` tag on the agent. When `mode:
// blocks` (or section omitted), the agent operates in classic block-mode.
// Round-trip is supported: flipping mode back to blocks removes the tag and
// blocks come back online.
export interface AgentMemoryConfig {
  mode: 'blocks' | 'memfs';
  bare_repo?: 'auto';                        // 'auto' = resolve via Letta /v1/git/<id>/state.git
  template_dir?: string;                     // dir of skeleton .md files; relative to root_path
  preserve_existing_paths?: string[];        // memfs paths to seed but not overwrite once present
  prune_missing_skills?: boolean;            // deprecated no-op — provenance now removes any file lettactl stops shipping
  prune_paths?: string[];                    // legacy escape hatch: force-delete bare-repo paths on apply. Provenance
                                             // handles removals automatically for agents projected by a recent lettactl;
                                             // only needed to clean up files projected before provenance tracking existed.
  files?: Array<{
    to: string;                              // memfs target path
    value?: string;                          // inline content
    from_file?: string;                      // repo-relative source file
    template_vars?: Record<string, string>;  // optional {{VAR}} replacements
  }>;
  skills?: Array<{
    name?: string;                           // defaults to basename(from_dir)
    from_dir: string;                        // skill dir containing SKILL.md; relative to root_path
  }>;
  from_blocks?: Array<{
    block: string;                           // existing block label on the agent
    to: string;                              // memfs target path (must end in .md, no leading slash, no ..)
    extract_section?: string;                // optional: extract only this markdown H2 section from the block
  }>;
  capability_index_file?: string;            // path to system/capability-index.md content (relative to template_dir)
  verify?: {
    require_core_memory_empty?: boolean;     // post-flip, /context must show num_tokens_core_memory === 0
    smoke_prompt?: string;                   // optional probe sent after the flip
  };
}

export interface McpToolConfig {
  server: string;
  tools?: string[] | 'all';
}

export interface ToolConfig {
  name: string;
  from_bucket: {
    provider: string;
    bucket: string;
    path: string;
  };
}

export interface FromBucketConfig {
  provider: 'supabase'; // Matches BucketConfig from storage-backend
  bucket: string;
  path: string;
}

export type FolderFileConfig = string | { from_bucket: FromBucketConfig };

export interface FolderConfig {
  name: string;
  files: FolderFileConfig[];
}

export interface SharedFolderConfig {
  name: string;
  files: FolderFileConfig[];
}

export interface PromptConfig {
  value?: string;
  from_file?: string;
}

export interface MemoryBlock {
  name: string;
  description: string;
  limit: number;
  value?: string;
  from_file?: string;
  version?: string; // Optional user-defined version tag
  agent_owned?: boolean; // Default: true. If false, value syncs from YAML on every apply
}

export interface ArchiveConfig {
  name: string;
  description?: string;
  embedding?: string;
  embedding_config?: Record<string, any>;
}

export interface ConversationConfig {
  summary: string;
  isolated_blocks?: string[];  // Maps to isolated_block_labels in API
}

export interface LLMConfig {
  model: string;
  context_window: number;
  max_tokens?: number;
}

export interface CompactionSettingsConfig {
  clip_chars?: number;
  mode?: string;
  sliding_window_percentage?: number;
  prompt?: string;
  model?: string;
  model_settings?: Record<string, any>;
  prompt_acknowledgement?: string;
}

// LettaBot configuration types

export type LettaBotGroupMode = 'open' | 'listen' | 'mention-only' | 'disabled';

export interface LettaBotGroupConfig {
  mode?: LettaBotGroupMode;
  allowedUsers?: string[];
  receiveBotMessages?: boolean;
}

export interface LettaBotChannelConfigBase {
  enabled: boolean;
  dmPolicy?: 'pairing' | 'allowlist' | 'open';
  allowedUsers?: (string | number)[];
  groupDebounceSec?: number;
  groups?: Record<string, LettaBotGroupConfig>;
  mentionPatterns?: string[];
  // Deprecated but preserved for backwards compatibility
  groupPollIntervalMin?: number;
  instantGroups?: string[];
  listeningGroups?: string[];
}

export interface LettaBotDisplayConfig {
  showToolCalls?: boolean;
  showReasoning?: boolean;
  reasoningMaxChars?: number;
}

export interface LettaBotProviderConfig {
  id: string;
  name: string;
  type: string;
  apiKey: string;
}

export interface LettaBotConfig {
  // Server connection (required for LettaBot runtime)
  server?: {
    mode?: 'api' | 'docker';
    baseUrl?: string;
    apiKey?: string;
    logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    api?: {
      port?: number;
      host?: string;
      corsOrigin?: string;
    };
  };
  // Per-agent display name prefix for outbound messages
  displayName?: string;
  // Conversation routing
  conversations?: {
    mode?: 'shared' | 'per-channel';
    heartbeat?: string; // "dedicated" | "last-active" | "<channel>"
    perChannel?: string[];
  };
  channels?: {
    telegram?: LettaBotChannelConfigBase & { token?: string };
    'telegram-mtproto'?: LettaBotChannelConfigBase & {
      phoneNumber?: string;
      apiId?: number;
      apiHash?: string;
      databaseDirectory?: string;
      groupPolicy?: 'mention' | 'reply' | 'both' | 'off';
      adminChatId?: number;
    };
    slack?: LettaBotChannelConfigBase & { appToken?: string; botToken?: string };
    discord?: LettaBotChannelConfigBase & { token?: string };
    whatsapp?: LettaBotChannelConfigBase & {
      selfChat?: boolean;
      sessionPath?: string;
      groupPolicy?: 'open' | 'disabled' | 'allowlist';
      groupAllowFrom?: string[];
    };
    signal?: LettaBotChannelConfigBase & {
      phone?: string;
      selfChat?: boolean;
      cliPath?: string;
      httpHost?: string;
      httpPort?: number;
    };
  };
  features?: {
    cron?: boolean;
    heartbeat?: {
      enabled: boolean;
      intervalMin?: number;
      skipRecentUserMin?: number;
      prompt?: string;
      promptFile?: string;
      target?: string; // Delivery target ("telegram:123", "slack:C123", etc.)
    };
    inlineImages?: boolean;
    memfs?: boolean;
    maxToolCalls?: number;
    sendFileDir?: string;
    sendFileMaxSize?: number;
    sendFileCleanup?: boolean;
    display?: LettaBotDisplayConfig;
  };
  // BYOK providers (api mode only)
  providers?: LettaBotProviderConfig[];
  polling?: {
    enabled?: boolean;
    intervalMs?: number;
    gmail?: { enabled?: boolean; account?: string; accounts?: string[] };
  };
  transcription?: { provider: 'openai' | 'mistral'; apiKey?: string; model?: string };
  attachments?: { maxMB?: number; maxAgeDays?: number };
}
