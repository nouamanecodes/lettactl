import { LettaClientWrapper } from './letta-client';
import { AgentVersion } from './agent-manager';
import { BlockManager } from './block-manager';
import { ArchiveManager } from './archive-manager';
import { normalizeResponse } from './response-normalizer';
import { DiffApplier } from './diff-applier';
import { analyzeToolChanges, analyzeBlockChanges, analyzeFolderChanges, analyzeArchiveChanges } from './diff-analyzers';
import type { AgentUpdateOperations } from '../types/diff';
import { log } from './logger';

// Re-export types for backwards compatibility
export type { ToolDiff, BlockDiff, FolderDiff, ArchiveDiff, FieldChange, AgentUpdateOperations } from '../types/diff';

/**
 * DiffEngine determines what specific operations are needed to update an agent
 * while preserving conversation history whenever possible
 */
export class DiffEngine {
  private client: LettaClientWrapper;
  private blockManager: BlockManager;
  private archiveManager: ArchiveManager;
  private basePath: string;

  constructor(client: LettaClientWrapper, blockManager: BlockManager, archiveManager: ArchiveManager, basePath: string = '') {
    this.client = client;
    this.blockManager = blockManager;
    this.archiveManager = archiveManager;
    this.basePath = basePath;
  }

  /**
   * Analyzes differences between existing and desired agent configuration
   * and generates specific update operations that preserve conversation history
   */
  async generateUpdateOperations(
    existingAgent: AgentVersion,
    desiredConfig: {
      systemPrompt: string;
      description?: string;
      tools: string[];
      toolSourceHashes?: Record<string, string>;
      model?: string;
      embedding?: string;
      embeddingConfig?: Record<string, any>;
      contextWindow?: number;
      memoryBlocks?: Array<{name: string; description: string; limit: number; value: string}>;
      memoryBlockFileHashes?: Record<string, string>;
      folders?: Array<{name: string; files: string[]; fileContentHashes?: Record<string, string>}>;
      archives?: Array<{name: string; description?: string; embedding?: string; embedding_config?: Record<string, any>}>;
      sharedBlocks?: string[];
    },
    toolRegistry: Map<string, string>,
    folderRegistry: Map<string, string>,
    verbose: boolean = false,
    sharedBlockIds?: Map<string, string>,
    updatedTools?: Set<string>,
    previousFolderFileHashes?: Record<string, Record<string, string>>,
    dryRun: boolean = false
  ): Promise<AgentUpdateOperations> {
    
    const operations: AgentUpdateOperations = {
      preservesConversation: true,
      operationCount: 0
    };

    if (verbose) log(`  Analyzing configuration changes for agent: ${existingAgent.name}`);

    // Get current agent state from server
    const currentAgent = await this.client.getAgent(existingAgent.id);
    const currentToolsResponse = await this.client.listAgentTools(existingAgent.id);
    const currentBlocksResponse = await this.client.listAgentBlocks(existingAgent.id);
    const currentFoldersResponse = await this.client.listAgentFolders(existingAgent.id);
    const currentArchivesResponse = await this.client.listAgentArchives(existingAgent.id);
    
    // Normalize responses to arrays
    const currentTools = normalizeResponse(currentToolsResponse);
    const currentBlocks = normalizeResponse(currentBlocksResponse);
    const currentFolders = normalizeResponse(currentFoldersResponse);
    const currentArchives = normalizeResponse(currentArchivesResponse);

    // Analyze basic field changes
    const fieldUpdates: any = {};
    
    // For system prompt comparison, check if they're actually different
    // Note: desiredConfig.systemPrompt includes base instructions + user prompt
    // currentAgent.system is the full composed prompt from the server
    const normalizedCurrent = (currentAgent.system || '').trim();
    const normalizedDesired = (desiredConfig.systemPrompt || '').trim();
    
    if (normalizedCurrent !== normalizedDesired) {
      if (verbose) log(`    System prompt differs - current length: ${normalizedCurrent.length}, desired length: ${normalizedDesired.length}`);
      fieldUpdates.system = { from: normalizedCurrent, to: normalizedDesired };
      operations.operationCount++;
    }

    // Check description changes
    const currentDescription = (currentAgent as any).description || '';
    const desiredDescription = desiredConfig.description || '';
    if (currentDescription !== desiredDescription) {
      fieldUpdates.description = { from: currentDescription, to: desiredDescription };
      operations.operationCount++;
    }

    const desiredModel = desiredConfig.model || "google_ai/gemini-2.5-pro";
    if (currentAgent.model !== desiredModel) {
      fieldUpdates.model = { from: currentAgent.model, to: desiredModel };
      operations.operationCount++;
    }

    const desiredEmbedding = desiredConfig.embedding;
    if (desiredEmbedding !== undefined && currentAgent.embedding !== desiredEmbedding) {
      fieldUpdates.embedding = { from: currentAgent.embedding, to: desiredEmbedding };
      operations.operationCount++;
    }

    const normalizeConfig = (value: any): any => {
      if (value === null || value === undefined) return null;
      if (Array.isArray(value)) return value.map(normalizeConfig);
      if (typeof value === 'object') {
        const result: any = {};
        for (const key of Object.keys(value).sort()) {
          result[key] = normalizeConfig(value[key]);
        }
        return result;
      }
      return value;
    };

    const currentEmbeddingConfig = normalizeConfig((currentAgent as any).embedding_config);
    const desiredEmbeddingConfig = normalizeConfig(desiredConfig.embeddingConfig);
    if (JSON.stringify(currentEmbeddingConfig) !== JSON.stringify(desiredEmbeddingConfig)) {
      fieldUpdates.embeddingConfig = { from: currentEmbeddingConfig, to: desiredEmbeddingConfig };
      operations.operationCount++;
    }

    const desiredContextWindow = desiredConfig.contextWindow || 64000;
    const currentContextWindow = (currentAgent as any).llm_config?.context_window || 64000;
    if (currentContextWindow !== desiredContextWindow) {
      fieldUpdates.contextWindow = { from: currentContextWindow, to: desiredContextWindow };
      operations.operationCount++;
    }

    if (Object.keys(fieldUpdates).length > 0) {
      operations.updateFields = fieldUpdates;
    }

    // Analyze tool changes
    operations.tools = await analyzeToolChanges(
      currentTools,
      desiredConfig.tools || [],
      toolRegistry,
      desiredConfig.toolSourceHashes || {},
      updatedTools
    );
    operations.operationCount += operations.tools.toAdd.length + operations.tools.toRemove.length + operations.tools.toUpdate.length;

    // Analyze memory block changes
    operations.blocks = await analyzeBlockChanges(
      currentBlocks,
      [
        ...(desiredConfig.memoryBlocks || []),
        ...(desiredConfig.sharedBlocks || []).map(name => ({ name, isShared: true }))
      ],
      this.blockManager,
      existingAgent.name,
      dryRun
    );
    operations.operationCount += operations.blocks.toAdd.length + operations.blocks.toRemove.length + operations.blocks.toUpdate.length + operations.blocks.toUpdateValue.length;

    // Analyze folder changes
    operations.folders = await analyzeFolderChanges(
      currentFolders,
      desiredConfig.folders || [],
      folderRegistry,
      this.client,
      previousFolderFileHashes,
      dryRun
    );
    operations.operationCount += operations.folders.toAttach.length + operations.folders.toDetach.length +
      operations.folders.toUpdate.reduce((sum, folder) => sum + folder.filesToAdd.length + folder.filesToRemove.length + folder.filesToUpdate.length, 0);

    // Analyze archive changes
    const archiveOps = await analyzeArchiveChanges(
      currentArchives,
      desiredConfig.archives || [],
      this.archiveManager,
      dryRun
    );
    operations.archives = archiveOps;
    operations.operationCount += archiveOps.toAttach.length + archiveOps.toDetach.length + archiveOps.toUpdate.length;

    return operations;
  }

  /**
   * Applies the update operations to the agent
   */
  async applyUpdateOperations(
    agentId: string,
    operations: AgentUpdateOperations,
    verbose: boolean = false,
    force: boolean = false
  ): Promise<void> {
    const applier = new DiffApplier(this.client, this.basePath);
    return applier.applyUpdateOperations(agentId, operations, verbose, force);
  }
}
