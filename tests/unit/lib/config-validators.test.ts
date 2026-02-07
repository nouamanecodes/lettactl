import { ArchiveValidator, McpToolsValidator, SharedFolderValidator, FleetConfigValidator } from '../../../src/lib/validation/config-validators';

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

describe('FleetConfigValidator - duplicate folder names', () => {
  const baseAgent = (name: string, folders?: any[]) => ({
    name,
    description: 'd',
    llm_config: { model: 'm', context_window: 1000 },
    system_prompt: { value: 'p' },
    folders
  });

  it('rejects duplicate inline folder names across agents', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [
        baseAgent('agent-a', [{ name: 'docs', files: ['a.txt'] }]),
        baseAgent('agent-b', [{ name: 'docs', files: ['b.txt'] }])
      ]
    })).toThrow('Folder "docs" defined on multiple agents (agent-a, agent-b)');
  });

  it('allows same folder name on a single agent', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [
        baseAgent('agent-a', [{ name: 'docs', files: ['a.txt'] }]),
        baseAgent('agent-b', [{ name: 'other', files: ['b.txt'] }])
      ]
    })).not.toThrow();
  });

  it('allows agents without folders', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [
        baseAgent('agent-a'),
        baseAgent('agent-b')
      ]
    })).not.toThrow();
  });
});

describe('AgentValidator - tags', () => {
  const baseAgent = (name: string, tags?: any) => ({
    name,
    description: 'd',
    llm_config: { model: 'm', context_window: 1000 },
    system_prompt: { value: 'p' },
    tags
  });

  it('accepts valid tags', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a', ['tenant:user-123', 'role:support'])]
    })).not.toThrow();
  });

  it('accepts agents without tags', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a')]
    })).not.toThrow();
  });

  it('rejects non-array tags', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a', 'not-array')]
    })).toThrow('tags must be an array');
  });

  it('rejects empty string tags', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a', ['valid', ''])]
    })).toThrow('Tag 2 must be a non-empty string');
  });

  it('rejects tags containing commas', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a', ['valid:tag', 'bad,tag'])]
    })).toThrow('must not contain commas');
  });
});

describe('AgentValidator - reserved names', () => {
  const baseAgent = (name: string) => ({
    name,
    description: 'd',
    llm_config: { model: 'm', context_window: 1000 },
    system_prompt: { value: 'p' }
  });

  it('rejects reserved name "agents"', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agents')]
    })).toThrow('reserved');
  });

  it('rejects reserved name "blocks"', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('blocks')]
    })).toThrow('reserved');
  });

  it('rejects reserved name "tools"', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('tools')]
    })).toThrow('reserved');
  });

  it('accepts non-reserved names', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('my-agent')]
    })).not.toThrow();
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
