export interface FleetConfig {
  root_path?: string;
  shared_blocks?: SharedBlock[];
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
}

export interface AgentConfig {
  name: string;
  description: string;
  system_prompt: PromptConfig;
  llm_config: LLMConfig;
  tools?: string[];
  shared_blocks?: string[];
  memory_blocks?: MemoryBlock[];
  folders?: FolderConfig[];
  embedding?: string;
  first_message?: string; // Message sent to agent on first creation for auto-calibration
  reasoning?: boolean; // Enable reasoning for models that support it (default: true)
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
  mutable?: boolean; // Default: true. If false, value syncs from YAML on every apply
}

export interface LLMConfig {
  model: string;
  context_window: number;
}