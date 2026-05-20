import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  computeMemfsAction,
  extractMarkdownSection,
  gitBlobSha,
  GIT_MEMORY_ENABLED_TAG,
  type ServerAgentState,
  type BlockSnapshot,
} from '../../../../src/lib/memfs-reconciler/plan';
import type { AgentConfig } from '../../../../src/types/fleet-config';

function mkBlock(label: string, value: string, extra: Partial<BlockSnapshot> = {}): BlockSnapshot {
  return { label, value, agentOwned: true, limit: 5000, id: `block-${label}`, ...extra };
}

function mkServer(opts: { tags?: string[]; blocks?: BlockSnapshot[]; files?: Record<string, string> } = {}): ServerAgentState {
  return {
    agentId: 'agent-test',
    tags: opts.tags ?? [],
    blocks: opts.blocks ?? [],
    bareRepoFiles: new Map(Object.entries(opts.files ?? {})),
  };
}

function mkAgent(memory?: AgentConfig['memory']): AgentConfig {
  return {
    name: 'test-agent',
    description: 'unit test agent',
    system_prompt: { value: 'You are a test.' },
    llm_config: { model: 'test/model', context_window: 4000 },
    memory,
  };
}

describe('computeMemfsAction', () => {
  it('returns no-op when memory absent and no tag', () => {
    const action = computeMemfsAction('test-agent', mkAgent(), mkServer(), '/tmp');
    expect(action.kind).toBe('no-op');
    if (action.kind === 'no-op') expect(action.reason).toContain('block-mode');
  });

  it('returns rollback when memory.mode=blocks and tag is set', () => {
    const action = computeMemfsAction('test-agent', mkAgent({ mode: 'blocks' }),
      mkServer({ tags: [GIT_MEMORY_ENABLED_TAG, 'tenant:foo'] }), '/tmp');
    expect(action.kind).toBe('rollback');
    if (action.kind === 'rollback') {
      expect(action.currentTags).toEqual([GIT_MEMORY_ENABLED_TAG, 'tenant:foo']);
    }
  });

  it('returns rollback when memory absent and tag is set', () => {
    const action = computeMemfsAction('test-agent', mkAgent(),
      mkServer({ tags: [GIT_MEMORY_ENABLED_TAG] }), '/tmp');
    expect(action.kind).toBe('rollback');
  });

  it('returns migrate-forward when memfs mode + no tag', () => {
    const blocks = [mkBlock('persona', 'My identity is X.')];
    const action = computeMemfsAction(
      'test-agent',
      mkAgent({
        mode: 'memfs',
        from_blocks: [{ block: 'persona', to: 'system/persona.md' }],
      }),
      mkServer({ blocks }),
      '/tmp',
    );
    expect(action.kind).toBe('migrate-forward');
    if (action.kind === 'migrate-forward') {
      expect(action.targetFiles.get('system/persona.md')).toBe('My identity is X.');
      expect(action.sourceBlocks).toEqual(blocks);
    }
  });

  it('returns no-op when memfs mode + tag set + no content drift', () => {
    const value = 'My identity is X.';
    const sha = gitBlobSha(value);
    const action = computeMemfsAction(
      'test-agent',
      mkAgent({
        mode: 'memfs',
        from_blocks: [{ block: 'persona', to: 'system/persona.md' }],
      }),
      mkServer({
        tags: [GIT_MEMORY_ENABLED_TAG],
        blocks: [mkBlock('persona', value)],
        files: { 'system/persona.md': sha },
      }),
      '/tmp',
    );
    expect(action.kind).toBe('no-op');
    if (action.kind === 'no-op') expect(action.reason).toContain('in sync');
  });

  it('returns sync-files-only when memfs mode + tag set + content drifted', () => {
    const action = computeMemfsAction(
      'test-agent',
      mkAgent({
        mode: 'memfs',
        from_blocks: [
          { block: 'persona', to: 'system/persona.md' },
          { block: 'image', to: 'capabilities/image.md' },
        ],
      }),
      mkServer({
        tags: [GIT_MEMORY_ENABLED_TAG],
        blocks: [
          mkBlock('persona', 'NEW identity'),
          mkBlock('image', 'image guidance'),
        ],
        files: {
          'system/persona.md': gitBlobSha('OLD identity'),
          'capabilities/image.md': gitBlobSha('image guidance'),
        },
      }),
      '/tmp',
    );
    expect(action.kind).toBe('sync-files-only');
    if (action.kind === 'sync-files-only') {
      expect(action.changedFiles.size).toBe(1);
      expect(action.changedFiles.get('system/persona.md')).toBe('NEW identity');
      expect(action.changedFiles.has('capabilities/image.md')).toBe(false);
    }
  });

  it('throws when a referenced block does not exist on the server', () => {
    expect(() =>
      computeMemfsAction(
        'test-agent',
        mkAgent({
          mode: 'memfs',
          from_blocks: [{ block: 'nonexistent', to: 'x.md' }],
        }),
        mkServer(),
        '/tmp',
      ),
    ).toThrow('block "nonexistent" referenced in memory.from_blocks does not exist');
  });

  it('extracts a section when extract_section is set', () => {
    const personaContent = [
      '# Persona',
      'I am Draper.',
      '',
      '## Learned Preferences',
      'I like overhead shots.',
      'I prefer Seedream for product.',
      '',
      '## Tools',
      'image_gen, video_gen',
    ].join('\n');
    const action = computeMemfsAction(
      'test-agent',
      mkAgent({
        mode: 'memfs',
        from_blocks: [
          { block: 'persona', to: 'persona/lp.md', extract_section: 'Learned Preferences' },
        ],
      }),
      mkServer({ blocks: [mkBlock('persona', personaContent)] }),
      '/tmp',
    );
    expect(action.kind).toBe('migrate-forward');
    if (action.kind === 'migrate-forward') {
      const content = action.targetFiles.get('persona/lp.md')!;
      expect(content).toContain('I like overhead shots.');
      expect(content).toContain('I prefer Seedream');
      expect(content).not.toContain('# Persona');
      expect(content).not.toContain('## Tools');
    }
  });
});

