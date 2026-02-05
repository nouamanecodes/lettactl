import { createSpinner } from '../../lib/ux/spinner';
import { log, warn } from '../../lib/shared/logger';

export interface DeleteItem {
  id: string;
  name: string;
}

export interface DeleteWithProgressOptions {
  items: DeleteItem[];
  resourceType: string;
  deleteFn: (id: string) => Promise<unknown>;
  useSpinner?: boolean;
  verbose?: boolean;
  updateInterval?: number;
  successSuffix?: string;
}

/**
 * Delete items with progress indicator, updating every N items
 */
export async function deleteWithProgress(options: DeleteWithProgressOptions): Promise<number> {
  const {
    items,
    resourceType,
    deleteFn,
    useSpinner = true,
    verbose = false,
    updateInterval = 5,
    successSuffix = ''
  } = options;

  const total = items.length;
  const spinner = createSpinner(`Deleting 0/${total} ${resourceType}...`, useSpinner).start();

  let deleted = 0;
  for (const item of items) {
    try {
      await deleteFn(item.id);
      deleted++;
      if (deleted % updateInterval === 0 || deleted === total) {
        spinner.text = `Deleting ${deleted}/${total} ${resourceType}...`;
      }
      if (verbose) log(`Deleted ${resourceType.slice(0, -1)}: ${item.name}`);
    } catch (err: any) {
      warn(`Failed to delete ${resourceType.slice(0, -1)} ${item.name}: ${err.message}`);
    }
  }

  const suffix = successSuffix ? ` ${successSuffix}` : '';
  spinner.succeed(`Deleted ${deleted} orphaned ${resourceType}${suffix}`);
  return deleted;
}
