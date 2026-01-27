import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { OutputFormatter } from '../lib/ux/output-formatter';
import { validateResourceType, validateRequired } from '../lib/validators';
import { withErrorHandling } from '../lib/error-handler';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';
import { normalizeToArray, findAttachedAgents } from '../lib/resource-usage';
import {
  displayAgentDetails,
  displayBlockDetails,
  displayToolDetails,
  displayFolderDetails,
  displayFileDetails,
  displayMcpServerDetails,
  AgentDetailsData,
  BlockDetailsData,
  ToolDetailsData,
  FolderDetailsData,
  FileDetailsData,
  McpServerDetailsData,
} from '../lib/ux/display';
import { output } from '../lib/logger';

const SUPPORTED_RESOURCES = ['agent', 'agents', 'block', 'blocks', 'tool', 'tools', 'folder', 'folders', 'file', 'files', 'mcp-servers'];

async function describeCommandImpl(resource: string, name: string, options?: { output?: string }, command?: any) {
  const verbose = command?.parent?.opts().verbose || false;
  validateResourceType(resource, SUPPORTED_RESOURCES);

  // Normalize resource to singular form (but preserve mcp-servers as-is)
  const normalizedResource = resource === 'mcp-servers' ? 'mcp-servers' : resource.replace(/s$/, '');
  validateRequired(name, `${normalizedResource.charAt(0).toUpperCase() + normalizedResource.slice(1)} name`, `lettactl describe ${normalizedResource} <name>`);

  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  const spinnerEnabled = getSpinnerEnabled(command);

  switch (normalizedResource) {
    case 'agent':
      await describeAgent(client, resolver, name, options, spinnerEnabled, verbose);
      break;
    case 'block':
      await describeBlock(client, resolver, name, options, spinnerEnabled);
      break;
    case 'tool':
      await describeTool(client, resolver, name, options, spinnerEnabled);
      break;
    case 'folder':
      await describeFolder(client, resolver, name, options, spinnerEnabled);
      break;
    case 'file':
      await describeFile(client, resolver, name, options, spinnerEnabled);
      break;
    case 'mcp-servers':
      await describeMcpServer(client, name, options, spinnerEnabled);
      break;
  }
}

async function describeAgent(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: { output?: string },
  spinnerEnabled?: boolean,
  verbose?: boolean
) {
  const spinner = createSpinner(`Loading details for agent ${name}...`, spinnerEnabled).start();

  try {
    // Find agent by name
    const { agent } = await resolver.findAgentByName(name);

    // Get full agent details
    const agentDetails = await resolver.getAgentWithDetails(agent.id);

    // Get folders with file info
    const folders = (agentDetails as any).folders || [];
    const folderData: { name: string; id: string; fileCount: number; files: string[] }[] = [];

    for (const folder of folders) {
      try {
        const fileList = normalizeToArray(await client.listFolderFiles(folder.id));
        folderData.push({
          name: folder.name || folder.id,
          id: folder.id,
          fileCount: fileList.length,
          files: fileList.map((f: any) => f.file_name || f.original_file_name || f.name || f.id),
        });
      } catch {
        folderData.push({
          name: folder.name || folder.id,
          id: folder.id,
          fileCount: 0,
          files: [],
        });
      }
    }

    // Get recent messages
    let messages: { createdAt?: string; role?: string; preview?: string }[] = [];
    try {
      const messageList = normalizeToArray(await client.getAgentMessages(agentDetails.id, 5));
      messages = messageList.map((msg: any) => {
        // Get the text content from various possible fields
        const text = msg.content || msg.text || msg.reasoning || '';
        return {
          createdAt: msg.date || msg.created_at,
          role: msg.message_type || msg.role,
          preview: text ? text.substring(0, 100) : undefined,
        };
      });
    } catch {
      // Messages unavailable
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(agentDetails, options?.output)) {
      return;
    }

    // Build display data
    const displayData: AgentDetailsData = {
      id: agentDetails.id,
      name: agentDetails.name,
      description: agentDetails.description,
      model: agentDetails.llm_config?.model,
      contextWindow: agentDetails.llm_config?.context_window,
      embedding: agentDetails.embedding_config?.embedding_model,
      created: agentDetails.created_at,
      updated: agentDetails.updated_at,
      systemPrompt: agentDetails.system,
      blocks: agentDetails.blocks?.map((b: any) => ({
        label: b.label || b.id,
        description: b.description,
        limit: b.limit,
        valueLength: b.value?.length || 0,
      })),
      tools: agentDetails.tools?.map((t: any) => ({
        name: t.name || t,
        description: t.description,
      })),
      folders: folderData,
      messages,
    };

    output(displayAgentDetails(displayData, verbose));
  } catch (error) {
    spinner.fail(`Failed to load details for agent ${name}`);
    throw error;
  }
}

async function describeBlock(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for block ${name}...`, spinnerEnabled).start();

  try {
    // Find block by name/label
    const allBlocks = await client.listBlocks();
    const block = allBlocks.find((b: any) => b.label === name || b.name === name || b.id === name);

    if (!block) {
      spinner.fail(`Block "${name}" not found`);
      throw new Error(`Block "${name}" not found`);
    }

    // Compute which agents use this block
    spinner.text = 'Finding attached agents...';
    const attachedAgents = await findAttachedAgents(client, resolver, 'blocks', block.id);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...block, attached_agents: attachedAgents }, options?.output)) {
      return;
    }

    const displayData: BlockDetailsData = {
      id: block.id,
      label: block.label || block.name || 'Unknown',
      description: block.description,
      limit: block.limit,
      currentSize: block.value?.length || 0,
      created: block.created_at,
      attachedAgents: attachedAgents.map((a: any) => ({ name: a.name, id: a.id })),
      valuePreview: block.value?.length > 500 ? block.value.substring(0, 500) + '...' : block.value,
    };

    output(displayBlockDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for block ${name}`);
    throw error;
  }
}

