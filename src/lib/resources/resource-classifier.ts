import { LettaClientWrapper } from '../client/letta-client';
import { normalizeResponse } from '../shared/response-normalizer';

export class ResourceClassifier {
  private client: LettaClientWrapper;

  constructor(client: LettaClientWrapper) {
    this.client = client;
  }

  /**
   * Determines if a folder is shared based on naming conventions
   */
  isSharedFolder(folder: any): boolean {
    if (!folder.name) return false;
    
    return folder.name.includes('shared');
  }

  /**
   * Determines if a memory block is shared based on connected agent count
   */
  isSharedBlock(block: any): boolean {
    if (!block.label) return false;

    // Use agent count if available (from server-side filtering)
    if (block.agentCount !== undefined) return block.agentCount > 1;

    return false;
  }

  /**
   * Checks if a folder is used by other agents
   */
  async isFolderUsedByOtherAgents(folderId: string, excludeAgentId: string, allAgents: any[]): Promise<boolean> {
    const otherAgents = allAgents.filter((a: any) => a.id !== excludeAgentId);
    
    for (const otherAgent of otherAgents) {
      try {
        const otherDetails = await this.client.getAgent(otherAgent.id);
        const otherFolders = (otherDetails as any).folders;
        
        if (otherFolders && otherFolders.find((f: any) => f.id === folderId)) {
          return true;
        }
      } catch (error) {
        // Continue if we can't get agent details
        continue;
      }
    }
    
    return false;
  }

  /**
   * Checks if a memory block is used by other agents
   */
  async isBlockUsedByOtherAgents(blockId: string, excludeAgentId: string, allAgents: any[]): Promise<boolean> {
    const otherAgents = allAgents.filter((a: any) => a.id !== excludeAgentId);
    
    for (const otherAgent of otherAgents) {
      try {
        const otherDetails = await this.client.getAgent(otherAgent.id);
        
        if (otherDetails.blocks && otherDetails.blocks.find((b: any) => b.id === blockId)) {
          return true;
        }
      } catch (error) {
        // Continue if we can't get agent details
        continue;
      }
    }
    
    return false;
  }

  /**
   * Checks if an archive is used by other agents
   */
  async isArchiveUsedByOtherAgents(archiveId: string, excludeAgentId: string, allAgents: any[]): Promise<boolean> {
    const otherAgents = allAgents.filter((a: any) => a.id !== excludeAgentId);

    for (const otherAgent of otherAgents) {
      try {
        const archives = await this.client.listAgentArchives(otherAgent.id);
        if (archives && archives.find((a: any) => a.id === archiveId)) {
          return true;
        }
      } catch (error) {
        continue;
      }
    }

    return false;
  }

  /**
   * Identifies agent-specific blocks based on naming patterns
   * Uses simple heuristic: blocks containing the agent name (excluding shared blocks)
   */
  getAgentSpecificBlocks(allBlocks: any[], agentName: string): any[] {
    const blockList = normalizeResponse(allBlocks);

    return blockList.filter((block: any) => {
      if (!block.label) return false;

      // Never delete shared blocks (connected to multiple agents)
      if (this.isSharedBlock(block)) return false;

      // Look for blocks that contain the agent name
      return block.label.includes(agentName) ||
             block.label.includes('_' + agentName) ||
             block.label.includes(agentName + '_');
    });
  }
}
