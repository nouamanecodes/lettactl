import chalk from 'chalk';
import { LettaClientWrapper } from '../client/letta-client';
import { BlockManager } from '../managers/block-manager';
import { ArchiveManager } from '../managers/archive-manager';
import { AgentManager } from '../managers/agent-manager';
import { DiffEngine, AgentUpdateOperations } from './diff-engine';
import { FileContentTracker } from './file-content-tracker';
import { FleetParser } from './fleet-parser';
import { output } from '../shared/logger';
import { displayDryRunHeader, displayDryRunSummary, displayDryRunAction } from '../ux/display';
import { shouldUseFancyUx, truncate } from '../ux/box';
import { purple } from '../ux/constants';
import { buildMcpServerRegistry, expandMcpToolsForAgents } from '../tools/mcp-tools';

export interface DryRunResult {
  name: string;
  action: 'create' | 'update' | 'unchanged';
  config?: any;
  operations?: AgentUpdateOperations;
}

interface DryRunContext {
  client: LettaClientWrapper;
  blockManager: BlockManager;
  archiveManager: ArchiveManager;
  agentManager: AgentManager;
  diffEngine: DiffEngine;
  fileTracker: FileContentTracker;
  parser: FleetParser;
  agentFilter?: string;
  verbose: boolean;
}

/**
 * Compute diffs for all agents without applying changes
 */
export async function computeDryRunDiffs(
  config: any,
  ctx: DryRunContext
): Promise<DryRunResult[]> {
  const { client, blockManager, agentManager, diffEngine, fileTracker, parser, agentFilter } = ctx;

  // Build read-only registries
  const toolNameToId = await buildToolRegistry(client);
  const folderNameToId = await buildFolderRegistry(client);
  const sharedBlockIds = buildSharedBlockRegistry(config, blockManager);
  const mcpServerNameToId = await buildMcpServerRegistry(client);
  await expandMcpToolsForAgents(config, client, mcpServerNameToId, ctx.verbose);

  const results: DryRunResult[] = [];

  for (const agent of config.agents) {
    if (agentFilter && !agent.name.includes(agentFilter)) continue;

    const result = await computeAgentDiff(agent, {
      client,
      agentManager,
      diffEngine,
      fileTracker,
      parser,
      toolNameToId,
      folderNameToId,
      sharedBlockIds
    });

    results.push(result);
  }

  return results;
}

async function buildToolRegistry(client: LettaClientWrapper): Promise<Map<string, string>> {
  const tools = await client.listTools();
  const registry = new Map<string, string>();
  for (const tool of tools) {
    registry.set(tool.name, tool.id);
  }
  return registry;
}

async function buildFolderRegistry(client: LettaClientWrapper): Promise<Map<string, string>> {
  const folders = await client.listFolders();
  const registry = new Map<string, string>();
  for (const folder of folders) {
    registry.set(folder.name, folder.id);
  }
  return registry;
}

function buildSharedBlockRegistry(config: any, blockManager: BlockManager): Map<string, string> {
  const registry = new Map<string, string>();
  if (config.shared_blocks) {
    for (const block of config.shared_blocks) {
      const blockId = blockManager.getSharedBlockId(block.name);
      if (blockId) {
        registry.set(block.name, blockId);
      }
    }
  }
  return registry;
}

