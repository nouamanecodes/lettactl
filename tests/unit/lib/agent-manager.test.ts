import { AgentManager } from '../../../src/lib/agent-manager';
import { LettaClientWrapper } from '../../../src/lib/letta-client';
import { generateContentHash } from '../../../src/utils/hash-utils';

jest.mock('../../../src/lib/letta-client');

describe('AgentManager', () => {
  let manager: AgentManager;
  let mockClient: jest.Mocked<LettaClientWrapper>;

  beforeEach(() => {
    mockClient = new (LettaClientWrapper as any)();
    manager = new AgentManager(mockClient);
  });

  describe('hashing', () => {
    const hash = (content: string) => generateContentHash(content);

    it('is deterministic and unique', () => {
      expect(hash('a')).toBe(hash('a'));
      expect(hash('a')).not.toBe(hash('b'));
    });
  });

  describe('parseVersionFromName', () => {
    const parse = (name: string) => (manager as any).parseVersionFromName(name);

    it('extracts version from name', () => {
      expect(parse('agent__v__v1').version).toBe('v1');
      expect(parse('agent').version).toBeNull();
    });
  });

  describe('generateAgentConfigHashes', () => {
    const gen = (config: any) => (manager as any).generateAgentConfigHashes(config);

    it('differs by prompt, tools, and tool source', () => {
      expect(gen({ systemPrompt: 'a', tools: [] }).systemPrompt)
        .not.toBe(gen({ systemPrompt: 'b', tools: [] }).systemPrompt);

      expect(gen({ systemPrompt: 's', tools: ['a'] }).tools)
        .not.toBe(gen({ systemPrompt: 's', tools: ['b'] }).tools);

      expect(gen({ systemPrompt: 's', tools: ['t'], toolSourceHashes: { t: '1' } }).tools)
        .not.toBe(gen({ systemPrompt: 's', tools: ['t'], toolSourceHashes: { t: '2' } }).tools);
    });
  });

  describe('getConfigChanges', () => {
    it('detects changes correctly', () => {
      const config = { systemPrompt: 'p', tools: [] };
      const existing = {
        id: '1', name: 'a', baseName: 'a', version: 'v1', lastUpdated: '2024-01-01',
        configHashes: (manager as any).generateAgentConfigHashes(config)
      };

      expect(manager.getConfigChanges(existing, config).hasChanges).toBe(false);
      expect(manager.getConfigChanges(existing, { systemPrompt: 'new', tools: [] }).hasChanges).toBe(true);
    });
  });

  describe('getOrCreateAgentName', () => {
    it('creates new or returns existing', async () => {
      mockClient.listAgents.mockResolvedValue([] as any);
      await manager.loadExistingAgents();
      expect((await manager.getOrCreateAgentName('new', { systemPrompt: 't', tools: [] })).shouldCreate).toBe(true);

      mockClient.listAgents.mockResolvedValue([{ id: '1', name: 'existing', system: 'p' }] as any);
      await manager.loadExistingAgents();
      const result = await manager.getOrCreateAgentName('existing', { systemPrompt: 'p', tools: [] });
      expect(result.shouldCreate).toBe(false);
    });
  });
});
