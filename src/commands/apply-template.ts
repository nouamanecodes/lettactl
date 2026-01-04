import { FleetParser } from '../lib/fleet-parser';
import { LettaClientWrapper } from '../lib/letta-client';
import { BlockManager } from '../lib/block-manager';
import { DiffEngine } from '../lib/diff-engine';
import { FileContentTracker } from '../lib/file-content-tracker';
import { OutputFormatter } from '../lib/output-formatter';
import { createSpinner, getSpinnerEnabled } from '../lib/spinner';
import { minimatch } from 'minimatch';

/**
 * Template mode: apply a template config to all existing agents matching a glob pattern.
 * Uses MERGE semantics - adds/updates resources but doesn't remove existing ones.
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
  matchingAgents.forEach((a: any) => console.log(`  - ${a.name}`));

  if (options.dryRun) {
    console.log('\nDry-run mode: no changes will be made');
    return;
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
      if (verbose) console.log(`  ${sharedBlock.name} -> ${blockId}`);
    }
    blockSpinner.succeed(`Processed ${config.shared_blocks.length} shared blocks`);
  }

  // Get template agent config (first agent in config, or use top-level values)
  const templateAgent = config.agents?.[0];
  const templateTools = templateAgent?.tools || [];
  const templateSharedBlocks = templateAgent?.shared_blocks || [];

  // Generate tool source hashes and register tools
  const toolSourceHashes = fileTracker.generateToolSourceHashes(templateTools, parser.toolConfigs);
  const { toolNameToId, updatedTools } = await parser.registerRequiredTools(config, client, verbose, toolSourceHashes);

  // Apply template to each matching agent
  for (const existingAgent of matchingAgents) {
    const agentSpinner = createSpinner(`Analyzing ${existingAgent.name}...`, spinnerEnabled).start();

    try {
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

      // MERGE semantics: clear toRemove arrays (don't remove existing resources)
      if (ops.tools) ops.tools.toRemove = [];
      if (ops.blocks) ops.blocks.toRemove = [];
      if (ops.folders) ops.folders.toDetach = [];

      // Recalculate operation count after filtering
      ops.operationCount = 0;
      if (ops.updateFields) ops.operationCount += Object.keys(ops.updateFields).length;
      if (ops.tools) ops.operationCount += ops.tools.toAdd.length + ops.tools.toUpdate.length;
      if (ops.blocks) ops.operationCount += ops.blocks.toAdd.length + ops.blocks.toUpdate.length;
      if (ops.folders) ops.operationCount += ops.folders.toAttach.length;

      if (ops.operationCount === 0) {
        agentSpinner.succeed(`${existingAgent.name}: already up to date`);
        continue;
      }

      agentSpinner.stop();
      OutputFormatter.showAgentUpdateDiff(ops);

      const updateSpinner = createSpinner(`Applying updates to ${existingAgent.name}...`, spinnerEnabled).start();
      await diffEngine.applyUpdateOperations(existingAgent.id, ops, verbose);
      updateSpinner.succeed(`${existingAgent.name}: updated successfully`);

    } catch (error: any) {
      agentSpinner.fail(`${existingAgent.name}: ${error.message}`);
    }
  }

  console.log('\nTemplate apply completed');
}
