import { BlockManager } from '../../src/lib/block-manager';
import { LettaClientWrapper } from '../../src/lib/letta-client';
import { analyzeToolChanges, analyzeBlockChanges, analyzeFolderChanges } from '../../src/lib/diff-analyzers';

jest.mock('../../src/lib/letta-client');
jest.mock('../../src/lib/block-manager');

describe('DiffEngine', () => {
  let mockBlockManager: jest.Mocked<BlockManager>;
  let mockClient: jest.Mocked<LettaClientWrapper>;

  beforeEach(() => {
    mockClient = new (LettaClientWrapper as any)();
    mockBlockManager = new (BlockManager as any)(mockClient);
  });

  describe('analyzeToolChanges', () => {
    it('identifies tools to add', async () => {
      const result = await analyzeToolChanges([], ['new-tool'], new Map([['new-tool', 'id-1']]));
      expect(result.toAdd).toEqual([{ name: 'new-tool', id: 'id-1' }]);
    });

    it('identifies tools to remove', async () => {
      const result = await analyzeToolChanges([{ name: 'old-tool', id: 'id-1' }], [], new Map());
      expect(result.toRemove).toEqual([{ name: 'old-tool', id: 'id-1' }]);
    });

    it('identifies unchanged tools', async () => {
      const result = await analyzeToolChanges([{ name: 'tool', id: 'id-1' }], ['tool'], new Map([['tool', 'id-1']]));
      expect(result.unchanged).toHaveLength(1);
    });

    it('marks tool for update when source hash exists and ID changed', async () => {
      const result = await analyzeToolChanges(
        [{ name: 'tool', id: 'old-id' }],
        ['tool'],
        new Map([['tool', 'new-id']]),
        { 'tool': 'hash' }
      );
      expect(result.toUpdate[0].reason).toBe('source_code_changed');
    });

    it('skips built-in tools for updates', async () => {
      const result = await analyzeToolChanges(
        [{ name: 'archival_memory_insert', id: 'id' }],
        ['archival_memory_insert'],
        new Map([['archival_memory_insert', 'id']]),
        { 'archival_memory_insert': 'hash' }
      );
      expect(result.toUpdate).toEqual([]);
    });
  });

  describe('analyzeBlockChanges', () => {
    it('identifies blocks to add', async () => {
      mockBlockManager.getSharedBlockId.mockReturnValue('id-1');
      const result = await analyzeBlockChanges([], [{ name: 'block', isShared: true }], mockBlockManager);
      expect(result.toAdd).toEqual([{ name: 'block', id: 'id-1' }]);
    });

    it('identifies blocks to remove', async () => {
      const result = await analyzeBlockChanges([{ label: 'block', id: 'id-1' }], [], mockBlockManager);
      expect(result.toRemove).toEqual([{ name: 'block', id: 'id-1' }]);
    });

    it('marks existing blocks as unchanged', async () => {
      const result = await analyzeBlockChanges([{ label: 'block', id: 'id-1' }], [{ name: 'block' }], mockBlockManager);
      expect(result.unchanged).toEqual([{ name: 'block', id: 'id-1' }]);
      expect(result.toRemove).toEqual([]);
      expect(result.toUpdate).toEqual([]);
    });
  });

  describe('analyzeFolderChanges', () => {
    it('identifies folders to attach', async () => {
      const result = await analyzeFolderChanges([], [{ name: 'folder', files: [] }], new Map([['folder', 'id-1']]), mockClient);
      expect(result.toAttach).toEqual([{ name: 'folder', id: 'id-1' }]);
    });

    it('identifies folders to detach', async () => {
      const result = await analyzeFolderChanges([{ name: 'folder', id: 'id-1' }], [], new Map(), mockClient);
      expect(result.toDetach).toEqual([{ name: 'folder', id: 'id-1' }]);
    });

    it('identifies unchanged folders', async () => {
      const result = await analyzeFolderChanges([{ name: 'folder', id: 'id-1' }], [{ name: 'folder', files: [] }], new Map(), mockClient);
      expect(result.unchanged).toHaveLength(1);
    });
  });
});
