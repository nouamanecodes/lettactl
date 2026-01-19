import { LettaClientWrapper } from './letta-client';
import { normalizeResponse } from './response-normalizer';
import { generateContentHash } from '../utils/hash-utils';
import { log } from './logger';

export interface BlockInfo {
  id: string;
  label: string;
  description: string;
  value: string;
  limit: number;
  contentHash: string;
  isShared: boolean;
}

export class BlockManager {
  private client: LettaClientWrapper;
  private blockRegistry = new Map<string, BlockInfo>();

  constructor(client: LettaClientWrapper) {
    this.client = client;
  }

  /**
   * Loads existing blocks from the server and builds the registry
   */
  async loadExistingBlocks(): Promise<void> {
    const blocks = await this.client.listBlocks();
    const blockList = normalizeResponse(blocks);

    for (const block of blockList) {
      if (block.label && block.value) {
        const contentHash = generateContentHash(block.value);
        const isShared = block.label.startsWith('shared_');

        const blockInfo: BlockInfo = {
          id: block.id,
          label: block.label,
          description: block.description || '',
          value: block.value,
          limit: block.limit || 0,
          contentHash,
          isShared
        };

        this.blockRegistry.set(this.getBlockKey(block.label, isShared), blockInfo);
      }
    }
  }

  /**
   * Gets the registry key for a block
   * Agent-specific blocks include agent name to prevent cross-agent collisions
   */
  private getBlockKey(label: string, isShared: boolean, agentName?: string): string {
    if (isShared) return `shared:${label}`;
    return agentName ? `${agentName}:${label}` : label;
  }

  /**
   * Gets or creates a shared block, updating in-place if content changed
   */
  async getOrCreateSharedBlock(blockConfig: any): Promise<string> {
    const blockKey = this.getBlockKey(blockConfig.name, true);
    const contentHash = generateContentHash(blockConfig.value);

    // Check both shared and non-shared keys
    let existing = this.blockRegistry.get(blockKey);
    if (!existing) {
      existing = this.blockRegistry.get(this.getBlockKey(blockConfig.name, false));
    }

    if (existing) {
      if (existing.contentHash === contentHash) {
        log(`Using existing shared block: ${existing.label}`);
        return existing.id;
      }

      // Content changed - update in-place
      log(`Updating shared block: ${existing.label}`);
      await this.client.updateBlock(existing.id, {
        value: blockConfig.value,
        description: blockConfig.description,
        limit: blockConfig.limit
      });

      // Update registry
      existing.value = blockConfig.value;
      existing.contentHash = contentHash;
      existing.description = blockConfig.description;
      existing.limit = blockConfig.limit;

      return existing.id;
    }

    // Create new block
    log(`Creating new shared block: ${blockConfig.name}`);
    const newBlock = await this.client.createBlock({
      label: blockConfig.name,
      description: blockConfig.description,
      value: blockConfig.value,
      limit: blockConfig.limit
    });

    const blockInfo: BlockInfo = {
      id: newBlock.id,
      label: blockConfig.name,
      description: blockConfig.description,
      value: blockConfig.value,
      limit: blockConfig.limit,
      contentHash,
      isShared: true
    };

    this.blockRegistry.set(blockKey, blockInfo);
    return newBlock.id;
  }

  /**
   * Gets or creates an agent-specific block, updating in-place if content changed
   */
  async getOrCreateAgentBlock(blockConfig: any, agentName: string): Promise<string> {
    const blockKey = this.getBlockKey(blockConfig.name, false, agentName);
    const contentHash = generateContentHash(blockConfig.value);
    const existing = this.blockRegistry.get(blockKey);

    if (existing) {
      if (existing.contentHash === contentHash) {
        log(`Using existing block: ${existing.label}`);
        return existing.id;
      }

      // Content changed - update in-place
      log(`Updating block: ${existing.label}`);
      await this.client.updateBlock(existing.id, {
        value: blockConfig.value,
        description: blockConfig.description,
        limit: blockConfig.limit
      });

      // Update registry
      existing.value = blockConfig.value;
      existing.contentHash = contentHash;
      existing.description = blockConfig.description;
      existing.limit = blockConfig.limit;

      return existing.id;
    }

    // Create new block
    log(`Creating new block: ${blockConfig.name}`);
    const newBlock = await this.client.createBlock({
      label: blockConfig.name,
      description: blockConfig.description,
      value: blockConfig.value,
      limit: blockConfig.limit
    });

    const blockInfo: BlockInfo = {
      id: newBlock.id,
      label: blockConfig.name,
      description: blockConfig.description,
      value: blockConfig.value,
      limit: blockConfig.limit,
      contentHash,
      isShared: false
    };

    this.blockRegistry.set(blockKey, blockInfo);
    return newBlock.id;
  }

  /**
   * Gets the shared block ID by name
   */
  getSharedBlockId(blockName: string): string | null {
    let existing = this.blockRegistry.get(this.getBlockKey(blockName, true));
    if (!existing) {
      existing = this.blockRegistry.get(this.getBlockKey(blockName, false));
    }
    return existing ? existing.id : null;
  }

  /**
   * Gets agent block ID by name if it exists
   */
  getAgentBlockId(blockName: string, agentName?: string): string | null {
    const key = this.getBlockKey(blockName, false, agentName);
    const existing = this.blockRegistry.get(key);
    return existing ? existing.id : null;
  }

  /**
   * Lists all blocks for debugging/reporting
   */
  getBlockRegistry(): Map<string, BlockInfo> {
    return new Map(this.blockRegistry);
  }
}
