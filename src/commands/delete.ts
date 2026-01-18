import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { ResourceClassifier } from '../lib/resource-classifier';
import { validateResourceType, validateRequired } from '../lib/validators';
import { withErrorHandling } from '../lib/error-handler';
import { normalizeResponse } from '../lib/response-normalizer';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';
import { output, error, warn } from '../lib/logger';

async function deleteCommandImpl(resource: string, name: string, options?: { force?: boolean }, command?: any) {
  validateResourceType(resource, ['agent', 'agents', 'mcp-servers']);

  if (resource === 'mcp-servers') {
    return await deleteMcpServer(name, options, command);
  }

  validateRequired(name, 'Agent name', 'lettactl delete agent <name>');

  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  
  // Find agent by name
  const { agent, allAgents } = await resolver.findAgentByName(name);
    
  if (!options?.force) {
    output(`This will permanently delete agent: ${name} (${agent.id})`);
    output('This will also delete:');
    output('  - Agent-specific memory blocks');
    output('  - Agent-specific folders (if not shared)');
    output('  - Associated conversation history');
    output('Shared blocks and folders will be preserved.');
    output('Use --force to confirm deletion');
    process.exit(1);
  }
    
  const spinnerEnabled = getSpinnerEnabled(command);
  const spinner = createSpinner(`Deleting agent ${name}...`, spinnerEnabled).start();
  
  try {
    // Use the shared delete logic
    await deleteAgentWithCleanup(client, resolver, agent, allAgents, true);
    
    spinner.succeed(`Agent ${name} and associated resources deleted successfully`);
  } catch (err) {
    spinner.fail(`Failed to delete agent ${name}`);
    throw err;
  }
}

