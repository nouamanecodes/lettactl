/**
 * Memfs reconciliation — execution layer.
 *
 * Consumes a MemfsAction from ./plan.ts and applies it (or reports the plan
 * in dry-run mode). Handles migration: snapshot blocks -> enable MemFS marker
 * so Cloud initializes the memory repo -> push files -> verify remote files.
 *
 * Rollback is just `PATCH agent.tags -= [git-memory-enabled]`. Memfs files
 * are left in place — they're "dead" while the tag is absent, and become
 * live again on the next forward migration.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { LettaClientWrapper } from '../client/letta-client';
import { GitClient } from './git-client';
import {
  type MemfsAction,
  GIT_MEMORY_ENABLED_TAG,
  GIT_MEMORY_ENABLED_METADATA_KEY,
  gitBlobSha,
} from './plan';

export interface MemfsExecutorOptions {
  dryRun: boolean;
  backupDir: string; // where to write block snapshots before forward migrations
  lettactlVersion: string; // embedded in commit messages
}

export interface MemfsExecutionResult {
  kind: MemfsAction['kind'];
  agentId: string;
  status: 'applied' | 'dry-run' | 'noop' | 'failed';
  backupPath?: string;
  commitSha?: string;
  newTags?: string[];
  filesChanged?: string[];
  error?: string;
}

export class MemfsReconciler {
  constructor(
    private readonly letta: LettaClientWrapper,
    private readonly git: GitClient,
    private readonly opts: MemfsExecutorOptions,
  ) {}

  async execute(action: MemfsAction): Promise<MemfsExecutionResult> {
    try {
      switch (action.kind) {
        case 'no-op':
          return { kind: 'no-op', agentId: action.agentId, status: 'noop' };

        case 'rollback':
          return await this.executeRollback(action);

        case 'migrate-forward':
          return await this.executeMigrateForward(action);

        case 'sync-files-only':
          return await this.executeSyncFiles(action);
      }
    } catch (err) {
      const e = err as Error;
      // eslint-disable-next-line no-console
      console.error(`[MemfsReconciler] action ${action.kind} failed for ${action.agentId}:`, e);
      return {
        kind: action.kind,
        agentId: action.agentId,
        status: 'failed',
        error: e.message,
      };
    }
  }

  private async executeRollback(
    action: Extract<MemfsAction, { kind: 'rollback' }>,
  ): Promise<MemfsExecutionResult> {
    const newTags = action.currentTags.filter((t) => t !== GIT_MEMORY_ENABLED_TAG);

    if (this.opts.dryRun) {
      return {
        kind: 'rollback',
        agentId: action.agentId,
        status: 'dry-run',
        newTags,
      };
    }

    await this.setMemfsEnabled(action.agentId, false, newTags);
    return {
      kind: 'rollback',
      agentId: action.agentId,
      status: 'applied',
      newTags,
    };
  }

  private async executeMigrateForward(
    action: Extract<MemfsAction, { kind: 'migrate-forward' }>,
  ): Promise<MemfsExecutionResult> {
    // Always write the block snapshot (even in dry-run) so operators have a
    // ready-made restore source if anything goes wrong post-flip.
    const backupPath = await this.writeBlockSnapshot(action.agentId, action.sourceBlocks);
    const filesChanged = Array.from(action.targetFiles.keys());

    if (this.opts.dryRun) {
      return {
        kind: 'migrate-forward',
        agentId: action.agentId,
        status: 'dry-run',
        backupPath,
        newTags: [...action.currentTags, GIT_MEMORY_ENABLED_TAG],
        filesChanged,
      };
    }

    // Phase 1: enable marker first. Letta Cloud may initialize/reset the memory
    // repo when the marker is written, so pushing files before this can appear
    // successful locally and then disappear from a fresh remote clone.
    const newTags = [...action.currentTags, GIT_MEMORY_ENABLED_TAG];
    await this.setMemfsEnabled(action.agentId, true, newTags);

    // Phase 2: clone initialized bare repo, write files, commit, push
    const commitMessage = `migrate: ${action.targetFiles.size} blocks -> memfs (lettactl ${this.opts.lettactlVersion})`;
    let tempDir: string | null = null;
    let commitSha: string | undefined;
    try {
      try {
        tempDir = await this.git.cloneToTemp(action.agentId);
        commitSha = await this.git.writeCommitPush(tempDir, action.targetFiles, commitMessage);
      } finally {
        if (tempDir) {
          await this.git.cleanup(tempDir).catch((e) => {
            // eslint-disable-next-line no-console
            console.error('[MemfsReconciler.executeMigrateForward] cleanup errored:', e);
          });
        }
      }

      const remoteVerify = await this.verifyRemoteFiles(action.agentId, action.targetFiles);
      if (!remoteVerify.ok) {
        await this.rollbackMemfsMarker(action.agentId, action.currentTags, 'verify-failure');
        return {
          kind: 'migrate-forward',
          agentId: action.agentId,
          status: 'failed',
          backupPath,
          commitSha,
          filesChanged,
          error:
            `Remote MemFS verification failed after push: ${remoteVerify.error}. ` +
            `MemFS marker was rolled back; retry apply after the remote git repo is healthy.`,
        };
      }
    } catch (err) {
      await this.setMemfsEnabled(action.agentId, false, action.currentTags).catch((e) => {
        // eslint-disable-next-line no-console
        console.error('[MemfsReconciler.executeMigrateForward] rollback-after-push-failure errored:', e);
      });
      throw err;
    }

    // Phase 3: verify — /context should now show core_memory: 0 tokens
    try {
      const ctx = await this.letta.getAgentContext(action.agentId);
      if (ctx?.num_tokens_core_memory !== 0) {
        // Don't auto-rollback — operator should investigate. Return failed.
        return {
          kind: 'migrate-forward',
          agentId: action.agentId,
          status: 'failed',
          backupPath,
          commitSha,
          newTags,
          filesChanged,
          error:
            `Post-flip verify failed: expected num_tokens_core_memory=0 ` +
            `but got ${ctx?.num_tokens_core_memory ?? '<missing>'}. ` +
            `Tag IS set on the agent. Investigate before retrying — ` +
            `do not assume rollback is safe.`,
        };
      }
    } catch (verifyErr) {
      // Verification failed but migration completed. Surface as warning, not failure.
      return {
        kind: 'migrate-forward',
        agentId: action.agentId,
        status: 'applied',
        backupPath,
        commitSha,
        newTags,
        filesChanged,
        error: `Migration applied but verify failed: ${(verifyErr as Error).message}`,
      };
    }

    return {
      kind: 'migrate-forward',
      agentId: action.agentId,
      status: 'applied',
      backupPath,
      commitSha,
      newTags,
      filesChanged,
    };
  }

  private async executeSyncFiles(
    action: Extract<MemfsAction, { kind: 'sync-files-only' }>,
  ): Promise<MemfsExecutionResult> {
    const filesChanged = Array.from(action.changedFiles.keys());

    if (this.opts.dryRun) {
      return {
        kind: 'sync-files-only',
        agentId: action.agentId,
        status: 'dry-run',
        filesChanged,
      };
    }

    const commitMessage = `update: ${action.changedFiles.size} files changed (lettactl ${this.opts.lettactlVersion})`;
    let tempDir: string | null = null;
    let commitSha: string;
    try {
      tempDir = await this.git.cloneToTemp(action.agentId);
      commitSha = await this.git.writeCommitPush(tempDir, action.changedFiles, commitMessage);
    } finally {
      if (tempDir) {
        await this.git.cleanup(tempDir).catch((e) => {
          // eslint-disable-next-line no-console
          console.error('[MemfsReconciler.executeSyncFiles] cleanup errored:', e);
        });
      }
    }

    const remoteVerify = await this.verifyRemoteFiles(action.agentId, action.changedFiles);
    if (!remoteVerify.ok) {
      return {
        kind: 'sync-files-only',
        agentId: action.agentId,
        status: 'failed',
        commitSha,
        filesChanged,
        error: `Remote MemFS verification failed after push: ${remoteVerify.error}.`,
      };
    }

    return {
      kind: 'sync-files-only',
      agentId: action.agentId,
      status: 'applied',
      commitSha,
      filesChanged,
    };
  }

  private async writeBlockSnapshot(agentId: string, blocks: import('./plan').BlockSnapshot[]): Promise<string> {
    await fs.mkdir(this.opts.backupDir, { recursive: true });
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotPath = path.join(this.opts.backupDir, `${agentId}-${iso}.json`);
    const payload = {
      agentId,
      capturedAt: new Date().toISOString(),
      blocks: blocks.map((b) => ({
        id: b.id,
        label: b.label,
        value: b.value,
        description: b.description,
        limit: b.limit,
        agent_owned: b.agentOwned,
      })),
    };
    await fs.writeFile(snapshotPath, JSON.stringify(payload, null, 2), 'utf8');
    return snapshotPath;
  }

  private async setMemfsEnabled(
    agentId: string,
    enabled: boolean,
    tags: string[],
  ): Promise<void> {
    const agent = await this.letta.getAgent(agentId);
    const metadata = { ...((agent as any).metadata ?? {}) };
    if (enabled) {
      metadata[GIT_MEMORY_ENABLED_METADATA_KEY] = true;
    } else {
      delete metadata[GIT_MEMORY_ENABLED_METADATA_KEY];
    }

    // Tags remain for self-hosted/legacy servers. Cloud currently accepts the
    // field but does not persist it, so metadata is the durable marker.
    await this.letta.updateAgent(agentId, { tags, metadata });
  }

  private async rollbackMemfsMarker(agentId: string, currentTags: string[], reason: string): Promise<void> {
    await this.setMemfsEnabled(agentId, false, currentTags).catch((e) => {
      // eslint-disable-next-line no-console
      console.error(`[MemfsReconciler.executeMigrateForward] rollback-after-${reason} errored:`, e);
    });
  }

  private async verifyRemoteFiles(
    agentId: string,
    expectedFiles: Map<string, string>,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const expectedShas = mapContentToBlobShas(expectedFiles);
    let lastError = '';

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const remoteFiles = await this.git.listBareRepoFiles(agentId);
        const mismatches = findRemoteFileMismatches(expectedShas, remoteFiles);
        if (mismatches.length === 0) return { ok: true };
        lastError = summarizeMismatches(mismatches);
      } catch (err) {
        lastError = (err as Error).message;
      }

      if (attempt < 4) {
        await sleep(250 * 2 ** (attempt - 1));
      }
    }

    return { ok: false, error: lastError || 'unknown mismatch' };
  }
}

export function mapContentToBlobShas(files: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [filePath, content] of files) {
    out.set(filePath, gitBlobSha(content));
  }
  return out;
}

export function findRemoteFileMismatches(
  expectedShas: Map<string, string>,
  remoteShas: Map<string, string>,
): Array<{ path: string; reason: 'missing' | 'sha-mismatch'; expected: string; actual?: string }> {
  const out: Array<{ path: string; reason: 'missing' | 'sha-mismatch'; expected: string; actual?: string }> = [];
  for (const [filePath, expected] of expectedShas) {
    const actual = remoteShas.get(filePath);
    if (!actual) {
      out.push({ path: filePath, reason: 'missing', expected });
    } else if (actual !== expected) {
      out.push({ path: filePath, reason: 'sha-mismatch', expected, actual });
    }
  }
  return out;
}

function summarizeMismatches(
  mismatches: Array<{ path: string; reason: 'missing' | 'sha-mismatch'; expected: string; actual?: string }>,
): string {
  const preview = mismatches
    .slice(0, 5)
    .map((m) => `${m.path} ${m.reason}${m.actual ? ` (${m.actual.slice(0, 7)} != ${m.expected.slice(0, 7)})` : ''}`);
  const suffix = mismatches.length > 5 ? `, +${mismatches.length - 5} more` : '';
  return `${mismatches.length} file mismatch${mismatches.length === 1 ? '' : 'es'}: ${preview.join(', ')}${suffix}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
