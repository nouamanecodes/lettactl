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
import { StorageBackendManager, SupabaseStorageBackend } from './storage-backend';
import { FolderFileConfig } from '../types/fleet-config';

export async function processSharedBlocks(
  config: any,
  blockManager: BlockManager,
  verbose: boolean
): Promise<Map<string, string>> {
  const sharedBlockIds = new Map<string, string>();
  if (config.shared_blocks) {
    if (verbose) console.log('Processing shared blocks...');
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
function getStorageManager(): StorageBackendManager {
  if (!storageManager) {
    const supabaseBackend = process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
      ? new SupabaseStorageBackend()
      : undefined;
    storageManager = new StorageBackendManager({ supabaseBackend });
  }
  return storageManager;
}

export async function processFolders(
  config: any,
  client: LettaClientWrapper,
  parser: FleetParser,
  options: { agent?: string },
  verbose: boolean
): Promise<Map<string, string>> {
  const createdFolders = new Map<string, string>();

  if (verbose) console.log('Processing folders...');
  const foldersResponse = await client.listFolders();
  const existingFolders = Array.isArray(foldersResponse) ? foldersResponse : (foldersResponse as any).items || [];

  for (const agent of config.agents) {
    if (options.agent && !agent.name.includes(options.agent)) continue;

    if (agent.folders) {
      for (const folderConfig of agent.folders) {
        if (createdFolders.has(folderConfig.name)) {
          if (verbose) console.log(`Using existing folder: ${folderConfig.name}`);
          continue;
        }

        let folder = existingFolders.find((f: any) => f.name === folderConfig.name);

        if (!folder) {
          if (verbose) console.log(`Creating folder: ${folderConfig.name}`);
          folder = await client.createFolder({
            name: folderConfig.name,
            embedding: agent.embedding || "letta/letta-free"
          });
          console.log(`Created folder: ${folderConfig.name}`);
          createdFolders.set(folderConfig.name, folder.id);

          if (verbose) console.log(`Uploading ${folderConfig.files.length} files...`);
          for (const fileConfig of folderConfig.files) {
            try {
              if (isFromBucketConfig(fileConfig)) {
                // Handle from_bucket config
                const bucketConfig = fileConfig.from_bucket;
                const fileName = path.basename(bucketConfig.path);

                if (verbose) console.log(`  Downloading from bucket: ${bucketConfig.bucket}/${bucketConfig.path}...`);

                const storage = getStorageManager();
                const fileBuffer = await storage.downloadBinaryFromBucket(bucketConfig);

                // Write to temp file so the stream has proper file metadata
                const tempDir = os.tmpdir();
                const tempPath = path.join(tempDir, fileName);
                fs.writeFileSync(tempPath, fileBuffer);

                if (verbose) console.log(`  Uploading ${fileName} to folder...`);
                const fileStream = fs.createReadStream(tempPath);
                await client.uploadFileToFolder(fileStream, folder.id, fileName);

                // Cleanup temp file
                fs.unlinkSync(tempPath);

                if (verbose) console.log(`  Uploaded: ${fileName} (from bucket)`);
              } else {
                // Handle local file path (existing behavior)
                const filePath = fileConfig;
                const resolvedPath = path.resolve(parser.basePath, filePath);

                if (!fs.existsSync(resolvedPath)) {
                  console.warn(`File not found, skipping: ${filePath}`);
                  continue;
                }

                if (verbose) console.log(`  Uploading ${filePath}...`);
                const fileStream = fs.createReadStream(resolvedPath);

                await client.uploadFileToFolder(fileStream, folder.id, path.basename(filePath));

                if (verbose) console.log(`  Uploaded: ${filePath}`);
              }
            } catch (error: any) {
              const fileDesc = isFromBucketConfig(fileConfig)
                ? `${fileConfig.from_bucket.bucket}/${fileConfig.from_bucket.path}`
                : fileConfig;
              console.error(`  Failed to upload ${fileDesc}:`, error.message);
            }
          }
        } else {
          if (verbose) console.log(`Using existing folder: ${folderConfig.name}`);
          createdFolders.set(folderConfig.name, folder.id);

          // Still upload from_bucket files for existing folders
          for (const fileConfig of folderConfig.files) {
            try {
              if (isFromBucketConfig(fileConfig)) {
                const bucketConfig = fileConfig.from_bucket;
                const fileName = path.basename(bucketConfig.path);

                if (verbose) console.log(`  Downloading from bucket: ${bucketConfig.bucket}/${bucketConfig.path}...`);

                const storage = getStorageManager();
                const fileBuffer = await storage.downloadBinaryFromBucket(bucketConfig);

                const tempDir = os.tmpdir();
                const tempPath = path.join(tempDir, fileName);
                fs.writeFileSync(tempPath, fileBuffer);

                if (verbose) console.log(`  Uploading ${fileName} to folder...`);
                const fileStream = fs.createReadStream(tempPath);
                await client.uploadFileToFolder(fileStream, folder.id, fileName);

                fs.unlinkSync(tempPath);

                if (verbose) console.log(`  Uploaded: ${fileName} (from bucket)`);
              }
            } catch (error: any) {
              const fileDesc = isFromBucketConfig(fileConfig)
                ? `${fileConfig.from_bucket.bucket}/${fileConfig.from_bucket.path}`
                : fileConfig;
              console.error(`  Failed to upload ${fileDesc}:`, error.message);
            }
          }
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
    diffEngine: DiffEngine;
    agentManager: AgentManager;
    toolNameToId: Map<string, string>;
    updatedTools: Set<string>;
    createdFolders: Map<string, string>;
    sharedBlockIds: Map<string, string>;
    spinnerEnabled: boolean;
    verbose: boolean;
  }
): Promise<void> {
  const { diffEngine, agentManager, toolNameToId, updatedTools, createdFolders, sharedBlockIds, spinnerEnabled, verbose } = context;

  console.log(`Updating agent ${agent.name}:`);

  const spinner = createSpinner(`Analyzing changes for ${agent.name}...`, spinnerEnabled).start();

  try {
    const updateOperations = await diffEngine.generateUpdateOperations(
      existingAgent,
      { ...agentConfig, memoryBlockFileHashes: agentConfig.memoryBlockFileHashes },
      toolNameToId,
      createdFolders,
      verbose,
      sharedBlockIds,
      updatedTools
    );

    spinner.stop();

    OutputFormatter.showAgentUpdateDiff(updateOperations);

    const updateSpinner = createSpinner(`Applying updates to ${agent.name}...`, spinnerEnabled).start();

    await diffEngine.applyUpdateOperations(existingAgent.id, updateOperations, verbose);

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
    createdFolders: Map<string, string>;
    sharedBlockIds: Map<string, string>;
    spinnerEnabled: boolean;
    verbose: boolean;
  }
): Promise<void> {
  const { client, blockManager, agentManager, toolNameToId, createdFolders, sharedBlockIds, spinnerEnabled, verbose } = context;

  const blockIds: string[] = [];

  // Add shared blocks
  if (agent.shared_blocks) {
    for (const sharedBlockName of agent.shared_blocks) {
      const sharedBlockId = sharedBlockIds.get(sharedBlockName);
      if (sharedBlockId) {
        blockIds.push(sharedBlockId);
        if (verbose) console.log(`  Using shared block: ${sharedBlockName}`);
      } else {
        console.warn(`  Shared block not found: ${sharedBlockName}`);
      }
    }
  }

  // Create agent-specific memory blocks
  if (agent.memory_blocks) {
    for (const block of agent.memory_blocks) {
      if (verbose) console.log(`  Processing memory block: ${block.name}`);
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
          console.warn(`  Tool not found: ${toolName}`);
        }
      }
    }

    const createdAgent = await client.createAgent({
      name: agentName,
      model: agent.llm_config?.model || "google_ai/gemini-2.5-pro",
      embedding: agent.embedding || "letta/letta-free",
      system: agent.system_prompt.value || '',
      block_ids: blockIds,
      context_window_limit: agent.llm_config?.context_window || 64000
    });

    // Attach tools
    for (const toolId of toolIds) {
      if (verbose) console.log(`  Attaching tool: ${toolId}`);
      await client.attachToolToAgent(createdAgent.id, toolId);
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
        value: block.value || ''
      })),
      folders: agent.folders || [],
      sharedBlocks: agent.shared_blocks || []
    }, createdAgent.id);

    // Attach folders
    if (agent.folders) {
      for (const folderConfig of agent.folders) {
        const folderId = createdFolders.get(folderConfig.name);
        if (folderId) {
          if (verbose) console.log(`  Attaching folder ${folderConfig.name}`);
          await client.attachFolderToAgent(createdAgent.id, folderId);
          if (verbose) console.log(`  Folder attached`);
        }
      }
    }

    creationSpinner.succeed(`Agent ${agentName} created successfully`);
  } catch (error) {
    creationSpinner.fail(`Failed to create agent ${agentName}`);
    throw error;
  }
}
