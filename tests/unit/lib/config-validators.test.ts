import { ArchiveValidator, McpToolsValidator, SharedFolderValidator, FleetConfigValidator, LettaBotConfigValidator, AgentMemoryConfigValidator } from '../../../src/lib/validation/config-validators';

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

describe('FleetConfigValidator - secrets', () => {
  const baseAgent = (extra: any = {}) => ({
    name: 'agent-a',
    description: 'd',
    llm_config: { model: 'm', context_window: 1000 },
    system_prompt: { value: 'p' },
    ...extra,
  });

  it('accepts global-secrets and per-agent secrets', () => {
    expect(() => FleetConfigValidator.validate({
      'global-secrets': {
        API_BASE_URL: { value: 'https://api.example.com' },
      },
      agents: [
        baseAgent({
          secrets: {
            RUNTIME_AGENT_TOKEN: { from_env: 'AGENT_TOKEN' },
          },
        }),
      ],
    })).not.toThrow();
  });

  it('rejects invalid secret names', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [
        baseAgent({
          secrets: {
            'bad-name': { value: 'x' },
          },
        }),
      ],
    })).toThrow('Invalid secret name');
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

describe('AgentValidator - compaction_settings', () => {
  const baseAgent = (extra: any = {}) => ({
    name: 'a',
    description: 'd',
    llm_config: { model: 'm', context_window: 1000 },
    system_prompt: { value: 'p' },
    ...extra,
  });

  it('accepts compaction_settings as a known field', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent({ compaction_settings: { clip_chars: 1000 } })]
    })).not.toThrow();
  });

  it('still rejects unknown fields', () => {
    expect(() => FleetConfigValidator.validate({
      agents: [baseAgent({ bogus_field: 'x' })]
    })).toThrow('Unknown fields: bogus_field');
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
    })).toThrow('provider must be one of: openai, mistral');
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