describe('extractMarkdownSection', () => {
  it('extracts a section and trims trailing whitespace', () => {
    const content = '## Foo\nfoo content\n\n## Bar\nbar';
    expect(extractMarkdownSection(content, 'Foo', 'a', 'b')).toBe('foo content\n');
  });

  it('extracts the last section to EOF if no subsequent same-or-shallower heading', () => {
    const content = '## Foo\nfoo content\n### Sub\nsubcontent';
    expect(extractMarkdownSection(content, 'Foo', 'a', 'b')).toBe('foo content\n### Sub\nsubcontent\n');
  });

  it('throws when section is missing', () => {
    expect(() => extractMarkdownSection('## Other\n', 'Missing', 'a', 'b')).toThrow(
      'extract_section "Missing" not found in block "b"',
    );
  });
});

describe('capability_index_file resolution', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lettactl-plan-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads capability_index_file content from template_dir and adds it to target files', () => {
    const templates = path.join(tmpDir, 'templates');
    fs.mkdirSync(path.join(templates, 'system'), { recursive: true });
    const indexContent = '---\ndescription: index\n---\n# Index\nfoo';
    fs.writeFileSync(path.join(templates, 'system', 'capability-index.md'), indexContent);

    const action = computeMemfsAction(
      'test-agent',
      mkAgent({
        mode: 'memfs',
        from_blocks: [{ block: 'persona', to: 'system/persona.md' }],
        template_dir: 'templates',
        capability_index_file: 'system/capability-index.md',
      }),
      mkServer({ blocks: [mkBlock('persona', 'identity')] }),
      tmpDir,
    );
    expect(action.kind).toBe('migrate-forward');
    if (action.kind === 'migrate-forward') {
      expect(action.targetFiles.get('system/capability-index.md')).toBe(indexContent);
    }
  });

  it('throws when capability_index_file is set without template_dir', () => {
    expect(() =>
      computeMemfsAction(
        'test-agent',
        mkAgent({
          mode: 'memfs',
          from_blocks: [{ block: 'p', to: 'x.md' }],
          capability_index_file: 'system/capability-index.md',
        }),
        mkServer({ blocks: [mkBlock('p', 'content')] }),
        tmpDir,
      ),
    ).toThrow('memory.capability_index_file is set but memory.template_dir is not');
  });

  it('throws when capability_index_file does not exist on disk', () => {
    expect(() =>
      computeMemfsAction(
        'test-agent',
        mkAgent({
          mode: 'memfs',
          from_blocks: [{ block: 'p', to: 'x.md' }],
          template_dir: 'templates',
          capability_index_file: 'system/missing.md',
        }),
        mkServer({ blocks: [mkBlock('p', 'content')] }),
        tmpDir,
      ),
    ).toThrow('capability_index_file does not exist');
  });
});

describe('gitBlobSha', () => {
  it('matches git hash-object output for known inputs', () => {
    // `git hash-object --stdin` for "" is e69de29bb2d1d6434b8b29ae775ad8c2e48c5391
    expect(gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    // `git hash-object --stdin` for "hello\n" is ce013625030ba8dba906f756967f9e9ca394464a
    expect(gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
  });
});
