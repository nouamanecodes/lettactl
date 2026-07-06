import {
  assertLettaCliAvailableForMemfs,
  fleetUsesMemfs,
  resolveLettaCodeCli,
} from '../../../src/lib/memfs-reconciler/letta-cli';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter } from 'path';
import path from 'path';

describe('letta CLI MemFS preflight', () => {
  const originalCwd = process.cwd();
  const originalPath = process.env.PATH;

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
    process.env.PATH = originalPath;
    process.chdir(originalCwd);
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

  it('uses pnpm internal bin when letta is not on PATH', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lettactl-letta-cli-'));
    const binDir = path.join(dir, 'node_modules', '.pnpm', 'node_modules', '.bin');
    const cliPath = path.join(binDir, 'letta');

    mkdirSync(binDir, { recursive: true });
    writeFileSync(cliPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    process.chdir(dir);

    await expect(assertLettaCliAvailableForMemfs(memfsFleet)).resolves.toBeUndefined();

    rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to a letta binary on PATH for global installs', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lettactl-global-letta-'));
    const binDir = path.join(dir, 'bin');
    const cliPath = path.join(binDir, 'letta');

    mkdirSync(binDir, { recursive: true });
    writeFileSync(cliPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    process.chdir(dir);
    process.env.PATH = binDir + delimiter + (originalPath || '');

    expect(resolveLettaCodeCli()).toBe(cliPath);

    rmSync(dir, { recursive: true, force: true });
  });
});
