import { BlockManager } from '../../../src/lib/block-manager';
import { LettaClientWrapper } from '../../../src/lib/letta-client';
import { generateContentHash } from '../../../src/utils/hash-utils';

jest.mock('../../../src/lib/letta-client');

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

    it('updates existing block when content changes', async () => {
      mockClient.listBlocks.mockResolvedValue([
        { id: 'id-1', label: 'test', value: 'old-val', description: 'desc', limit: 1000 }
      ] as any);
      mockClient.updateBlock.mockResolvedValue({ id: 'id-1' } as any);
      await manager.loadExistingBlocks();

      const result = await manager.getOrCreateSharedBlock({ name: 'test', description: 'new-desc', limit: 2000, value: 'new-val' });

      expect(result).toBe('id-1');
      expect(mockClient.updateBlock).toHaveBeenCalledWith('id-1', {
        value: 'new-val', description: 'new-desc', limit: 2000
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
});
