import LettaClient from '@letta-ai/letta-client';

export class LettaClientWrapper {
  private client: LettaClient;

  constructor() {
    const config: any = {
      baseURL: process.env.LETTA_API_URL!,
    };
    
    // API key is optional for self-hosting
    if (process.env.LETTA_API_KEY) {
      config.apiKey = process.env.LETTA_API_KEY;
    }
    
    this.client = new LettaClient(config);
  }

  async listAgents() {
    return await this.client.agents.list();
  }

  async getAgent(agentId: string) {
    return await this.client.agents.retrieve(agentId);
  }

  async createAgent(agentData: any) {
    return await this.client.agents.create(agentData);
  }

  async deleteAgent(agentId: string) {
    return await this.client.agents.delete(agentId);
  }

  async getAgentMessages(agentId: string, limit?: number) {
    return await this.client.agents.messages.list(agentId, { limit });
  }

  async createBlock(blockData: any) {
    return await this.client.blocks.create(blockData);
  }

  async listBlocks() {
    return await this.client.blocks.list();
  }

  async listFolders() {
    return await this.client.folders.list();
  }

  async createFolder(folderData: any) {
    return await this.client.folders.create(folderData);
  }

  async uploadFileToFolder(fileStream: any, folderId: string, fileName: string) {
    return await this.client.folders.files.upload(folderId, {
      file: fileStream,
      name: fileName
    });
  }

  async attachFolderToAgent(agentId: string, folderId: string) {
    return await this.client.agents.folders.attach(folderId, {
      agent_id: agentId
    });
  }

  async deleteFolder(folderId: string) {
    return await this.client.folders.delete(folderId);
  }

  async deleteBlock(blockId: string) {
    return await this.client.blocks.delete(blockId);
  }

  async listFolderFiles(folderId: string) {
    return await this.client.folders.files.list(folderId);
  }

  async updateAgent(agentId: string, agentData: any) {
    return await this.client.agents.update(agentId, agentData);
  }

  async listTools() {
    return await this.client.tools.list();
  }

  async createTool(toolData: any) {
    return await this.client.tools.create(toolData);
  }

  async deleteTool(toolId: string) {
    return await this.client.tools.delete(toolId);
  }
}