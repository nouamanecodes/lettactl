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
  metadata?: Record<string, any>;
  blocks: BlockSnapshot[];
  // path -> blob SHA at HEAD of the bare repo. Empty if no commits yet.
  bareRepoFiles: Map<string, string>;
}

export const GIT_MEMORY_ENABLED_TAG = 'git-memory-enabled';
export const GIT_MEMORY_ENABLED_METADATA_KEY = 'lettactl.memfs.enabled';

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
      // Managed remote files that should be removed.
      deletedFiles: string[];
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
  const hasTag =
    server.tags.includes(GIT_MEMORY_ENABLED_TAG) ||
    server.metadata?.[GIT_MEMORY_ENABLED_METADATA_KEY] === true;
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

  // Tag already set — diff targetFiles vs bareRepoFiles. Paths listed in
  // preserve_existing_paths are seed-only after their first remote write:
  // if the file exists in the bare repo, do not overwrite agent-owned edits.
  const changedFiles = new Map<string, string>();
  const preserveExistingPaths = new Set(memory.preserve_existing_paths ?? []);
  for (const [filePath, content] of targetFiles) {
    const currentSha = server.bareRepoFiles.get(filePath);
    if (preserveExistingPaths.has(filePath) && currentSha) {
      continue;
    }
    const desiredSha = gitBlobSha(content);
    if (desiredSha !== currentSha) {
      changedFiles.set(filePath, content);
    }
  }
  const deletedFiles = Array.from(new Set([
    ...computeManagedSkillDeletions(memory, targetFiles, server.bareRepoFiles),
    ...computeExplicitPruneDeletions(memory, targetFiles, server.bareRepoFiles),
  ])).sort();

  if (changedFiles.size === 0 && deletedFiles.length === 0) {
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
    deletedFiles,
  };
}

function computeManagedSkillDeletions(
  memory: AgentMemoryConfig,
  targetFiles: Map<string, string>,
  bareRepoFiles: Map<string, string>,
): string[] {
  if (!memory.prune_missing_skills || !memory.skills) return [];

  const desiredSkills = new Set(
    memory.skills.map((skill) => skill.name || path.basename(skill.from_dir)),
  );
  const deleted = new Set<string>();

  for (const filePath of bareRepoFiles.keys()) {
    const match = filePath.match(/^skills\/([^/]+)\//);
    if (!match) continue;
    if (!desiredSkills.has(match[1]) || !targetFiles.has(filePath)) {
      deleted.add(filePath);
    }
  }

  return Array.from(deleted).sort();
}

/**
 * Explicit removals: paths the config names in `prune_paths` (a renamed or
 * removed system/reference/state file). Non-skill files can't be auto-pruned —
 * agents author their own memory files under system/, so a blanket "delete
 * anything not in target" would erase agent memory. Explicit naming is safe and
 * works on the first apply. A path is only deleted if it exists in the bare repo
 * and is NOT also a target file (never delete a file we intend to keep).
 */
function computeExplicitPruneDeletions(
  memory: AgentMemoryConfig,
  targetFiles: Map<string, string>,
  bareRepoFiles: Map<string, string>,
): string[] {
  if (!memory.prune_paths || memory.prune_paths.length === 0) return [];
  const deleted: string[] = [];
  for (const p of memory.prune_paths) {
    if (bareRepoFiles.has(p) && !targetFiles.has(p)) deleted.push(p);
  }
  return deleted;
}

/**
 * Build the desired file set from YAML config + server's current block values.
 *
 * Sources, in evaluation order — later sources overwrite earlier on path collision:
 *   1. `capability_index_file` — legacy, single explicit file read (kept for back-compat).
 *      Now redundant with the template_dir scan below, but harmless when content matches.
 *   2. `template_dir` recursive scan — walks the directory for .md/.gitkeep/.keep files,
 *      excluding dotfiles (except .gitkeep/.keep), symlinks, and the root-level README.md.
 *      Hand-authored files like `system/identity.md` or `persona/learned-preferences.md`
 *      ship via this path without needing a `from_blocks` entry.
 *   3. `files` — explicit inline or from_file entries for dynamic per-agent content.
 *   4. `skills` — copies skill directories to `skills/<skill-name>/...`.
 *   5. `from_blocks` — last so it ALWAYS wins on collision. The YAML's explicit directive
 *      to derive a memfs file from a live block trumps any template skeleton at the same path.
 */
export function buildTargetFiles(
  agentName: string,
  memory: AgentMemoryConfig,
  server: ServerAgentState,
  rootPath: string,
): Map<string, string> {
  const out = new Map<string, string>();

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
    out.set(memory.capability_index_file, content);
  }

  if (memory.template_dir) {
    const absDir = path.resolve(rootPath, memory.template_dir);
    if (!fs.existsSync(absDir)) {
      throw new Error(
        `[memfs-plan] Agent ${agentName}: template_dir does not exist at ${absDir}. ` +
          `Check memory.template_dir in YAML (resolved against root_path).`,
      );
    }
    for (const [filePath, content] of walkTemplateDir(absDir)) {
      out.set(filePath, content);
    }
  }

  if (memory.files) {
    for (const entry of memory.files) {
      if (entry.value !== undefined) {
        out.set(entry.to, renderTemplateVars(entry.value, entry.template_vars ?? {}));
        continue;
      }
      const absFile = path.resolve(rootPath, entry.from_file!);
      if (!fs.existsSync(absFile)) {
        throw new Error(
          `[memfs-plan] Agent ${agentName}: memory.files from_file does not exist at ${absFile}. ` +
            `Check memory.files[].from_file in YAML (resolved against root_path).`,
        );
      }
      out.set(entry.to, renderTemplateVars(fs.readFileSync(absFile, 'utf8'), entry.template_vars ?? {}));
    }
  }

  if (memory.skills) {
    for (const skill of memory.skills) {
      const absDir = path.resolve(rootPath, skill.from_dir);
      const skillName = skill.name || path.basename(absDir);
      if (!fs.existsSync(absDir)) {
        throw new Error(
          `[memfs-plan] Agent ${agentName}: memory.skills from_dir does not exist at ${absDir}. ` +
            `Check memory.skills[].from_dir in YAML (resolved against root_path).`,
        );
      }
      const skillMd = path.join(absDir, 'SKILL.md');
      if (!fs.existsSync(skillMd)) {
        throw new Error(
          `[memfs-plan] Agent ${agentName}: memory.skills "${skillName}" must contain SKILL.md at ${skillMd}.`,
        );
      }
      for (const [filePath, content] of walkSkillDir(absDir)) {
        out.set(`skills/${skillName}/${filePath}`, content);
      }
    }
  }

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

  return out;
}

