import { FleetParser } from '../../lib/apply/fleet-parser';
import { LettaClientWrapper } from '../../lib/client/letta-client';
import { BlockManager } from '../../lib/managers/block-manager';
import { ArchiveManager } from '../../lib/managers/archive-manager';
import { AgentManager } from '../../lib/managers/agent-manager';
import { DiffEngine } from '../../lib/apply/diff-engine';
import { FileContentTracker } from '../../lib/apply/file-content-tracker';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { SupabaseStorageBackend, hasSupabaseConfig } from '../../lib/storage/storage-backend';
import { applyTemplateMode } from './template';
import { processSharedBlocks, processFolders, updateExistingAgent, createNewAgent } from '../../lib/apply/apply-helpers';
import { formatLettaError } from '../../lib/shared/error-handler';
import { computeDryRunDiffs, displayDryRunResults } from '../../lib/apply/dry-run';
import { log, warn, output, isQuietMode } from '../../lib/shared/logger';
import { FILE_SEARCH_TOOLS } from '../../lib/tools/builtin-tools';
import { displayApplySummary } from '../../lib/ux/display';
import { buildMcpServerRegistry, expandMcpToolsForAgents } from '../../lib/tools/mcp-tools';
import { buildAgentManifest, getDefaultManifestPath, writeAgentManifest } from '../../lib/apply/agent-manifest';
import { ApplyOptions, DeployResult } from './types';
import { DEFAULT_CANARY_PREFIX, rewriteAgentNamesForCanary, cleanupCanaryAgents, buildCanaryMetadata } from '../../lib/apply/canary';
import * as path from 'path';