async function deleteAllCommandImpl(resource: string, options?: {
  force?: boolean;
  pattern?: string;
}, command?: any) {
  validateResourceType(resource, ['agent', 'agents', 'folders', 'folder', 'blocks', 'block', 'tools', 'tool', 'mcp-servers']);

  const client = new LettaClientWrapper();
  const spinnerEnabled = getSpinnerEnabled(command);

  // Route to appropriate handler
  if (resource === 'folders' || resource === 'folder') {
    return await deleteAllFolders(client, options, spinnerEnabled);
  }
  if (resource === 'blocks' || resource === 'block') {
    return await deleteAllBlocks(client, options, spinnerEnabled);
  }
  if (resource === 'tools' || resource === 'tool') {
    return await deleteAllTools(client, options, spinnerEnabled);
  }
  if (resource === 'mcp-servers') {
    return await deleteAllMcpServers(client, options, spinnerEnabled);
  }

  // Default: agents
  const resolver = new AgentResolver(client);

  // Get all agents
  const allAgents = await resolver.getAllAgents();

  // Filter agents by pattern if provided
  let agentsToDelete = allAgents;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    agentsToDelete = allAgents.filter(agent =>
      pattern.test(agent.name) || pattern.test(agent.id)
    );
  }

  if (agentsToDelete.length === 0) {
    output(options?.pattern
      ? `No agents found matching pattern: ${options.pattern}`
      : 'No agents found to delete'
    );
    return;
  }

  output(`Found ${agentsToDelete.length} agent(s) to delete:`);
  agentsToDelete.forEach((agent, i) => {
    output(`  ${i + 1}. ${agent.name} (${agent.id})`);
  });

  if (!options?.force) {
    output('');
    output('This will permanently delete all listed agents and their associated resources:');
    output('  - Agent-specific memory blocks');
    output('  - Agent-specific folders (if not shared)');
    output('  - Associated conversation history');
    output('Shared blocks and folders will be preserved.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  output('');
  output('Starting bulk deletion...');

  // Delete each agent
  for (const agent of agentsToDelete) {
    try {
      output(`\nDeleting agent: ${agent.name}...`);
      await deleteAgentWithCleanup(client, resolver, agent, allAgents, false);
      output(`Agent ${agent.name} deleted successfully`);
    } catch (err: any) {
      error(`Failed to delete agent ${agent.name}: ${err.message}`);
    }
  }

  output(`\nBulk deletion completed. Deleted ${agentsToDelete.length} agent(s).`);
}

async function deleteAllFolders(client: LettaClientWrapper, options?: { force?: boolean; pattern?: string }, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading folders...', spinnerEnabled).start();
  const folders = await client.listFolders();
  const folderList = normalizeResponse(folders);
  listSpinner.stop();

  let foldersToDelete = folderList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    foldersToDelete = folderList.filter((f: any) => pattern.test(f.name) || pattern.test(f.id));
  }

  if (foldersToDelete.length === 0) {
    output(options?.pattern ? `No folders found matching pattern: ${options.pattern}` : 'No folders found to delete');
    return;
  }

  output(`Found ${foldersToDelete.length} folder(s) to delete:`);
  foldersToDelete.forEach((f: any, i: number) => output(`  ${i + 1}. ${f.name} (${f.id})`));

  if (!options?.force) {
    output('\nThis will permanently delete all listed folders and their files.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${foldersToDelete.length} folders...`, spinnerEnabled).start();
  let deleted = 0;
  for (const folder of foldersToDelete) {
    try {
      await client.deleteFolder(folder.id);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete folder ${folder.name}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${foldersToDelete.length} folder(s)`);
}

async function deleteAllBlocks(client: LettaClientWrapper, options?: { force?: boolean; pattern?: string }, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading blocks...', spinnerEnabled).start();
  const blocks = await client.listBlocks();
  const blockList = normalizeResponse(blocks);
  listSpinner.stop();

  let blocksToDelete = blockList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    blocksToDelete = blockList.filter((b: any) => pattern.test(b.label || b.name || '') || pattern.test(b.id));
  }

  if (blocksToDelete.length === 0) {
    output(options?.pattern ? `No blocks found matching pattern: ${options.pattern}` : 'No blocks found to delete');
    return;
  }

  output(`Found ${blocksToDelete.length} block(s) to delete:`);
  blocksToDelete.forEach((b: any, i: number) => output(`  ${i + 1}. ${b.label || b.name || b.id} (${b.id})`));

  if (!options?.force) {
    output('\nThis will permanently delete all listed memory blocks.');
    output('WARNING: Blocks attached to agents will cause errors.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${blocksToDelete.length} blocks...`, spinnerEnabled).start();
  let deleted = 0;
  for (const block of blocksToDelete) {
    try {
      await client.deleteBlock(block.id);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete block ${block.label || block.id}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${blocksToDelete.length} block(s)`);
}

async function deleteAllTools(client: LettaClientWrapper, options?: { force?: boolean; pattern?: string }, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading tools...', spinnerEnabled).start();
  const tools = await client.listTools();
  const toolList = normalizeResponse(tools);
  listSpinner.stop();

  let toolsToDelete = toolList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    toolsToDelete = toolList.filter((t: any) => pattern.test(t.name) || pattern.test(t.id));
  }

  if (toolsToDelete.length === 0) {
    output(options?.pattern ? `No tools found matching pattern: ${options.pattern}` : 'No tools found to delete');
    return;
  }

  output(`Found ${toolsToDelete.length} tool(s) to delete:`);
  toolsToDelete.forEach((t: any, i: number) => output(`  ${i + 1}. ${t.name} (${t.id})`));

  if (!options?.force) {
    output('\nThis will permanently delete all listed tools.');
    output('WARNING: Tools attached to agents will cause errors.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${toolsToDelete.length} tools...`, spinnerEnabled).start();
  let deleted = 0;
  for (const tool of toolsToDelete) {
    try {
      await client.deleteTool(tool.id);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete tool ${tool.name}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${toolsToDelete.length} tool(s)`);
}

async function deleteAllMcpServers(client: LettaClientWrapper, options?: { force?: boolean; pattern?: string }, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading MCP servers...', spinnerEnabled).start();
  const servers = await client.listMcpServers();
  const serverList = Array.isArray(servers) ? servers : [];
  listSpinner.stop();

  let serversToDelete = serverList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    serversToDelete = serverList.filter((s: any) =>
      pattern.test(s.server_name || s.name || '') || pattern.test(s.id)
    );
  }

  if (serversToDelete.length === 0) {
    output(options?.pattern ? `No MCP servers found matching pattern: ${options.pattern}` : 'No MCP servers found to delete');
    return;
  }

  output(`Found ${serversToDelete.length} MCP server(s) to delete:`);
  serversToDelete.forEach((s: any, i: number) => {
    const name = (s as any).server_name || (s as any).name || s.id;
    output(`  ${i + 1}. ${name} (${s.id})`);
  });

  if (!options?.force) {
    output('\nThis will permanently delete all listed MCP servers.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${serversToDelete.length} MCP servers...`, spinnerEnabled).start();
  let deleted = 0;
  for (const server of serversToDelete) {
    const serverName = (server as any).server_name || (server as any).name || server.id;
    try {
      await client.deleteMcpServer(server.id!);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete MCP server ${serverName}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${serversToDelete.length} MCP server(s)`);
}

async function deleteAgentWithCleanup(
  client: LettaClientWrapper, 
  resolver: AgentResolver, 
  agent: any, 
  allAgents: any[],
  verbose: boolean = false
) {
  const classifier = new ResourceClassifier(client);
  
  // Get agent details to find attached folders and blocks
  const agentDetails = await resolver.getAgentWithDetails(agent.id);
  
  // Delete agent-attached memory blocks first (custom blocks attached to this specific agent)
  const agentAttachedBlocks = (agentDetails as any).blocks || [];
  if (agentAttachedBlocks.length > 0) {
    if (verbose) output(`Checking attached memory blocks...`);
    for (const block of agentAttachedBlocks) {
      // Check if this is a shared block
      const isShared = classifier.isSharedBlock(block);
      if (isShared) {
        if (verbose) output(`  Keeping shared block: ${block.label || block.id}`);
        continue;
      }
      
      // Check if this block is used by other agents
      const blockInUse = await classifier.isBlockUsedByOtherAgents(block.id, agent.id, allAgents);
      
      if (!blockInUse) {
        if (verbose) output(`  Deleting agent-specific block: ${block.label || block.id}`);
        try {
          await client.deleteBlock(block.id);
          if (verbose) output(`  Block deleted`);
        } catch (err: any) {
          warn(`  Could not delete block: ${err.message}`);
        }
      } else {
        if (verbose) output(`  Keeping block used by other agents: ${block.label || block.id}`);
      }
    }
  }
  
  // Delete attached folders if they're not shared
  const folders = (agentDetails as any).folders;
  if (folders) {
    if (verbose) output(`Checking attached folders...`);
    for (const folder of folders) {
      // Check if folder is shared or used by other agents
      const isShared = classifier.isSharedFolder(folder);
      const usedByOthers = await classifier.isFolderUsedByOtherAgents(folder.id, agent.id, allAgents);
      
      if (isShared) {
        if (verbose) output(`  Keeping shared folder: ${folder.name || folder.id}`);
      } else if (!usedByOthers) {
        if (verbose) output(`  Deleting agent-specific folder: ${folder.name || folder.id}`);
        try {
          await client.deleteFolder(folder.id);
          if (verbose) output(`  Folder deleted`);
        } catch (err: any) {
          warn(`  Could not delete folder: ${err.message}`);
        }
      } else {
        if (verbose) output(`  Keeping folder used by other agents: ${folder.name || folder.id}`);
      }
    }
  }
  
  // Delete the agent
  await client.deleteAgent(agent.id);
  
  // Clean up any remaining orphaned memory blocks by name pattern (fallback)
  if (verbose) output(`Cleaning up orphaned memory blocks...`);
  try {
    const blocks = await client.listBlocks();
    const blockList = normalizeResponse(blocks);
    const agentSpecificBlocks = classifier.getAgentSpecificBlocks(blockList, agent.name);
    
    for (const block of agentSpecificBlocks) {
      // Check if this block is still attached to any remaining agents
      const blockInUse = await classifier.isBlockUsedByOtherAgents(block.id, agent.id, allAgents);
      
      if (!blockInUse) {
        if (verbose) output(`  Deleting orphaned block: ${block.label}`);
        try {
          await client.deleteBlock(block.id);
          if (verbose) output(`  Block deleted`);
        } catch (err: any) {
          warn(`  Could not delete block: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    warn(`  Could not clean up blocks: ${err.message}`);
  }
}

async function deleteMcpServer(name: string, options?: { force?: boolean }, command?: any) {
  validateRequired(name, 'MCP server name', 'lettactl delete mcp-servers <name>');

  const client = new LettaClientWrapper();

  // Find MCP server by name or ID
  const serverList = await client.listMcpServers();
  const servers = Array.isArray(serverList) ? serverList : [];
  const server = servers.find((s: any) =>
    s.server_name === name || s.name === name || s.id === name
  );

  if (!server) {
    throw new Error(`MCP server "${name}" not found`);
  }

  if (!options?.force) {
    output(`This will permanently delete MCP server: ${name} (${server.id})`);
    output('Use --force to confirm deletion');
    process.exit(1);
  }

  const spinnerEnabled = getSpinnerEnabled(command);
  const spinner = createSpinner(`Deleting MCP server ${name}...`, spinnerEnabled).start();

  try {
    await client.deleteMcpServer(server.id!);
    spinner.succeed(`MCP server ${name} deleted successfully`);
  } catch (err) {
    spinner.fail(`Failed to delete MCP server ${name}`);
    throw err;
  }
}

export default withErrorHandling('Delete command', deleteCommandImpl);
export const deleteAllCommand = withErrorHandling('Delete all command', deleteAllCommandImpl);