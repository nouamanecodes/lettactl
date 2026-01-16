import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LettaClientWrapper } from './letta-client';
import { BlockManager } from './block-manager';
import { AgentManager, AgentVersion } from './agent-manager';
import { DiffEngine } from './diff-engine';
import { FileContentTracker } from './file-content-tracker';
import { OutputFormatter } from './output-formatter';
import { createSpinner } from './spinner';
import { FleetParser } from './fleet-parser';
import { StorageBackendManager, SupabaseStorageBackend, hasSupabaseConfig } from './storage-backend';
import { FolderFileConfig } from '../types/fleet-config';
import { isBuiltinTool } from './builtin-tools';
import { displayAgentDetails } from '../commands/describe';
import { AgentResolver } from './agent-resolver';
import { log, warn, isQuietMode } from './logger';

export async function processSharedBlocks(
  config: any,
  blockManager: BlockManager,
  verbose: boolean
): Promise<Map<string, string>> {
  const sharedBlockIds = new Map<string, string>();
  if (config.shared_blocks) {
    if (verbose) log('Processing shared blocks...');
    for (const sharedBlock of config.shared_blocks) {
      const blockId = await blockManager.getOrCreateSharedBlock(sharedBlock);
      sharedBlockIds.set(sharedBlock.name, blockId);
    }
  }
  return sharedBlockIds;
}

// Helper to check if a file config is a from_bucket config
function isFromBucketConfig(fileConfig: FolderFileConfig): fileConfig is { from_bucket: { provider: 'supabase'; bucket: string; path: string } } {
  return typeof fileConfig === 'object' && 'from_bucket' in fileConfig;
}

// Create storage backend manager lazily (only when needed)
let storageManager: StorageBackendManager | null = null;
let supabaseBackendInstance: SupabaseStorageBackend | undefined = undefined;

function getStorageManager(): StorageBackendManager {
  if (!storageManager) {
    supabaseBackendInstance = hasSupabaseConfig() ? new SupabaseStorageBackend() : undefined;
    storageManager = new StorageBackendManager({ supabaseBackend: supabaseBackendInstance });
  }
  return storageManager;
}

// Helper to upload bucket files with glob expansion support
async function uploadBucketFilesToFolder(
  bucketConfig: { provider: 'supabase'; bucket: string; path: string },
  folderId: string,
  client: LettaClientWrapper,
  verbose: boolean
): Promise<void> {
  const storage = getStorageManager();
  const filePath = bucketConfig.path;

  if (filePath.includes('*')) {
    // Glob pattern - list and download all matching files
    const prefix = filePath.split('*')[0];

    if (!supabaseBackendInstance) {
      throw new Error('Supabase backend not configured for bucket file download');
    }

    const files = await supabaseBackendInstance.listFiles(bucketConfig.bucket, prefix);

    if (verbose) log(`  Found ${files.length} files matching ${bucketConfig.bucket}/${filePath}`);

    for (const file of files) {
      const fileName = path.basename(file);

      if (verbose) log(`  Downloading: ${file}...`);

      const fileBuffer = await storage.downloadBinaryFromBucket({
        ...bucketConfig,
        path: file
      });

      const tempDir = os.tmpdir();
      const tempPath = path.join(tempDir, fileName);
      fs.writeFileSync(tempPath, fileBuffer);

      if (verbose) log(`  Uploading ${fileName} to folder...`);
      const fileStream = fs.createReadStream(tempPath);
      await client.uploadFileToFolder(fileStream, folderId, fileName);

      fs.unlinkSync(tempPath);

      if (verbose) log(`  Uploaded: ${fileName} (from bucket)`);
    }
  } else {
    // Single file
    const fileName = path.basename(filePath);

    if (verbose) log(`  Downloading from bucket: ${bucketConfig.bucket}/${filePath}...`);

    const fileBuffer = await storage.downloadBinaryFromBucket(bucketConfig);

    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, fileName);
    fs.writeFileSync(tempPath, fileBuffer);

    if (verbose) log(`  Uploading ${fileName} to folder...`);
    const fileStream = fs.createReadStream(tempPath);
    await client.uploadFileToFolder(fileStream, folderId, fileName);

    fs.unlinkSync(tempPath);

    if (verbose) log(`  Uploaded: ${fileName} (from bucket)`);
  }
}

