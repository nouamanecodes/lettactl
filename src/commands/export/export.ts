import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import * as fs from 'fs';
import * as path from 'path';
import { log, output, error } from '../../lib/logger';

export default async function exportCommand(
  resource: string,
  name: string,
  options: {
    output?: string;
    maxSteps?: number;
    legacyFormat?: boolean;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  try {
    if (resource !== 'agent') {
      throw new Error('Only "agent" resource is currently supported for export');
    }

    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(name);

    if (verbose) {
      output(`Exporting agent: ${agent.name} (${agent.id})`);
    }

    // Export the agent
    const exportResponse = await client.exportAgent(agent.id, {
      max_steps: options.maxSteps,
      use_legacy_format: options.legacyFormat || false
    });

    // Determine output filename
    const outputFile = options.output || `${agent.name}-export.json`;
    const resolvedPath = path.resolve(outputFile);

    if (verbose) {
      output(`Writing export to: ${resolvedPath}`);
      output(`Format: ${options.legacyFormat ? 'legacy (v1)' : 'standard (v2)'}`);
    }

    // Write the export file
    fs.writeFileSync(resolvedPath, JSON.stringify(exportResponse, null, 2));

    output(`Agent ${agent.name} exported to ${outputFile}`);

    if (verbose) {
      const stats = fs.statSync(resolvedPath);
      output(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    }

  } catch (err: any) {
    error(`Failed to export agent ${name}:`, err.message);
    throw err;
  }
}
