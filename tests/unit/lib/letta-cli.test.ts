import {
  assertLettaCliAvailableForMemfs,
  fleetUsesMemfs,
} from '../../../src/lib/memfs-reconciler/letta-cli';

describe('letta CLI MemFS preflight', () => {
  const memfsFleet: any = {
    agents: [{
      name: 'agent-a',
      description: 'd',
      system_prompt: { value: 'p' },
      llm_config: { model: 'm', context_window: 1000 },
      memory: { mode: 'memfs' },
    }],
  };

  const blockFleet: any = {
    agents: [{
      name: 'agent-a',
      description: 'd',
      system_prompt: { value: 'p' },
      llm_config: { model: 'm', context_window: 1000 },
    }],
  };

  afterEach(() => {
    delete process.env.LETTA_CODE_CLI;
  });

  it('detects memfs fleets', () => {
    expect(fleetUsesMemfs(memfsFleet)).toBe(true);
    expect(fleetUsesMemfs(blockFleet)).toBe(false);
  });

  it('skips non-memfs fleets', async () => {
    process.env.LETTA_CODE_CLI = '/definitely/not/a/letta/binary';
    await expect(assertLettaCliAvailableForMemfs(blockFleet)).resolves.toBeUndefined();
  });

  it('fails with an actionable message when letta CLI is missing', async () => {
    process.env.LETTA_CODE_CLI = '/definitely/not/a/letta/binary';
    await expect(assertLettaCliAvailableForMemfs(memfsFleet)).rejects.toThrow(
      'MemFS agents require a working Letta Code CLI',
    );
    await expect(assertLettaCliAvailableForMemfs(memfsFleet)).rejects.toThrow(
      'LETTA_CODE_CLI=/absolute/path/to/letta',
    );
  });
});
