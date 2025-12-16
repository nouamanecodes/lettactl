import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { OutputFormatter } from '../lib/output-formatter';
import { validateResourceType } from '../lib/validators';
import { withErrorHandling } from '../lib/error-handler';
import { createSpinner, getSpinnerEnabled } from '../lib/spinner';

const SUPPORTED_RESOURCES = ['agents', 'blocks', 'tools', 'folders'];

async function getCommandImpl(resource: string, _name?: string, options?: { output: string }, command?: any) {
  validateResourceType(resource, SUPPORTED_RESOURCES);

  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  const spinnerEnabled = getSpinnerEnabled(command);

  // Handle each resource type
  switch (resource) {
    case 'agents':
      await getAgents(resolver, options, spinnerEnabled);
      break;
    case 'blocks':
      await getBlocks(client, options, spinnerEnabled);
      break;
    case 'tools':
      await getTools(client, options, spinnerEnabled);
      break;
    case 'folders':
      await getFolders(client, options, spinnerEnabled);
      break;
  }
}

async function getAgents(
  resolver: AgentResolver,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner('Loading agents...', spinnerEnabled).start();

  try {
    const agents = await resolver.getAllAgents();
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(agents, options?.output)) {
      return;
    }

    if (options?.output === 'yaml') {
      console.log(OutputFormatter.formatOutput(agents, 'yaml'));
      return;
    }

    console.log(OutputFormatter.createAgentTable(agents));
  } catch (error) {
    spinner.fail('Failed to load agents');
    throw error;
  }
}

async function getBlocks(
  client: LettaClientWrapper,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner('Loading blocks...', spinnerEnabled).start();

  try {
    const blocks = await client.listBlocks();
    const blockList = Array.isArray(blocks) ? blocks : (blocks as any).items || [];
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(blockList, options?.output)) {
      return;
    }

    if (blockList.length === 0) {
      console.log('No blocks found');
      return;
    }

    console.log(OutputFormatter.createBlockTable(blockList));
  } catch (error) {
    spinner.fail('Failed to load blocks');
    throw error;
  }
}

async function getTools(
  client: LettaClientWrapper,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner('Loading tools...', spinnerEnabled).start();

  try {
    const tools = await client.listTools();
    const toolList = Array.isArray(tools) ? tools : (tools as any).items || [];
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(toolList, options?.output)) {
      return;
    }

    if (toolList.length === 0) {
      console.log('No tools found');
      return;
    }

    console.log(OutputFormatter.createToolTable(toolList));
  } catch (error) {
    spinner.fail('Failed to load tools');
    throw error;
  }
}

async function getFolders(
  client: LettaClientWrapper,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner('Loading folders...', spinnerEnabled).start();

  try {
    const folders = await client.listFolders();
    const folderList = Array.isArray(folders) ? folders : (folders as any).items || [];
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(folderList, options?.output)) {
      return;
    }

    if (folderList.length === 0) {
      console.log('No folders found');
      return;
    }

    console.log(OutputFormatter.createFolderTable(folderList));
  } catch (error) {
    spinner.fail('Failed to load folders');
    throw error;
  }
}

export default withErrorHandling('Get command', getCommandImpl);