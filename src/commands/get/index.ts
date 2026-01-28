import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { validateResourceType } from '../../lib/validators';
import { withErrorHandling } from '../../lib/error-handler';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { log } from '../../lib/logger';

import { SUPPORTED_RESOURCES, GetOptions } from './types';
import { getAgents } from './agents';
import { getBlocks } from './blocks';
import { getTools } from './tools';
import { getFolders } from './folders';
import { getFiles } from './files';
import { getMcpServers } from './mcp-servers';
import { getArchival } from './archival';

async function getCommandImpl(resource: string, name?: string, options?: GetOptions, command?: any) {
  validateResourceType(resource, SUPPORTED_RESOURCES);

  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  const spinnerEnabled = getSpinnerEnabled(command);

  // Validate flag combinations
  if (options?.shared && options?.orphaned) {
    throw new Error('Cannot use --shared and --orphaned together');
  }
  if ((options?.shared || options?.orphaned) && options?.agent) {
    throw new Error('Cannot use --shared or --orphaned with --agent');
  }
  if ((options?.shared || options?.orphaned) && resource === 'agents') {
    log('Note: --shared and --orphaned flags are ignored for "get agents"');
  }

  // If --agent flag is provided, resolve agent name to ID
  let agentId: string | undefined;
  let agentName: string | undefined;
  if (options?.agent) {
    if (resource === 'agents') {
      log('Note: --agent flag is ignored for "get agents"');
    } else {
      const spinner = createSpinner(`Resolving agent ${options.agent}...`, spinnerEnabled).start();
      try {
        const { agent } = await resolver.findAgentByName(options.agent);
        agentId = agent.id;
        agentName = agent.name;
        spinner.stop();
      } catch (error) {
        spinner.fail(`Agent "${options.agent}" not found`);
        throw error;
      }
    }
  }

  // For `get blocks <agent>` or `get archival <agent>`, resolve the positional name as an agent
  if ((resource === 'blocks' || resource === 'archival') && name && !agentId) {
    const spinner = createSpinner(`Resolving agent ${name}...`, spinnerEnabled).start();
    try {
      const { agent } = await resolver.findAgentByName(name);
      agentId = agent.id;
      agentName = agent.name;
      spinner.stop();
    } catch (error) {
      spinner.fail(`Agent "${name}" not found`);
      throw error;
    }
  }

  // Handle each resource type
  switch (resource) {
    case 'agents':
      await getAgents(resolver, client, options, spinnerEnabled);
      break;
    case 'blocks':
      await getBlocks(client, resolver, options, spinnerEnabled, agentId, agentName);
      break;
    case 'tools':
      await getTools(client, resolver, options, spinnerEnabled, agentId);
      break;
    case 'folders':
      await getFolders(client, resolver, options, spinnerEnabled, agentId);
      break;
    case 'files':
      await getFiles(client, resolver, options, spinnerEnabled, agentId);
      break;
    case 'mcp-servers':
      await getMcpServers(client, options, spinnerEnabled);
      break;
    case 'archival':
      await getArchival(client, resolver, options, spinnerEnabled, agentId, agentName);
      break;
  }
}

export default withErrorHandling('Get command', getCommandImpl);
