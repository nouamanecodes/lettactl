import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { validateResourceType, validateRequired } from '../../lib/validation/validators';
import { withErrorHandling } from '../../lib/shared/error-handler';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { output, error } from '../../lib/shared/logger';

import { DELETE_SUPPORTED_RESOURCES, DELETE_ALL_SUPPORTED_RESOURCES, DeleteOptions, DeleteAllOptions } from './types';
import { deleteAgentWithCleanup } from './agent';
import { deleteMcpServer } from './mcp-server';
import { deleteAllFolders } from './all-folders';
import { deleteAllBlocks } from './all-blocks';
import { deleteAllTools } from './all-tools';
import { deleteAllMcpServers } from './all-mcp-servers';

async function deleteCommandImpl(resource: string, name: string, options?: DeleteOptions, command?: any) {
  validateResourceType(resource, DELETE_SUPPORTED_RESOURCES);

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

async function deleteAllCommandImpl(resource: string, options?: DeleteAllOptions, command?: any) {
  validateResourceType(resource, DELETE_ALL_SUPPORTED_RESOURCES);

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

export { deleteAgentWithCleanup };
export default withErrorHandling('Delete command', deleteCommandImpl);
export const deleteAllCommand = withErrorHandling('Delete all command', deleteAllCommandImpl);
