import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { ResourceClassifier } from '../lib/resource-classifier';
import { validateResourceType, validateRequired } from '../lib/validators';
import { withErrorHandling } from '../lib/error-handler';
import { normalizeResponse } from '../lib/response-normalizer';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';

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
    console.log(`This will permanently delete agent: ${name} (${agent.id})`);
    console.log('This will also delete:');
    console.log('  - Agent-specific memory blocks');
    console.log('  - Agent-specific folders (if not shared)');
    console.log('  - Associated conversation history');
    console.log('Shared blocks and folders will be preserved.');
    console.log('Use --force to confirm deletion');
    process.exit(1);
  }
    
  const spinnerEnabled = getSpinnerEnabled(command);
  const spinner = createSpinner(`Deleting agent ${name}...`, spinnerEnabled).start();
  
  try {
    // Use the shared delete logic
    await deleteAgentWithCleanup(client, resolver, agent, allAgents, true);
    
    spinner.succeed(`Agent ${name} and associated resources deleted successfully`);
  } catch (error) {
    spinner.fail(`Failed to delete agent ${name}`);
    throw error;
  }
}

async function deleteAllCommandImpl(resource: string, options?: { 
  force?: boolean; 
  pattern?: string;
}) {
  validateResourceType(resource, ['agent', 'agents']);

  const client = new LettaClientWrapper();
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
    console.log(options?.pattern 
      ? `No agents found matching pattern: ${options.pattern}`
      : 'No agents found to delete'
    );
    return;
  }
  
  console.log(`Found ${agentsToDelete.length} agent(s) to delete:`);
  agentsToDelete.forEach((agent, i) => {
    console.log(`  ${i + 1}. ${agent.name} (${agent.id})`);
  });
  
  if (!options?.force) {
    console.log('');
    console.log('This will permanently delete all listed agents and their associated resources:');
    console.log('  - Agent-specific memory blocks');
    console.log('  - Agent-specific folders (if not shared)');
    console.log('  - Associated conversation history');
    console.log('Shared blocks and folders will be preserved.');
    console.log('Use --force to confirm deletion.');
    process.exit(1);
  }
  
  console.log('');
  console.log('Starting bulk deletion...');
  
  // Delete each agent
  for (const agent of agentsToDelete) {
    try {
      console.log(`\nDeleting agent: ${agent.name}...`);
      await deleteAgentWithCleanup(client, resolver, agent, allAgents, false);
      console.log(`Agent ${agent.name} deleted successfully`);
    } catch (error: any) {
      console.error(`Failed to delete agent ${agent.name}: ${error.message}`);
    }
  }
  
  console.log(`\nBulk deletion completed. Deleted ${agentsToDelete.length} agent(s).`);
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
    if (verbose) console.log(`Checking attached memory blocks...`);
    for (const block of agentAttachedBlocks) {
      // Check if this is a shared block
      const isShared = classifier.isSharedBlock(block);
      if (isShared) {
        if (verbose) console.log(`  Keeping shared block: ${block.label || block.id}`);
        continue;
      }
      
      // Check if this block is used by other agents
      const blockInUse = await classifier.isBlockUsedByOtherAgents(block.id, agent.id, allAgents);
      
      if (!blockInUse) {
        if (verbose) console.log(`  Deleting agent-specific block: ${block.label || block.id}`);
        try {
          await client.deleteBlock(block.id);
          if (verbose) console.log(`  Block deleted`);
        } catch (error: any) {
          console.warn(`  Could not delete block: ${error.message}`);
        }
      } else {
        if (verbose) console.log(`  Keeping block used by other agents: ${block.label || block.id}`);
      }
    }
  }
  
  // Delete attached folders if they're not shared
  const folders = (agentDetails as any).folders;
  if (folders) {
    if (verbose) console.log(`Checking attached folders...`);
    for (const folder of folders) {
      // Check if folder is shared or used by other agents
      const isShared = classifier.isSharedFolder(folder);
      const usedByOthers = await classifier.isFolderUsedByOtherAgents(folder.id, agent.id, allAgents);
      
      if (isShared) {
        if (verbose) console.log(`  Keeping shared folder: ${folder.name || folder.id}`);
      } else if (!usedByOthers) {
        if (verbose) console.log(`  Deleting agent-specific folder: ${folder.name || folder.id}`);
        try {
          await client.deleteFolder(folder.id);
          if (verbose) console.log(`  Folder deleted`);
        } catch (error: any) {
          console.warn(`  Could not delete folder: ${error.message}`);
        }
      } else {
        if (verbose) console.log(`  Keeping folder used by other agents: ${folder.name || folder.id}`);
      }
    }
  }
  
  // Delete the agent
  await client.deleteAgent(agent.id);
  
  // Clean up any remaining orphaned memory blocks by name pattern (fallback)
  if (verbose) console.log(`Cleaning up orphaned memory blocks...`);
  try {
    const blocks = await client.listBlocks();
    const blockList = normalizeResponse(blocks);
    const agentSpecificBlocks = classifier.getAgentSpecificBlocks(blockList, agent.name);
    
    for (const block of agentSpecificBlocks) {
      // Check if this block is still attached to any remaining agents
      const blockInUse = await classifier.isBlockUsedByOtherAgents(block.id, agent.id, allAgents);
      
      if (!blockInUse) {
        if (verbose) console.log(`  Deleting orphaned block: ${block.label}`);
        try {
          await client.deleteBlock(block.id);
          if (verbose) console.log(`  Block deleted`);
        } catch (error: any) {
          console.warn(`  Could not delete block: ${error.message}`);
        }
      }
    }
  } catch (error: any) {
    console.warn(`  Could not clean up blocks: ${error.message}`);
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
    console.log(`This will permanently delete MCP server: ${name} (${server.id})`);
    console.log('Use --force to confirm deletion');
    process.exit(1);
  }

  const spinnerEnabled = getSpinnerEnabled(command);
  const spinner = createSpinner(`Deleting MCP server ${name}...`, spinnerEnabled).start();

  try {
    await client.deleteMcpServer(server.id!);
    spinner.succeed(`MCP server ${name} deleted successfully`);
  } catch (error) {
    spinner.fail(`Failed to delete MCP server ${name}`);
    throw error;
  }
}

export default withErrorHandling('Delete command', deleteCommandImpl);
export const deleteAllCommand = withErrorHandling('Delete all command', deleteAllCommandImpl);