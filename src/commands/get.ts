import { LettaClientWrapper } from '../lib/letta-client';
import Table from 'cli-table3';

export async function getCommand(resource: string, name?: string, options?: { output: string }) {
  if (resource !== 'agents') {
    console.error('Error: Only "agents" resource is currently supported');
    process.exit(1);
  }

  try {
    const client = new LettaClientWrapper();
    
    if (name) {
      // Get specific agent
      console.log(`Getting agent: ${name}`);
      // TODO: Find agent by name and show details
    } else {
      // List all agents
      const agents = await client.listAgents();
      
      if (options?.output === 'json') {
        console.log(JSON.stringify(agents, null, 2));
        return;
      }

      if (options?.output === 'yaml') {
        // TODO: Convert to YAML output
        console.log('YAML output not yet implemented');
        return;
      }

      // Default table output
      const table = new Table({
        head: ['NAME', 'ID'],
        colWidths: [30, 50]
      });

      // Handle different SDK response formats
      const agentList = Array.isArray(agents) ? agents : ((agents as any).items || (agents as any).body || []);
      
      for (const agent of agentList) {
        table.push([
          agent.name || 'Unknown',
          agent.id || 'Unknown'
        ]);
      }

      console.log(table.toString());
    }
    
  } catch (error) {
    console.error('Get command failed:', error);
    process.exit(1);
  }
}