async function computeAgentDiff(
  agent: any,
  ctx: {
    client: LettaClientWrapper;
    agentManager: AgentManager;
    diffEngine: DiffEngine;
    fileTracker: FileContentTracker;
    parser: FleetParser;
    toolNameToId: Map<string, string>;
    folderNameToId: Map<string, string>;
    sharedBlockIds: Map<string, string>;
  }
): Promise<DryRunResult> {
  const { client, agentManager, diffEngine, fileTracker, parser, toolNameToId, folderNameToId, sharedBlockIds } = ctx;

  // Build agent config
  const folderContentHashes = await fileTracker.generateFolderFileHashes(agent.folders || []);
  const toolSourceHashes = fileTracker.generateToolSourceHashes(agent.tools || [], parser.toolConfigs);
  const memoryBlockFileHashes = await fileTracker.generateMemoryBlockFileHashes(agent.memory_blocks || []);

  const agentConfig = {
    systemPrompt: agent.system_prompt?.value || '',
    description: agent.description || '',
    tools: agent.tools || [],
    toolSourceHashes,
    model: agent.llm_config?.model,
    embedding: agent.embedding,
    embeddingConfig: agent.embedding_config,
    contextWindow: agent.llm_config?.context_window,
    memoryBlocks: (agent.memory_blocks || []).map((b: any) => ({
      name: b.name,
      description: b.description,
      limit: b.limit,
      value: b.value || '',
      agent_owned: b.agent_owned
    })),
    archives: (agent.archives || []).map((a: any) => {
      const resolved: any = {
        name: a.name,
        description: a.description,
        embedding_config: a.embedding_config,
      };
      if (a.embedding) {
        resolved.embedding = a.embedding;
      } else if (!a.embedding_config && agent.embedding) {
        resolved.embedding = agent.embedding;
      }
      return resolved;
    }),
    memoryBlockFileHashes,
    folders: (agent.folders || []).map((f: any) => ({
      name: f.name,
      files: f.files,
      fileContentHashes: folderContentHashes.get(f.name) || {}
    })),
    sharedBlocks: agent.shared_blocks || [],
    tags: agent.tags || [],
    lettabotConfig: agent.lettabot || null,
    firstMessage: agent.first_message || null
  };

  // Check if agent exists
  const { shouldCreate, existingAgent } = await agentManager.getOrCreateAgentName(
    agent.name,
    agentConfig,
    false
  );

  if (shouldCreate) {
    return { name: agent.name, action: 'create', config: agentConfig };
  }

  if (!existingAgent) {
    return { name: agent.name, action: 'unchanged' };
  }

  // Check for changes
  const changes = agentManager.getConfigChanges(existingAgent, agentConfig);
  if (!changes.hasChanges) {
    return { name: agent.name, action: 'unchanged' };
  }

  // Compute detailed diff
  const fullAgent = await client.getAgent(existingAgent.id);
  const previousFolderFileHashes = (fullAgent as any).metadata?.['lettactl.folderFileHashes'] || {};

  const operations = await diffEngine.generateUpdateOperations(
    existingAgent,
    agentConfig,
    toolNameToId,
    folderNameToId,
    false,
    sharedBlockIds,
    new Set<string>(),
    previousFolderFileHashes,
    true  // dryRun - don't create resources
  );

  return { name: agent.name, action: 'update', operations };
}

/**
 * Display dry-run results
 */
export function displayDryRunResults(results: DryRunResult[], verbose: boolean, skipFirstMessage?: boolean): void {
  const fancy = shouldUseFancyUx();

  // Calculate totals first for header
  let created = 0, updated = 0, unchanged = 0;
  let totalChanges = 0;
  for (const result of results) {
    if (result.action === 'create') {
      created++;
      totalChanges++;
    } else if (result.action === 'update' && result.operations) {
      updated++;
      totalChanges += result.operations.operationCount;
    } else {
      unchanged++;
    }
  }

  // Show header with drift status
  output('');
  output(displayDryRunHeader(totalChanges > 0));
  output('');

  // Reset for detailed output
  created = 0; updated = 0; unchanged = 0; totalChanges = 0;

  for (const result of results) {
    if (result.action === 'create') {
      created++;
      totalChanges++;
      output(displayDryRunAction(result.name, 'create'));
      formatCreateDetails(result, fancy, skipFirstMessage);
    } else if (result.action === 'update' && result.operations) {
      updated++;
      totalChanges += result.operations.operationCount;
      output(displayDryRunAction(result.name, 'update', `${result.operations.operationCount} changes`));
      formatUpdateDetails(result.operations, verbose, fancy);
    } else if (verbose) {
      unchanged++;
      output(displayDryRunAction(result.name, 'unchanged'));
    } else {
      unchanged++;
    }
  }

  output('');
  output(displayDryRunSummary({ created, updated, unchanged, totalChanges }));
}

