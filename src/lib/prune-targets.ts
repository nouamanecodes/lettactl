// --prune <targets> selects WHAT apply is allowed to delete. Every target is
// destructive, so apply gates on a confirmation prompt (or --confirm) before acting.

export const PRUNE_TARGETS = ['blocks', 'tools', 'secrets', 'agents', 'all'] as const;
export type PruneTarget = (typeof PRUNE_TARGETS)[number];

export interface PruneSelection {
  blocks: boolean;
  tools: boolean;
  secrets: boolean;
  agents: boolean;
}

export const NO_PRUNE: PruneSelection = { blocks: false, tools: false, secrets: false, agents: false };

/**
 * Parse the comma-separated --prune value. Throws on an empty or unknown target
 * rather than silently pruning nothing — a typo here deletes the wrong things.
 */
export function parsePruneTargets(raw: string | undefined): PruneSelection {
  if (raw === undefined) return { ...NO_PRUNE };

  const parts = raw.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`--prune requires at least one target: ${PRUNE_TARGETS.join(', ')}`);
  }

  const unknown = parts.filter((p) => !(PRUNE_TARGETS as readonly string[]).includes(p));
  if (unknown.length > 0) {
    throw new Error(`Unknown --prune target(s): ${unknown.join(', ')}. Valid: ${PRUNE_TARGETS.join(', ')}`);
  }

  if (parts.includes('all')) return { blocks: true, tools: true, secrets: true, agents: true };

  return {
    blocks: parts.includes('blocks'),
    tools: parts.includes('tools'),
    secrets: parts.includes('secrets'),
    agents: parts.includes('agents'),
  };
}

export function selectedPruneTargets(selection: PruneSelection): string[] {
  return (Object.keys(selection) as Array<keyof PruneSelection>).filter((k) => selection[k]);
}

export function isPruning(selection: PruneSelection): boolean {
  return selectedPruneTargets(selection).length > 0;
}
