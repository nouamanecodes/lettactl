import { LettaClientWrapper } from './letta-client';
import { normalizeResponse } from './response-normalizer';
import { warn } from './logger';

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
    
    // Fetch attached tools
    try {
      const tools = await this.client.listAgentTools(agentId);
      agentWithDetails.tools = Array.isArray(tools) ? tools : (tools?.items || []);
    } catch (error) {
      warn(`Warning: Could not fetch tools for agent ${agentId}`);
      agentWithDetails.tools = [];
    }
    
    // Fetch attached memory blocks
    try {
      const blocks = await this.client.listAgentBlocks(agentId);
      agentWithDetails.blocks = Array.isArray(blocks) ? blocks : (blocks?.items || []);
    } catch (error) {
      warn(`Warning: Could not fetch blocks for agent ${agentId}`);
      agentWithDetails.blocks = [];
    }
    
    // Fetch attached folders
    try {
      const folders = await this.client.listAgentFolders(agentId);
      agentWithDetails.folders = Array.isArray(folders) ? folders : (folders?.items || []);
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