async function describeTool(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for tool ${name}...`, spinnerEnabled).start();

  try {
    // Find tool by name
    const allTools = await client.listTools();
    const tool = allTools.find((t: any) => t.name === name || t.id === name);

    if (!tool) {
      spinner.fail(`Tool "${name}" not found`);
      throw new Error(`Tool "${name}" not found`);
    }

    // Compute which agents use this tool
    spinner.text = 'Finding attached agents...';
    const attachedAgents = await findAttachedAgents(client, resolver, 'tools', tool.id);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...tool, attached_agents: attachedAgents }, options?.output)) {
      return;
    }

    const displayData: ToolDetailsData = {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      module: tool.module,
      created: tool.created_at,
      attachedAgents: attachedAgents.map((a: any) => ({ name: a.name, id: a.id })),
      sourceCode: tool.source_code,
    };

    output(displayToolDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for tool ${name}`);
    throw error;
  }
}

async function describeFolder(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for folder ${name}...`, spinnerEnabled).start();

  try {
    // Find folder by name
    const allFolders = await client.listFolders();
    const folder = allFolders.find((f: any) => f.name === name || f.id === name);

    if (!folder) {
      spinner.fail(`Folder "${name}" not found`);
      throw new Error(`Folder "${name}" not found`);
    }

    // Get folder files
    spinner.text = 'Loading folder contents...';
    const fileList = normalizeToArray(await client.listFolderFiles(folder.id));

    // Compute which agents use this folder
    spinner.text = 'Finding attached agents...';
    const attachedAgents = await findAttachedAgents(client, resolver, 'folders', folder.id);

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...folder, files: fileList, attached_agents: attachedAgents }, options?.output)) {
      return;
    }

    const displayData: FolderDetailsData = {
      id: folder.id,
      name: folder.name,
      description: folder.description,
      created: folder.created_at,
      attachedAgents: attachedAgents.map((a: any) => ({ name: a.name, id: a.id })),
      files: fileList.map((f: any) => f.name || f.file_name || f.id),
    };

    output(displayFolderDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for folder ${name}`);
    throw error;
  }
}

async function describeMcpServer(
  client: LettaClientWrapper,
  name: string,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for MCP server ${name}...`, spinnerEnabled).start();

  try {
    // Find MCP server by name or ID
    const serverList = await client.listMcpServers();
    const servers = Array.isArray(serverList) ? serverList : [];
    const server = servers.find((s: any) =>
      s.server_name === name || s.name === name || s.id === name
    );

    if (!server) {
      spinner.fail(`MCP server "${name}" not found`);
      throw new Error(`MCP server "${name}" not found`);
    }

    // Get tools for this MCP server
    spinner.text = 'Loading MCP server tools...';
    let tools: any[] = [];
    try {
      const toolList = await client.listMcpServerTools(server.id!);
      tools = Array.isArray(toolList) ? toolList : [];
    } catch (e) {
      // Tools might not be available
    }

    spinner.stop();

    // Cast to any for flexible property access
    const s: any = server;

    if (OutputFormatter.handleJsonOutput({ ...s, tools }, options?.output)) {
      return;
    }

    const displayData: McpServerDetailsData = {
      id: s.id,
      name: s.server_name || s.name || 'Unknown',
      type: s.mcp_server_type,
      serverUrl: s.server_url,
      command: s.command,
      args: s.args,
      authHeader: s.auth_header,
      tools: tools.map((t: any) => ({ name: t.name || t.id, description: t.description })),
    };

    output(displayMcpServerDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for MCP server ${name}`);
    throw error;
  }
}

async function describeFile(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: { output?: string },
  spinnerEnabled?: boolean
) {
  const spinner = createSpinner(`Loading details for file ${name}...`, spinnerEnabled).start();

  try {
    // Find file by name or ID across all folders
    spinner.text = 'Searching for file...';
    const allFolders = await client.listFolders();

    let foundFile: any = null;
    const foldersContainingFile: { name: string; id: string; agentCount?: number }[] = [];

    // Search through all folders to find the file
    for (const folder of allFolders) {
      const files = normalizeToArray(await client.listFolderFiles(folder.id));
      const matchingFile = files.find((f: any) =>
        f.name === name || f.file_name === name || f.id === name
      );

      if (matchingFile) {
        if (!foundFile) {
          foundFile = matchingFile;
        }
        // Compute agents attached to this folder
        const attachedAgents = await findAttachedAgents(client, resolver, 'folders', folder.id);
        foldersContainingFile.push({
          name: folder.name || folder.id,
          id: folder.id,
          agentCount: attachedAgents.length,
        });
      }
    }

    if (!foundFile) {
      spinner.fail(`File "${name}" not found`);
      throw new Error(`File "${name}" not found in any folder`);
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput({ ...foundFile, folders: foldersContainingFile }, options?.output)) {
      return;
    }

    const displayData: FileDetailsData = {
      id: foundFile.id || foundFile.file_id,
      name: foundFile.name || foundFile.file_name,
      size: foundFile.size || foundFile.file_size,
      mimeType: foundFile.mime_type || foundFile.content_type,
      created: foundFile.created_at,
      folders: foldersContainingFile,
    };

    output(displayFileDetails(displayData));
  } catch (error) {
    spinner.fail(`Failed to load details for file ${name}`);
    throw error;
  }
}

export default withErrorHandling('Describe command', describeCommandImpl);