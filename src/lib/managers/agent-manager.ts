import { LettaClientWrapper } from '../client/letta-client';
import { normalizeResponse } from '../shared/response-normalizer';
import { generateContentHash, generateTimestampVersion } from '../../utils/hash-utils';
import type { AgentConfigHashes, AgentVersion } from '../../types/agent';
import { log } from '../shared/logger';
import { DEFAULT_CONTEXT_WINDOW, DEFAULT_EMBEDDING } from '../shared/constants';

// Re-export types for backwards compatibility
export type { AgentConfigHashes, AgentVersion } from '../../types/agent';

export class AgentManager {
  private client: LettaClientWrapper;
  private agentRegistry = new Map<string, AgentVersion>();

  constructor(client: LettaClientWrapper) {
    this.client = client;
  }


  /**
   * Parses version from agent name (e.g., "recipe-assistant__v__20241202-abc123ef")
   */
  private parseVersionFromName(agentName: string): { baseName: string; version: string | null } {
    const versionMatch = agentName.match(/^(.+)__v__(.+)$/);
    if (versionMatch) {
      return { baseName: versionMatch[1], version: versionMatch[2] };
    }
    return { baseName: agentName, version: null };
  }

  /**
   * Loads existing agents from the server and builds the registry
   * Note: We only store basic info here. Full configuration comparison 
   * happens in getOrCreateAgentName when we have the desired config.
   */
  async loadExistingAgents(): Promise<void> {
    const agents = await this.client.listAgents();
    const agentList = normalizeResponse(agents);

    for (const agent of agentList) {
      if (agent.name && agent.system) {
        // For existing agents, store basic info for lookup
        // Full configuration hashing will be done during comparison
        const configHashes: AgentConfigHashes = {
          overall: '',              // Will be populated during comparison
          systemPrompt: generateContentHash(agent.system),
          tools: '',
          model: '',
          memoryBlocks: '',
          folders: '',
          sharedBlocks: '',
          archives: '',
          tags: '',
          lettabotConfig: ''
        };
        const { baseName, version } = this.parseVersionFromName(agent.name);

        const agentVersion: AgentVersion = {
          id: agent.id,
          name: agent.name,
          baseName: baseName,
          configHashes: configHashes,
          version: version || 'latest',
          lastUpdated: agent.last_updated || new Date().toISOString()
        };

        // Store by base name for lookup
        const existingAgent = this.agentRegistry.get(baseName);
        if (!existingAgent || agentVersion.lastUpdated > existingAgent.lastUpdated) {
          this.agentRegistry.set(baseName, agentVersion);
        }
      }
    }
  }

