import { FleetParser } from '../lib/fleet-parser';
import { LettaClientWrapper } from '../lib/letta-client';
import { BlockManager } from '../lib/block-manager';
import { AgentManager } from '../lib/agent-manager';
import { DiffEngine } from '../lib/diff-engine';
import { FileContentTracker } from '../lib/file-content-tracker';
import { createSpinner, getSpinnerEnabled } from '../lib/spinner';
import { SupabaseStorageBackend, hasSupabaseConfig } from '../lib/storage-backend';
import { applyTemplateMode } from './apply-template';
import { processSharedBlocks, processFolders, updateExistingAgent, createNewAgent } from '../lib/apply-helpers';
import { formatLettaError } from '../lib/error-handler';
import { computeDryRunDiffs, displayDryRunResults } from '../lib/dry-run';
import { log, warn, isQuietMode } from '../lib/logger';
import { FILE_SEARCH_TOOLS } from '../lib/builtin-tools';

export async function applyCommand(options: { file: string; agent?: string; match?: string; dryRun?: boolean; root?: string }, command: any) {
  // Quiet mode overrides verbose
  const verbose = isQuietMode() ? false : (command.parent?.opts().verbose || false);
  const spinnerEnabled = getSpinnerEnabled(command);

  try {
    const parseSpinner = createSpinner(`Parsing ${options.file}...`, spinnerEnabled).start();

    if (options.dryRun) {
      log('Dry-run mode enabled');
    }

    if (options.agent) {
      if (verbose) log(`Filtering agents by pattern: ${options.agent}`);
    }

    // Initialize Supabase backend if environment variables are available
    let supabaseBackend: SupabaseStorageBackend | undefined;

    try {
      if (hasSupabaseConfig()) {
        supabaseBackend = new SupabaseStorageBackend();
        log('Supabase backend configured for cloud storage access');
      }
    } catch (error: any) {
      throw new Error(`Supabase configuration error: ${error.message}`);
    }

    const parser = new FleetParser(options.file, {
      supabaseBackend,
      rootPath: options.root
    });
    const config = await parser.parseFleetConfig(options.file);
    parseSpinner.succeed(`Parsed ${options.file} (${config.agents.length} agents)`);

    // Validate embedding configuration for self-hosted environments
    const isSelfHosted = !process.env.LETTA_BASE_URL?.includes('letta.com');
    if (isSelfHosted) {
      const agentsWithoutEmbedding = config.agents.filter((agent: any) => !agent.embedding);
      if (agentsWithoutEmbedding.length > 0) {
        const names = agentsWithoutEmbedding.map((a: any) => a.name).join(', ');
        throw new Error(
          `Self-hosted Letta requires explicit embedding configuration.\n` +
          `Agents missing embedding: ${names}\n\n` +
          `Add an embedding field to each agent:\n` +
          `  embedding: "openai/text-embedding-3-small"\n\n` +
          `Common embedding providers:\n` +
          `  - openai/text-embedding-3-small\n` +
          `  - openai/text-embedding-3-large\n` +
          `  - openai/text-embedding-ada-002`
        );
      }
    }

    if (verbose) log(`Found ${config.agents.length} agents in configuration`);

    // Template mode: apply config to existing agents matching pattern
    if (options.match) {
      await applyTemplateMode({ ...options, match: options.match }, config, parser, command);
      return;
    }

    const client = new LettaClientWrapper();
    const blockManager = new BlockManager(client);
    const agentManager = new AgentManager(client);
    const diffEngine = new DiffEngine(client, blockManager, parser.basePath);
    const fileTracker = new FileContentTracker(parser.basePath, parser.storageBackend);

    // Load existing resources
    const loadSpinner = createSpinner('Loading existing resources...', spinnerEnabled).start();
    if (verbose) log('Loading existing blocks...');
    await blockManager.loadExistingBlocks();

    if (verbose) log('Loading existing agents...');
    await agentManager.loadExistingAgents();
    loadSpinner.succeed('Loaded existing resources');

    // Dry-run mode: compute and display diffs without applying
    if (options.dryRun) {
      const results = await computeDryRunDiffs(config, {
        client,
        blockManager,
        agentManager,
        diffEngine,
        fileTracker,
        parser,
        agentFilter: options.agent,
        verbose
      });
      displayDryRunResults(results, verbose);
      return;
    }

    // Process shared blocks
    const blockSpinner = createSpinner('Processing shared blocks...', spinnerEnabled).start();
    const sharedBlockIds = await processSharedBlocks(config, blockManager, verbose);
    blockSpinner.succeed(`Processed ${sharedBlockIds.size} shared blocks`);

    // Generate tool source hashes and register tools
    const allToolNames = new Set<string>();
    for (const agent of config.agents) {
      for (const toolName of agent.tools || []) {
        allToolNames.add(toolName);
      }
      // Include file search tools for agents with folders
      if ((agent.folders || []).length > 0) {
        for (const fileTool of FILE_SEARCH_TOOLS) {
          allToolNames.add(fileTool);
        }
      }
    }
    const globalToolSourceHashes = fileTracker.generateToolSourceHashes(Array.from(allToolNames), parser.toolConfigs);

    const toolSpinner = createSpinner('Registering tools...', spinnerEnabled).start();
    if (verbose) log('Registering tools...');
    const { toolNameToId, updatedTools, builtinTools } = await parser.registerRequiredTools(config, client, verbose, globalToolSourceHashes);
    const builtinCount = builtinTools.size;
    const customCount = toolNameToId.size - builtinCount;
    toolSpinner.succeed(`Registered ${customCount} custom, ${builtinCount} builtin tools`);

    // Register MCP servers
    if (config.mcp_servers && config.mcp_servers.length > 0) {
      const mcpSpinner = createSpinner('Registering MCP servers...', spinnerEnabled).start();
      if (verbose) log('Registering MCP servers...');
      const mcpResult = await parser.registerMcpServers(config, client, verbose);
      mcpSpinner.succeed(`Registered ${config.mcp_servers.length} MCP servers`);

      // Display MCP server operation summary
      if (mcpResult.created.length > 0) {
        log(`MCP servers created: ${mcpResult.created.join(', ')}`);
      }
      if (mcpResult.updated.length > 0) {
        log(`MCP servers updated: ${mcpResult.updated.join(', ')}`);
      }
      if (mcpResult.unchanged.length > 0 && verbose) {
        log(`MCP servers unchanged: ${mcpResult.unchanged.join(', ')}`);
      }
      if (mcpResult.failed.length > 0) {
        warn(`MCP servers failed: ${mcpResult.failed.join(', ')}`);
      }
    }

    // Process folders
    const folderSpinner = createSpinner('Processing folders...', spinnerEnabled).start();
    const createdFolders = await processFolders(config, client, parser, options, verbose);
    folderSpinner.succeed(`Processed ${createdFolders.size} folders`);

    // Process agents
    if (verbose) log('Processing agents...');

    for (const agent of config.agents) {
      if (options.agent && !agent.name.includes(options.agent)) continue;
      if (verbose) {
        log(`  Description: ${agent.description}`);
        log(`  Tools: ${agent.tools?.join(', ') || 'none'}`);
        log(`  Memory blocks: ${agent.memory_blocks?.length || 0}`);
        log(`  Folders: ${agent.folders?.length || 0}`);
      }

      try {
        // Generate hashes for change detection
        const folderContentHashes = await fileTracker.generateFolderFileHashes(agent.folders || []);
        const toolSourceHashes = fileTracker.generateToolSourceHashes(agent.tools || [], parser.toolConfigs);
        const memoryBlockFileHashes = await fileTracker.generateMemoryBlockFileHashes(agent.memory_blocks || []);

        // Build agent config - auto-manage file search tools based on folder presence
        const hasFolders = (agent.folders || []).length > 0;
        let tools = agent.tools || [];

        if (hasFolders) {
          // Add file search tools if not already present
          const toolSet = new Set(tools);
          for (const fileTool of FILE_SEARCH_TOOLS) {
            if (!toolSet.has(fileTool)) {
              tools = [...tools, fileTool];
            }
          }
        } else {
          // Remove auto-added file search tools if no folders
          tools = tools.filter((t: string) => !FILE_SEARCH_TOOLS.includes(t));
        }

        const agentConfig = {
          systemPrompt: agent.system_prompt.value || '',
          description: agent.description || '',
          tools,
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
            log(`Agent ${agent.name} already up to date`);
            continue;
          }

          // Read previous folder file hashes from agent metadata
          const fullAgent = await client.getAgent(existingAgent.id);
          const previousFolderFileHashes = (fullAgent as any).metadata?.['lettactl.folderFileHashes'] || {};

          // Update existing agent
          await updateExistingAgent(agent, existingAgent, agentConfig, {
            client,
            diffEngine,
            agentManager,
            toolNameToId,
            updatedTools,
            builtinTools,
            createdFolders,
            sharedBlockIds,
            spinnerEnabled,
            verbose,
            previousFolderFileHashes
          });
        } else {
          // Create new agent
          await createNewAgent(agent, agentName, {
            client,
            blockManager,
            agentManager,
            toolNameToId,
            builtinTools,
            createdFolders,
            sharedBlockIds,
            spinnerEnabled,
            verbose,
            folderContentHashes
          });
        }
      } catch (error: any) {
        console.error(`Failed to process agent ${agent.name}:`, formatLettaError(error.message));
        throw error;
      }
    }

    log('Apply completed successfully');

  } catch (error: any) {
    throw new Error(`Apply failed: ${formatLettaError(error.message || error)}`);
  }
}