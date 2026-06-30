import { LettaClientWrapper } from '../../lib/client/letta-client';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { GetOptions } from './types';

function formatProjectTable(projects: any[]): string {
  const nameW = Math.max(...projects.map(p => String(p.name || '').length), 4) + 1;
  const slugW = Math.max(...projects.map(p => String(p.slug || '').length), 4) + 1;
  const idW = Math.max(...projects.map(p => String(p.id || '').length), 2) + 1;
  const header = 'NAME'.padEnd(nameW) + '  ' + 'SLUG'.padEnd(slugW) + '  ' + 'ID'.padEnd(idW);
  const lines = [header, '-'.repeat(header.length)];

  for (const project of projects) {
    lines.push(
      String(project.name || '').padEnd(nameW) + '  ' +
      String(project.slug || '').padEnd(slugW) + '  ' +
      String(project.id || '').padEnd(idW),
    );
  }

  return lines.join('\n');
}

export async function getProjects(
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean,
) {
  const spinner = createSpinner('Loading projects...', spinnerEnabled).start();

  try {
    const projects = await client.listProjects();
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(projects, options?.output)) {
      return;
    }

    if (projects.length === 0) {
      output('No projects found');
      return;
    }

    output(formatProjectTable(projects));
  } catch (error) {
    spinner.fail('Failed to load projects');
    throw error;
  }
}
