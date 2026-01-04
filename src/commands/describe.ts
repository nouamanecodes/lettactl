import { LettaClientWrapper } from '../lib/letta-client';
import { AgentResolver } from '../lib/agent-resolver';
import { OutputFormatter } from '../lib/output-formatter';
import { validateResourceType, validateRequired } from '../lib/validators';
import { withErrorHandling } from '../lib/error-handler';
import { createSpinner, getSpinnerEnabled } from '../lib/spinner';
import { normalizeToArray, findAttachedAgents } from '../lib/resource-usage';

const SUPPORTED_RESOURCES = ['agent', 'agents', 'block', 'blocks', 'tool', 'tools', 'folder', 'folders', 'mcp-servers'];

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
    
    spinner.stop();
  
  if (OutputFormatter.handleJsonOutput(agentDetails, options?.output)) {
    return;
  }
    
    // Display formatted information
    console.log(`Agent Details: ${name}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`ID:               ${agentDetails.id}`);
    console.log(`Name:             ${agentDetails.name}`);
    console.log(`Model:            ${agentDetails.llm_config?.model || 'Unknown'}`);
    console.log(`Context Window:   ${agentDetails.llm_config?.context_window || 'Default'}`);
    console.log(`Embedding:        ${agentDetails.embedding_config?.embedding_model || 'Unknown'}`);
    console.log(`Created:          ${agentDetails.created_at || 'Unknown'}`);
    console.log(`Last Updated:     ${agentDetails.updated_at || 'Unknown'}`);
    
    // System prompt (truncated)
    if (agentDetails.system) {
      console.log(`\nSystem Prompt:`);
      const truncated = agentDetails.system.length > 200 
        ? agentDetails.system.substring(0, 200) + '...' 
        : agentDetails.system;
      console.log(`${truncated}`);
    }
    
    // Memory blocks
    if (agentDetails.blocks && agentDetails.blocks.length > 0) {
      console.log(`\nMemory Blocks (${agentDetails.blocks.length}):`);
      for (const block of agentDetails.blocks) {
        console.log(`  - ${block.label || block.id}`);
        console.log(`    Description: ${block.description || 'No description'}`);
        console.log(`    Limit: ${block.limit || 'No limit'} characters`);
        console.log(`    Value: ${block.value ? `${block.value.length} characters` : 'No content'}`);
        console.log();
      }
    } else {
      console.log(`\nMemory Blocks: None`);
    }
    
    // Tools
    if (agentDetails.tools && agentDetails.tools.length > 0) {
      console.log(`Tools (${agentDetails.tools.length}):`);
      for (const tool of agentDetails.tools) {
        console.log(`  - ${tool.name || tool}`);
        if (tool.description) {
          if (verbose) {
            console.log(`    ${tool.description}`);
          } else {
            // Truncate to first line, max 80 chars
            const firstLine = tool.description.split('\n')[0].trim();
            const truncated = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;
            console.log(`    ${truncated}`);
          }
        }
      }
      console.log();
    } else {
      console.log(`Tools: None\n`);
    }
    
    // Attached folders
    const folders = (agentDetails as any).folders;
    if (folders && folders.length > 0) {
      console.log(`Attached Folders (${folders.length}):`);
      for (const folder of folders) {
        console.log(`  - ${folder.name || folder.id}`);
        console.log(`    ID: ${folder.id}`);
        
        // Get folder file count
        try {
          const fileList = normalizeToArray(await client.listFolderFiles(folder.id));
          console.log(`    Files: ${fileList.length}`);
          
          // Show first few files
          if (fileList.length > 0) {
            const displayFiles = fileList.slice(0, 3);
            for (const file of displayFiles) {
              console.log(`      - ${file.name || file.filename || file.id}`);
            }
            if (fileList.length > 3) {
              console.log(`      ... and ${fileList.length - 3} more files`);
            }
          }
        } catch (error) {
          console.log(`    Files: Unable to retrieve file list`);
        }
        console.log();
      }
    } else {
      console.log(`Attached Folders: None\n`);
    }
    
    // Messages (recent)
    try {
      const messageList = normalizeToArray(await client.getAgentMessages(agentDetails.id, 5));
      
      if (messageList.length > 0) {
        console.log(`Recent Messages (${messageList.length} of last 5):`);
        for (const message of messageList.slice(-3)) { // Show last 3
          console.log(`  - ${message.created_at || 'Unknown time'}`);
          console.log(`    Role: ${message.role}`);
          const preview = message.text?.substring(0, 100) || 'No content';
          console.log(`    Preview: ${preview}${message.text?.length > 100 ? '...' : ''}`);
          console.log();
        }
      } else {
        console.log(`Recent Messages: None\n`);
      }
    } catch (error) {
      console.log(`Recent Messages: Unable to retrieve messages\n`);
    }
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

    console.log(`Block Details: ${block.label || block.name}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`ID:            ${block.id}`);
    console.log(`Label:         ${block.label || '-'}`);
    console.log(`Description:   ${block.description || '-'}`);
    console.log(`Limit:         ${block.limit || 'No limit'} characters`);
    console.log(`Current Size:  ${block.value?.length || 0} characters`);
    console.log(`Created:       ${block.created_at || 'Unknown'}`);

    console.log(`\nAttached Agents (${attachedAgents.length}):`);
    if (attachedAgents.length > 0) {
      for (const agent of attachedAgents) {
        console.log(`  - ${agent.name} (${agent.id})`);
      }
    } else {
      console.log(`  (none - orphaned block)`);
    }

    console.log(`\nValue Preview:`);
    if (block.value) {
      const preview = block.value.length > 500 ? block.value.substring(0, 500) + '...' : block.value;
      console.log(preview);
    } else {
      console.log(`  (empty)`);
    }
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

    console.log(`Tool Details: ${tool.name}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`ID:            ${tool.id}`);
    console.log(`Name:          ${tool.name}`);
    console.log(`Description:   ${tool.description || '-'}`);
    console.log(`Module:        ${tool.module || '-'}`);
    console.log(`Created:       ${tool.created_at || 'Unknown'}`);

    console.log(`\nAttached Agents (${attachedAgents.length}):`);
    if (attachedAgents.length > 0) {
      for (const agent of attachedAgents) {
        console.log(`  - ${agent.name} (${agent.id})`);
      }
    } else {
      console.log(`  (none - orphaned tool)`);
    }

    if (tool.source_code) {
      console.log(`\nSource Code:`);
      const preview = tool.source_code.length > 1000 ? tool.source_code.substring(0, 1000) + '\n...(truncated)' : tool.source_code;
      console.log(preview);
    }
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

    console.log(`Folder Details: ${folder.name}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`ID:            ${folder.id}`);
    console.log(`Name:          ${folder.name}`);
    console.log(`Description:   ${folder.description || '-'}`);
    console.log(`Created:       ${folder.created_at || 'Unknown'}`);

    console.log(`\nAttached Agents (${attachedAgents.length}):`);
    if (attachedAgents.length > 0) {
      for (const agent of attachedAgents) {
        console.log(`  - ${agent.name} (${agent.id})`);
      }
    } else {
      console.log(`  (none - orphaned folder)`);
    }

    console.log(`\nFiles (${fileList.length}):`);
    if (fileList.length > 0) {
      for (const file of fileList) {
        console.log(`  - ${file.name || file.file_name || file.id}`);
      }
    } else {
      console.log(`  (empty folder)`);
    }
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

    console.log(`MCP Server Details: ${s.server_name || s.name}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`ID:            ${s.id}`);
    console.log(`Name:          ${s.server_name || s.name || '-'}`);
    console.log(`Type:          ${s.mcp_server_type || '-'}`);

    if (s.server_url) {
      console.log(`Server URL:    ${s.server_url}`);
    }
    if (s.command) {
      console.log(`Command:       ${s.command}`);
      if (s.args && s.args.length > 0) {
        console.log(`Args:          ${s.args.join(' ')}`);
      }
    }
    if (s.auth_header) {
      console.log(`Auth Header:   ${s.auth_header}`);
    }

    console.log(`\nTools (${tools.length}):`);
    if (tools.length > 0) {
      for (const tool of tools) {
        console.log(`  - ${tool.name || tool.id}`);
        if (tool.description) {
          const truncated = tool.description.length > 80
            ? tool.description.substring(0, 77) + '...'
            : tool.description;
          console.log(`    ${truncated}`);
        }
      }
    } else {
      console.log(`  (no tools registered)`);
    }
  } catch (error) {
    spinner.fail(`Failed to load details for MCP server ${name}`);
    throw error;
  }
}

export default withErrorHandling('Describe command', describeCommandImpl);