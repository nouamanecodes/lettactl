/**
 * Memfs reconciliation — planning layer.
 *
 * Pure functions that diff an agent's desired state (YAML `memory:` section)
 * against its actual state on the Letta server (tags + blocks + bare repo
 * file SHAs) and emit a `MemfsAction` describing what to do.
 *
 * No IO here — the executor (see ./executor.ts) consumes these actions.
 *
 * See: docs/research/1531-migration-tooling.md (atomic-flip model)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type { AgentConfig, AgentMemoryConfig } from '../../types/fleet-config';

export interface BlockSnapshot {
  label: string;
  value: string;
  description?: string;
  agentOwned: boolean;
  limit: number;
  id: string;
}

export interface ServerAgentState {
  agentId: string;
  tags: string[];
  blocks: BlockSnapshot[];
  // path -> blob SHA at HEAD of the bare repo. Empty if no commits yet.
  bareRepoFiles: Map<string, string>;
}

export const GIT_MEMORY_ENABLED_TAG = 'git-memory-enabled';

export type MemfsAction =
  | {
      kind: 'no-op';
      agentId: string;
      reason: string;
    }
  | {
      kind: 'migrate-forward';
      agentId: string;
      currentTags: string[];
      sourceBlocks: BlockSnapshot[];
      // Full target file set to push (path -> content).
      targetFiles: Map<string, string>;
    }
  | {
      kind: 'rollback';
      agentId: string;
      currentTags: string[];
    }
  | {
      kind: 'sync-files-only';
      agentId: string;
      // Only files whose content differs from the bare repo (or are new).
      changedFiles: Map<string, string>;
    };

/**
 * Diff YAML's desired memory mode against the server's actual state.
 *
 * Decision matrix:
 *   yaml.memory absent OR mode=blocks
 *     + no tag    -> no-op
 *     + tag set   -> rollback (remove tag)
 *   yaml.memory mode=memfs
 *     + no tag    -> migrate-forward (push files, then add tag)
 *     + tag set, no content drift -> no-op
 *     + tag set, content drift    -> sync-files-only (push changed files only)
 */
export function computeMemfsAction(
  agentName: string,
  yaml: AgentConfig,
  server: ServerAgentState,
  rootPath: string,
): MemfsAction {
  const hasTag = server.tags.includes(GIT_MEMORY_ENABLED_TAG);
  const memory = yaml.memory;

  // No memory section, or explicitly blocks-mode
  if (!memory || memory.mode === 'blocks') {
    if (hasTag) {
      return {
        kind: 'rollback',
        agentId: server.agentId,
        currentTags: server.tags,
      };
    }
    return {
      kind: 'no-op',
      agentId: server.agentId,
      reason: 'block-mode and no git-memory-enabled tag — nothing to reconcile',
    };
  }

  // mode === 'memfs' from here
  const targetFiles = buildTargetFiles(agentName, memory, server, rootPath);

  if (!hasTag) {
    return {
      kind: 'migrate-forward',
      agentId: server.agentId,
      currentTags: server.tags,
      sourceBlocks: server.blocks,
      targetFiles,
    };
  }

  // Tag already set — diff targetFiles vs bareRepoFiles
  const changedFiles = new Map<string, string>();
  for (const [filePath, content] of targetFiles) {
    const desiredSha = gitBlobSha(content);
    const currentSha = server.bareRepoFiles.get(filePath);
    if (desiredSha !== currentSha) {
      changedFiles.set(filePath, content);
    }
  }

  if (changedFiles.size === 0) {
    return {
      kind: 'no-op',
      agentId: server.agentId,
      reason: `memfs in sync: ${targetFiles.size} files match bare repo HEAD`,
    };
  }

  return {
    kind: 'sync-files-only',
    agentId: server.agentId,
    changedFiles,
  };
}

/**
 * Build the desired file set from YAML config + server's current block values.
 *
 * For each `from_blocks` entry:
 *   1. Look up the named block on the server (throw if missing).
 *   2. If extract_section is set, slice out that H2 section (throw if missing).
 *   3. Map to the target path.
 *
 * If capability_index_file is set, read that file from template_dir and add
 * it under `system/capability-index.md` (or whatever the file basename says
 * relative to template_dir).
 */
export function buildTargetFiles(
  agentName: string,
  memory: AgentMemoryConfig,
  server: ServerAgentState,
  rootPath: string,
): Map<string, string> {
  const out = new Map<string, string>();

  if (memory.from_blocks) {
    const blockByLabel = new Map(server.blocks.map((b) => [b.label, b]));
    for (const entry of memory.from_blocks) {
      const block = blockByLabel.get(entry.block);
      if (!block) {
        throw new Error(
          `[memfs-plan] Agent ${agentName}: block "${entry.block}" referenced in memory.from_blocks does not exist on the server. ` +
            `Available block labels: ${server.blocks.map((b) => b.label).join(', ') || '(none)'}`,
        );
      }
      let content = block.value;
      if (entry.extract_section) {
        content = extractMarkdownSection(content, entry.extract_section, agentName, entry.block);
      }
      out.set(entry.to, content);
    }
  }

  if (memory.capability_index_file) {
    if (!memory.template_dir) {
      throw new Error(
        `[memfs-plan] Agent ${agentName}: memory.capability_index_file is set but memory.template_dir is not. ` +
          `Set template_dir to the directory holding the index file.`,
      );
    }
    const indexAbsolute = path.resolve(rootPath, memory.template_dir, memory.capability_index_file);
    if (!fs.existsSync(indexAbsolute)) {
      throw new Error(
        `[memfs-plan] Agent ${agentName}: capability_index_file does not exist at ${indexAbsolute}. ` +
          `Check memory.template_dir + memory.capability_index_file in YAML.`,
      );
    }
    const content = fs.readFileSync(indexAbsolute, 'utf8');
    // Target path is the capability_index_file relative path (e.g., "system/capability-index.md")
    out.set(memory.capability_index_file, content);
  }

  return out;
}

/**
 * Extract a markdown section identified by its heading text. Returns the
 * section content (without the heading itself), trimmed.
 *
 * Section ends at the next heading of equal-or-shallower level, or EOF.
 *
 * Throws if the heading isn't found.
 */
export function extractMarkdownSection(
  content: string,
  headingText: string,
  agentName: string,
  blockLabel: string,
): string {
  const lines = content.split(/\r?\n/);
  // Match any heading level
  const startIdx = lines.findIndex((line) =>
    new RegExp(`^(#{1,6})\\s+${escapeRegExp(headingText)}\\s*$`).test(line),
  );
  if (startIdx === -1) {
    throw new Error(
      `[memfs-plan] Agent ${agentName}: extract_section "${headingText}" not found in block "${blockLabel}". ` +
        `Section must be a markdown heading (#, ##, ### etc.) with matching text.`,
    );
  }
  const startMatch = lines[startIdx].match(/^(#{1,6})/)!;
  const startLevel = startMatch[1].length;

  // Find the next heading of equal-or-shallower level
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= startLevel) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx + 1, endIdx).join('\n').trim() + '\n';
}

/**
 * Compute the git blob SHA-1 for a string (matches `git hash-object`).
 * Format: sha1("blob <byte_length>\0<content>").
 */
export function gitBlobSha(content: string): string {
  const buf = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${buf.length}\0`, 'utf8');
  return createHash('sha1').update(Buffer.concat([header, buf])).digest('hex');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
