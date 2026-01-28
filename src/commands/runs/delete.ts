import { LettaClientWrapper } from '../../lib/letta-client';
import { output, error } from '../../lib/logger';

export async function deleteRunCommand(
  runId: string,
  _options: {},
  _command: any
) {
  const client = new LettaClientWrapper();

  try {
    await client.deleteRun(runId);
    output(`Run ${runId} deleted.`);
  } catch (err: any) {
    error(`Failed to delete run: ${err.message}`);
    process.exit(1);
  }
}
