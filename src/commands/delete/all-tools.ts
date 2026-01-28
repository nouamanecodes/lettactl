import { LettaClientWrapper } from '../../lib/letta-client';
import { normalizeResponse } from '../../lib/response-normalizer';
import { createSpinner } from '../../lib/ux/spinner';
import { output, error } from '../../lib/logger';
import { DeleteAllOptions } from './types';

export async function deleteAllTools(client: LettaClientWrapper, options?: DeleteAllOptions, spinnerEnabled: boolean = true) {
  const listSpinner = createSpinner('Loading tools...', spinnerEnabled).start();
  const tools = await client.listTools();
  const toolList = normalizeResponse(tools);
  listSpinner.stop();

  let toolsToDelete = toolList;
  if (options?.pattern) {
    const pattern = new RegExp(options.pattern, 'i');
    toolsToDelete = toolList.filter((t: any) => pattern.test(t.name) || pattern.test(t.id));
  }

  if (toolsToDelete.length === 0) {
    output(options?.pattern ? `No tools found matching pattern: ${options.pattern}` : 'No tools found to delete');
    return;
  }

  output(`Found ${toolsToDelete.length} tool(s) to delete:`);
  toolsToDelete.forEach((t: any, i: number) => output(`  ${i + 1}. ${t.name} (${t.id})`));

  if (!options?.force) {
    output('\nThis will permanently delete all listed tools.');
    output('WARNING: Tools attached to agents will cause errors.');
    output('Use --force to confirm deletion.');
    process.exit(1);
  }

  const spinner = createSpinner(`Deleting ${toolsToDelete.length} tools...`, spinnerEnabled).start();
  let deleted = 0;
  for (const tool of toolsToDelete) {
    try {
      await client.deleteTool(tool.id);
      deleted++;
    } catch (err: any) {
      error(`Failed to delete tool ${tool.name}: ${err.message}`);
    }
  }
  spinner.succeed(`Deleted ${deleted}/${toolsToDelete.length} tool(s)`);
}
