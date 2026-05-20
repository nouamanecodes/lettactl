/**
 * Memfs reconciliation — execution layer.
 *
 * Consumes a MemfsAction from ./plan.ts and applies it (or reports the plan
 * in dry-run mode). Handles the atomic-flip migration: snapshot blocks ->
 * push files to bare repo -> PATCH agent.tags += [git-memory-enabled].
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

    await this.letta.updateAgent(action.agentId, { tags: newTags });
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

    // Phase 1: clone bare repo, write files, commit, push
    const commitMessage = `migrate: ${action.targetFiles.size} blocks -> memfs (lettactl ${this.opts.lettactlVersion})`;
    let tempDir: string | null = null;
    let commitSha: string;
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

    // Phase 2: atomic flip — add tag
    const newTags = [...action.currentTags, GIT_MEMORY_ENABLED_TAG];
    await this.letta.updateAgent(action.agentId, { tags: newTags });

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
}