export async function applyCommand(options: ApplyOptions, command: any): Promise<DeployResult> {
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
    } catch (err: any) {
      throw new Error(`Supabase configuration err: ${err.message}`);
    }

    const parser = new FleetParser(options.file, {
      supabaseBackend,
      rootPath: options.root
    });
    const config = await parser.parseFleetConfig(options.file);
    parseSpinner.succeed(`Parsed ${options.file} (${config.agents.length} agents)`);

    // Validate embedding configuration for self-hosted environments
    let isSelfHosted = true;
    if (process.env.LETTA_BASE_URL) {
      try {
        const host = new URL(process.env.LETTA_BASE_URL).hostname;
        // Must be exactly letta.com or a subdomain like api.letta.com
        isSelfHosted = host !== 'letta.com' && !host.endsWith('.letta.com');
      } catch {
        // Invalid URL, treat as self-hosted
      }
    }
    if (isSelfHosted) {
      const agentsWithoutEmbedding = config.agents.filter((agent: any) => !agent.embedding && !agent.embedding_config);
      if (agentsWithoutEmbedding.length > 0) {
        const names = agentsWithoutEmbedding.map((a: any) => a.name).join(', ');
        throw new Error(
          `Self-hosted Letta requires explicit embedding configuration.\n` +
          `Agents missing embedding: ${names}\n\n` +
          `Add an embedding or embedding_config field to each agent:\n` +
          `  embedding: "openai/text-embedding-3-small"\n` +
          `  # OR\n` +
          `  embedding_config:\n` +
          `    embedding_model: "nomic-embed-text:latest"\n\n` +
          `Common embedding providers:\n` +
          `  - openai/text-embedding-3-small\n` +
          `  - openai/text-embedding-3-large\n` +
          `  - openai/text-embedding-ada-002`
        );
      }
    }

    if (verbose) log(`Found ${config.agents.length} agents in configuration`);

    // Canary flag validation
    if (options.promote && !options.canary) {
      throw new Error('--promote requires --canary flag');
    }
    if (options.cleanup && !options.canary) {
      throw new Error('--cleanup requires --canary flag');
    }
    if (options.canary && options.match) {
      throw new Error('--canary cannot be combined with --match (template mode)');
    }

    // Canary mode: rewrite agent names or handle cleanup
    const canaryPrefix = options.canaryPrefix || DEFAULT_CANARY_PREFIX;
    let canaryMode = false;

    if (options.canary && options.cleanup && !options.promote) {
      // Cleanup-only: delete canary agents and return
      const client = new LettaClientWrapper();
      await cleanupCanaryAgents(config, canaryPrefix, client, options, spinnerEnabled, verbose);
      return { agents: {}, created: [], updated: [], unchanged: [] };
    }

    if (options.canary && !options.promote) {
      // Canary deploy: prefix all agent names
      const { rewrittenAgents } = rewriteAgentNamesForCanary(config.agents, canaryPrefix);
      config.agents = rewrittenAgents;
      canaryMode = true;
      log(`Canary mode: deploying with prefix "${canaryPrefix}"`);
    }

    // Canary deploy skips first_message by default (testing, not calibration)
    // Promote does NOT force-skip — user may want calibration on production
    if (options.canary && !options.promote) {
      options.skipFirstMessage = true;
    }

    // Template mode: apply config to existing agents matching pattern
    if (options.match) {
      await applyTemplateMode({ ...options, match: options.match }, config, parser, command);
      return { agents: {}, created: [], updated: [], unchanged: [] };
    }

    const client = new LettaClientWrapper();
    const blockManager = new BlockManager(client);
    const agentManager = new AgentManager(client);
    const archiveManager = new ArchiveManager(client);
    const diffEngine = new DiffEngine(client, blockManager, archiveManager, parser.basePath);
    const fileTracker = new FileContentTracker(parser.basePath, parser.storageBackend);

    // Load existing resources
    const loadSpinner = createSpinner('Loading existing resources...', spinnerEnabled).start();
    if (verbose) log('Loading existing blocks...');
    await blockManager.loadExistingBlocks();

    if (verbose) log('Loading existing archives...');
    await archiveManager.loadExistingArchives();

    if (verbose) log('Loading existing agents...');
    await agentManager.loadExistingAgents();
    loadSpinner.succeed('Loaded existing resources');

    // Dry-run mode: compute and display diffs without applying
    if (options.dryRun) {
      const results = await computeDryRunDiffs(config, {
        client,
        blockManager,
        archiveManager,
        agentManager,
        diffEngine,
        fileTracker,
        parser,
        agentFilter: options.agent,
        verbose
      });
      displayDryRunResults(results, verbose, options.skipFirstMessage);
      return { agents: {}, created: [], updated: [], unchanged: [] };
    }

    // Process shared blocks
    const blockSpinner = createSpinner('Processing shared blocks...', spinnerEnabled).start();
    const sharedBlockIds = await processSharedBlocks(config, blockManager, verbose);
    blockSpinner.succeed(`Processed ${sharedBlockIds.size} shared blocks`);

    // Register MCP servers
    let mcpServerNameToId = new Map<string, string>();
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
    mcpServerNameToId = await buildMcpServerRegistry(client);
    await expandMcpToolsForAgents(config, client, mcpServerNameToId, verbose);

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

    // Process folders
    const folderSpinner = createSpinner('Processing folders...', spinnerEnabled).start();
    const createdFolders = await processFolders(config, client, parser, options, verbose);
    folderSpinner.succeed(`Processed ${createdFolders.size} folders`);

    // Process agents
    if (verbose) log('Processing agents...');

    // Track results for summary (kubectl-style: continue on failure)
    const succeeded: string[] = [];
    const created: string[] = [];
    const updated: string[] = [];
    const failed: { name: string; err: string }[] = [];
    const skipped: string[] = [];
    const appliedAgents = new Map<string, { id: string; resolvedName: string }>();

    for (const agent of config.agents) {
      const filterName = (agent as any)._originalName || agent.name;
      if (options.agent && !filterName.includes(options.agent)) continue;
      if (verbose) {
        log(`  Description: ${agent.description}`);
        log(`  Tools: ${agent.tools?.join(', ') || 'none'}`);
        log(`  Memory blocks: ${agent.memory_blocks?.length || 0}`);
        log(`  Archives: ${agent.archives?.length || 0}`);
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
          embeddingConfig: agent.embedding_config,
          contextWindow: agent.llm_config?.context_window,
          reasoning: agent.reasoning,
          memoryBlocks: (agent.memory_blocks || []).map((block: any) => ({
            name: block.name,
            description: block.description,
            limit: block.limit,
            value: block.value || '',
            agent_owned: block.agent_owned
          })),
          archives: (agent.archives || []).map((archive: any) => {
            const resolved: any = {
              name: archive.name,
              description: archive.description,
              embedding_config: archive.embedding_config
            };
            if (archive.embedding) {
              resolved.embedding = archive.embedding;
            } else if (!archive.embedding_config && agent.embedding) {
              resolved.embedding = agent.embedding;
            }
            return resolved;
          }),
          memoryBlockFileHashes,
          folders: (agent.folders || []).map((folder: any) => ({
            name: folder.name,
            files: folder.files,
            fileContentHashes: folderContentHashes.get(folder.name) || {}
          })),
          sharedBlocks: agent.shared_blocks || [],
          tags: agent.tags || []
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
            skipped.push(agent.name);
            appliedAgents.set(agent.name, {
              id: existingAgent.id,
              resolvedName: existingAgent.name
            });
            if (verbose) log(`Agent ${agent.name} already up to date`);
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
            archiveManager,
            spinnerEnabled,
            verbose,
            force: options.force || false,
            previousFolderFileHashes
          });
          succeeded.push(agent.name);
          updated.push(agent.name);
          appliedAgents.set(agent.name, {
            id: existingAgent.id,
            resolvedName: existingAgent.name
          });
        } else {
          // Create new agent
          const createdAgent = await createNewAgent(agent, agentName, {
            client,
            blockManager,
            archiveManager,
            agentManager,
            toolNameToId,
            builtinTools,
            createdFolders,
            sharedBlockIds,
            spinnerEnabled,
            verbose,
            folderContentHashes,
            skipFirstMessage: options.skipFirstMessage
          });

          // Store canary metadata on newly created canary agents
          if (canaryMode && (agent as any)._originalName) {
            const canaryMeta = buildCanaryMetadata((agent as any)._originalName, canaryPrefix);
            await client.updateAgent(createdAgent.id, { metadata: canaryMeta });
          }

          succeeded.push(agent.name);
          created.push(agent.name);
          appliedAgents.set(agent.name, {
            id: createdAgent.id,
            resolvedName: createdAgent.name
          });
        }
      } catch (err: any) {
        const errorMsg = formatLettaError(err.message);
        failed.push({ name: agent.name, err: errorMsg });
        warn(`Failed: ${agent.name}: ${errorMsg}`);
        // Continue processing remaining agents (kubectl-style)
      }
    }

    // Display summary
    const summaryData = { succeeded, failed, unchanged: skipped };
    if (failed.length > 0) {
      output('');
      output(displayApplySummary(summaryData));
      throw new Error(`${failed.length} agent(s) failed to apply`);
    } else {
      log(displayApplySummary(summaryData));
    }

    // Post-promote cleanup: delete canary agents after promoting to production
    if (options.canary && options.promote && options.cleanup) {
      await cleanupCanaryAgents(config, canaryPrefix, client, options, spinnerEnabled, verbose);
    }

    // Only generate manifest if explicitly requested via --manifest flag
    if (options.manifest !== undefined) {
      // --manifest without path gives true, --manifest <path> gives the path string
      const manifestPath = typeof options.manifest === 'string'
        ? path.resolve(options.manifest)
        : getDefaultManifestPath(options.file);
      const manifest = buildAgentManifest({
        config,
        configPath: options.file,
        basePath: parser.basePath,
        appliedAgents,
        agentManager,
        blockManager,
        archiveManager,
        sharedBlockIds,
        toolNameToId,
        folderNameToId: createdFolders,
        mcpServerNameToId
      });
      writeAgentManifest(manifest, manifestPath);
      log(`Agent manifest written to ${manifestPath}`);
    }

    // Build result with agent name → ID mapping
    const resultAgents: Record<string, string> = {};
    for (const [name, info] of appliedAgents) {
      resultAgents[name] = info.id;
    }

    return { agents: resultAgents, created, updated, unchanged: skipped };

  } catch (err: any) {
    throw new Error(`Apply failed: ${formatLettaError(err.message || err)}`);
  }
}