export async function processFolders(
  config: any,
  client: LettaClientWrapper,
  parser: FleetParser,
  options: { agent?: string },
  verbose: boolean
): Promise<Map<string, string>> {
  const createdFolders = new Map<string, string>();

  if (verbose) log('Processing folders...');
  const foldersResponse = await client.listFolders();
  const existingFolders = Array.isArray(foldersResponse) ? foldersResponse : (foldersResponse as any).items || [];

  for (const agent of config.agents) {
    if (options.agent && !agent.name.includes(options.agent)) continue;

    if (agent.folders) {
      for (const folderConfig of agent.folders) {
        if (createdFolders.has(folderConfig.name)) {
          if (verbose) log(`Using existing folder: ${folderConfig.name}`);
          continue;
        }

        let folder = existingFolders.find((f: any) => f.name === folderConfig.name);

        if (!folder) {
          if (verbose) log(`Creating folder: ${folderConfig.name}`);
          folder = await client.createFolder({
            name: folderConfig.name,
            embedding: agent.embedding || "letta/letta-free"
          });
          log(`Created folder: ${folderConfig.name}`);
          createdFolders.set(folderConfig.name, folder.id);

          if (verbose) log(`Uploading ${folderConfig.files.length} files...`);
          for (const fileConfig of folderConfig.files) {
            try {
              if (isFromBucketConfig(fileConfig)) {
                await uploadBucketFilesToFolder(fileConfig.from_bucket, folder.id, client, verbose);
              } else {
                // Handle local file path (existing behavior)
                const filePath = fileConfig;
                const resolvedPath = path.resolve(parser.basePath, filePath);

                if (!fs.existsSync(resolvedPath)) {
                  warn(`File not found, skipping: ${filePath}`);
                  continue;
                }

                if (verbose) log(`  Uploading ${filePath}...`);
                const fileStream = fs.createReadStream(resolvedPath);

                await client.uploadFileToFolder(fileStream, folder.id, path.basename(filePath));

                if (verbose) log(`  Uploaded: ${filePath}`);
              }
            } catch (error: any) {
              const fileDesc = isFromBucketConfig(fileConfig)
                ? `${fileConfig.from_bucket.bucket}/${fileConfig.from_bucket.path}`
                : fileConfig;
              console.error(`  Failed to upload ${fileDesc}:`, error.message);
            }
          }
        } else {
          if (verbose) log(`Using existing folder: ${folderConfig.name}`);
          createdFolders.set(folderConfig.name, folder.id);
          // File uploads for existing folders are handled by the diff engine
          // during agent update - this avoids creating duplicate files
        }
      }
    }
  }

  return createdFolders;
}

export async function updateExistingAgent(
  agent: any,
  existingAgent: AgentVersion,
  agentConfig: any,
  context: {
    client: LettaClientWrapper;
    diffEngine: DiffEngine;
    agentManager: AgentManager;
    toolNameToId: Map<string, string>;
    updatedTools: Set<string>;
    builtinTools: Set<string>;
    createdFolders: Map<string, string>;
    sharedBlockIds: Map<string, string>;
    spinnerEnabled: boolean;
    verbose: boolean;
    previousFolderFileHashes?: Record<string, Record<string, string>>;
  }
): Promise<void> {
  const { client, diffEngine, agentManager, toolNameToId, updatedTools, builtinTools, createdFolders, sharedBlockIds, spinnerEnabled, verbose, previousFolderFileHashes } = context;

  log(`Updating agent ${agent.name}:`);

  const spinner = createSpinner(`Analyzing changes for ${agent.name}...`, spinnerEnabled).start();

  try {
    const updateOperations = await diffEngine.generateUpdateOperations(
      existingAgent,
      { ...agentConfig, memoryBlockFileHashes: agentConfig.memoryBlockFileHashes },
      toolNameToId,
      createdFolders,
      verbose,
      sharedBlockIds,
      updatedTools,
      previousFolderFileHashes
    );

    spinner.stop();

    OutputFormatter.showAgentUpdateDiff(updateOperations, builtinTools);

    const updateSpinner = createSpinner(`Applying updates to ${agent.name}...`, spinnerEnabled).start();

    await diffEngine.applyUpdateOperations(existingAgent.id, updateOperations, verbose);

    // Store folder file hashes in agent metadata for next apply
    const newFolderFileHashes: Record<string, Record<string, string>> = {};
    for (const folder of agentConfig.folders || []) {
      if (folder.fileContentHashes) {
        newFolderFileHashes[folder.name] = folder.fileContentHashes;
      }
    }
    if (Object.keys(newFolderFileHashes).length > 0) {
      const currentAgent = await client.getAgent(existingAgent.id);
      await client.updateAgent(existingAgent.id, {
        metadata: {
          ...(currentAgent as any).metadata,
          'lettactl.folderFileHashes': newFolderFileHashes
        }
      });
    }

    agentManager.updateRegistry(existingAgent.name, agentConfig, existingAgent.id);

    updateSpinner.succeed(`Agent ${agent.name} updated successfully (conversation history preserved)`);
  } catch (error) {
    spinner.fail(`Failed to update agent ${agent.name}`);
    throw error;
  }
}

