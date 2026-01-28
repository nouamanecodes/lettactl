import { LettaClientWrapper } from '../../lib/letta-client';
import { normalizeResponse } from '../../lib/response-normalizer';
import { createSpinner } from '../../lib/ux/spinner';
import { output, error } from '../../lib/logger';
import { DeleteAllOptions } from './types';

export async function deleteAllFolders(client: LettaClientWrapper, options?: DeleteAllOptions, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading folders...', spinnerEnabled).start();
  const folders = await client.listFolders();
  const folderList = normalizeResponse(folders);
  listSpinner.stop();

  let foldersToDelete = folderList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    foldersToDelete = folderList.filter((f: any) => pattern.test(f.name) || pattern.test(f.id));
  }

  if (foldersToDelete.length === 0) {
    output(options?.pattern ? `No folders found matching pattern: ${options.pattern}` : 'No folders found to delete');
    return;
  }

  output(`Found ${foldersToDelete.length} folder(s) to delete:`);
  foldersToDelete.forEach((f: any, i: number) => output(`  ${i + 1}. ${f.name} (${f.id})`));

  if (!options?.force) {
    output('\nThis will permanently delete all listed folders and their files.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${foldersToDelete.length} folders...`, spinnerEnabled).start();
  let deleted = 0;
  for (const folder of foldersToDelete) {
    try {
      await client.deleteFolder(folder.id);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete folder ${folder.name}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${foldersToDelete.length} folder(s)`);
}
