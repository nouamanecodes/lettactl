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

  // lettactl materializes memfs skills by pushing to the runtime's git endpoint
  // (/v1/git) — it never runs `letta` itself. The `letta` CLI is a RUNTIME need
  // (the server that renders skills). On Letta Cloud that runtime is managed and
  // always has it, so there is nothing to verify client-side — skip entirely.
  if (isLettaCloud()) return;

  // Self-hosted / local runtime: we still don't run `letta` here, but the
  // runtime image must include it to render skills. We can only probe the client
  // env — a weak proxy — so WARN, never block. The git push (the actual work) is
  // unaffected; a missing runtime `letta` surfaces at skill-render time.
  const command = resolveLettaCodeCli();
  try {
    await execFileAsync(command, ['skills', '--help'], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (err: any) {
    console.warn(
      `[lettactl] Could not run "${command} skills --help" in this environment. ` +
      `lettactl does not need it (memfs is materialized over git), but a SELF-HOSTED ` +
      `runtime image must include "letta" to render skills (set LETTA_CODE_CLI to override the path). ` +
      `This does NOT block the deploy.` +
      (err?.message ? `\n  ${err.message}` : ''),
    );
  }
}

/** True when deploying against Letta Cloud (letta.com / *.letta.com). */
function isLettaCloud(): boolean {
  const url = process.env.LETTA_BASE_URL;
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'letta.com' || host.endsWith('.letta.com');
  } catch {
    return false;
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
