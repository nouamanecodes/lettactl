import chalk from 'chalk';
import { purple, STATUS } from '../constants';
import { createBoxWithRows, stripAnsi, shouldUseFancyUx } from '../box';

export interface OrphanedItem {
  name: string;
  detail: string;
}

export function displayOrphanedResources(type: string, items: OrphanedItem[], extraInfo?: string): string {
  if (!shouldUseFancyUx()) {
    return displayOrphanedResourcesPlain(type, items, extraInfo);
  }

  const rows: string[] = items.map(item =>
    STATUS.warn + '  ' + chalk.white(item.name) + chalk.dim(` (${item.detail})`)
  );

  const title = extraInfo
    ? `Orphaned ${type} (${items.length}, ${extraInfo})`
    : `Orphaned ${type} (${items.length})`;
  const width = Math.max(50, ...rows.map(r => stripAnsi(r).length + 4));
  return createBoxWithRows(title, rows, width).join('\n');
}

function displayOrphanedResourcesPlain(type: string, items: OrphanedItem[], extraInfo?: string): string {
  const lines: string[] = [];
  const title = extraInfo
    ? `Orphaned ${type} (${items.length}, ${extraInfo})`
    : `Orphaned ${type} (${items.length})`;
  lines.push(title + ':');
  for (const item of items) {
    lines.push(`  - ${item.name} (${item.detail})`);
  }
  return lines.join('\n');
}

export function displayCleanupNote(totalCount: number, isDryRun: boolean): string {
  if (!shouldUseFancyUx()) {
    if (isDryRun) {
      return `Would delete ${totalCount} orphaned resource(s). Use --force to actually delete.`;
    }
    return `Deleted ${totalCount} orphaned resource(s).`;
  }

  if (isDryRun) {
    return purple(`Would delete ${totalCount} orphaned resource(s). Use --force to actually delete.`);
  }
  return chalk.green(`Deleted ${totalCount} orphaned resource(s).`);
}
