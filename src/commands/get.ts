import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { OutputFormatter } from '../lib/output-formatter';
import { validateResourceType } from '../lib/validators';
import { withErrorHandling } from '../lib/error-handler';
import { createSpinner, getSpinnerEnabled } from '../lib/spinner';
import { normalizeToArray, computeAgentCounts } from '../lib/resource-usage';
import { log } from '../lib/logger';

const SUPPORTED_RESOURCES = ['agents', 'blocks', 'tools', 'folders', 'mcp-servers'];

interface GetOptions {
  output?: string;
  agent?: string;
  shared?: boolean;
  orphaned?: boolean;
}

async function getCommandImpl(resource: string, _name?: string, options?: GetOptions, command?: any) {
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
  if (options?.agent) {
    if (resource === 'agents') {
      log('Note: --agent flag is ignored for "get agents"');
    } else {
      const spinner = createSpinner(`Resolving agent ${options.agent}...`, spinnerEnabled).start();
      try {
        const { agent } = await resolver.findAgentByName(options.agent);
        agentId = agent.id;
        spinner.stop();
      } catch (error) {
        spinner.fail(`Agent "${options.agent}" not found`);
        throw error;
      }
    }
  }

  // Handle each resource type
  switch (resource) {
    case 'agents':
      await getAgents(resolver, client, options, spinnerEnabled);
      break;
    case 'blocks':
      await getBlocks(client, resolver, options, spinnerEnabled, agentId);
      break;
    case 'tools':
      await getTools(client, resolver, options, spinnerEnabled, agentId);
      break;
    case 'folders':
      await getFolders(client, resolver, options, spinnerEnabled, agentId);
      break;
    case 'mcp-servers':
      await getMcpServers(client, options, spinnerEnabled);
      break;
  }
}

async function getAgents(
  resolver: AgentResolver,
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean
) {
  const isWide = options?.output === 'wide';
  const spinner = createSpinner('Loading agents...', spinnerEnabled).start();

  try {
    const agents = await resolver.getAllAgents();

    // For wide output, fetch detailed agent info (blocks/tools counts)
    let detailedAgents = agents;
    if (isWide) {
      spinner.text = 'Fetching agent details...';
      detailedAgents = await Promise.all(
        agents.map(async (agent: any) => {
          const details = await resolver.getAgentWithDetails(agent.id);
          return details;
        })
      );
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(detailedAgents, options?.output)) {
      return;
    }

    if (options?.output === 'yaml') {
      console.log(OutputFormatter.formatOutput(detailedAgents, 'yaml'));
      return;
    }

    console.log(OutputFormatter.createAgentTable(detailedAgents, isWide));
  } catch (error) {
    spinner.fail('Failed to load agents');
    throw error;
  }
}

async function getBlocks(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  const isWide = options?.output === 'wide';
  let label = 'Loading blocks...';
  if (agentId) label = 'Loading agent blocks...';
  else if (options?.shared) label = 'Loading shared blocks...';
  else if (options?.orphaned) label = 'Loading orphaned blocks...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let blockList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      blockList = normalizeToArray(await client.listAgentBlocks(agentId));
    } else if (options?.shared) {
      blockList = await client.listBlocks({ connectedAgentsCountGt: 1 });
    } else if (options?.orphaned) {
      blockList = await client.listBlocks({ connectedAgentsCountEq: [0] });
    } else {
      blockList = await client.listBlocks();
    }

    // For wide output, compute agent counts
    if (isWide && !agentId) {
      spinner.text = 'Computing block usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'blocks', blockList.map((b: any) => b.id));
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(blockList, options?.output)) {
      return;
    }

    if (blockList.length === 0) {
      if (agentId) console.log('No blocks attached to this agent');
      else if (options?.shared) console.log('No shared blocks found (attached to 2+ agents)');
      else if (options?.orphaned) console.log('No orphaned blocks found (attached to 0 agents)');
      else console.log('No blocks found');
      return;
    }

    console.log(OutputFormatter.createBlockTable(blockList, isWide, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load blocks');
    throw error;
  }
}

async function getTools(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  const isWide = options?.output === 'wide';
  const needAgentCounts = isWide || options?.shared || options?.orphaned;

  let label = 'Loading tools...';
  if (agentId) label = 'Loading agent tools...';
  else if (options?.shared) label = 'Loading shared tools...';
  else if (options?.orphaned) label = 'Loading orphaned tools...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let toolList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      toolList = normalizeToArray(await client.listAgentTools(agentId));
    } else if (needAgentCounts) {
      spinner.text = 'Fetching all tools...';
      const allTools = await client.listTools();

      spinner.text = 'Computing tool usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'tools', allTools.map((t: any) => t.id));

      // Filter based on flag
      if (options?.shared) {
        toolList = allTools.filter((t: any) => (agentCounts!.get(t.id) || 0) >= 2);
      } else if (options?.orphaned) {
        toolList = allTools.filter((t: any) => (agentCounts!.get(t.id) || 0) === 0);
      } else {
        toolList = allTools;
      }
    } else {
      toolList = await client.listTools();
    }
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(toolList, options?.output)) {
      return;
    }

    if (toolList.length === 0) {
      if (agentId) console.log('No tools attached to this agent');
      else if (options?.shared) console.log('No shared tools found (attached to 2+ agents)');
      else if (options?.orphaned) console.log('No orphaned tools found (attached to 0 agents)');
      else console.log('No tools found');
      return;
    }

    console.log(OutputFormatter.createToolTable(toolList, isWide, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load tools');
    throw error;
  }
}

async function getFolders(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  const isWide = options?.output === 'wide';
  const needAgentCounts = isWide || options?.shared || options?.orphaned;

  let label = 'Loading folders...';
  if (agentId) label = 'Loading agent folders...';
  else if (options?.shared) label = 'Loading shared folders...';
  else if (options?.orphaned) label = 'Loading orphaned folders...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let folderList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      folderList = normalizeToArray(await client.listAgentFolders(agentId));
    } else if (needAgentCounts) {
      spinner.text = 'Fetching all folders...';
      const allFolders = await client.listFolders();

      spinner.text = 'Computing folder usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'folders', allFolders.map((f: any) => f.id));

      // Filter based on flag
      if (options?.shared) {
        folderList = allFolders.filter((f: any) => (agentCounts!.get(f.id) || 0) >= 2);
      } else if (options?.orphaned) {
        folderList = allFolders.filter((f: any) => (agentCounts!.get(f.id) || 0) === 0);
      } else {
        folderList = allFolders;
      }
    } else {
      folderList = await client.listFolders();
    }
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(folderList, options?.output)) {
      return;
    }

    if (folderList.length === 0) {
      if (agentId) console.log('No folders attached to this agent');
      else if (options?.shared) console.log('No shared folders found (attached to 2+ agents)');
      else if (options?.orphaned) console.log('No orphaned folders found (attached to 0 agents)');
      else console.log('No folders found');
      return;
    }

    console.log(OutputFormatter.createFolderTable(folderList, isWide, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load folders');
    throw error;
  }
}

async function getMcpServers(
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner('Loading MCP servers...', spinnerEnabled).start();

  try {
    const serverList = await client.listMcpServers();
    const servers = Array.isArray(serverList) ? serverList : [];

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(servers, options?.output)) {
      return;
    }

    if (servers.length === 0) {
      console.log('No MCP servers found');
      return;
    }

    console.log(OutputFormatter.createMcpServerTable(servers));
  } catch (error) {
    spinner.fail('Failed to load MCP servers');
    throw error;
  }
}

export default withErrorHandling('Get command', getCommandImpl);