import { FleetParser } from '../../lib/fleet-parser';
import { LettaClientWrapper } from '../../lib/letta-client';
import { BlockManager } from '../../lib/block-manager';
import { DiffEngine } from '../../lib/diff-engine';
import { FileContentTracker } from '../../lib/file-content-tracker';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { minimatch } from 'minimatch';
import { readLastApplied, applyThreeWayMerge, hashCurrentTools, hashCurrentBlocks, METADATA_KEY } from '../../lib/last-applied-config';
import { normalizeResponse } from '../../lib/response-normalizer';
import { log, output } from '../../lib/logger';

/**
 * Template mode: apply a template config to all existing agents matching a glob pattern.
 * Uses kubectl-style three-way merge: removes resources only if they were previously
 * applied via template (preserves user-added resources).
 */
export async function applyTemplateMode(
  options: { file: string; match: string; dryRun?: boolean; root?: string },
  config: any,
  parser: FleetParser,
  command: any
): Promise<void> {
  const verbose = command.parent?.opts().verbose || false;
  const spinnerEnabled = getSpinnerEnabled(command);
  const pattern = options.match;

  const findSpinner = createSpinner(`Finding agents matching "${pattern}"...`, spinnerEnabled).start();

  // Get all agents from server
  const client = new LettaClientWrapper();
  const allAgentsResponse = await client.listAgents();
  const allAgents = Array.isArray(allAgentsResponse)
    ? allAgentsResponse
    : (allAgentsResponse as any).items || [];

  // Filter by glob pattern
  const matchingAgents = allAgents.filter((agent: any) =>
    minimatch(agent.name, pattern)
  );

  if (matchingAgents.length === 0) {
    findSpinner.fail(`No agents found matching pattern: ${pattern}`);
    return;
  }

  findSpinner.succeed(`Found ${matchingAgents.length} agents matching "${pattern}"`);
  matchingAgents.forEach((a: any) => output(`  - ${a.name}`));

  if (options.dryRun) {
    output('\nDry-run mode: no changes will be made');
    return;
  }

  // Pre-fetch current state for conflict detection BEFORE any modifications
  // This captures server state before shared blocks are updated
  const preModifyHashes = new Map<string, { toolHashes: Record<string, string>; blockHashes: Record<string, string> }>();
  for (const agent of matchingAgents) {
    const toolsResponse = await client.listAgentTools(agent.id);
    const blocksResponse = await client.listAgentBlocks(agent.id);
    const tools = normalizeResponse(toolsResponse);
    const blocks = normalizeResponse(blocksResponse);
    preModifyHashes.set(agent.id, {
      toolHashes: hashCurrentTools(tools),
      blockHashes: hashCurrentBlocks(blocks),
    });
  }

  // Initialize managers
  const blockManager = new BlockManager(client);
  const diffEngine = new DiffEngine(client, blockManager, parser.basePath);
  const fileTracker = new FileContentTracker(parser.basePath, parser.storageBackend);
  const createdFolders = new Map<string, string>();

  await blockManager.loadExistingBlocks();

  // Process shared blocks from template
  const sharedBlockIds = new Map<string, string>();
  if (config.shared_blocks?.length) {
    const blockSpinner = createSpinner('Processing shared blocks...', spinnerEnabled).start();
    for (const sharedBlock of config.shared_blocks) {
      const blockId = await blockManager.getOrCreateSharedBlock(sharedBlock);
      sharedBlockIds.set(sharedBlock.name, blockId);
      if (verbose) output(`  ${sharedBlock.name} -> ${blockId}`);
    }
    blockSpinner.succeed(`Processed ${config.shared_blocks.length} shared blocks`);
  }

  // Get template agent config (first agent in config, or use top-level values)
  const templateAgent = config.agents?.[0];
  const templateTools = templateAgent?.tools || [];
  const templateSharedBlocks = templateAgent?.shared_blocks || [];

  // Generate tool source hashes and register tools
  const toolSourceHashes = fileTracker.generateToolSourceHashes(templateTools, parser.toolConfigs);
  const { toolNameToId, updatedTools, builtinTools } = await parser.registerRequiredTools(config, client, verbose, toolSourceHashes);

  // Apply template to each matching agent
  for (const existingAgent of matchingAgents) {
    const agentSpinner = createSpinner(`Analyzing ${existingAgent.name}...`, spinnerEnabled).start();

    try {
      // Get full agent details including metadata
      const fullAgent = await client.getAgent(existingAgent.id);
      const lastApplied = readLastApplied(fullAgent.metadata);

      // Use pre-cached hashes (captured before shared blocks were modified)
      const currentHashes = preModifyHashes.get(existingAgent.id) || null;

      // Generate template block hashes
      const templateBlockHashes = await fileTracker.generateMemoryBlockFileHashes(
        config.shared_blocks || []
      );

      // Build desired config from template (no memoryBlocks - those are instance-specific)
      const desiredConfig = {
        systemPrompt: templateAgent?.system_prompt?.value || '',
        tools: templateTools,
        toolSourceHashes,
        sharedBlocks: templateSharedBlocks,
        embedding: templateAgent?.embedding,
        model: templateAgent?.llm_config?.model,
        contextWindow: templateAgent?.llm_config?.context_window,
      };

      // Create minimal AgentVersion for diff engine
      const agentVersion = {
        id: existingAgent.id,
        name: existingAgent.name,
        baseName: existingAgent.name,
        configHashes: { overall: '', systemPrompt: '', tools: '', model: '', memoryBlocks: '', folders: '', sharedBlocks: '' },
        version: 'latest',
        lastUpdated: existingAgent.updated_at || new Date().toISOString()
      };

      // Generate update operations
      const ops = await diffEngine.generateUpdateOperations(
        agentVersion,
        desiredConfig,
        toolNameToId,
        createdFolders,
        verbose,
        sharedBlockIds,
        updatedTools
      );

      // Three-way merge: only remove resources that were in lastApplied
      const configToStore = applyThreeWayMerge(
        ops,
        lastApplied,
        {
          tools: templateTools,
          sharedBlocks: templateSharedBlocks,
          folders: [],
          toolHashes: toolSourceHashes,
          blockHashes: templateBlockHashes,
        },
        currentHashes,
        verbose
      );

      if (ops.operationCount === 0) {
        // Still store lastApplied on first template apply (for future conflict detection)
        if (!lastApplied) {
          await client.updateAgentMetadata(existingAgent.id, {
            metadata: { ...fullAgent.metadata, [METADATA_KEY]: configToStore }
          });
        }
        agentSpinner.succeed(`${existingAgent.name}: already up to date`);
        continue;
      }

      agentSpinner.stop();
      OutputFormatter.showAgentUpdateDiff(ops, builtinTools);

      const updateSpinner = createSpinner(`Applying updates to ${existingAgent.name}...`, spinnerEnabled).start();
      await diffEngine.applyUpdateOperations(existingAgent.id, ops, verbose);

      // Store lastApplied config in agent metadata
      await client.updateAgentMetadata(existingAgent.id, {
        metadata: { ...fullAgent.metadata, [METADATA_KEY]: configToStore }
      });

      updateSpinner.succeed(`${existingAgent.name}: updated successfully`);

    } catch (err: any) {
      agentSpinner.fail(`${existingAgent.name}: ${err.message}`);
    }
  }

  output('\nTemplate apply completed');
}
