import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { delimiter } from 'path';
import path from 'path';
import { promisify } from 'util';
import type { FleetConfig } from '../../types/fleet-config';

const execFileAsync = promisify(execFile);

export function fleetUsesMemfs(config: FleetConfig): boolean {
  return config.agents.some((agent) => agent.memory?.mode === 'memfs');
}

export async function assertLettaCliAvailableForMemfs(config: FleetConfig): Promise<void> {
  if (!fleetUsesMemfs(config)) return;

  const command = resolveLettaCodeCli();
  try {
    await execFileAsync(command, ['skills', '--help'], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (err: any) {
    const detail = [
      err?.code ? `code=${err.code}` : '',
      err?.stdout ? `stdout=${String(err.stdout).trim()}` : '',
      err?.stderr ? `stderr=${String(err.stderr).trim()}` : '',
      err?.message ? `message=${err.message}` : '',
    ].filter(Boolean).join('\n  ');

    throw new Error(
      `MemFS agents require a working Letta Code CLI so runtime skills can be materialized.\n` +
      `Could not run: ${command} skills --help\n\n` +
      `Install or update the "letta" CLI in the same environment running lettactl, ` +
      `or set LETTA_CODE_CLI=/absolute/path/to/letta.\n` +
      `If you are deploying self-managed runtimes, the runtime image must also include "letta".` +
      (detail ? `\n\nDetails:\n  ${detail}` : ''),
    );
  }
}

export function resolveLettaCodeCli(): string {
  if (process.env.LETTA_CODE_CLI) return process.env.LETTA_CODE_CLI;

  const candidates = unique([
    path.join(process.cwd(), 'node_modules', '.bin', 'letta'),
    path.join(process.cwd(), 'node_modules', '.pnpm', 'node_modules', '.bin', 'letta'),
    ...pathCandidates('letta'),
    process.execPath ? path.join(path.dirname(process.execPath), 'letta') : '',
  ]);

  return candidates.find((candidate) => existsSync(candidate)) || 'letta';
}

function pathCandidates(binaryName: string): string[] {
  return (process.env.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, binaryName));
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