/**
 * Recursively walk a skill directory, returning skill-relative path -> content.
 * Skills can contain markdown references and helper scripts, so this allows
 * normal files while skipping dependency/build/dotfile directories.
 */
export function walkSkillDir(absDir: string): Map<string, string> {
  const out = new Map<string, string>();
  const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next']);

  function walk(currentAbs: string, relPrefix: string) {
    const entries = fs.readdirSync(currentAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const name = entry.name;
      if (name.startsWith('.')) continue;
      const relPath = relPrefix ? `${relPrefix}/${name}` : name;
      const absPath = path.join(currentAbs, name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(name)) continue;
        walk(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      out.set(relPath, fs.readFileSync(absPath, 'utf8'));
    }
  }

  walk(absDir, '');
  return out;
}

/**
 * Recursively walk `absDir`, returning a map of repo-relative path -> file content.
 *
 * Includes: .md, .gitkeep, .keep
 * Excludes: dotfiles (except .gitkeep/.keep), symlinks, root-level README.md.
 * Nested READMEs (e.g. subdir/README.md) are NOT excluded — operators may
 * structure them deliberately as agent-readable docs.
 */
export function walkTemplateDir(absDir: string): Map<string, string> {
  const out = new Map<string, string>();
  const KEEP_EXT = new Set(['.md', '.gitkeep', '.keep']);

  function walk(currentAbs: string, relPrefix: string) {
    const entries = fs.readdirSync(currentAbs, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const name = entry.name;
      const isKeepFile = name === '.gitkeep' || name === '.keep';
      if (name.startsWith('.') && !isKeepFile) continue;
      const relPath = relPrefix ? `${relPrefix}/${name}` : name;
      const absPath = path.join(currentAbs, name);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (relPrefix === '' && name === 'README.md') continue;
      const ext = isKeepFile ? name : path.extname(name);
      if (!KEEP_EXT.has(ext)) continue;
      out.set(relPath, fs.readFileSync(absPath, 'utf8'));
    }
  }

  walk(absDir, '');
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

export function renderTemplateVars(content: string, vars: Record<string, string>): string {
  let rendered = content;
  for (const [key, value] of Object.entries(vars)) {
    rendered = rendered.replace(new RegExp(`{{${escapeRegExp(key)}}}`, 'g'), value);
  }
  return rendered;
}
