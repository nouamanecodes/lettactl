export interface FleetConfig {
  shared_blocks?: SharedBlock[];
  agents: AgentConfig[];
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
}

export interface FolderConfig {
  name: string;
  files: string[];
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
}

export interface LLMConfig {
  model: string;
  context_window: number;
}