import { ArchiveValidator, McpToolsValidator } from '../../../src/lib/config-validators';

describe('ArchiveValidator', () => {
  it('rejects more than one archive per agent', () => {
    expect(() => ArchiveValidator.validate([
      { name: 'a' },
      { name: 'b' }
    ])).toThrow('Only one archive is supported per agent.');
  });

  it('accepts a single archive', () => {
    expect(() => ArchiveValidator.validate([
      { name: 'a', description: 'test archive' }
    ])).not.toThrow();
  });
});

describe('McpToolsValidator', () => {
  it('accepts tools: all', () => {
    expect(() => McpToolsValidator.validate([
      { server: 'mcp_server', tools: 'all' }
    ])).not.toThrow();
  });

  it('accepts explicit tool lists', () => {
    expect(() => McpToolsValidator.validate([
      { server: 'mcp_server', tools: ['tool_a', 'tool_b'] }
    ])).not.toThrow();
  });

  it('rejects invalid selections', () => {
    expect(() => McpToolsValidator.validate({} as any)).toThrow('mcp_tools must be an array.');
    expect(() => McpToolsValidator.validate([
      { tools: ['tool_a'] }
    ])).toThrow('mcp_tools 1 must include a non-empty server name.');
    expect(() => McpToolsValidator.validate([
      { server: 'mcp_server', tools: 5 as any }
    ])).toThrow('mcp_tools 1 tools must be an array or "all".');
  });
});
