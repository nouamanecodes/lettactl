import LettaClient from '@letta-ai/letta-client';
import { sendMessageToAgent, MessageOptions } from '../messaging/message-sender';
import { warn } from '../shared/logger';

export class LettaClientWrapper {
  private client: LettaClient;

  constructor() {
    const config: any = {
      baseURL: process.env.LETTA_BASE_URL!,
    };
    
    // API key is optional for self-hosting
    if (process.env.LETTA_API_KEY) {
      config.apiKey = process.env.LETTA_API_KEY;
    }
    
    this.client = new LettaClient(config);
  }

  async listAgents(options?: { tags?: string[] }) {
    const params: any = {};
    if (options?.tags && options.tags.length > 0) {
      params.tags = options.tags;
      params.match_all_tags = true;
    }
    const result = await this.client.agents.list(params);

    // SDK strips tags from response — fetch raw to get them back
    try {
      const baseUrl = process.env.LETTA_BASE_URL;
      const url = new URL('/v1/agents/', baseUrl);
      if (options?.tags) {
        for (const tag of options.tags) {
          url.searchParams.append('tags', tag);
        }
        url.searchParams.set('match_all_tags', 'true');
      }
      const response = await fetch(url.toString(), { headers: this.getAuthHeaders() });
      if (response.ok) {
        const rawAgents = await response.json() as any[];
        const tagsMap = new Map<string, string[]>();
        for (const a of rawAgents) {
          if (a.id && a.tags) tagsMap.set(a.id, a.tags);
        }
        // Patch tags onto SDK response items
        const items = (result as any).items || (Array.isArray(result) ? result : []);
        for (const agent of items) {
          if (tagsMap.has(agent.id)) {
            agent.tags = tagsMap.get(agent.id);
          }
        }
      }
    } catch {
      // Silently fall back to SDK response (tags will be empty)
    }

    return result;
  }

