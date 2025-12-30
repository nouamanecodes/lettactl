import { FleetParser } from '../lib/fleet-parser';
import { LettaClientWrapper } from '../lib/letta-client';
import { BlockManager } from '../lib/block-manager';
import { AgentManager } from '../lib/agent-manager';
import { DiffEngine } from '../lib/diff-engine';
import { FileContentTracker } from '../lib/file-content-tracker';
import { getSpinnerEnabled } from '../lib/spinner';
import { SupabaseStorageBackend } from '../lib/storage-backend';
import { applyTemplateMode } from './apply-template';
import { processSharedBlocks, processFolders, updateExistingAgent, createNewAgent } from '../lib/apply-helpers';


export async function applyCommand(options: { file: string; agent?: string; match?: string; dryRun?: boolean; root?: string }, command: any) {
  const verbose = command.parent?.opts().verbose || false;
  try {
    console.log(`Applying configuration from ${options.file}`);
    
    if (options.dryRun) {
      console.log('Dry-run mode enabled');
    }

    if (options.agent) {
      if (verbose) console.log(`Filtering agents by pattern: ${options.agent}`);
    }

    // Initialize Supabase backend if environment variables are available
    let supabaseBackend: SupabaseStorageBackend | undefined;
    
    try {
      if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        supabaseBackend = new SupabaseStorageBackend();
        console.log('Supabase backend configured for cloud storage access');
      }
    } catch (error: any) {
      console.error(`Supabase configuration error: ${error.message}`);
      process.exit(1);
    }

    const parser = new FleetParser(options.file, { 
      supabaseBackend,
      rootPath: options.root
    });
    const config = await parser.parseFleetConfig(options.file);
    
    if (verbose) console.log(`Found ${config.agents.length} agents in configuration`);

    // Template mode: apply config to existing agents matching pattern
    if (options.match) {
      await applyTemplateMode({ ...options, match: options.match }, config, parser, command);
      return;
    }

    if (options.dryRun) {
      for (const agent of config.agents) {
        console.log(`Would create/update agent: ${agent.name}`);
        if (agent.folders) {
          for (const folder of agent.folders) {
            console.log(`  Would create folder: ${folder.name} with ${folder.files.length} files`);
          }
        }
      }
      return;
    }

    const client = new LettaClientWrapper();
    const blockManager = new BlockManager(client);
    const agentManager = new AgentManager(client);
    const diffEngine = new DiffEngine(client, blockManager, parser.basePath);
    const fileTracker = new FileContentTracker(parser.basePath, parser.storageBackend);

    // Load existing resources
    if (verbose) console.log('Loading existing blocks...');
    await blockManager.loadExistingBlocks();

    if (verbose) console.log('Loading existing agents...');
    await agentManager.loadExistingAgents();

    // Process shared blocks
    const sharedBlockIds = await processSharedBlocks(config, blockManager, verbose);

    // Generate tool source hashes and register tools
    const allToolNames = new Set<string>();
    for (const agent of config.agents) {
      for (const toolName of agent.tools || []) {
        allToolNames.add(toolName);
      }
    }
    const globalToolSourceHashes = fileTracker.generateToolSourceHashes(Array.from(allToolNames), parser.toolConfigs);

    if (verbose) console.log('Registering tools...');
    const toolNameToId = await parser.registerRequiredTools(config, client, verbose, globalToolSourceHashes);

    // Process folders
    const createdFolders = await processFolders(config, client, parser, options, verbose);
    
    // Process agents
    const spinnerEnabled = getSpinnerEnabled(command);
    if (verbose) console.log('Processing agents...');

    for (const agent of config.agents) {
      if (options.agent && !agent.name.includes(options.agent)) continue;

      console.log(`Processing agent: ${agent.name}`);
      if (verbose) {
        console.log(`  Description: ${agent.description}`);
        console.log(`  Tools: ${agent.tools?.join(', ') || 'none'}`);
        console.log(`  Memory blocks: ${agent.memory_blocks?.length || 0}`);
        console.log(`  Folders: ${agent.folders?.length || 0}`);
      }

      try {
        // Generate hashes for change detection
        const folderContentHashes = fileTracker.generateFolderFileHashes(agent.folders || []);
        const toolSourceHashes = fileTracker.generateToolSourceHashes(agent.tools || [], parser.toolConfigs);
        const memoryBlockFileHashes = await fileTracker.generateMemoryBlockFileHashes(agent.memory_blocks || []);

        // Build agent config
        const agentConfig = {
          systemPrompt: agent.system_prompt.value || '',
          tools: agent.tools || [],
          toolSourceHashes,
          model: agent.llm_config?.model,
          embedding: agent.embedding,
          contextWindow: agent.llm_config?.context_window,
          memoryBlocks: (agent.memory_blocks || []).map((block: any) => ({
            name: block.name,
            description: block.description,
            limit: block.limit,
            value: block.value || ''
          })),
          memoryBlockFileHashes,
          folders: (agent.folders || []).map((folder: any) => ({
            name: folder.name,
            files: folder.files,
            fileContentHashes: folderContentHashes.get(folder.name) || {}
          })),
          sharedBlocks: agent.shared_blocks || []
        };

        // Check if agent exists
        const { agentName, shouldCreate, existingAgent } = await agentManager.getOrCreateAgentName(
          agent.name,
          agentConfig,
          verbose
        );

        if (!shouldCreate && existingAgent) {
          // Check if changes needed
          const changes = agentManager.getConfigChanges(existingAgent, agentConfig);
          if (!changes.hasChanges) {
            console.log(`Agent ${agent.name} already exists and is up to date`);
            continue;
          }

          // Update existing agent
          await updateExistingAgent(agent, existingAgent, agentConfig, {
            diffEngine,
            agentManager,
            toolNameToId,
            createdFolders,
            sharedBlockIds,
            spinnerEnabled,
            verbose
          });
        } else {
          // Create new agent
          await createNewAgent(agent, agentName, {
            client,
            blockManager,
            agentManager,
            toolNameToId,
            createdFolders,
            sharedBlockIds,
            spinnerEnabled,
            verbose
          });
        }
      } catch (error: any) {
        console.error(`Failed to process agent ${agent.name}:`, error.message);
        throw error;
      }
    }

    console.log('Apply completed successfully');

  } catch (error: any) {
    console.error('Apply failed:', error.message || error);
    process.exit(1);
  }
}