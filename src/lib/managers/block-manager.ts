import { LettaClientWrapper } from '../client/letta-client';
import { normalizeResponse } from '../shared/response-normalizer';
import { generateContentHash } from '../../utils/hash-utils';
import { log } from '../shared/logger';

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
   * Loads existing blocks from the server and builds the registry.
   * When desiredNames is provided, only blocks matching those names are registered,
   * preventing cross-tenant contamination via unscoped global lookups.
   */
  async loadExistingBlocks(desiredNames?: Set<string>): Promise<void> {
    const blocks = await this.client.listBlocks();
    const blockList = normalizeResponse(blocks);

    for (const block of blockList) {
      if (block.label && block.value) {
        // Skip blocks not in the current fleet config to prevent cross-tenant contamination
        if (desiredNames && !desiredNames.has(block.label)) {
          continue;
        }

        const contentHash = generateContentHash(block.value);

        const blockInfo: BlockInfo = {
          id: block.id,
          label: block.label,
          description: block.description || '',
          value: block.value,
          limit: block.limit || 0,
          contentHash,
          isShared: false
        };

        // Store under plain label and shared key so pre-existing shared blocks
        // are discoverable without a dangerous plain-label fallback
        this.blockRegistry.set(block.label, blockInfo);
        this.blockRegistry.set(`shared:${block.label}`, blockInfo);
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
    const sharedKey = this.getBlockKey(blockConfig.name, true);
    const contentHash = generateContentHash(blockConfig.value);

    // Only check the shared key — never fall back to plain label
    const existing = this.blockRegistry.get(sharedKey);

    if (existing) {
      // For agent_owned: false shared blocks, sync value/limit/description from YAML
      if (blockConfig.agent_owned === false) {
        const valueChanged = blockConfig.value !== existing.value;
        const limitChanged = blockConfig.limit != null && blockConfig.limit !== existing.limit;
        const descriptionChanged = blockConfig.description != null && blockConfig.description !== existing.description;

        if (valueChanged || limitChanged || descriptionChanged) {
          log(`Syncing shared block: ${existing.label}`);
          // Update limit first if increasing (avoids value-exceeds-limit errors)
          if (limitChanged && blockConfig.limit > (existing.limit || 0)) {
            await this.client.updateBlock(existing.id, { limit: blockConfig.limit });
          }
          const updateData: { value?: string; description?: string; limit?: number } = {};
          if (valueChanged) updateData.value = blockConfig.value;
          if (descriptionChanged) updateData.description = blockConfig.description;
          if (limitChanged) updateData.limit = blockConfig.limit;
          if (Object.keys(updateData).length > 0) {
            await this.client.updateBlock(existing.id, updateData);
          }
          existing.value = blockConfig.value;
          existing.contentHash = contentHash;
          existing.description = blockConfig.description || existing.description;
          existing.limit = blockConfig.limit || existing.limit;
        } else {
          log(`Shared block unchanged: ${existing.label}`);
        }
      } else {
        log(`Using existing shared block: ${existing.label}`);
      }
      existing.isShared = true;
      this.blockRegistry.set(sharedKey, existing);
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

    this.blockRegistry.set(sharedKey, blockInfo);
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
    const existing = this.blockRegistry.get(this.getBlockKey(blockName, true));
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
