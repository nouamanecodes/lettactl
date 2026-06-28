import {
  findRemoteFileMismatches,
  mapContentToBlobShas,
} from '../../../../src/lib/memfs-reconciler/executor';
import { gitBlobSha } from '../../../../src/lib/memfs-reconciler/plan';

describe('memfs executor remote verification helpers', () => {
  it('maps content to git blob shas', () => {
    const mapped = mapContentToBlobShas(new Map([
      ['skills/test/SKILL.md', 'hello\n'],
    ]));

    expect(mapped.get('skills/test/SKILL.md')).toBe(gitBlobSha('hello\n'));
  });

  it('detects missing remote files', () => {
    const mismatches = findRemoteFileMismatches(
      new Map([
        ['skills/test/SKILL.md', 'abc123'],
      ]),
      new Map(),
    );

    expect(mismatches).toEqual([
      {
        path: 'skills/test/SKILL.md',
        reason: 'missing',
        expected: 'abc123',
      },
    ]);
  });

  it('detects remote sha mismatches', () => {
    const mismatches = findRemoteFileMismatches(
      new Map([
        ['skills/test/SKILL.md', 'expected'],
      ]),
      new Map([
        ['skills/test/SKILL.md', 'actual'],
      ]),
    );

    expect(mismatches).toEqual([
      {
        path: 'skills/test/SKILL.md',
        reason: 'sha-mismatch',
        expected: 'expected',
        actual: 'actual',
      },
    ]);
  });

  it('returns no mismatches when expected files match remote', () => {
    const mismatches = findRemoteFileMismatches(
      new Map([
        ['skills/test/SKILL.md', 'same'],
      ]),
      new Map([
        ['skills/test/SKILL.md', 'same'],
        ['unmanaged.md', 'ignored'],
      ]),
    );

    expect(mismatches).toEqual([]);
  });
});
