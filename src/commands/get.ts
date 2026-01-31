import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { OutputFormatter } from '../lib/ux/output-formatter';
import { validateResourceType } from '../lib/validators';
import { withErrorHandling } from '../lib/error-handler';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';
import { normalizeToArray, computeAgentCounts } from '../lib/resource-usage';
import { log, output } from '../lib/logger';
import { AgentDataFetcher, DetailLevel } from '../lib/agent-data-fetcher';

const SUPPORTED_RESOURCES = ['agents', 'blocks', 'archives', 'tools', 'folders', 'files', 'mcp-servers'];

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
    case 'archives':
      await getArchives(client, resolver, options, spinnerEnabled, agentId);
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
  }
}

async function getAgents(
  _resolver: AgentResolver,
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean
) {
  const isWide = options?.output === 'wide';
  const fetcher = new AgentDataFetcher(client);

  // Determine detail level based on output format
  // 'standard' fetches tools/blocks counts (default for readable output)
  // 'full' also fetches folders, files, MCP servers (for wide view)
  const detailLevel: DetailLevel = isWide ? 'full' : 'standard';

  const spinner = createSpinner('Loading agents...', spinnerEnabled).start();

  try {
    spinner.text = 'Fetching agent details...';

    const agents = await fetcher.fetchAllAgents(detailLevel);

    spinner.stop();

    // For JSON output, return the raw data
    if (options?.output === 'json') {
      const rawData = agents.map(a => a.raw);
      OutputFormatter.handleJsonOutput(rawData, 'json');
      return;
    }

    if (options?.output === 'yaml') {
      const rawData = agents.map(a => a.raw);
      output(OutputFormatter.formatOutput(rawData, 'yaml'));
      return;
    }

    output(OutputFormatter.createAgentTable(agents, isWide));
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
      // For agent-specific blocks, no need for agent counts
      blockList = normalizeToArray(await client.listAgentBlocks(agentId));
    } else if (options?.shared) {
      blockList = await client.listBlocks({ connectedAgentsCountGt: 1 });
    } else if (options?.orphaned) {
      blockList = await client.listBlocks({ connectedAgentsCountEq: [0] });
    } else {
      blockList = await client.listBlocks();
    }

    // Always compute agent counts for block listing (unless agent-specific)
    if (!agentId) {
      spinner.text = 'Computing block usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'blocks', blockList.map((b: any) => b.id));
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(blockList, options?.output)) {
      return;
    }

    if (blockList.length === 0) {
      if (agentId) output('No blocks attached to this agent');
      else if (options?.shared) output('No shared blocks found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned blocks found (attached to 0 agents)');
      else output('No blocks found');
      return;
    }

    output(OutputFormatter.createBlockTable(blockList, isWide, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load blocks');
    throw error;
  }
}

async function getArchives(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  let label = 'Loading archives...';
  if (agentId) label = 'Loading agent archives...';
  else if (options?.shared) label = 'Loading shared archives...';
  else if (options?.orphaned) label = 'Loading orphaned archives...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let archiveList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      archiveList = normalizeToArray(await client.listAgentArchives(agentId));
    } else {
      archiveList = await client.listArchives();
    }

    if (!agentId) {
      spinner.text = 'Computing archive usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'archives', archiveList.map((a: any) => a.id));

      if (options?.shared) {
        archiveList = archiveList.filter((a: any) => (agentCounts?.get(a.id) || 0) > 1);
      } else if (options?.orphaned) {
        archiveList = archiveList.filter((a: any) => (agentCounts?.get(a.id) || 0) === 0);
      }
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(archiveList, options?.output)) {
      return;
    }

    if (archiveList.length === 0) {
      if (agentId) output('No archives attached to this agent');
      else if (options?.shared) output('No shared archives found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned archives found (attached to 0 agents)');
      else output('No archives found');
      return;
    }

    output(OutputFormatter.createArchiveTable(archiveList, agentCounts));
  } catch (error) {
    spinner.fail('Failed to load archives');
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

  let label = 'Loading tools...';
  if (agentId) label = 'Loading agent tools...';
  else if (options?.shared) label = 'Loading shared tools...';
  else if (options?.orphaned) label = 'Loading orphaned tools...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  try {
    let toolList: any[];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      // For agent-specific tools, no need for agent counts
      toolList = normalizeToArray(await client.listAgentTools(agentId));
    } else {
      // Always compute agent counts for tool listing
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
    }
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(toolList, options?.output)) {
      return;
    }

    if (toolList.length === 0) {
      if (agentId) output('No tools attached to this agent');
      else if (options?.shared) output('No shared tools found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned tools found (attached to 0 agents)');
      else output('No tools found');
      return;
    }

    output(OutputFormatter.createToolTable(toolList, isWide, agentCounts));
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

  let label = 'Loading folders...';
  if (agentId) label = 'Loading agent folders...';
  else if (options?.shared) label = 'Loading shared folders...';
  else if (options?.orphaned) label = 'Loading orphaned folders...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  // Helper to safely get file count for a folder
  const getFileCount = async (folderId: string): Promise<number> => {
    try {
      const files = await client.listFolderFiles(folderId);
      const fileList = Array.isArray(files) ? files : ((files as any)?.items || []);
      return fileList.length;
    } catch {
      return 0;
    }
  };

  try {
    let folderList: any[];
    let agentCounts: Map<string, number> | undefined;
    let fileCounts: Map<string, number> | undefined;

    if (agentId) {
      // For agent-specific folders, no need for agent counts
      folderList = normalizeToArray(await client.listAgentFolders(agentId));
    } else {
      // Always compute agent counts for folder listing
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
    }

    // Compute file counts for all folders in parallel
    spinner.text = 'Computing file counts...';
    const fileCountResults = await Promise.all(
      folderList.map(async (f: any) => ({ id: f.id, count: await getFileCount(f.id) }))
    );
    fileCounts = new Map(fileCountResults.map(r => [r.id, r.count]));

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(folderList, options?.output)) {
      return;
    }

    if (folderList.length === 0) {
      if (agentId) output('No folders attached to this agent');
      else if (options?.shared) output('No shared folders found (attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned folders found (attached to 0 agents)');
      else output('No folders found');
      return;
    }

    output(OutputFormatter.createFolderTable(folderList, isWide, agentCounts, fileCounts));
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
      output('No MCP servers found');
      return;
    }

    output(OutputFormatter.createMcpServerTable(servers));
  } catch (error) {
    spinner.fail('Failed to load MCP servers');
    throw error;
  }
}