export async function createNewAgent(
  agent: any,
  agentName: string,
  context: {
    client: LettaClientWrapper;
    blockManager: BlockManager;
    agentManager: AgentManager;
    toolNameToId: Map<string, string>;
    builtinTools: Set<string>;
    createdFolders: Map<string, string>;
    sharedBlockIds: Map<string, string>;
    spinnerEnabled: boolean;
    verbose: boolean;
    folderContentHashes?: Map<string, Record<string, string>>;
  }
): Promise<void> {
  const { client, blockManager, agentManager, toolNameToId, builtinTools, createdFolders, sharedBlockIds, spinnerEnabled, verbose, folderContentHashes } = context;

  const blockIds: string[] = [];

  // Add shared blocks
  if (agent.shared_blocks) {
    for (const sharedBlockName of agent.shared_blocks) {
      const sharedBlockId = sharedBlockIds.get(sharedBlockName);
      if (sharedBlockId) {
        blockIds.push(sharedBlockId);
        if (verbose) log(`  Using shared block: ${sharedBlockName}`);
      } else {
        warn(`  Shared block not found: ${sharedBlockName}`);
      }
    }
  }

  // Create agent-specific memory blocks
  if (agent.memory_blocks) {
    for (const block of agent.memory_blocks) {
      if (verbose) log(`  Processing memory block: ${block.name}`);
      const blockId = await blockManager.getOrCreateAgentBlock(block, agent.name);
      blockIds.push(blockId);
    }
  }

  const creationSpinner = createSpinner(`Creating agent ${agentName}...`, spinnerEnabled).start();

  try {
    // Resolve tool names to IDs
    const toolIds: string[] = [];
    if (agent.tools) {
      for (const toolName of agent.tools) {
        const toolId = toolNameToId.get(toolName);
        if (toolId) {
          toolIds.push(toolId);
        } else {
          warn(`  Tool not found: ${toolName}`);
        }
      }
    }

    const createdAgent = await client.createAgent({
      name: agentName,
      description: agent.description || '',
      model: agent.llm_config?.model || "google_ai/gemini-2.5-pro",
      embedding: agent.embedding || "letta/letta-free",
      system: agent.system_prompt.value || '',
      block_ids: blockIds,
      context_window_limit: agent.llm_config?.context_window || 64000
    });

    // Attach tools
    for (const toolName of agent.tools || []) {
      const toolId = toolNameToId.get(toolName);
      if (toolId) {
        const tag = builtinTools.has(toolName) || isBuiltinTool(toolName) ? ' [builtin]' : '';
        if (verbose) log(`  Attaching tool: ${toolName}${tag}`);
        await client.attachToolToAgent(createdAgent.id, toolId);
      }
    }

    // Update registry
    agentManager.updateRegistry(agentName, {
      systemPrompt: agent.system_prompt.value || '',
      tools: agent.tools || [],
      model: agent.llm_config?.model,
      embedding: agent.embedding,
      contextWindow: agent.llm_config?.context_window,
      memoryBlocks: (agent.memory_blocks || []).map((block: any) => ({
        name: block.name,
        description: block.description,
        limit: block.limit,
        value: block.value || '',
        mutable: block.mutable
      })),
      folders: agent.folders || [],
      sharedBlocks: agent.shared_blocks || []
    }, createdAgent.id);

    // Attach folders
    if (agent.folders) {
      for (const folderConfig of agent.folders) {
        const folderId = createdFolders.get(folderConfig.name);
        if (folderId) {
          if (verbose) log(`  Attaching folder ${folderConfig.name}`);
          await client.attachFolderToAgent(createdAgent.id, folderId);
          if (verbose) log(`  Folder attached`);
        }
      }
      // Close all files to prevent context window bloat
      // Files remain searchable but aren't loaded into context
      await client.closeAllAgentFiles(createdAgent.id);
    }

    // Store folder file hashes in agent metadata for future change detection
    if (folderContentHashes && folderContentHashes.size > 0) {
      const newFolderFileHashes: Record<string, Record<string, string>> = {};
      for (const [folderName, hashes] of folderContentHashes) {
        newFolderFileHashes[folderName] = hashes;
      }
      await client.updateAgent(createdAgent.id, {
        metadata: {
          'lettactl.folderFileHashes': newFolderFileHashes
        }
      });
    }

    creationSpinner.succeed(`Agent ${agentName} created successfully`);

    // Display agent details (skip in quiet mode)
    if (!isQuietMode()) {
      const resolver = new AgentResolver(client);
      const fullAgent = await resolver.getAgentWithDetails(createdAgent.id);
      await displayAgentDetails(client, fullAgent, verbose);
    }
  } catch (error) {
    creationSpinner.fail(`Failed to create agent ${agentName}`);
    throw error;
  }
}