describe('AgentMemoryConfigValidator', () => {
  it('accepts a minimal blocks-mode config', () => {
    expect(() => AgentMemoryConfigValidator.validate({ mode: 'blocks' })).not.toThrow();
  });

  it('accepts a memfs-mode config with from_blocks', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [
        { block: 'persona', to: 'persona/learned-preferences.md', extract_section: 'Learned Preferences' },
        { block: 'image_prompting', to: 'capabilities/image-prompting.md' },
      ],
    })).not.toThrow();
  });

  it('accepts a memfs-mode config with only template_dir', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      template_dir: 'lib/fleet/memfs-templates/draper/',
    })).not.toThrow();
  });

  it('accepts preserve_existing_paths for memfs mode', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      template_dir: 'lib/fleet/memfs-templates/draper/',
      preserve_existing_paths: [
        'system/persona.md',
        'system/important_variables.md',
        'system/generation_state.md',
      ],
    })).not.toThrow();
  });

  it('accepts prune_missing_skills for memfs mode', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      template_dir: 'lib/fleet/memfs-templates/draper/',
      prune_missing_skills: true,
    })).not.toThrow();
  });

  it('accepts a memfs-mode config with only skills', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      skills: [
        { from_dir: 'agents/skills/media-generation' },
        { name: 'reference-handling', from_dir: 'agents/skills/reference' },
      ],
    })).not.toThrow();
  });

  it('accepts a memfs-mode config with only files', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [
        { to: 'system/important_variables.md', value: '# Important Variables' },
        { to: 'system/persona.md', from_file: 'agents/draper/persona.md' },
      ],
    })).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => AgentMemoryConfigValidator.validate(null as any)).toThrow('memory must be an object.');
    expect(() => AgentMemoryConfigValidator.validate('memfs' as any)).toThrow('memory must be an object.');
  });

  it('rejects an unknown mode', () => {
    expect(() => AgentMemoryConfigValidator.validate({ mode: 'hybrid' as any })).toThrow('memory.mode must be "blocks" or "memfs"');
  });

  it('rejects memfs mode without from_blocks or template_dir', () => {
    expect(() => AgentMemoryConfigValidator.validate({ mode: 'memfs' })).toThrow('none of from_blocks');
    expect(() => AgentMemoryConfigValidator.validate({ mode: 'memfs', from_blocks: [] })).toThrow('none of from_blocks');
  });

  it('rejects invalid skill configs', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      skills: 'media-generation' as any,
    })).toThrow('memory.skills must be an array');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      skills: [{ from_dir: '/absolute/path' }],
    })).toThrow('repo-relative path');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      skills: [{ name: 'MediaGeneration', from_dir: 'agents/skills/media-generation' }],
    })).toThrow('lowercase letters');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      skills: [
        { name: 'media-generation', from_dir: 'agents/skills/media-generation' },
        { name: 'media-generation', from_dir: 'agents/skills/media-generation-copy' },
      ],
    })).toThrow('duplicate skill name');
  });

  it('rejects invalid preserve_existing_paths configs', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      template_dir: 'templates',
      preserve_existing_paths: 'system/persona.md' as any,
    })).toThrow('memory.preserve_existing_paths must be an array');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      template_dir: 'templates',
      preserve_existing_paths: ['/system/persona.md'],
    })).toThrow('repo-relative path');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      template_dir: 'templates',
      preserve_existing_paths: ['system/persona.md', 'system/persona.md'],
    })).toThrow('duplicate path');
  });

  it('rejects invalid prune_missing_skills configs', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      template_dir: 'templates',
      prune_missing_skills: 'yes' as any,
    })).toThrow('memory.prune_missing_skills must be a boolean');
  });

  it('rejects invalid memory.files configs', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: 'system/persona.md' as any,
    })).toThrow('memory.files must be an array');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [{ to: '/system/persona.md', value: 'x' }],
    })).toThrow('repo-relative path');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [{ to: 'system/persona.txt', value: 'x' }],
    })).toThrow('must end in ".md"');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [{ to: 'system/persona.md', value: 'x', from_file: 'persona.md' }],
    })).toThrow('exactly one of value or from_file');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [{ to: 'system/persona.md' }],
    })).toThrow('exactly one of value or from_file');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [{ to: 'system/persona.md', from_file: '../persona.md' }],
    })).toThrow('repo-relative path');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [
        { to: 'system/persona.md', value: 'x' },
        { to: 'system/persona.md', value: 'y' },
      ],
    })).toThrow('duplicate target path');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [{ to: 'system/persona.md', from_file: 'persona.md', template_vars: { 'bad-key': 'x' } }],
    })).toThrow('uppercase letters');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      files: [{ to: 'system/persona.md', from_file: 'persona.md', template_vars: { GOOD_KEY: 123 } }],
    })).toThrow('must be a string');
  });

  it('rejects bare_repo value other than "auto"', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [{ block: 'p', to: 'x.md' }],
      bare_repo: 'github' as any,
    })).toThrow('memory.bare_repo must be "auto"');
  });

  it('rejects target paths with leading slash or ..', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [{ block: 'p', to: '/system/identity.md' }],
    })).toThrow('repo-relative path');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [{ block: 'p', to: '../outside.md' }],
    })).toThrow('repo-relative path');
  });

  it('rejects target paths that do not end in .md', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [{ block: 'p', to: 'system/identity.txt' }],
    })).toThrow('must end in ".md"');
  });

  it('rejects duplicate target paths', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [
        { block: 'a', to: 'system/identity.md' },
        { block: 'b', to: 'system/identity.md' },
      ],
    })).toThrow('duplicate target path');
  });

  it('rejects non-string extract_section', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [{ block: 'p', to: 'x.md', extract_section: 123 as any }],
    })).toThrow('extract_section must be a string');
  });

  it('validates verify block when set', () => {
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [{ block: 'p', to: 'x.md' }],
      verify: { require_core_memory_empty: 'yes' as any },
    })).toThrow('require_core_memory_empty must be a boolean');
    expect(() => AgentMemoryConfigValidator.validate({
      mode: 'memfs',
      from_blocks: [{ block: 'p', to: 'x.md' }],
      verify: { smoke_prompt: 123 as any },
    })).toThrow('smoke_prompt must be a string');
  });
});