  async getAgent(agentId: string) {
    const agent = await this.client.agents.retrieve(agentId);

    // SDK strips tags — fetch raw to get them back
    try {
      const baseUrl = process.env.LETTA_BASE_URL;
      const response = await fetch(`${baseUrl}/v1/agents/${agentId}/`, { headers: this.getAuthHeaders() });
      if (response.ok) {
        const raw: any = await response.json();
        if (raw.tags) (agent as any).tags = raw.tags;
      }
    } catch {
      // Fall back to SDK response
    }

    return agent;
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

  async listBlocks(options?: {
    limit?: number;
    connectedAgentsCountEq?: number[];
    connectedAgentsCountGt?: number;
    connectedAgentsCountLt?: number;
  }) {
    const allBlocks: any[] = [];
    const params: any = { limit: options?.limit || 1000 };

    if (options?.connectedAgentsCountEq !== undefined) {
      params.connected_to_agents_count_eq = options.connectedAgentsCountEq;
    }
    if (options?.connectedAgentsCountGt !== undefined) {
      params.connected_to_agents_count_gt = options.connectedAgentsCountGt;
    }
    if (options?.connectedAgentsCountLt !== undefined) {
      params.connected_to_agents_count_lt = options.connectedAgentsCountLt;
    }

    for await (const block of this.client.blocks.list(params)) {
      allBlocks.push(block);
    }
    return allBlocks;
  }

  async listArchives(options?: { limit?: number; agentId?: string; name?: string }) {
    const allArchives: any[] = [];
    const params: any = { limit: options?.limit || 1000 };

    if (options?.agentId) {
      params.agent_id = options.agentId;
    }
    if (options?.name) {
      params.name = options.name;
    }

    for await (const archive of this.client.archives.list(params)) {
      allArchives.push(archive);
    }
    return allArchives;
  }

  async listAgentArchives(agentId: string) {
    return await this.listArchives({ agentId });
  }

  async getArchive(archiveId: string) {
    return await this.client.archives.retrieve(archiveId);
  }

  async createArchive(archiveData: any) {
    return await this.client.archives.create(archiveData);
  }

  async updateArchive(archiveId: string, archiveData: any) {
    return await this.client.archives.update(archiveId, archiveData);
  }

  async deleteArchive(archiveId: string) {
    return await this.client.archives.delete(archiveId);
  }

  async listFolders(options?: { limit?: number }) {
    const allFolders: any[] = [];
    for await (const folder of this.client.folders.list({ limit: options?.limit || 1000 })) {
      allFolders.push(folder);
    }
    return allFolders;
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

  async attachArchiveToAgent(agentId: string, archiveId: string) {
    return await this.client.agents.archives.attach(archiveId, { agent_id: agentId });
  }

  async detachArchiveFromAgent(agentId: string, archiveId: string) {
    return await this.client.agents.archives.detach(archiveId, { agent_id: agentId });
  }

  async listFolderAgents(folderId: string): Promise<string[]> {
    const response = await this.client.folders.agents.list(folderId);
    return Array.isArray(response) ? response : (response as any).agent_ids || [];
  }

  async deleteFolder(folderId: string) {
    return await this.client.folders.delete(folderId);
  }

  async deleteBlock(blockId: string) {
    return await this.client.blocks.delete(blockId);
  }

  async updateBlock(blockId: string, updateData: { value?: string; description?: string; limit?: number }) {
    return await this.client.blocks.update(blockId, updateData);
  }

  async listFolderFiles(folderId: string) {
    const allFiles: any[] = [];
    for await (const file of this.client.folders.files.list(folderId)) {
      allFiles.push(file);
    }
    return allFiles;
  }

  async updateAgent(agentId: string, agentData: any) {
    return await this.client.agents.update(agentId, agentData);
  }

  async listTools(options?: { limit?: number }) {
    const allTools: any[] = [];
    for await (const tool of this.client.tools.list({ limit: options?.limit || 1000 })) {
      allTools.push(tool);
    }
    return allTools;
  }

  async getToolByName(name: string) {
    // Try to fetch tool by name using query parameter if supported by SDK/API
    try {
      // Cast params to any to bypass potential type restrictions if SDK is outdated
      const iterator = this.client.tools.list({ name } as any);
      for await (const tool of iterator) {
        if (tool.name === name) return tool;
      }
    } catch (e) {
      // Fallback: list all and find (though inefficient, it's a safety net)
      // But we already called listTools in the caller, so maybe just return null.
      warn(`Failed to fetch tool by name '${name}':`, (e as Error).message);
    }
    return null;
  }

  async createTool(toolData: any) {
    return await this.client.tools.create(toolData);
  }

  async deleteTool(toolId: string) {
    return await this.client.tools.delete(toolId);
  }

  async exportAgent(agentId: string, options?: { max_steps?: number; use_legacy_format?: boolean }) {
    return await this.client.agents.exportFile(agentId, options);
  }

  async importAgent(fileStream: any, options?: any) {
    return await this.client.agents.importFile({ 
      file: fileStream,
      ...options 
    });
  }

  // Message operations
  async listMessages(agentId: string, options?: any) {
    return await this.client.agents.messages.list(agentId, options);
  }

  async createMessage(agentId: string, params?: any) {
    return await this.client.agents.messages.create(agentId, params);
  }

  async streamMessage(agentId: string, params?: any) {
    return await this.client.agents.messages.stream(agentId, params);
  }

  async createAsyncMessage(agentId: string, params?: any) {
    return await this.client.agents.messages.createAsync(agentId, params);
  }

  async cancelMessages(agentId: string, runIds?: string[]) {
    return await this.client.agents.messages.cancel(agentId, runIds ? { run_ids: runIds } : undefined);
  }

  async resetMessages(agentId: string, addDefaultMessages?: boolean) {
    return await this.client.agents.messages.reset(agentId, { 
      add_default_initial_messages: addDefaultMessages 
    });
  }

  async compactMessages(agentId: string) {
    return await this.client.agents.messages.compact(agentId);
  }

  // === Run Management ===

  async listRuns(options?: { agentId?: string; active?: boolean; limit?: number }) {
    return await this.client.runs.list({
      agent_id: options?.agentId,
      active: options?.active,
      limit: options?.limit
    });
  }

  async getRun(runId: string) {
    return await this.client.runs.retrieve(runId);
  }

  async deleteRun(runId: string) {
    // SDK doesn't expose delete, call API directly
    const baseUrl = process.env.LETTA_BASE_URL;
    const response = await fetch(`${baseUrl}/v1/runs/${runId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`Failed to delete run: ${response.statusText}`);
    }
    return response.json();
  }

  async getRunMessages(runId: string) {
    return await this.client.runs.messages.list(runId);
  }

  async streamRun(runId: string) {
    return await this.client.runs.messages.stream(runId);
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (process.env.LETTA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.LETTA_API_KEY}`;
    }
    return headers;
  }

  // === Granular Agent Update Operations ===
  // These methods enable partial updates that preserve conversation history

  // Tool Management
  async attachToolToAgent(agentId: string, toolId: string) {
    return await this.client.agents.tools.attach(toolId, { agent_id: agentId });
  }

  async detachToolFromAgent(agentId: string, toolId: string) {
    return await this.client.agents.tools.detach(toolId, { agent_id: agentId });
  }

  async listAgentTools(agentId: string) {
    const allTools: any[] = [];
    for await (const tool of this.client.agents.tools.list(agentId)) {
      allTools.push(tool);
    }
    return allTools;
  }

  async updateToolApproval(agentId: string, toolName: string, requiresApproval: boolean) {
    return await this.client.agents.tools.updateApproval(toolName, { 
      agent_id: agentId, 
      body_requires_approval: requiresApproval 
    });
  }

  // Memory Block Management
  async attachBlockToAgent(agentId: string, blockId: string) {
    return await this.client.agents.blocks.attach(blockId, { agent_id: agentId });
  }

  async detachBlockFromAgent(agentId: string, blockId: string) {
    return await this.client.agents.blocks.detach(blockId, { agent_id: agentId });
  }

  async updateAgentBlock(agentId: string, blockLabel: string, updateData: any) {
    return await this.client.agents.blocks.update(blockLabel, { 
      agent_id: agentId, 
      ...updateData 
    });
  }

  async listAgentBlocks(agentId: string) {
    const allBlocks: any[] = [];
    for await (const block of this.client.agents.blocks.list(agentId)) {
      allBlocks.push(block);
    }
    return allBlocks;
  }

  // Folder Management
  async detachFolderFromAgent(agentId: string, folderId: string) {
    return await this.client.agents.folders.detach(folderId, { agent_id: agentId });
  }

  async listAgentFolders(agentId: string) {
    const allFolders: any[] = [];
    for await (const folder of this.client.agents.folders.list(agentId)) {
      allFolders.push(folder);
    }
    return allFolders;
  }

  async closeAllAgentFiles(agentId: string) {
    return await this.client.agents.files.closeAll(agentId);
  }

  // Agent Configuration Updates (all preserve conversation history)
  async updateAgentSystemPrompt(agentId: string, systemPrompt: string) {
    return await this.updateAgent(agentId, { system: systemPrompt });
  }

  async updateAgentModel(agentId: string, model: string) {
    return await this.updateAgent(agentId, { model });
  }

  async updateAgentEmbedding(agentId: string, embedding: string) {
    return await this.updateAgent(agentId, { embedding });
  }

  async updateAgentContextWindow(agentId: string, contextWindowLimit: number) {
    return await this.updateAgent(agentId, { context_window_limit: contextWindowLimit });
  }

  async updateAgentModelSettings(agentId: string, modelSettings: any) {
    return await this.updateAgent(agentId, { model_settings: modelSettings });
  }

  async updateAgentMetadata(agentId: string, updates: {
    name?: string;
    description?: string;
    timezone?: string;
    tags?: string[];
    metadata?: any;
  }) {
    return await this.updateAgent(agentId, updates);
  }

  // === File Management Operations ===
  // These methods enable file add/remove/update operations in folders

  async deleteFileFromFolder(folderId: string, fileId: string) {
    return await this.client.folders.files.delete(fileId, { folder_id: folderId });
  }

  async getFileIdByName(folderId: string, fileName: string): Promise<string | null> {
    const files = await this.listFolderFiles(folderId);
    const fileList = Array.isArray(files) ? files : (files as any).items || [];
    
    for (const file of fileList) {
      if (file.name === fileName || file.file_name === fileName) {
        return file.id;
      }
    }
    return null;
  }

  async uploadFileToExistingFolder(folderId: string, filePath: string, fileName: string, fileContent: Buffer | string) {
    if (typeof fileContent === 'string') {
      // Create a buffer from string content
      const buffer = Buffer.from(fileContent, 'utf8');
      // Create a readable stream from buffer
      const { Readable } = require('stream');
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);
      
      return await this.uploadFileToFolder(stream, folderId, fileName);
    } else {
      // Create stream from buffer
      const { Readable } = require('stream');
      const stream = new Readable();
      stream.push(fileContent);
      stream.push(null);
      
      return await this.uploadFileToFolder(stream, folderId, fileName);
    }
  }

  // Convenient wrapper using the modular message sender
  async sendMessage(agentId: string, message: string, options?: MessageOptions) {
    return await sendMessageToAgent(this, agentId, message, options);
  }

  // === MCP Server Operations ===

  async listMcpServers() {
    return await this.client.mcpServers.list();
  }

  async getMcpServer(mcpServerId: string) {
    return await this.client.mcpServers.retrieve(mcpServerId);
  }

  async createMcpServer(serverData: any) {
    return await this.client.mcpServers.create(serverData);
  }

  async updateMcpServer(mcpServerId: string, serverData: any) {
    return await this.client.mcpServers.update(mcpServerId, serverData);
  }

  async deleteMcpServer(mcpServerId: string) {
    return await this.client.mcpServers.delete(mcpServerId);
  }

  async refreshMcpServer(mcpServerId: string) {
    return await this.client.mcpServers.refresh(mcpServerId);
  }

  async listMcpServerTools(mcpServerId: string) {
    return await this.client.mcpServers.tools.list(mcpServerId);
  }

  async listAgentArchival(agentId: string, limit?: number) {
    return await this.client.agents.passages.list(agentId, { limit: limit || 100, ascending: false });
  }

  async searchAgentArchival(agentId: string, query: string, limit?: number) {
    return await this.client.agents.passages.search(agentId, { query, top_k: limit || 50 });
  }
}
