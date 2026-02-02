import { LettaClientWrapper } from '../../lib/client/letta-client';
import { formatStatus, OutputFormatter } from '../../lib/ux/output-formatter';
import { Run } from '../../types/run';
import { output } from '../../lib/shared/logger';
import { GetRunOptions } from './types';
import { waitForRun, streamRun, showRunMessages } from './utils';

export async function getRunCommand(
  runId: string,
  options: GetRunOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  const client = new LettaClientWrapper();

  if (options.wait) {
    await waitForRun(client, runId, verbose);
    return;
  }

  if (options.stream) {
    await streamRun(client, runId);
    return;
  }

  if (options.messages) {
    await showRunMessages(client, runId, options.output);
    return;
  }

  // Default: show run details
  const run = await client.getRun(runId) as Run;

  if (OutputFormatter.handleJsonOutput(run, options.output)) {
    return;
  }

  output(`Run: ${run.id}`);
  output('='.repeat(50));
  output('');
  output(`Status:     ${formatStatus(run.status)}`);
  output(`Agent:      ${run.agent_id}`);
  output(`Created:    ${new Date(run.created_at).toLocaleString()}`);

  if (run.completed_at) {
    output(`Completed:  ${new Date(run.completed_at).toLocaleString()}`);
  }

  if (run.stop_reason) {
    output(`Stop reason: ${run.stop_reason}`);
  }

  if (verbose) {
    output(`Background: ${run.background ?? false}`);
  }
}
