import { OutputFormatter } from '../../../src/lib/output-formatter';

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
    it('should create table for agents', () => {
      const agents = [
        { name: 'agent-1', id: 'id-1' },
        { name: 'agent-2', id: 'id-2' }
      ];
      
      const result = OutputFormatter.createAgentTable(agents);
      
      expect(result).toContain('agent-1');
      expect(result).toContain('id-1');
      expect(result).toContain('agent-2');
      expect(result).toContain('id-2');
      expect(result).toContain('NAME');
      expect(result).toContain('ID');
    });

    it('should handle agents with missing properties', () => {
      const agents = [
        { name: 'agent-1' }, // missing id
        { id: 'id-2' }, // missing name
        {} // missing both
      ];
      
      const result = OutputFormatter.createAgentTable(agents);
      
      expect(result).toContain('agent-1');
      expect(result).toContain('id-2');
      expect(result).toContain('Unknown');
    });

    it('should handle empty agent list', () => {
      const agents: any[] = [];
      const result = OutputFormatter.createAgentTable(agents);
      
      expect(result).toContain('NAME');
      expect(result).toContain('ID');
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