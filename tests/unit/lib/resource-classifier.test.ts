import { ResourceClassifier } from '../../../src/lib/resource-classifier';
import { LettaClientWrapper } from '../../../src/lib/letta-client';

jest.mock('../../../src/lib/letta-client');

describe('ResourceClassifier', () => {
  let classifier: ResourceClassifier;
  let mockClient: jest.Mocked<LettaClientWrapper>;

  beforeEach(() => {
    mockClient = new (LettaClientWrapper as any)();
    classifier = new ResourceClassifier(mockClient);
  });

  describe('isSharedFolder', () => {
    it('identifies shared vs non-shared folders', () => {
      expect(classifier.isSharedFolder({ name: 'shared-docs' })).toBe(true);
      expect(classifier.isSharedFolder({ name: 'private-docs' })).toBe(false);
      expect(classifier.isSharedFolder({})).toBe(false);
    });
  });

  describe('isSharedBlock', () => {
    it('identifies shared vs non-shared blocks', () => {
      expect(classifier.isSharedBlock({ label: 'shared_block' })).toBe(true);
      expect(classifier.isSharedBlock({ label: 'agent_memory' })).toBe(false);
      expect(classifier.isSharedBlock({})).toBe(false);
    });
  });

  describe('isFolderUsedByOtherAgents', () => {
    it('checks if folder is used by other agents', async () => {
      mockClient.getAgent.mockResolvedValueOnce({ folders: [{ id: 'folder-1' }] } as any);

      const result = await classifier.isFolderUsedByOtherAgents('folder-1', 'agent-1', [{ id: 'agent-1' }, { id: 'agent-2' }]);
      expect(result).toBe(true);
    });
  });

  describe('getAgentSpecificBlocks', () => {
    it('filters blocks by agent name, excluding shared', () => {
      const blocks = [
        { label: 'test-agent_memory' },
        { label: 'shared_block' },
        { label: 'other-agent_memory' }
      ];

      const result = classifier.getAgentSpecificBlocks(blocks, 'test-agent');
      expect(result).toHaveLength(1);
      expect(result[0].label).toBe('test-agent_memory');
    });
  });
});
