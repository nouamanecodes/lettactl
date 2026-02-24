import { collectDesiredResourceNames } from '../../../src/lib/apply/apply-helpers';

describe('collectDesiredResourceNames', () => {
  it('collects block names from shared_blocks and agent memory_blocks/shared_blocks', () => {
    const config = {
      shared_blocks: [{ name: 'global_context' }],
      agents: [
        {
          memory_blocks: [{ name: 'persona' }, { name: 'policies' }],
          shared_blocks: ['global_context'],
        },
        {
          memory_blocks: [{ name: 'brand_identity' }],
        },
      ],
    };

    const { blockNames } = collectDesiredResourceNames(config);

    expect(blockNames).toEqual(new Set(['global_context', 'persona', 'policies', 'brand_identity']));
  });

  it('collects folder names from agents and shared_folders', () => {
    const config = {
      shared_folders: [{ name: 'shared_docs' }],
      agents: [
        { folders: [{ name: 'research' }] },
        { folders: [{ name: 'shared_docs' }, { name: 'notes' }] },
      ],
    };

    const { folderNames } = collectDesiredResourceNames(config);

    expect(folderNames).toEqual(new Set(['shared_docs', 'research', 'notes']));
  });

  it('collects archive names from agents', () => {
    const config = {
      agents: [
        { archives: [{ name: 'search_index' }] },
        { archives: [{ name: 'metrics' }] },
      ],
    };

    const { archiveNames } = collectDesiredResourceNames(config);

    expect(archiveNames).toEqual(new Set(['search_index', 'metrics']));
  });

  it('returns empty sets for minimal config', () => {
    const { blockNames, folderNames, archiveNames } = collectDesiredResourceNames({ agents: [] });

    expect(blockNames.size).toBe(0);
    expect(folderNames.size).toBe(0);
    expect(archiveNames.size).toBe(0);
  });
});
