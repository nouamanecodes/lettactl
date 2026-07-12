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
  const originalBaseUrl = process.env.LETTA_BASE_URL;

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
    if (originalBaseUrl === undefined) delete process.env.LETTA_BASE_URL;
    else process.env.LETTA_BASE_URL = originalBaseUrl;
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

  it('warns but does NOT throw when letta CLI is missing (self-hosted)', async () => {
    process.env.LETTA_CODE_CLI = '/definitely/not/a/letta/binary';
    delete process.env.LETTA_BASE_URL; // non-cloud → probe runs, but only warns
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(assertLettaCliAvailableForMemfs(memfsFleet)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('skips the preflight entirely for Letta Cloud (no probe, no warning)', async () => {
    process.env.LETTA_CODE_CLI = '/definitely/not/a/letta/binary';
    process.env.LETTA_BASE_URL = 'https://api.letta.com';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(assertLettaCliAvailableForMemfs(memfsFleet)).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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