function formatCreateDetails(result: DryRunResult, fancy: boolean, skipFirstMessage?: boolean): void {
  if (!result.config) return;
  const dim = fancy ? chalk.dim : (s: string) => s;
  const yellow = fancy ? chalk.yellow : (s: string) => s;
  const indent = '    ';
  output(`${indent}${dim('Model:')} ${result.config.model || 'default'}`);
  output(`${indent}${dim('Embedding:')} ${result.config.embedding || 'default'}`);
  if (result.config.tools?.length) {
    output(`${indent}${dim('Tools:')} ${result.config.tools.length}`);
  }
  if (result.config.memoryBlocks?.length) {
    output(`${indent}${dim('Memory blocks:')} ${result.config.memoryBlocks.length}`);
  }
  if (result.config.archives?.length) {
    output(`${indent}${dim('Archives:')} ${result.config.archives.length}`);
  }
  if (result.config.folders?.length) {
    const fileCount = result.config.folders.reduce((sum: number, f: any) => sum + f.files.length, 0);
    output(`${indent}${dim('Folders:')} ${result.config.folders.length} (${fileCount} files)`);
  }
  if (result.config.lettabotConfig) {
    const channels = Object.keys(result.config.lettabotConfig.channels || {});
    if (channels.length) {
      output(`${indent}${dim('LettaBot channels:')} ${channels.join(', ')}`);
    }
  }
  if (result.config.firstMessage && !skipFirstMessage) {
    output(`${indent}${yellow('First message:')} will send calibration message`);
  }
}

function collapseTruncate(text: string, maxLen: number): string {
  return truncate(text.replace(/\n/g, '\\n').replace(/\r/g, ''), maxLen);
}

function formatTextDiff(label: string, from: string, to: string, fancy: boolean): void {
  const indent = '    ';
  const dim = fancy ? chalk.dim : (s: string) => s;
  const red = fancy ? chalk.red : (s: string) => s;
  const green = fancy ? chalk.green : (s: string) => s;
  output(`${indent}${dim(label + ':')}`);
  output(`${indent}  ${red('- ' + collapseTruncate(from, 70))}`);
  output(`${indent}  ${green('+ ' + collapseTruncate(to, 70))}`);
}

