import { ArchiveValidator, McpToolsValidator, SharedFolderValidator } from '../../../src/lib/validation/config-validators';

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

describe('SharedFolderValidator', () => {
  it('accepts valid shared folders', () => {
    expect(() => SharedFolderValidator.validate([
      { name: 'docs', files: ['files/doc1.txt'] }
    ])).not.toThrow();
  });

  it('rejects duplicate folder names', () => {
    expect(() => SharedFolderValidator.validate([
      { name: 'docs', files: ['a.txt'] },
      { name: 'docs', files: ['b.txt'] }
    ])).toThrow('Duplicate shared folder name');
  });

  it('rejects folders without files', () => {
    expect(() => SharedFolderValidator.validate([
      { name: 'docs' } as any
    ])).toThrow('must have a files array');
  });

  it('rejects non-array input', () => {
    expect(() => SharedFolderValidator.validate({} as any)).toThrow('Shared folders must be an array.');
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
