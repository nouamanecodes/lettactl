import { BlockManager } from '../../../src/lib/managers/block-manager';
import { ArchiveManager } from '../../../src/lib/managers/archive-manager';
import { LettaClientWrapper } from '../../../src/lib/client/letta-client';
import { DiffEngine } from '../../../src/lib/apply/diff-engine';
import { analyzeToolChanges, analyzeBlockChanges, analyzeFolderChanges, analyzeArchiveChanges } from '../../../src/lib/apply/diff-analyzers';

jest.mock('../../../src/lib/client/letta-client');
jest.mock('../../../src/lib/managers/block-manager');
jest.mock('../../../src/lib/managers/archive-manager');

describe('DiffEngine', () => {
  let mockBlockManager: jest.Mocked<BlockManager>;
  let mockArchiveManager: jest.Mocked<ArchiveManager>;
  let mockClient: jest.Mocked<LettaClientWrapper>;
  const originalLettaBaseUrl = process.env.LETTA_BASE_URL;

  beforeEach(() => {
    mockClient = new (LettaClientWrapper as any)();
    mockBlockManager = new (BlockManager as any)(mockClient);
    mockArchiveManager = new (ArchiveManager as any)(mockClient);
    process.env.LETTA_BASE_URL = originalLettaBaseUrl;
  });

  afterEach(() => {
    process.env.LETTA_BASE_URL = originalLettaBaseUrl;
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

    it('marks tool for update when in updatedTools set', async () => {
      const result = await analyzeToolChanges(
        [{ name: 'tool', id: 'tool-id' }],
        ['tool'],
        new Map([['tool', 'tool-id']]),
        {},
        new Set(['tool'])
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

    it('skips re-attachment for implicit builtins but adds explicit builtins (see #381)', async () => {
      const result = await analyzeToolChanges(
        [],
        ['archival_memory_insert', 'web_search'],
        new Map([['archival_memory_insert', 'builtin-id-1'], ['web_search', 'builtin-id-2']])
      );
      // archival_memory_insert is server-auto-attached → unchanged
      // web_search is letta_builtin → requires explicit attachToolToAgent → toAdd
      expect(result.toAdd).toEqual([
        { name: 'web_search', id: 'builtin-id-2' }
      ]);
      expect(result.unchanged).toEqual([
        { name: 'archival_memory_insert', id: 'builtin-id-1' }
      ]);
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

    it('detects per-agent → shared migration when block IDs differ', async () => {
      // Agent has per-agent block (id-agent), but shared block exists with different ID
      mockBlockManager.getSharedBlockId.mockReturnValue('id-shared');
      const result = await analyzeBlockChanges(
        [{ label: 'guidelines', id: 'id-agent' }],
        [{ name: 'guidelines', isShared: true }],
        mockBlockManager
      );
      expect(result.toUpdate).toEqual([{
        name: 'guidelines',
        currentId: 'id-agent',
        newId: 'id-shared',
        reason: 'per-agent → shared'
      }]);
      expect(result.unchanged).toEqual([]);
    });

    it('detects value drift on shared blocks with agent_owned false', async () => {
      mockBlockManager.getSharedBlockId.mockReturnValue('id-1');
      const result = await analyzeBlockChanges(
        [{ label: 'credit_rules', id: 'id-1', value: 'old value', limit: 2000, description: 'desc' }],
        [{ name: 'credit_rules', isShared: true, agent_owned: false, value: 'new value', limit: 2000, description: 'desc' }],
        mockBlockManager
      );
      expect(result.toUpdateValue).toEqual([{
        name: 'credit_rules',
        id: 'id-1',
        oldValue: 'old value',
        newValue: 'new value',
        newLimit: undefined,
        newDescription: undefined,
      }]);
      expect(result.unchanged).toEqual([]);
    });

    it('marks shared block unchanged when IDs match', async () => {
      // Agent already has the shared block (same ID)
      mockBlockManager.getSharedBlockId.mockReturnValue('id-1');
      const result = await analyzeBlockChanges(
        [{ label: 'guidelines', id: 'id-1' }],
        [{ name: 'guidelines', isShared: true }],
        mockBlockManager
      );
      expect(result.toUpdate).toEqual([]);
      expect(result.unchanged).toEqual([{ name: 'guidelines', id: 'id-1' }]);
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

  describe('analyzeArchiveChanges', () => {
    it('identifies archives to attach', async () => {
      mockArchiveManager.getArchiveId.mockReturnValue('archive-1');
      const result = await analyzeArchiveChanges([], [{ name: 'archive' }], mockArchiveManager);
      expect(result.toAttach).toEqual([{ name: 'archive', id: 'archive-1' }]);
    });

    it('identifies archives to detach', async () => {
      const result = await analyzeArchiveChanges([{ name: 'archive', id: 'archive-1' }], [], mockArchiveManager);
      expect(result.toDetach).toEqual([{ name: 'archive', id: 'archive-1' }]);
    });

    it('marks archives as unchanged', async () => {
      const result = await analyzeArchiveChanges([{ name: 'archive', id: 'archive-1' }], [{ name: 'archive' }], mockArchiveManager);
      expect(result.unchanged).toEqual([{ name: 'archive', id: 'archive-1' }]);
    });

    it('preserves archives when desired is empty but agent has archival tools (#257)', async () => {
      const currentArchives = [{ name: 'learned-memory', id: 'archive-1' }];
      const agentTools = [
        { name: 'archival_memory_insert', id: 'tool-1' },
        { name: 'archival_memory_search', id: 'tool-2' }
      ];
      const result = await analyzeArchiveChanges(currentArchives, [], mockArchiveManager, false, agentTools);
      expect(result.toDetach).toEqual([]);
      expect(result.unchanged).toEqual([{ name: 'learned-memory', id: 'archive-1' }]);
    });

    it('detaches archives when desired is empty and agent has no archival tools', async () => {
      const currentArchives = [{ name: 'old-archive', id: 'archive-1' }];
      const agentTools = [{ name: 'conversation_search', id: 'tool-1' }];
      const result = await analyzeArchiveChanges(currentArchives, [], mockArchiveManager, false, agentTools);
      expect(result.toDetach).toEqual([{ name: 'old-archive', id: 'archive-1' }]);
      expect(result.unchanged).toEqual([]);
    });
  });

  describe('generateUpdateOperations', () => {
    it('detects model drift when metadata disagrees with the live llm handle', async () => {
      mockClient.getAgent.mockResolvedValue({
        id: 'agent-1',
        name: 'agent-1',
        system: 'system',
        description: 'description',
        model: 'claude-haiku-4-5',
        llm_config: {
          handle: 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
          context_window: 64000,
        },
        metadata: {
          'lettactl.model': 'lc-zai/glm-4.7',
          'lettactl.includeBaseTools': false,
          'lettactl.includeBaseToolRules': false,
        },
        tools: [],
        blocks: [],
        tags: [],
      } as any);

      const engine = new DiffEngine(mockClient, mockBlockManager, mockArchiveManager);
      const operations = await engine.generateUpdateOperations(
        { id: 'agent-1', name: 'agent-1' } as any,
        {
          systemPrompt: 'system',
          description: 'description',
          tools: [],
          includeBaseTools: false,
          includeBaseToolRules: false,
          model: 'lc-zai/glm-4.7',
          contextWindow: 64000,
          tags: [],
        },
        new Map(),
        new Map()
      );

      expect(operations.updateFields?.model).toEqual({
        from: 'lc-bedrock/us.anthropic.claude-haiku-4-5-20251001-v1:0',
        to: 'lc-zai/glm-4.7',
      });
    });

    it('ignores omitted embedding on Letta Cloud because Cloud manages embedding config', async () => {
      process.env.LETTA_BASE_URL = 'https://api.letta.com';
      mockClient.getAgent.mockResolvedValue({
        id: 'agent-1',
        name: 'agent-1',
        system: 'system',
        description: 'description',
        model: 'glm-4.7',
        llm_config: {
          handle: 'lc-zai/glm-4.7',
          context_window: 64000,
        },
        metadata: {
          'lettactl.model': 'lc-zai/glm-4.7',
          'lettactl.embedding': 'openai/text-embedding-3-small',
          'lettactl.includeBaseTools': false,
          'lettactl.includeBaseToolRules': false,
        },
        tools: [],
        blocks: [],
        tags: [],
      } as any);

      const engine = new DiffEngine(mockClient, mockBlockManager, mockArchiveManager);
      const operations = await engine.generateUpdateOperations(
        { id: 'agent-1', name: 'agent-1' } as any,
        {
          systemPrompt: 'system',
          description: 'description',
          tools: [],
          includeBaseTools: false,
          includeBaseToolRules: false,
          model: 'lc-zai/glm-4.7',
          contextWindow: 64000,
          tags: [],
        },
        new Map(),
        new Map()
      );

      expect(operations.updateFields?.embedding).toBeUndefined();
    });

    it('still detects omitted embedding drift outside Letta Cloud', async () => {
      process.env.LETTA_BASE_URL = 'http://localhost:8283';
      mockClient.getAgent.mockResolvedValue({
        id: 'agent-1',
        name: 'agent-1',
        system: 'system',
        description: 'description',
        model: 'glm-4.7',
        llm_config: {
          handle: 'lc-zai/glm-4.7',
          context_window: 64000,
        },
        metadata: {
          'lettactl.model': 'lc-zai/glm-4.7',
          'lettactl.embedding': 'openai/text-embedding-3-small',
          'lettactl.includeBaseTools': false,
          'lettactl.includeBaseToolRules': false,
        },
        tools: [],
        blocks: [],
        tags: [],
      } as any);

      const engine = new DiffEngine(mockClient, mockBlockManager, mockArchiveManager);
      const operations = await engine.generateUpdateOperations(
        { id: 'agent-1', name: 'agent-1' } as any,
        {
          systemPrompt: 'system',
          description: 'description',
          tools: [],
          includeBaseTools: false,
          includeBaseToolRules: false,
          model: 'lc-zai/glm-4.7',
          contextWindow: 64000,
          tags: [],
        },
        new Map(),
        new Map()
      );

      expect(operations.updateFields?.embedding).toEqual({
        from: 'openai/text-embedding-3-small',
        to: null,
      });
    });
  });
});
