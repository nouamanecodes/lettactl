import { FolderManager } from '../../../src/lib/managers/folder-manager';
import { LettaClientWrapper } from '../../../src/lib/client/letta-client';

jest.mock('../../../src/lib/client/letta-client');

describe('FolderManager', () => {
  let manager: FolderManager;
  let mockClient: jest.Mocked<LettaClientWrapper>;

  beforeEach(() => {
    mockClient = new (LettaClientWrapper as any)();
    manager = new FolderManager(mockClient);
  });

  describe('loadExistingFolders', () => {
    it('loads folders into registry', async () => {
      mockClient.listFolders.mockResolvedValue([
        { id: 'f1', name: 'docs', embedding: 'openai/text-embedding-3-small' },
        { id: 'f2', name: 'notes', embedding: null },
      ] as any);

      await manager.loadExistingFolders();

      expect(manager.getFolderId('docs')).toBe('f1');
      expect(manager.getFolderId('notes')).toBe('f2');
    });

    it('skips entries without name or id', async () => {
      mockClient.listFolders.mockResolvedValue([
        { id: 'f1', name: 'valid' },
        { id: null, name: 'no-id' },
        { id: 'f3', name: null },
        { id: null, name: null },
      ] as any);

      await manager.loadExistingFolders();

      expect(manager.getFolderId('valid')).toBe('f1');
      expect(manager.getFolderId('no-id')).toBeNull();
    });
  });

  describe('getOrCreateFolder', () => {
    it('creates folder when not in registry', async () => {
      mockClient.listFolders.mockResolvedValue([] as any);
      mockClient.createFolder.mockResolvedValue({ id: 'new-1', name: 'docs' } as any);
      await manager.loadExistingFolders();

      const id = await manager.getOrCreateFolder({ name: 'docs', embedding: 'openai/text-embedding-3-small' });

      expect(id).toBe('new-1');
      expect(mockClient.createFolder).toHaveBeenCalledWith({
        name: 'docs',
        embedding: 'openai/text-embedding-3-small',
      });
    });

    it('returns existing folder without API call', async () => {
      mockClient.listFolders.mockResolvedValue([
        { id: 'existing-1', name: 'docs', embedding: 'openai/text-embedding-3-small' },
      ] as any);
      await manager.loadExistingFolders();

      const id = await manager.getOrCreateFolder({ name: 'docs', embedding: 'openai/text-embedding-3-small' });

      expect(id).toBe('existing-1');
      expect(mockClient.createFolder).not.toHaveBeenCalled();
    });

    it('is idempotent — second call reuses first (1 API call total)', async () => {
      mockClient.listFolders.mockResolvedValue([] as any);
      mockClient.createFolder.mockResolvedValue({ id: 'new-1', name: 'docs' } as any);
      await manager.loadExistingFolders();

      const id1 = await manager.getOrCreateFolder({ name: 'docs', embedding: 'openai/text-embedding-3-small' });
      const id2 = await manager.getOrCreateFolder({ name: 'docs', embedding: 'openai/text-embedding-3-small' });

      expect(id1).toBe('new-1');
      expect(id2).toBe('new-1');
      expect(mockClient.createFolder).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFolderRegistry', () => {
    it('returns a copy of the registry', async () => {
      mockClient.listFolders.mockResolvedValue([
        { id: 'f1', name: 'docs', embedding: 'openai/text-embedding-3-small' },
      ] as any);
      await manager.loadExistingFolders();

      const registry = manager.getFolderRegistry();

      expect(registry.size).toBe(1);
      expect(registry.get('docs')?.id).toBe('f1');

      // Verify it's a copy — mutating it doesn't affect the manager
      registry.delete('docs');
      expect(manager.getFolderId('docs')).toBe('f1');
    });
  });
});
