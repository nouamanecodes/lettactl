import { LettaClientWrapper } from './letta-client';
import { normalizeResponse } from '../shared/response-normalizer';
import { warn } from '../shared/logger';

export class AgentResolver {
  private client: LettaClientWrapper;

  constructor(client: LettaClientWrapper) {
    this.client = client;
  }

  async findAgentByName(name: string): Promise<{ agent: any; allAgents: any[] }> {
    const agents = await this.client.listAgents();
    const agentList = normalizeResponse(agents);
    const agent = agentList.find((a: any) => a.name === name);
    
    if (!agent) {
      throw new Error(`Agent "${name}" not found`);
    }
    
    return { agent, allAgents: agentList };
  }

  async getAllAgents(): Promise<any[]> {
    const agents = await this.client.listAgents();
    return normalizeResponse(agents);
  }

  async getAgentWithDetails(agentId: string): Promise<any> {
    // Get basic agent info
    const agent = await this.client.getAgent(agentId);
    const agentWithDetails = agent as any;
    
    // Use embedded tools/blocks from agent object (more reliable than paginated list endpoints)
    agentWithDetails.tools = agentWithDetails.tools || [];
    agentWithDetails.blocks = agentWithDetails.blocks || [];

    // Fetch attached folders
    try {
      const folders = await this.client.listAgentFolders(agentId);
      agentWithDetails.folders = folders;
    } catch (error) {
      warn(`Warning: Could not fetch folders for agent ${agentId}`);
      agentWithDetails.folders = [];
    }

    // Fetch attached archives
    try {
      const archives = await this.client.listAgentArchives(agentId);
      agentWithDetails.archives = normalizeResponse(archives);
    } catch (error) {
      warn(`Warning: Could not fetch archives for agent ${agentId}`);
      agentWithDetails.archives = [];
    }

    return agentWithDetails;
  }
}
