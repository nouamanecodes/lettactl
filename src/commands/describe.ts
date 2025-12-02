import { LettaClientWrapper } from '../lib/letta-client';

export async function describeCommand(resource: string, name: string, options?: { output?: string }) {
  if (resource !== 'agent' && resource !== 'agents') {
    console.error('Error: Only "agent/agents" resource is currently supported');
    process.exit(1);
  }

  if (!name) {
    console.error('Error: Agent name is required');
    console.error('Usage: lettactl describe agent <name>');
    process.exit(1);
  }

  try {
    const client = new LettaClientWrapper();
    
    // Find agent by name
    const agents = await client.listAgents();
    const agentList = Array.isArray(agents) ? agents : ((agents as any).items || (agents as any).body || []);
    const agent = agentList.find((a: any) => a.name === name);
    
    if (!agent) {
      console.error(`Error: Agent "${name}" not found`);
      process.exit(1);
    }
    
    // Get full agent details
    const agentDetails = await client.getAgent(agent.id);
    
    if (options?.output === 'json') {
      console.log(JSON.stringify(agentDetails, null, 2));
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
          console.log(`    ${tool.description}`);
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
          const files = await client.listFolderFiles(folder.id);
          const fileList = Array.isArray(files) ? files : ((files as any).items || []);
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
      const messages = await client.getAgentMessages(agentDetails.id, 5);
      const messageList = Array.isArray(messages) ? messages : ((messages as any).items || []);
      
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
    
  } catch (error: any) {
    console.error('Describe command failed:', error.message);
    process.exit(1);
  }
}