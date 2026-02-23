import { BlockManager } from '../../../src/lib/managers/block-manager';
import { LettaClientWrapper } from '../../../src/lib/client/letta-client';
import { generateContentHash } from '../../../src/utils/hash-utils';

jest.mock('../../../src/lib/client/letta-client');

describe('BlockManager', () => {
  let manager: BlockManager;
  let mockClient: jest.Mocked<LettaClientWrapper>;

  beforeEach(() => {
    mockClient = new (LettaClientWrapper as any)();
    manager = new BlockManager(mockClient);
  });

  describe('hashing', () => {
    const hash = (content: string) => generateContentHash(content);

    it('is deterministic and unique', () => {
      expect(hash('a')).toBe(hash('a'));
      expect(hash('a')).not.toBe(hash('b'));
    });
  });

  describe('getBlockKey', () => {
    const key = (name: string, shared: boolean) => (manager as any).getBlockKey(name, shared);

    it('handles shared prefix', () => {
      expect(key('block', true)).toBe('shared:block');
      expect(key('block', false)).toBe('block');
    });
  });

  describe('getOrCreateSharedBlock', () => {
    it('creates block with correct params', async () => {
      mockClient.listBlocks.mockResolvedValue([] as any);
      mockClient.createBlock.mockResolvedValue({ id: 'id-1' } as any);
      await manager.loadExistingBlocks();

      await manager.getOrCreateSharedBlock({ name: 'test', description: 'desc', limit: 1000, value: 'val' });

      expect(mockClient.createBlock).toHaveBeenCalledWith({
        label: 'test', description: 'desc', value: 'val', limit: 1000
      });
    });

    it('never updates shared blocks even with agent_owned false', async () => {
      mockClient.listBlocks.mockResolvedValue([
        { id: 'id-1', label: 'test', value: 'old-val', description: 'desc', limit: 1000 }
      ] as any);
      await manager.loadExistingBlocks();

      const result = await manager.getOrCreateSharedBlock({ name: 'test', description: 'new-desc', limit: 2000, value: 'new-val', agent_owned: false });

      expect(result).toBe('id-1');
      expect(mockClient.updateBlock).not.toHaveBeenCalled();
    });

    it('returns existing block when agent_owned is true even if content changes', async () => {
      mockClient.listBlocks.mockResolvedValue([
        { id: 'id-1', label: 'test', value: 'old-val', description: 'desc', limit: 1000 }
      ] as any);
      await manager.loadExistingBlocks();

      const result = await manager.getOrCreateSharedBlock({ name: 'test', description: 'new-desc', limit: 2000, value: 'new-val', agent_owned: true });

      expect(result).toBe('id-1');
      expect(mockClient.updateBlock).not.toHaveBeenCalled();
    });

    it('does not reuse a plain-label block from a different context', async () => {
      // Simulate a block that exists only under a plain label (e.g. loaded by
      // another tenant). Manually set it so it's NOT under the shared: key.
      (manager as any).blockRegistry.set('brand_identity', {
        id: 'other-tenant-block',
        label: 'brand_identity',
        description: 'other tenant',
        value: 'other',
        limit: 1000,
        contentHash: 'abc',
        isShared: false
      });

      mockClient.createBlock.mockResolvedValue({ id: 'new-block-id' } as any);

      const result = await manager.getOrCreateSharedBlock({
        name: 'brand_identity',
        description: 'my tenant',
        value: 'mine',
        limit: 2000
      });

      // Should create a new block, NOT reuse the plain-label one
      expect(result).toBe('new-block-id');
      expect(mockClient.createBlock).toHaveBeenCalledWith({
        label: 'brand_identity',
        description: 'my tenant',
        value: 'mine',
        limit: 2000
      });
    });

    it('returns existing block when content unchanged', async () => {
      mockClient.listBlocks.mockResolvedValue([
        { id: 'id-1', label: 'test', value: 'same-val', description: 'desc', limit: 1000 }
      ] as any);
      await manager.loadExistingBlocks();

      const result = await manager.getOrCreateSharedBlock({ name: 'test', description: 'desc', limit: 1000, value: 'same-val' });

      expect(result).toBe('id-1');
      expect(mockClient.createBlock).not.toHaveBeenCalled();
      expect(mockClient.updateBlock).not.toHaveBeenCalled();
    });
  });

  describe('getSharedBlockId', () => {
    it('returns null when block only exists under plain label', async () => {
      // Manually register a block under plain label only (no shared: prefix)
      (manager as any).blockRegistry.set('brand_identity', {
        id: 'plain-block-id',
        label: 'brand_identity',
        description: 'desc',
        value: 'val',
        limit: 1000,
        contentHash: 'abc',
        isShared: false
      });

      expect(manager.getSharedBlockId('brand_identity')).toBeNull();
    });

    it('returns id when block exists under shared key', async () => {
      mockClient.listBlocks.mockResolvedValue([
        { id: 'shared-block-id', label: 'brand_identity', value: 'val', description: 'desc', limit: 1000 }
      ] as any);
      await manager.loadExistingBlocks();

      expect(manager.getSharedBlockId('brand_identity')).toBe('shared-block-id');
    });
  });
});
