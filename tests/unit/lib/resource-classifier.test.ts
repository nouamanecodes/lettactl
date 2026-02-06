import { ResourceClassifier } from '../../../src/lib/resources/resource-classifier';
import { LettaClientWrapper } from '../../../src/lib/client/letta-client';

jest.mock('../../../src/lib/client/letta-client');

describe('ResourceClassifier', () => {
  let classifier: ResourceClassifier;
  let mockClient: jest.Mocked<LettaClientWrapper>;

  beforeEach(() => {
    mockClient = new (LettaClientWrapper as any)();
    classifier = new ResourceClassifier(mockClient);
  });

  describe('isSharedFolder', () => {
    it('identifies shared folders by agent count', () => {
      expect(classifier.isSharedFolder({ name: 'any-folder', agentCount: 2 })).toBe(true);
      expect(classifier.isSharedFolder({ name: 'any-folder', agentCount: 1 })).toBe(false);
      expect(classifier.isSharedFolder({ name: 'any-folder', agentCount: 0 })).toBe(false);
      expect(classifier.isSharedFolder({ name: 'shared-docs' })).toBe(false); // No naming convention
      expect(classifier.isSharedFolder({})).toBe(false);
    });
  });

  describe('isSharedBlock', () => {
    it('identifies shared blocks by agent count', () => {
      expect(classifier.isSharedBlock({ label: 'any_block', agentCount: 2 })).toBe(true);
      expect(classifier.isSharedBlock({ label: 'any_block', agentCount: 1 })).toBe(false);
      expect(classifier.isSharedBlock({ label: 'any_block', agentCount: 0 })).toBe(false);
      expect(classifier.isSharedBlock({ label: 'shared_block' })).toBe(false); // No naming convention
      expect(classifier.isSharedBlock({})).toBe(false);
    });
  });

  describe('isFolderUsedByOtherAgents', () => {
    it('checks if folder is used by other agents via API', async () => {
      mockClient.listFolderAgents = jest.fn().mockResolvedValueOnce(['agent-1', 'agent-2']);

      const result = await classifier.isFolderUsedByOtherAgents('folder-1', 'agent-1');
      expect(result).toBe(true);
    });

    it('returns false when folder only used by excluded agent', async () => {
      mockClient.listFolderAgents = jest.fn().mockResolvedValueOnce(['agent-1']);

      const result = await classifier.isFolderUsedByOtherAgents('folder-1', 'agent-1');
      expect(result).toBe(false);
    });
  });

  describe('getAgentSpecificBlocks', () => {
    it('filters blocks by agent name, excluding shared', () => {
      const blocks = [
        { label: 'test-agent_memory' },
        { label: 'company_knowledge', agentCount: 3 },
        { label: 'other-agent_memory' }
      ];

      const result = classifier.getAgentSpecificBlocks(blocks, 'test-agent');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('test-agent_memory');
    });
  });

  describe('isArchiveUsedByOtherAgents', () => {
    it('checks if archive is used by other agents', async () => {
      mockClient.listAgentArchives.mockResolvedValueOnce([{ id: 'archive-1' }] as any);

      const result = await classifier.isArchiveUsedByOtherAgents('archive-1', 'agent-1', [{ id: 'agent-1' }, { id: 'agent-2' }]);
      expect(result).toBe(true);
    });
  });
});
