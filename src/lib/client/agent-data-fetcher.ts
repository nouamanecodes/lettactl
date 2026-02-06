import { LettaClientWrapper } from './letta-client';
import { normalizeResponse } from '../shared/response-normalizer';

/**
 * Standardized agent data structure for display
 * This is the canonical format used throughout the CLI
 */
export interface AgentDisplayData {
  id: string;
  name: string;
  description?: string;
  model: string;
  blockCount: number;
  toolCount: number;
  folderCount: number;
  mcpServerCount: number;
  fileCount: number;
  created: string;
  // Raw data for JSON output
  raw?: any;
}

/**
 * Detail level for agent data fetching
 * - 'minimal': Just basic agent info from list API (fast, but counts are 0)
 * - 'standard': Fetches tools and blocks counts (default for list view)
 * - 'full': Fetches everything including folders, files, MCP servers (for wide view)
 */
export type DetailLevel = 'minimal' | 'standard' | 'full';

/**
 * Centralized agent data fetcher
 * Ensures consistent data gathering across all commands
 */
export class AgentDataFetcher {
  constructor(private client: LettaClientWrapper) {}

  /**
   * Fetch all agents with specified detail level
   */
  async fetchAllAgents(detailLevel: DetailLevel = 'standard', options?: { tags?: string[] }): Promise<AgentDisplayData[]> {
    const agents = await this.client.listAgents(options);
    const agentList = normalizeResponse(agents);

    if (detailLevel === 'minimal') {
      return agentList.map((agent: any) => this.transformMinimal(agent));
    }

    // Fetch details for each agent in parallel
    const detailedAgents = await Promise.all(
      agentList.map((agent: any) => this.fetchAgentDetails(agent.id, detailLevel))
    );

    return detailedAgents;
  }

  /**
   * Fetch single agent with specified detail level
   */
  async fetchAgentDetails(agentId: string, detailLevel: DetailLevel = 'standard'): Promise<AgentDisplayData> {
    const agent = await this.client.getAgent(agentId);

    if (detailLevel === 'minimal') {
      return this.transformMinimal(agent);
    }

    // Fetch tools and blocks in parallel
    const [tools, blocks] = await Promise.all([
      this.safeListAgentTools(agentId),
      this.safeListAgentBlocks(agentId),
    ]);

    let folders: any[] = [];
    let fileCount = 0;
    let mcpServers: any[] = [];

    if (detailLevel === 'full') {
      // Fetch folders, files, and MCP servers
      [folders, mcpServers] = await Promise.all([
        this.safeListAgentFolders(agentId),
        this.safeGetMcpServers(agent),
      ]);

      // Fetch file counts for all folders in parallel
      if (folders.length > 0) {
        const fileCounts = await Promise.all(
          folders.map((folder: any) => this.safeFetchFolderFileCount(folder.id))
        );
        fileCount = fileCounts.reduce((sum, count) => sum + count, 0);
      }
    }

    return this.transformFull(agent, {
      tools,
      blocks,
      folders,
      mcpServers,
      fileCount,
      detailLevel,
    });
  }

  /**
   * Transform minimal agent data (from list API)
   */
  private transformMinimal(agent: any): AgentDisplayData {
    return {
      id: agent.id || 'Unknown',
      name: agent.name || 'Unknown',
      description: agent.description,
      model: agent.llm_config?.model || agent.model || '-',
      blockCount: 0, // Not available in list response
      toolCount: 0, // Not available in list response
      folderCount: 0,
      mcpServerCount: 0,
      fileCount: 0,
      created: agent.created_at || '',
      raw: agent,
    };
  }

  /**
   * Transform full agent data with all details
   */
  private transformFull(
    agent: any,
    details: {
      tools: any[];
      blocks: any[];
      folders: any[];
      mcpServers: any[];
      fileCount: number;
      detailLevel: DetailLevel;
    }
  ): AgentDisplayData {
    return {
      id: agent.id || 'Unknown',
      name: agent.name || 'Unknown',
      description: agent.description,
      model: agent.llm_config?.model || agent.model || '-',
      blockCount: details.blocks.length,
      toolCount: details.tools.length,
      folderCount: details.detailLevel === 'full' ? details.folders.length : 0,
      mcpServerCount: details.detailLevel === 'full' ? details.mcpServers.length : 0,
      fileCount: details.detailLevel === 'full' ? details.fileCount : 0,
      created: agent.created_at || '',
      raw: {
        ...agent,
        tools: details.tools,
        blocks: details.blocks,
        folders: details.folders,
        mcp_servers: details.mcpServers,
        file_count: details.fileCount,
      },
    };
  }

  // Safe fetchers that return empty arrays on error
  private async safeListAgentTools(agentId: string): Promise<any[]> {
    try {
      const tools = await this.client.listAgentTools(agentId);
      return Array.isArray(tools) ? tools : ((tools as any)?.items || []);
    } catch {
      return [];
    }
  }

  private async safeListAgentBlocks(agentId: string): Promise<any[]> {
    try {
      const blocks = await this.client.listAgentBlocks(agentId);
      return Array.isArray(blocks) ? blocks : ((blocks as any)?.items || []);
    } catch {
      return [];
    }
  }

  private async safeListAgentFolders(agentId: string): Promise<any[]> {
    try {
      const folders = await this.client.listAgentFolders(agentId);
      return Array.isArray(folders) ? folders : ((folders as any)?.items || []);
    } catch {
      return [];
    }
  }

  private async safeGetMcpServers(agent: any): Promise<any[]> {
    // MCP servers come from the agent object directly
    return agent.mcp_servers || [];
  }

  private async safeFetchFolderFileCount(folderId: string): Promise<number> {
    try {
      const files = await this.client.listFolderFiles(folderId);
      const fileList = Array.isArray(files) ? files : ((files as any)?.items || []);
      return fileList.length;
    } catch {
      return 0;
    }
  }
}
