import { ArchiveValidator, McpToolsValidator, SharedFolderValidator, FleetConfigValidator, LettaBotConfigValidator } from '../../../src/lib/validation/config-validators';

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

describe('LettaBotConfigValidator', () => {
  it('accepts a valid config with channels', () => {
    expect(() => LettaBotConfigValidator.validate({
      channels: {
        telegram: { enabled: true, token: '${TELEGRAM_TOKEN}' },
        slack: { enabled: false }
      }
    })).not.toThrow();
  });

  it('accepts an empty object', () => {
    expect(() => LettaBotConfigValidator.validate({})).not.toThrow();
  });

  it('accepts full config with all sections', () => {
    expect(() => LettaBotConfigValidator.validate({
      channels: {
        telegram: { enabled: true },
        discord: { enabled: true, token: 'abc' },
        whatsapp: { enabled: false }
      },
      features: {
        cron: true,
        heartbeat: { enabled: true, intervalMin: 60 },
        maxToolCalls: 5
      },
      polling: { enabled: true, intervalMs: 3000 },
      transcription: { provider: 'openai' },
      attachments: { maxMB: 10, maxAgeDays: 30 }
    })).not.toThrow();
  });

  it('rejects non-object lettabot', () => {
    expect(() => LettaBotConfigValidator.validate('string')).toThrow('lettabot must be an object');
    expect(() => LettaBotConfigValidator.validate([1, 2])).toThrow('lettabot must be an object');
    expect(() => LettaBotConfigValidator.validate(null)).toThrow('lettabot must be an object');
  });

  it('rejects unknown top-level fields', () => {
    expect(() => LettaBotConfigValidator.validate({
      channels: { telegram: { enabled: true } },
      badField: true
    })).toThrow('unknown fields: badField');
  });

  it('rejects unknown channel names', () => {
    expect(() => LettaBotConfigValidator.validate({
      channels: { teams: { enabled: true } }
    })).toThrow('unknown channels: teams');
  });

  it('rejects channel missing enabled', () => {
    expect(() => LettaBotConfigValidator.validate({
      channels: { telegram: { token: 'abc' } }
    })).toThrow('must have an "enabled" boolean field');
  });

  it('rejects heartbeat missing enabled', () => {
    expect(() => LettaBotConfigValidator.validate({
      features: { heartbeat: { intervalMin: 30 } }
    })).toThrow('heartbeat must have an "enabled" boolean field');
  });

  it('rejects non-positive maxToolCalls', () => {
    expect(() => LettaBotConfigValidator.validate({
      features: { maxToolCalls: 0 }
    })).toThrow('maxToolCalls must be a positive integer');
    expect(() => LettaBotConfigValidator.validate({
      features: { maxToolCalls: -1 }
    })).toThrow('maxToolCalls must be a positive integer');
  });

  it('rejects invalid transcription provider', () => {
    expect(() => LettaBotConfigValidator.validate({
      transcription: { provider: 'whisper' }
    })).toThrow('provider must be "openai"');
  });

  it('rejects non-positive attachment limits', () => {
    expect(() => LettaBotConfigValidator.validate({
      attachments: { maxMB: 0 }
    })).toThrow('maxMB must be a positive integer');
    expect(() => LettaBotConfigValidator.validate({
      attachments: { maxAgeDays: -5 }
    })).toThrow('maxAgeDays must be a positive integer');
  });
});

describe('AgentValidator - lettabot integration', () => {
  const baseAgent = (name: string, lettabot?: any) => ({
    name,
    description: 'd',
    llm_config: { model: 'm', context_window: 1000 },
    system_prompt: { value: 'p' },
    ...(lettabot !== undefined ? { lettabot } : {})
  });

  it('accepts agent without lettabot section', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a')]
    })).not.toThrow();
  });

  it('accepts agent with valid lettabot config', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a', {
        channels: { telegram: { enabled: true } }
      })]
    })).not.toThrow();
  });

  it('rejects agent with invalid lettabot config', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent('agent-a', 'not-object')]
    })).toThrow('lettabot must be an object');
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