  /**
   * Generates granular configuration hashes for each component
   */
  private generateAgentConfigHashes(config: {
    systemPrompt: string;
    tools: string[];
    toolSourceHashes?: Record<string, string>;
    model?: string;
    embedding?: string;
    embeddingConfig?: Record<string, any>;
    contextWindow?: number;
    memoryBlocks?: Array<{name: string; description: string; limit: number; value: string}>;
    memoryBlockFileHashes?: Record<string, string>;
    folders?: Array<{name: string; files: string[]; fileContentHashes?: Record<string, string>}>;
    archives?: Array<{name: string; description?: string; embedding?: string}>;
    sharedBlocks?: string[];
    tags?: string[];
    lettabotConfig?: Record<string, any> | null;
  }): AgentConfigHashes {
    
    // System prompt hash
    const systemPromptHash = generateContentHash(config.systemPrompt);
    
    // Tools hash - includes tool names and source code content when available
    const toolsWithContent = (config.tools || []).map(toolName => ({
      name: toolName,
      sourceHash: config.toolSourceHashes?.[toolName] || ''
    })).sort((a, b) => a.name.localeCompare(b.name));
    const toolsHash = generateContentHash(JSON.stringify(toolsWithContent));
    
    // Model configuration hash (model + embedding + context window)
    const modelConfig = {
      model: config.model || "google_ai/gemini-2.5-pro",
      embedding: config.embedding || DEFAULT_EMBEDDING,
      embeddingConfig: config.embeddingConfig || null,
      contextWindow: config.contextWindow || DEFAULT_CONTEXT_WINDOW
    };
    const modelHash = generateContentHash(JSON.stringify(modelConfig));
    
    // Memory blocks hash - includes file content when available
    const normalizedMemoryBlocks = (config.memoryBlocks || [])
      .map(block => {
        const fileHash = config.memoryBlockFileHashes?.[block.name];
        const valueHash = generateContentHash(block.value || '');
        return {
          name: block.name,
          description: block.description,
          limit: block.limit,
          contentHash: fileHash || valueHash
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const memoryBlocksHash = generateContentHash(JSON.stringify(normalizedMemoryBlocks));
    
    // Folders hash - includes file contents when available  
    const normalizedFolders = (config.folders || [])
      .map(folder => ({
        name: folder.name,
        files: [...folder.files].sort(),
        fileContentHashes: folder.fileContentHashes || {}
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const foldersHash = generateContentHash(JSON.stringify(normalizedFolders));
    
    // Shared blocks hash
    const sharedBlocksHash = generateContentHash(JSON.stringify([...(config.sharedBlocks || [])].sort()));

    // Archives hash
    const normalizedArchives = (config.archives || [])
      .map(archive => ({
        name: archive.name,
        description: archive.description
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const archivesHash = generateContentHash(JSON.stringify(normalizedArchives));
    
    // Tags hash
    const tagsHash = generateContentHash(JSON.stringify([...(config.tags || [])].sort()));

    // LettaBot config hash
    const lettabotConfigHash = generateContentHash(JSON.stringify(config.lettabotConfig || null));

    // Overall hash combining all components
    const overallHash = generateContentHash(JSON.stringify({
      systemPrompt: systemPromptHash,
      tools: toolsHash,
      model: modelHash,
      memoryBlocks: memoryBlocksHash,
      folders: foldersHash,
      sharedBlocks: sharedBlocksHash,
      archives: archivesHash,
      tags: tagsHash,
      lettabotConfig: lettabotConfigHash
    }));

    return {
      overall: overallHash,
      systemPrompt: systemPromptHash,
      tools: toolsHash,
      model: modelHash,
      memoryBlocks: memoryBlocksHash,
      folders: foldersHash,
      sharedBlocks: sharedBlocksHash,
      archives: archivesHash,
      tags: tagsHash,
      lettabotConfig: lettabotConfigHash
    };
  }

  /**
   * Determines if an agent needs to be created/updated based on complete configuration
   */
  async getOrCreateAgentName(
    baseName: string,
    agentConfig: {
      systemPrompt: string;
      tools: string[];
      toolSourceHashes?: Record<string, string>;
      model?: string;
      embedding?: string;
      embeddingConfig?: Record<string, any>;
      contextWindow?: number;
      memoryBlocks?: Array<{name: string; description: string; limit: number; value: string}>;
      memoryBlockFileHashes?: Record<string, string>;
      folders?: Array<{name: string; files: string[]}>;
      archives?: Array<{name: string; description?: string; embedding?: string}>;
      sharedBlocks?: string[];
      tags?: string[];
      lettabotConfig?: Record<string, any> | null;
    },
    verbose: boolean = false
  ): Promise<{ agentName: string; shouldCreate: boolean; existingAgent?: AgentVersion }> {
    
    const desiredConfigHashes = this.generateAgentConfigHashes(agentConfig);
    const existingAgent = this.agentRegistry.get(baseName);

    if (!existingAgent) {
      // No agent with this base name exists
      if (verbose) log(`  No existing agent found for: ${baseName}`);
      return { 
        agentName: baseName, 
        shouldCreate: true 
      };
    }

    // For existing agents, we need to compare properly by generating current config hash
    // from the server state. For now, we'll always prefer partial updates over recreation.
    if (verbose) log(`  Found existing agent: ${existingAgent.name}, checking for changes...`);
    
    // Always return existing agent to trigger partial update logic in apply command
    // The actual comparison will happen in the DiffEngine
    return { 
      agentName: existingAgent.name, 
      shouldCreate: false, 
      existingAgent 
    };
  }

  /**
   * Identifies what has changed between existing and desired agent configuration
   */
  getConfigChanges(existing: AgentVersion, newConfig: {
    systemPrompt: string;
    tools: string[];
    toolSourceHashes?: Record<string, string>;
    model?: string;
    embedding?: string;
    embeddingConfig?: Record<string, any>;
    contextWindow?: number;
    memoryBlocks?: Array<{name: string; description: string; limit: number; value: string}>;
    memoryBlockFileHashes?: Record<string, string>;
    folders?: Array<{name: string; files: string[]}>;
    archives?: Array<{name: string; description?: string; embedding?: string}>;
    sharedBlocks?: string[];
    tags?: string[];
    lettabotConfig?: Record<string, any> | null;
  }): {
    hasChanges: boolean;
    changedComponents: string[];
    newHashes: AgentConfigHashes;
  } {
    const newHashes = this.generateAgentConfigHashes(newConfig);
    const changedComponents: string[] = [];

    // Compare each component hash
    if (existing.configHashes.systemPrompt !== newHashes.systemPrompt) {
      changedComponents.push('systemPrompt');
    }
    if (existing.configHashes.tools !== newHashes.tools) {
      changedComponents.push('tools');
    }
    if (existing.configHashes.model !== newHashes.model) {
      changedComponents.push('model');
    }
    if (existing.configHashes.memoryBlocks !== newHashes.memoryBlocks) {
      changedComponents.push('memoryBlocks');
    }
    if (existing.configHashes.folders !== newHashes.folders) {
      changedComponents.push('folders');
    }
    if (existing.configHashes.sharedBlocks !== newHashes.sharedBlocks) {
      changedComponents.push('sharedBlocks');
    }
    if (existing.configHashes.archives !== newHashes.archives) {
      changedComponents.push('archives');
    }
    if (existing.configHashes.tags !== newHashes.tags) {
      changedComponents.push('tags');
    }
    if (existing.configHashes.lettabotConfig !== newHashes.lettabotConfig) {
      changedComponents.push('lettabotConfig');
    }

    return {
      hasChanges: changedComponents.length > 0,
      changedComponents,
      newHashes
    };
  }

  /**
   * Updates the registry after creating a new agent
   */
  updateRegistry(agentName: string, agentConfig: {
    systemPrompt: string;
    tools: string[];
    model?: string;
    embedding?: string;
    embeddingConfig?: Record<string, any>;
    contextWindow?: number;
    memoryBlocks?: Array<{name: string; description: string; limit: number; value: string}>;
    folders?: Array<{name: string; files: string[]}>;
    archives?: Array<{name: string; description?: string; embedding?: string}>;
    sharedBlocks?: string[];
    tags?: string[];
    lettabotConfig?: Record<string, any> | null;
  }, agentId: string): void {
    const configHashes = this.generateAgentConfigHashes(agentConfig);
    const { baseName, version } = this.parseVersionFromName(agentName);

    const agentVersion: AgentVersion = {
      id: agentId,
      name: agentName,
      baseName: baseName,
      configHashes: configHashes,
      version: version || 'latest',
      lastUpdated: new Date().toISOString()
    };

    this.agentRegistry.set(baseName, agentVersion);
  }

  /**
   * Gets all agents with the same base name (for cleanup/management)
   */
  getAgentVersions(baseName: string): AgentVersion[] {
    const versions: AgentVersion[] = [];
    for (const agent of this.agentRegistry.values()) {
      if (agent.baseName === baseName) {
        versions.push(agent);
      }
    }
    return versions.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  }
}
