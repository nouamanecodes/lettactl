export interface FleetConfig {
  root_path?: string;
  shared_blocks?: SharedBlock[];
  shared_folders?: SharedFolderConfig[];
  mcp_servers?: McpServerConfig[];
  agents: AgentConfig[];
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
  mcp_tools?: McpToolConfig[];
  shared_blocks?: string[];
  memory_blocks?: MemoryBlock[];
  archives?: ArchiveConfig[];
  conversations?: ConversationConfig[];
  folders?: FolderConfig[];
  shared_folders?: string[];
  embedding?: string;
  embedding_config?: Record<string, any>;
  first_message?: string; // Message sent to agent on first creation for auto-calibration
  reasoning?: boolean; // Enable reasoning for models that support it (default: true)
  tags?: string[]; // Tags for filtering and multi-tenancy (e.g., ["tenant:user-123", "role:support"])
  lettabot?: LettaBotConfig; // LettaBot runtime configuration (channels, features, polling, etc.)
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
  disable_base_prompt?: boolean; // Optional: skip base Letta system instructions combination
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