async function getFiles(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options?: GetOptions,
  spinnerEnabled?: boolean,
  agentId?: string
) {
  const isWide = options?.output === 'wide';

  let label = 'Loading files...';
  if (agentId) label = 'Loading agent files...';
  else if (options?.shared) label = 'Loading shared files...';
  else if (options?.orphaned) label = 'Loading orphaned files...';

  const spinner = createSpinner(label, spinnerEnabled).start();

  // Helper to safely get files from a folder
  const getFolderFiles = async (folderId: string): Promise<any[]> => {
    try {
      const files = await client.listFolderFiles(folderId);
      return Array.isArray(files) ? files : ((files as any)?.items || []);
    } catch {
      return [];
    }
  };

  try {
    let fileList: any[] = [];
    let agentCounts: Map<string, number> | undefined;

    if (agentId) {
      // For agent-specific files, get folders attached to agent then get their files
      const agentFolders = normalizeToArray(await client.listAgentFolders(agentId));

      for (const folder of agentFolders) {
        const files = await getFolderFiles(folder.id);
        for (const file of files) {
          fileList.push({
            ...file,
            folderName: folder.name,
            folderId: folder.id,
          });
        }
      }
    } else {
      // Get all folders and their files
      spinner.text = 'Fetching all folders...';
      const allFolders = await client.listFolders();

      spinner.text = 'Computing folder usage...';
      agentCounts = await computeAgentCounts(client, resolver, 'folders', allFolders.map((f: any) => f.id));

      spinner.text = 'Fetching files from folders...';
      for (const folder of allFolders) {
        const files = await getFolderFiles(folder.id);
        for (const file of files) {
          fileList.push({
            ...file,
            folderName: folder.name,
            folderId: folder.id,
          });
        }
      }

      // Filter based on flag (by folder's agent count)
      if (options?.shared) {
        fileList = fileList.filter((f: any) => (agentCounts!.get(f.folderId) || 0) >= 2);
      } else if (options?.orphaned) {
        fileList = fileList.filter((f: any) => (agentCounts!.get(f.folderId) || 0) === 0);
      }
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(fileList, options?.output)) {
      return;
    }

    if (fileList.length === 0) {
      if (agentId) output('No files attached to this agent');
      else if (options?.shared) output('No shared files found (in folders attached to 2+ agents)');
      else if (options?.orphaned) output('No orphaned files found (in folders attached to 0 agents)');
      else output('No files found');
      return;
    }

    output(OutputFormatter.createFileTable(fileList, agentCounts, isWide));
  } catch (error) {
    spinner.fail('Failed to load files');
    throw error;
  }
}

export default withErrorHandling('Get command', getCommandImpl);
