/**
 * kubectl-style three-way merge for template mode
 *
 * Tracks what resources were applied via template so we can distinguish:
 * - Resources removed from template (should delete)
 * - Resources manually added by user (should preserve)
 * - Resources modified on server since last apply (conflict warning)
 */

import { generateContentHash } from '../utils/hash-utils';

export interface LastAppliedConfig {
  tools: string[];
  sharedBlocks: string[];
  folders: string[];
  // Content hashes for conflict detection
  toolHashes?: Record<string, string>;
  blockHashes?: Record<string, string>;
}

export const METADATA_KEY = 'lettactl.lastApplied';

/**
 * Read last applied config from agent metadata
 */
export function readLastApplied(metadata: any): LastAppliedConfig | null {
  const data = metadata?.[METADATA_KEY];
  if (!data || !Array.isArray(data.tools)) return null;
  return data;
}

/**
 * Hash current server-side tool content for conflict detection
 */
export function hashCurrentTools(tools: Array<{ name: string; source_code?: string }>): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const tool of tools) {
    if (tool.source_code) {
      hashes[tool.name] = generateContentHash(tool.source_code);
    }
  }
  return hashes;
}

/**
 * Hash current server-side block content for conflict detection
 */
export function hashCurrentBlocks(blocks: Array<{ label: string; value?: string }>): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const block of blocks) {
    if (block.value) {
      hashes[block.label] = generateContentHash(block.value);
    }
  }
  return hashes;
}

/**
 * Filter diff operations using three-way merge and return config to store
 *
 * - If no lastApplied: first apply, use MERGE semantics (no removals)
 * - If lastApplied exists: only remove resources that were in lastApplied
 * - Detects conflicts when server content differs from lastApplied
 */
export function applyThreeWayMerge(
  ops: {
    tools?: { toRemove: Array<{ name: string; id: string }>; toAdd: any[]; toUpdate: any[] };
    blocks?: { toRemove: Array<{ name: string; id: string }>; toAdd: any[]; toUpdate: any[] };
    folders?: { toDetach: Array<{ name: string; id: string }>; toAttach: any[]; toUpdate: any[] };
    operationCount: number;
    updateFields?: any;
  },
  lastApplied: LastAppliedConfig | null,
  desiredConfig: {
    tools: string[];
    sharedBlocks: string[];
    folders: string[];
    toolHashes?: Record<string, string>;
    blockHashes?: Record<string, string>;
  },
  currentHashes: {
    toolHashes: Record<string, string>;
    blockHashes: Record<string, string>;
  } | null,
  verbose: boolean = false
): LastAppliedConfig {
  const conflicts: string[] = [];

  if (!lastApplied) {
    // First apply: MERGE semantics - don't remove anything
    if (ops.tools) ops.tools.toRemove = [];
    if (ops.blocks) ops.blocks.toRemove = [];
    if (ops.folders) ops.folders.toDetach = [];
  } else {
    const prevTools = new Set(lastApplied.tools);
    const prevBlocks = new Set(lastApplied.sharedBlocks);
    const prevFolders = new Set(lastApplied.folders);

    // Detect conflicts: server content changed since last apply
    if (currentHashes && lastApplied.toolHashes) {
      for (const toolName of prevTools) {
        const lastHash = lastApplied.toolHashes[toolName];
        const currentHash = currentHashes.toolHashes[toolName];
        if (lastHash && currentHash && lastHash !== currentHash) {
          conflicts.push(`tool '${toolName}' modified on server since last apply`);
        }
      }
    }

    if (currentHashes && lastApplied.blockHashes) {
      for (const blockName of prevBlocks) {
        const lastHash = lastApplied.blockHashes[blockName];
        const currentHash = currentHashes.blockHashes[blockName];
        if (lastHash && currentHash && lastHash !== currentHash) {
          conflicts.push(`block '${blockName}' modified on server since last apply`);
        }
      }
    }

    // Filter removals to only template-applied resources
    if (ops.tools) {
      const before = ops.tools.toRemove.length;
      ops.tools.toRemove = ops.tools.toRemove.filter(t => prevTools.has(t.name));
      if (verbose && before > ops.tools.toRemove.length) {
        console.log(`  Preserving ${before - ops.tools.toRemove.length} user-added tool(s)`);
      }
    }

    if (ops.blocks) {
      const before = ops.blocks.toRemove.length;
      ops.blocks.toRemove = ops.blocks.toRemove.filter(b => prevBlocks.has(b.name));
      if (verbose && before > ops.blocks.toRemove.length) {
        console.log(`  Preserving ${before - ops.blocks.toRemove.length} user-added block(s)`);
      }
    }

    if (ops.folders) {
      const before = ops.folders.toDetach.length;
      ops.folders.toDetach = ops.folders.toDetach.filter(f => prevFolders.has(f.name));
      if (verbose && before > ops.folders.toDetach.length) {
        console.log(`  Preserving ${before - ops.folders.toDetach.length} user-added folder(s)`);
      }
    }
  }

  // Warn about conflicts (kubectl behavior: apply anyway, but inform user)
  if (conflicts.length > 0) {
    console.warn(`  Warning: ${conflicts.length} conflict(s) detected:`);
    for (const conflict of conflicts) {
      console.warn(`    - ${conflict}`);
    }
  }

  // Recalculate operation count
  ops.operationCount = 0;
  if (ops.updateFields) ops.operationCount += Object.keys(ops.updateFields).length;
  if (ops.tools) ops.operationCount += ops.tools.toAdd.length + ops.tools.toRemove.length + ops.tools.toUpdate.length;
  if (ops.blocks) ops.operationCount += ops.blocks.toAdd.length + ops.blocks.toRemove.length + ops.blocks.toUpdate.length;
  if (ops.folders) {
    ops.operationCount += ops.folders.toAttach.length + ops.folders.toDetach.length;
    for (const f of ops.folders.toUpdate || []) {
      ops.operationCount += (f.filesToAdd?.length || 0) + (f.filesToRemove?.length || 0) + (f.filesToUpdate?.length || 0);
    }
  }

  // Return config with hashes to store
  return {
    tools: desiredConfig.tools,
    sharedBlocks: desiredConfig.sharedBlocks,
    folders: desiredConfig.folders,
    toolHashes: desiredConfig.toolHashes,
    blockHashes: desiredConfig.blockHashes,
  };
}
