import {
  displayDryRunResults,
  formatMemfsFileList,
  type DryRunResult,
} from '../../../../src/lib/apply/dry-run';
import * as logger from '../../../../src/lib/shared/logger';
import type { MemfsAction } from '../../../../src/lib/memfs-reconciler/plan';

describe('formatMemfsFileList', () => {
  it('renders 0 files as "0 files"', () => {
    expect(formatMemfsFileList(0, [])).toBe('0 files');
  });
  it('renders 1 file with basename', () => {
    expect(formatMemfsFileList(1, ['system/identity.md'])).toBe('1 file: identity.md');
  });
  it('renders 2 files with both basenames', () => {
    expect(formatMemfsFileList(2, ['a/x.md', 'b/y.md'])).toBe('2 files: x.md, y.md');
  });
  it('renders 3-5 files as first 2 + remaining count', () => {
    expect(formatMemfsFileList(3, ['a.md', 'b.md', 'c.md'])).toBe('3 files: a.md, b.md, +1 more');
    expect(formatMemfsFileList(5, ['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])).toBe(
      '5 files: a.md, b.md, +3 more',
    );
  });
  it('renders 6+ files as count only', () => {
    expect(formatMemfsFileList(25, Array.from({ length: 25 }, (_, i) => `f${i}.md`))).toBe('25 files');
  });
});

describe('displayDryRunResults memfs rendering', () => {
  let outputSpy: jest.SpyInstance;
  let lines: string[];

  beforeEach(() => {
    lines = [];
    outputSpy = jest.spyOn(logger, 'output').mockImplementation((s: string) => {
      lines.push(s);
    });
  });

  afterEach(() => {
    outputSpy.mockRestore();
  });

  function makeMigrateForward(fileCount = 3): MemfsAction {
    const targetFiles = new Map<string, string>();
    for (let i = 0; i < fileCount; i++) targetFiles.set(`system/file${i}.md`, `content${i}`);
    return {
      kind: 'migrate-forward',
      agentId: 'agent-1',
      currentTags: ['tenant:foo'],
      sourceBlocks: [],
      targetFiles,
      deletedFiles: [],
      newProvenance: new Map(),
    };
  }

  function makeSyncOnly(paths: string[], deletedFiles: string[] = []): MemfsAction {
    const changedFiles = new Map<string, string>();
    for (const p of paths) changedFiles.set(p, 'x');
    return { kind: 'sync-files-only', agentId: 'agent-1', changedFiles, deletedFiles, newProvenance: new Map() };
  }

  it('renders migrate-forward with file list and backup path', () => {
    const result: DryRunResult = {
      name: 'agent-a',
      action: 'update',
      operations: { operationCount: 1 } as any,
      memfsAction: makeMigrateForward(3),
      memfsResult: {
        kind: 'migrate-forward',
        agentId: 'agent-1',
        status: 'dry-run',
        backupPath: '/tmp/backup.json',
        filesChanged: ['system/file0.md', 'system/file1.md', 'system/file2.md'],
        newTags: ['tenant:foo', 'git-memory-enabled'],
      },
    };
    displayDryRunResults([result], false);
    const memfsLines = lines.filter((l) => l.includes('Memfs'));
    expect(memfsLines.some((l) => l.includes('migrate-forward'))).toBe(true);
    expect(memfsLines.some((l) => l.includes('3 files'))).toBe(true);
    expect(memfsLines.some((l) => l.includes('git-memory-enabled'))).toBe(true);
    expect(lines.some((l) => l.includes('/tmp/backup.json'))).toBe(true);
  });

  it('renders sync-files-only with comma-separated basenames for small counts', () => {
    const result: DryRunResult = {
      name: 'agent-b',
      action: 'update',
      operations: { operationCount: 1 } as any,
      memfsAction: makeSyncOnly(['capabilities/image/prompting.md', 'system/identity.md']),
    };
    displayDryRunResults([result], false);
    const memfsLines = lines.filter((l) => l.includes('Memfs'));
    expect(memfsLines.some((l) => l.includes('sync-files-only'))).toBe(true);
    expect(lines.some((l) => l.includes('prompting.md'))).toBe(true);
    expect(lines.some((l) => l.includes('identity.md'))).toBe(true);
  });

  it('renders sync-files-only deleted files', () => {
    const result: DryRunResult = {
      name: 'agent-b',
      action: 'update',
      operations: { operationCount: 1 } as any,
      memfsAction: makeSyncOnly([], ['skills/old/SKILL.md']),
    };
    displayDryRunResults([result], false);
    const memfsLines = lines.filter((l) => l.includes('Memfs'));
    expect(memfsLines.some((l) => l.includes('sync-files-only'))).toBe(true);
    expect(lines.some((l) => l.includes('SKILL.md'))).toBe(true);
  });

  it('renders rollback', () => {
    const result: DryRunResult = {
      name: 'agent-c',
      action: 'update',
      operations: { operationCount: 1 } as any,
      memfsAction: { kind: 'rollback', agentId: 'agent-1', currentTags: ['git-memory-enabled'] },
    };
    displayDryRunResults([result], false);
    const memfsLines = lines.filter((l) => l.includes('Memfs'));
    expect(memfsLines.some((l) => l.includes('rollback'))).toBe(true);
    expect(memfsLines.some((l) => l.includes('remove tag'))).toBe(true);
  });

  it('renders no-op with reason', () => {
    const result: DryRunResult = {
      name: 'agent-d',
      action: 'update',
      operations: { operationCount: 1 } as any,
      memfsAction: { kind: 'no-op', agentId: 'agent-1', reason: 'memfs in sync: 25 files match bare repo HEAD' },
    };
    displayDryRunResults([result], false);
    const memfsLines = lines.filter((l) => l.includes('Memfs'));
    expect(memfsLines.some((l) => l.includes('no-op'))).toBe(true);
    expect(memfsLines.some((l) => l.includes('25 files match'))).toBe(true);
  });

  it('renders memfsError as warn line', () => {
    const result: DryRunResult = {
      name: 'agent-e',
      action: 'update',
      operations: { operationCount: 1 } as any,
      memfsError: 'agent will be created — memfs reconcile runs on next apply',
    };
    displayDryRunResults([result], false);
    const memfsLines = lines.filter((l) => l.includes('Memfs'));
    expect(memfsLines.some((l) => l.includes('Memfs [!]:'))).toBe(true);
    expect(memfsLines.some((l) => l.includes('agent will be created'))).toBe(true);
  });

  it('surfaces memfs-only drift on an otherwise-unchanged agent under an "update" header', () => {
    const result: DryRunResult = {
      name: 'agent-f',
      action: 'unchanged',
      memfsAction: makeSyncOnly(['system/identity.md']),
    };
    displayDryRunResults([result], false);
    expect(lines.some((l) => l.includes('agent-f') && l.toLowerCase().includes('update'))).toBe(true);
    const memfsLines = lines.filter((l) => l.includes('Memfs'));
    expect(memfsLines.some((l) => l.includes('sync-files-only'))).toBe(true);
  });

  it('counts memfs drift toward header totalChanges (not no-changes)', () => {
    // Agent unchanged at the config level, but memfs has drift → header should NOT say "no changes"
    const result: DryRunResult = {
      name: 'agent-g',
      action: 'unchanged',
      memfsAction: makeMigrateForward(2),
    };
    displayDryRunResults([result], false);
    // Header line printed early shows drift state — check we see "DRIFT" (or absence of "no changes")
    const headerJoined = lines.join('\n');
    expect(headerJoined.toLowerCase()).toContain('drift');
  });

  it('no-op memfs alone on unchanged agent does NOT bump totalChanges', () => {
    const result: DryRunResult = {
      name: 'agent-h',
      action: 'unchanged',
      memfsAction: { kind: 'no-op', agentId: 'agent-1', reason: 'memfs in sync' },
    };
    displayDryRunResults([result], false);
    const headerJoined = lines.join('\n');
    expect(headerJoined.toLowerCase()).toContain('no changes');
  });
});
