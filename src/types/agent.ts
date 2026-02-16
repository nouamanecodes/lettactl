export interface AgentConfigHashes {
  overall: string;           // Combined hash for quick comparison
  systemPrompt: string;      // System prompt hash
  tools: string;             // Tools configuration hash
  model: string;             // Model + embedding + context window hash
  memoryBlocks: string;      // Memory blocks hash
  folders: string;           // Folders hash
  sharedBlocks: string;      // Shared blocks hash
  archives: string;          // Archives hash
  tags: string;              // Tags hash
  lettabotConfig: string;    // LettaBot config hash
}

export interface AgentVersion {
  id: string;
  name: string;
  baseName: string; // Name without version suffix
  configHashes: AgentConfigHashes;
  version: string;
  lastUpdated: string;
}
