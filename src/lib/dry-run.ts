import { LettaClientWrapper } from './letta-client';
import { BlockManager } from './block-manager';
import { AgentManager } from './agent-manager';
import { DiffEngine, AgentUpdateOperations } from './diff-engine';
import { FileContentTracker } from './file-content-tracker';
import { FleetParser } from './fleet-parser';
import { output } from './logger';

export interface DryRunResult {
  name: string;
  action: 'create' | 'update' | 'unchanged';
  config?: any;
  operations?: AgentUpdateOperations;
}

interface DryRunContext {
  client: LettaClientWrapper;
  blockManager: BlockManager;
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
    contextWindow: agent.llm_config?.context_window,
    memoryBlocks: (agent.memory_blocks || []).map((b: any) => ({
      name: b.name,
      description: b.description,
      limit: b.limit,
      value: b.value || '',
      mutable: b.mutable
    })),
    memoryBlockFileHashes,
    folders: (agent.folders || []).map((f: any) => ({
      name: f.name,
      files: f.files,
      fileContentHashes: folderContentHashes.get(f.name) || {}
    })),
    sharedBlocks: agent.shared_blocks || []
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
export function displayDryRunResults(results: DryRunResult[], verbose: boolean): void {
  output('');
  output('='.repeat(50));

  let created = 0, updated = 0, unchanged = 0;
  let totalChanges = 0;

  for (const result of results) {
    if (result.action === 'create') {
      created++;
      totalChanges++;
      displayCreateResult(result);
    } else if (result.action === 'update' && result.operations) {
      updated++;
      totalChanges += result.operations.operationCount;
      displayUpdateResult(result, verbose);
    } else if (verbose) {
      unchanged++;
      output(`[=] ${result.name} (no changes)`);
    } else {
      unchanged++;
    }
  }

  // Summary
  output('');
  output('='.repeat(50));
  output('Summary:');
  if (created > 0) output(`  [+] ${created} agent(s) to create`);
  if (updated > 0) output(`  [~] ${updated} agent(s) to update`);
  if (unchanged > 0) output(`  [=] ${unchanged} agent(s) unchanged`);
  output(`  Total changes: ${totalChanges}`);

  if (totalChanges === 0) {
    output('\nNo changes to apply.');
  } else {
    output('\nRun "lettactl apply" to apply these changes.');
  }
}

function displayCreateResult(result: DryRunResult): void {
  output(`[+] ${result.name} (CREATE)`);
  if (result.config) {
    output(`    Model: ${result.config.model || 'default'}`);
    output(`    Embedding: ${result.config.embedding || 'default'}`);
    if (result.config.tools?.length) {
      output(`    Tools: ${result.config.tools.length}`);
    }
    if (result.config.memoryBlocks?.length) {
      output(`    Memory blocks: ${result.config.memoryBlocks.length}`);
    }
    if (result.config.folders?.length) {
      const fileCount = result.config.folders.reduce((sum: number, f: any) => sum + f.files.length, 0);
      output(`    Folders: ${result.config.folders.length} (${fileCount} files)`);
    }
  }
}

/**
 * Truncate text for display, showing first N chars with ellipsis
 */
function truncate(text: string, maxLen: number = 60): string {
  const singleLine = text.replace(/\n/g, '\\n').replace(/\r/g, '');
  if (singleLine.length <= maxLen) return singleLine;
  return singleLine.substring(0, maxLen - 3) + '...';
}

/**
 * Display a text diff with - and + lines
 */
function displayTextDiff(label: string, from: string, to: string, indent: string = '    '): void {
  output(`${indent}${label}:`);
  output(`${indent}  - ${truncate(from, 70)}`);
  output(`${indent}  + ${truncate(to, 70)}`);
}

function displayUpdateResult(result: DryRunResult, verbose: boolean): void {
  const ops = result.operations!;
  output(`[~] ${result.name} (UPDATE - ${ops.operationCount} changes)`);

  // Field changes
  if (ops.updateFields) {
    if (ops.updateFields.system) {
      displayTextDiff('system_prompt', ops.updateFields.system.from, ops.updateFields.system.to);
    }
    if (ops.updateFields.description) {
      displayTextDiff('description', ops.updateFields.description.from, ops.updateFields.description.to);
    }
    if (ops.updateFields.model) {
      output(`    model: ${ops.updateFields.model.from} -> ${ops.updateFields.model.to}`);
    }
    if (ops.updateFields.embedding) {
      output(`    embedding: ${ops.updateFields.embedding.from} -> ${ops.updateFields.embedding.to}`);
    }
    if (ops.updateFields.contextWindow) {
      output(`    context_window: ${ops.updateFields.contextWindow.from} -> ${ops.updateFields.contextWindow.to}`);
    }
  }

  // Tool changes
  if (ops.tools) {
    for (const t of ops.tools.toAdd) output(`    Tool [+]: ${t.name}`);
    for (const t of ops.tools.toRemove) output(`    Tool [-]: ${t.name} (requires --force)`);
    for (const t of ops.tools.toUpdate) output(`    Tool [~]: ${t.name} (${t.reason})`);
    if (verbose && ops.tools.unchanged.length > 0) {
      output(`    Tools unchanged: ${ops.tools.unchanged.length}`);
    }
  }

  // Block changes
  if (ops.blocks) {
    for (const b of ops.blocks.toAdd) output(`    Block [+]: ${b.name}`);
    for (const b of ops.blocks.toRemove) output(`    Block [-]: ${b.name} (requires --force)`);
    for (const b of ops.blocks.toUpdate) output(`    Block [~]: ${b.name}`);
    for (const b of ops.blocks.toUpdateValue) {
      output(`    Block [~]: ${b.name} (value sync)`);
      output(`      - ${truncate(b.oldValue, 60)}`);
      output(`      + ${truncate(b.newValue, 60)}`);
    }
    if (verbose && ops.blocks.unchanged.length > 0) {
      output(`    Blocks unchanged: ${ops.blocks.unchanged.length}`);
    }
  }

  // Folder changes
  if (ops.folders) {
    for (const f of ops.folders.toAttach) output(`    Folder [+]: ${f.name}`);
    for (const f of ops.folders.toDetach) output(`    Folder [-]: ${f.name} (requires --force)`);
    for (const f of ops.folders.toUpdate) {
      const changes = [];
      if (f.filesToAdd.length) changes.push(`+${f.filesToAdd.length} files`);
      if (f.filesToRemove.length) changes.push(`-${f.filesToRemove.length} files`);
      if (f.filesToUpdate.length) changes.push(`~${f.filesToUpdate.length} files`);
      output(`    Folder [~]: ${f.name} (${changes.join(', ')})`);
    }
    if (verbose && ops.folders.unchanged.length > 0) {
      output(`    Folders unchanged: ${ops.folders.unchanged.length}`);
    }
  }
}