function formatUpdateDetails(ops: AgentUpdateOperations, verbose: boolean, fancy: boolean): void {
  const dim = fancy ? chalk.dim : (s: string) => s;
  const green = fancy ? chalk.green : (s: string) => s;
  const red = fancy ? chalk.red : (s: string) => s;
  const colorPurple = fancy ? purple : (s: string) => s;

  // Field changes
  if (ops.updateFields) {
    if (ops.updateFields.system) {
      formatTextDiff('system_prompt', ops.updateFields.system.from, ops.updateFields.system.to, fancy);
    }
    if (ops.updateFields.description) {
      formatTextDiff('description', ops.updateFields.description.from, ops.updateFields.description.to, fancy);
    }
    if (ops.updateFields.model) {
      output(`    ${dim('model:')} ${ops.updateFields.model.from} ${dim('->')} ${ops.updateFields.model.to}`);
    }
    if (ops.updateFields.embedding) {
      output(`    ${dim('embedding:')} ${ops.updateFields.embedding.from} ${dim('->')} ${ops.updateFields.embedding.to}`);
    }
    if (ops.updateFields.contextWindow) {
      output(`    ${dim('context_window:')} ${ops.updateFields.contextWindow.from} ${dim('->')} ${ops.updateFields.contextWindow.to}`);
    }
    if (ops.updateFields.maxTokens) {
      output(`    ${dim('max_tokens:')} ${ops.updateFields.maxTokens.from} ${dim('->')} ${ops.updateFields.maxTokens.to}`);
    }
    if (ops.updateFields.tags) {
      output(`    ${dim('tags:')} [${ops.updateFields.tags.from}] ${dim('->')} [${ops.updateFields.tags.to}]`);
    }
    if (ops.updateFields.lettabotConfig) {
      const from = ops.updateFields.lettabotConfig.from;
      const to = ops.updateFields.lettabotConfig.to;
      if (!from && to) {
        output(`    ${green('lettabot:')} added`);
      } else if (from && !to) {
        output(`    ${red('lettabot:')} removed`);
      } else {
        output(`    ${dim('lettabot:')} updated`);
      }
    }
  }

  // Tool changes
  if (ops.tools) {
    for (const t of ops.tools.toAdd) output(`    ${green('Tool [+]:')} ${t.name}`);
    for (const t of ops.tools.toRemove) output(`    ${red('Tool [-]:')} ${t.name} ${dim('(requires --force)')}`);
    for (const t of ops.tools.toUpdate) output(`    ${colorPurple('Tool [~]:')} ${t.name} ${dim(`(${t.reason})`)}`);
    if (verbose && ops.tools.unchanged.length > 0) {
      output(`    ${dim(`Tools unchanged: ${ops.tools.unchanged.length}`)}`);
    }
  }

  // Block changes
  if (ops.blocks) {
    for (const b of ops.blocks.toAdd) output(`    ${green('Block [+]:')} ${b.name}`);
    for (const b of ops.blocks.toRemove) output(`    ${red('Block [-]:')} ${b.name} ${dim('(requires --force)')}`);
    for (const b of ops.blocks.toUpdate) output(`    ${colorPurple('Block [~]:')} ${b.name}`);
    for (const b of ops.blocks.toUpdateValue) {
      output(`    ${colorPurple('Block [~]:')} ${b.name} ${dim('(value sync)')}`);
      output(`      ${red('- ' + collapseTruncate(b.oldValue, 60))}`);
      output(`      ${green('+ ' + collapseTruncate(b.newValue, 60))}`);
    }
    if (verbose && ops.blocks.unchanged.length > 0) {
      output(`    ${dim(`Blocks unchanged: ${ops.blocks.unchanged.length}`)}`);
    }
  }

  // Folder changes
  if (ops.folders) {
    for (const f of ops.folders.toAttach) output(`    ${green('Folder [+]:')} ${f.name}`);
    for (const f of ops.folders.toDetach) output(`    ${red('Folder [-]:')} ${f.name} ${dim('(requires --force)')}`);
    for (const f of ops.folders.toUpdate) {
      const changes = [];
      if (f.filesToAdd.length) changes.push(`+${f.filesToAdd.length} files`);
      if (f.filesToRemove.length) changes.push(`-${f.filesToRemove.length} files`);
      if (f.filesToUpdate.length) changes.push(`~${f.filesToUpdate.length} files`);
      output(`    ${colorPurple('Folder [~]:')} ${f.name} ${dim(`(${changes.join(', ')})`)}`);
    }
    if (verbose && ops.folders.unchanged.length > 0) {
      output(`    ${dim(`Folders unchanged: ${ops.folders.unchanged.length}`)}`);
    }
  }

  // Archive changes
  if (ops.archives) {
    for (const a of ops.archives.toAttach) output(`    Archive [+]: ${a.name}`);
    for (const a of ops.archives.toDetach) output(`    Archive [-]: ${a.name} (requires --force)`);
    for (const a of ops.archives.toUpdate) output(`    Archive [~]: ${a.name}`);
    if (verbose && ops.archives.unchanged.length > 0) {
      output(`    Archives unchanged: ${ops.archives.unchanged.length}`);
    }
  }
}
