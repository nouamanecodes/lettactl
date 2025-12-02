import { LettaClientWrapper } from '../lib/letta-client';

export async function deleteCommand(resource: string, name: string, options?: { force?: boolean }) {
  if (resource !== 'agent' && resource !== 'agents') {
    console.error('Error: Only "agent/agents" resource is currently supported');
    process.exit(1);
  }

  if (!name) {
    console.error('Error: Agent name is required');
    console.error('Usage: lettactl delete agent <name>');
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
    
    if (!options?.force) {
      console.log(`This will permanently delete agent: ${name} (${agent.id})`);
      console.log('Use --force to confirm deletion');
      process.exit(1);
    }
    
    console.log(`Deleting agent: ${name}...`);
    
    // Get agent details to find attached folders and blocks
    const agentDetails = await client.getAgent(agent.id);
    
    // Delete attached folders if they're not shared
    const folders = (agentDetails as any).folders;
    if (folders) {
      console.log(`Checking attached folders...`);
      for (const folder of folders) {
        // Check if this folder is attached to other agents
        const otherAgents = agentList.filter((a: any) => a.id !== agent.id);
        let folderShared = false;
        
        for (const otherAgent of otherAgents) {
          try {
            const otherDetails = await client.getAgent(otherAgent.id);
            const otherFolders = (otherDetails as any).folders;
            if (otherFolders && otherFolders.find((f: any) => f.id === folder.id)) {
              folderShared = true;
              break;
            }
          } catch (error) {
            // Continue if we can't get other agent details
          }
        }
        
        // Only delete agent-specific folders, never shared ones
        const isSharedFolder = folder.name?.includes('shared') || 
                              folder.name?.includes('creative_direction_docs') ||
                              folder.name?.includes('ada_strategy_docs');
        
        if (isSharedFolder) {
          console.log(`Keeping shared folder: ${folder.name || folder.id}`);
        } else if (!folderShared) {
          console.log(`Deleting agent-specific folder: ${folder.name || folder.id}`);
          try {
            await client.deleteFolder(folder.id);
            console.log(`Folder deleted`);
          } catch (error: any) {
            console.warn(`Could not delete folder: ${error.message}`);
          }
        } else {
          console.log(`Keeping folder used by other agents: ${folder.name || folder.id}`);
        }
      }
    }
    
    // Delete the agent
    await client.deleteAgent(agent.id);
    console.log(`Agent ${name} deleted successfully`);
    
    // Clean up orphaned memory blocks
    console.log(`Cleaning up memory blocks...`);
    try {
      const blocks = await client.listBlocks();
      const blockList = Array.isArray(blocks) ? blocks : ((blocks as any).items || []);
      
      // Only check agent-specific blocks, never shared ones
      const agentSpecificBlocks = blockList.filter((block: any) => {
        if (!block.label) return false;
        
        // Never delete shared blocks
        if (block.label.startsWith('shared_')) return false;
        
        // Look for blocks that contain the agent name or brand
        const brandName = name.replace('draper-', '').replace('ada-', '');
        return block.label.includes(brandName) || 
               block.label.includes('_' + name) ||
               block.label.includes(name + '_');
      });
      
      for (const block of agentSpecificBlocks) {
        // Check if this block is still attached to any remaining agents
        let blockInUse = false;
        for (const otherAgent of agentList.filter((a: any) => a.id !== agent.id)) {
          try {
            const otherDetails = await client.getAgent(otherAgent.id);
            if (otherDetails.blocks && otherDetails.blocks.find((b: any) => b.id === block.id)) {
              blockInUse = true;
              break;
            }
          } catch (error) {
            // Continue
          }
        }
        
        if (!blockInUse) {
          console.log(`Deleting orphaned block: ${block.label}`);
          try {
            await client.deleteBlock(block.id);
            console.log(`Block deleted`);
          } catch (error: any) {
            console.warn(`Could not delete block: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      console.warn(`Could not clean up blocks: ${error.message}`);
    }
    
    console.log(`Agent ${name} and associated resources deleted successfully`);
    
  } catch (error: any) {
    console.error('Delete command failed:', error.message);
    process.exit(1);
  }
}