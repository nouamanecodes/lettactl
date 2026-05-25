import { OutputFormatter, diffShallowKeys } from '../../../src/lib/ux/output-formatter';
import { AgentUpdateOperations } from '../../../src/types/diff';

// Mock console.log for testing
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

describe('OutputFormatter', () => {
  beforeEach(() => {
    mockConsoleLog.mockClear();
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
  });

  describe('formatOutput', () => {
    it('should format JSON output correctly', () => {
      const data = { name: 'test-agent', id: 'agent-123' };
      const result = OutputFormatter.formatOutput(data, 'json');
      
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('should return YAML message for YAML format', () => {
      const data = { name: 'test-agent' };
      const result = OutputFormatter.formatOutput(data, 'yaml');
      
      expect(result).toBe('YAML output not yet implemented');
    });

    it('should return empty string for unknown format', () => {
      const data = { name: 'test-agent' };
      const result = OutputFormatter.formatOutput(data, 'table');
      
      expect(result).toBe('');
    });
  });

  describe('createAgentTable', () => {
    const makeAgent = (overrides: Partial<{
      id: string;
      name: string;
      model: string;
      blockCount: number;
      toolCount: number;
      folderCount: number;
      mcpServerCount: number;
      fileCount: number;
      created: string;
    }> = {}) => ({
      id: 'id-1',
      name: 'agent-1',
      model: 'test-model',
      blockCount: 0,
      toolCount: 0,
      folderCount: 0,
      mcpServerCount: 0,
      fileCount: 0,
      tags: [],
      created: '2024-01-01',
      ...overrides,
    });

    it('should create table for agents', () => {
      const agents = [
        makeAgent({ name: 'agent-1', id: 'id-1' }),
        makeAgent({ name: 'agent-2', id: 'id-2' })
      ];

      const result = OutputFormatter.createAgentTable(agents);

      expect(result).toContain('agent-1');
      expect(result).toContain('agent-2');
      expect(result).toContain('NAME');
    });

    it('should handle empty agent list', () => {
      const agents: any[] = [];
      const result = OutputFormatter.createAgentTable(agents);

      expect(result).toContain('NAME');
    });
  });

  describe('showAgentUpdateDiff', () => {
    const makeOperations = (): AgentUpdateOperations => ({
      tools: {
        toAdd: [],
        toRemove: [{ name: 'old-tool', id: 't1' }],
        toUpdate: [],
        unchanged: [],
      },
      blocks: {
        toAdd: [],
        toRemove: [{ name: 'old-block', id: 'b1' }],
        toUpdate: [],
        toUpdateValue: [],
        unchanged: [],
      },
      folders: {
        toAttach: [],
        toDetach: [{ name: 'old-folder', id: 'f1' }],
        toUpdate: [],
        unchanged: [],
      },
      archives: {
        toAttach: [],
        toDetach: [{ name: 'old-archive', id: 'a1' }],
        toUpdate: [],
        unchanged: [],
      },
      preservesConversation: true,
      operationCount: 4,
    });

    it('gates block/tool removal behind --prune and folder/archive removal behind --force when neither flag set', () => {
      OutputFormatter.showAgentUpdateDiff(makeOperations(), undefined, false, false);

      const lines = mockConsoleLog.mock.calls.map(c => c[0]);
      const removedTool = lines.find((l: string) => l.includes('Removed tool: old-tool'));
      const removedBlock = lines.find((l: string) => l.includes('Removed block: old-block'));
      const removedFolder = lines.find((l: string) => l.includes('Removed folder: old-folder'));
      const removedArchive = lines.find((l: string) => l.includes('Removed archive: old-archive'));

      // Blocks/tools detach safely under --prune; folders/archives can lose data so stay under --force (#384).
      expect(removedTool).toContain('(requires --prune)');
      expect(removedBlock).toContain('(requires --prune)');
      expect(removedFolder).toContain('(requires --force)');
      expect(removedArchive).toContain('(requires --force)');
    });

    it('clears the block/tool hint under --prune but keeps folders/archives gated behind --force', () => {
      OutputFormatter.showAgentUpdateDiff(makeOperations(), undefined, false, true);

      const lines = mockConsoleLog.mock.calls.map(c => c[0]);
      const removedTool = lines.find((l: string) => l.includes('Removed tool: old-tool'));
      const removedBlock = lines.find((l: string) => l.includes('Removed block: old-block'));
      const removedFolder = lines.find((l: string) => l.includes('Removed folder: old-folder'));
      const removedArchive = lines.find((l: string) => l.includes('Removed archive: old-archive'));

      expect(removedTool).not.toContain('(requires --prune)');
      expect(removedBlock).not.toContain('(requires --prune)');
      expect(removedFolder).toContain('(requires --force)');
      expect(removedArchive).toContain('(requires --force)');
    });

    it('omits all removal hints when force is true', () => {
      OutputFormatter.showAgentUpdateDiff(makeOperations(), undefined, true);

      const lines = mockConsoleLog.mock.calls.map(c => c[0]);
      const removalLines = lines.filter((l: string) => l.includes('Removed'));

      expect(removalLines.length).toBe(4);
      removalLines.forEach((line: string) => {
        expect(line).not.toContain('(requires --force)');
        expect(line).not.toContain('(requires --prune)');
      });
    });

    it('renders per-field compaction_settings drift', () => {
      const ops: AgentUpdateOperations = {
        updateFields: {
          compactionSettings: {
            from: { clip_chars: 50000, mode: 'sliding_window' },
            to: { clip_chars: 1000, mode: 'sliding_window' },
          },
        },
        preservesConversation: true,
        operationCount: 1,
      };
      OutputFormatter.showAgentUpdateDiff(ops, undefined, false);
      const lines = mockConsoleLog.mock.calls.map(c => c[0]);
      const header = lines.find((l: string) => l.includes('Compaction settings'));
      const drift = lines.find((l: string) => l.includes('clip_chars'));
      expect(header).toContain('1 field(s) changed');
      expect(drift).toContain('50000');
      expect(drift).toContain('1000');
      expect(lines.find((l: string) => l.includes('mode'))).toBeUndefined();
    });

    it('renders compaction_settings as added when from is null', () => {
      const ops: AgentUpdateOperations = {
        updateFields: {
          compactionSettings: { from: null, to: { clip_chars: 1000 } },
        },
        preservesConversation: true,
        operationCount: 1,
      };
      OutputFormatter.showAgentUpdateDiff(ops, undefined, false);
      const lines = mockConsoleLog.mock.calls.map(c => c[0]);
      expect(lines.some((l: string) => l.includes('+ Compaction settings: added'))).toBe(true);
      expect(lines.some((l: string) => l.includes('clip_chars'))).toBe(true);
    });
  });

  describe('diffShallowKeys', () => {
    it('lists only changed keys', () => {
      const changes = diffShallowKeys(
        { clip_chars: 50000, mode: 'sliding_window' },
        { clip_chars: 1000, mode: 'sliding_window' }
      );
      expect(changes).toEqual(['clip_chars: 50000 → 1000']);
    });

    it('handles null on either side', () => {
      expect(diffShallowKeys(null, { clip_chars: 1000 })).toEqual([
        'clip_chars: (unset) → 1000',
      ]);
      expect(diffShallowKeys({ clip_chars: 1000 }, null)).toEqual([
        'clip_chars: 1000 → (unset)',
      ]);
    });

    it('truncates long string values', () => {
      const longStr = 'x'.repeat(100);
      const changes = diffShallowKeys({ prompt: 'short' }, { prompt: longStr });
      expect(changes[0]).toContain('...');
      expect(changes[0].length).toBeLessThan(120);
    });
  });

  describe('handleJsonOutput', () => {
    it('should output JSON and return true when format is json', () => {
      const data = { test: 'data' };
      const result = OutputFormatter.handleJsonOutput(data, 'json');
      
      expect(result).toBe(true);
      expect(mockConsoleLog).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
    });

    it('should return false and not output when format is not json', () => {
      const data = { test: 'data' };
      const result = OutputFormatter.handleJsonOutput(data, 'table');
      
      expect(result).toBe(false);
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it('should return false when format is undefined', () => {
      const data = { test: 'data' };
      const result = OutputFormatter.handleJsonOutput(data);
      
      expect(result).toBe(false);
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });
  });
});