import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { isBuiltinTool } from '../../lib/tools/builtin-tools';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { minimatch } from 'minimatch';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { log, output, error, warn } from '../../lib/shared/logger';

const EXPORT_CONCURRENCY = 5;

export default async function exportCommand(
  resource: string,
  name: string | undefined,
  options: {
    output?: string;
    maxSteps?: number;
    legacyFormat?: boolean;
    format?: string;
    skipFirstMessage?: boolean;
    all?: boolean;
    match?: string;
    tags?: string;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  const spinnerEnabled = getSpinnerEnabled(command);

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // LettaBot export: generates a lettabot.yaml from agent metadata
    if (resource === 'lettabot') {
      const isBulk = !name || options.all || options.match || options.tags;

      if (isBulk) {
        const agents = name
          ? [await resolver.findAgentByName(name).then(r => r.agent)]
          : await resolveExportAgents(client, resolver, options);

        if (agents.length === 0) {
          const filter = options.match || options.tags || 'all';
          throw new Error(`No agents found matching: ${filter}`);
        }

        await exportLettaBotFleet(client, agents, options, verbose, spinnerEnabled);
      } else {
        const { agent } = await resolver.findAgentByName(name);
        await exportLettaBotConfig(client, agent, options, verbose);
      }
      return;
    }

    // Determine if this is a bulk export
    const isBulk = resource === 'agents' || options.all || options.match || options.tags;

    if (isBulk) {
      // Bulk export: YAML only
      if (options.format && options.format !== 'yaml') {
        throw new Error(
          'Bulk export (--all/--match/--tags) only supports YAML format. Use: -f yaml'
        );
      }

      const agents = await resolveExportAgents(client, resolver, options);

      if (agents.length === 0) {
        const filter = options.match || options.tags || 'all';
        throw new Error(`No agents found matching: ${filter}`);
      }

      if (verbose) {
        output(`Found ${agents.length} agent(s) to export`);
      }

      await exportBulkAsYaml(client, agents, options, verbose, spinnerEnabled);
      return;
    }

    // Single-agent export (existing behavior)
    if (resource !== 'agent') {
      throw new Error(
        'Resource must be "agent", "agents", or "lettabot".\n' +
        'Usage:\n' +
        '  lettactl export agent <name> -f yaml -o file.yaml\n' +
        '  lettactl export agents --all -f yaml -o fleet.yaml\n' +
        '  lettactl export lettabot <name> -o lettabot.yaml'
      );
    }

    if (!name) {
      throw new Error(
        'Agent name is required for single export.\n' +
        'Usage:\n' +
        '  lettactl export agent <name> -f yaml -o file.yaml\n' +
        'For bulk export:\n' +
        '  lettactl export agents --all -f yaml -o fleet.yaml'
      );
    }

    // Find the agent
    const { agent } = await resolver.findAgentByName(name);

    if (verbose) {
      output(`Exporting agent: ${agent.name} (${agent.id})`);
    }

    // Check if YAML format requested
    if (options.format === 'yaml') {
      await exportAsYaml(client, agent, options, verbose);
      return;
    }

    // Default: Letta's native export format (JSON)
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
    error(`Export failed:`, err.message);
    throw err;
  }
}

/**
 * Build a fleet-YAML-compatible config object for a single agent.
 * Returns the agent config object (not wrapped in { agents: [...] }).
 */
async function buildAgentYamlConfig(
  client: LettaClientWrapper,
  agent: { id: string; name: string },
  options: { skipFirstMessage?: boolean }
): Promise<any> {
  // Fetch full agent details
  const fullAgent = await client.getAgent(agent.id);

  // Use embedded tools/blocks from agent object; fetch folders/archives separately
  const [folders, archives] = await Promise.all([
    client.listAgentFolders(agent.id).then(normalizeResponse),
    client.listAgentArchives(agent.id).then(normalizeResponse),
  ]);
  const tools = normalizeResponse((fullAgent as any).tools || []);
  const blocks = normalizeResponse((fullAgent as any).blocks || []);

  // Build YAML-compatible config
  const agentConfig: any = {
    name: fullAgent.name,
    description: fullAgent.description || '',
    system_prompt: {
      value: fullAgent.system || '',
    },
    llm_config: {
      model: fullAgent.model || 'google_ai/gemini-2.5-pro',
      context_window: (fullAgent as any).llm_config?.context_window ||
                      (fullAgent as any).context_window_limit ||
                      16000,
      ...((fullAgent as any).llm_config?.max_tokens !== undefined && {
        max_tokens: (fullAgent as any).llm_config.max_tokens,
      }),
    },
  };

  // Add embedding if not default
  if (fullAgent.embedding) {
    agentConfig.embedding = fullAgent.embedding;
  }
  if ((fullAgent as any).embedding_config) {
    agentConfig.embedding_config = (fullAgent as any).embedding_config;
  }

  // Reasoning flag (stored as enable_reasoner in llm_config)
  const enableReasoner = (fullAgent as any).llm_config?.enable_reasoner;
  if (enableReasoner !== undefined) {
    agentConfig.reasoning = enableReasoner;
  }

  // Tags
  const tags = (fullAgent as any).tags;
  if (tags && tags.length > 0) {
    agentConfig.tags = tags;
  }

  // LettaBot config
  const lettabotConfig = (fullAgent as any).metadata?.['lettactl.lettabotConfig'];
  if (lettabotConfig) {
    agentConfig.lettabot = lettabotConfig;
  }

  // First message — include unless --skip-first-message
  if (!options.skipFirstMessage) {
    const firstMessage = (fullAgent as any).metadata?.['lettactl.firstMessage'];
    if (firstMessage) {
      agentConfig.first_message = firstMessage;
    }
  }

  // Add tools (exclude built-in tools)
  const customTools = tools.filter((t: any) => !isBuiltinTool(t.name));
  if (customTools.length > 0) {
    agentConfig.tools = customTools.map((t: any) => t.name);
  }

  // Add memory blocks
  const memoryBlocks = blocks
    .filter((b: any) => b.label && b.value)
    .map((b: any) => ({
      name: b.label,
      description: b.description || '',
      limit: b.limit || 5000,
      agent_owned: true,
      value: b.value,
    }));
  if (memoryBlocks.length > 0) {
    agentConfig.memory_blocks = memoryBlocks;
  }

  // Add folders
  if (folders.length > 0) {
    agentConfig.folders = await Promise.all(folders.map(async (f: any) => {
      const files = await client.listFolderFiles(f.id).then(normalizeResponse);
      return {
        name: f.name,
        files: files.map((file: any) => file.name || file.file_name),
      };
    }));
  }

  // Add archives
  if (archives.length > 0) {
    agentConfig.archives = archives.map((a: any) => {
      const archive: any = { name: a.name };
      if (a.description) archive.description = a.description;
      if (a.embedding) archive.embedding = a.embedding;
      return archive;
    });
  }

  return agentConfig;
}

/**
 * Write a fleet config to YAML file or stdout
 */
function writeYamlOutput(
  fleetConfig: Record<string, any>,
  outputPath: string | undefined,
  label: string,
  verbose: boolean
): void {
  const yamlStr = yaml.dump(fleetConfig, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });

  if (outputPath) {
    const resolvedPath = path.resolve(outputPath);
    fs.writeFileSync(resolvedPath, yamlStr);
    output(`${label} exported to ${outputPath}`);
    if (verbose) {
      const stats = fs.statSync(resolvedPath);
      output(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    }
  } else {
    // Print to stdout
    output(yamlStr);
  }
}

/**
 * Export a single agent to YAML format compatible with lettactl apply
 */
async function exportAsYaml(
  client: LettaClientWrapper,
  agent: any,
  options: { output?: string; skipFirstMessage?: boolean },
  verbose: boolean
): Promise<void> {
  const agentConfig = await buildAgentYamlConfig(client, agent, options);
  const fleetConfig = { agents: [agentConfig] };
  writeYamlOutput(fleetConfig, options.output, `Agent ${agent.name}`, verbose);
}

/**
 * Resolve which agents to export based on --all, --match, or --tags
 */
async function resolveExportAgents(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  options: { all?: boolean; match?: string; tags?: string }
): Promise<Array<{ id: string; name: string }>> {
  // By tags (AND logic via API)
  if (options.tags) {
    const tagFilter = options.tags.split(',').map(t => t.trim()).filter(Boolean);
    const agents = await client.listAgents({ tags: tagFilter });
    const agentList = normalizeResponse(agents);
    return agentList.map((a: any) => ({ id: a.id, name: a.name }));
  }

  // All agents or glob match require full list
  const allAgents = await resolver.getAllAgents();

  if (options.all) {
    return allAgents.map((a: any) => ({ id: a.id, name: a.name }));
  }

  if (options.match) {
    return allAgents
      .filter((a: any) => minimatch(a.name, options.match!))
      .map((a: any) => ({ id: a.id, name: a.name }));
  }

  throw new Error(
    'Bulk export requires one of: --all, --match <pattern>, or --tags <tags>\n' +
    'Examples:\n' +
    '  lettactl export agents --all -f yaml -o fleet.yaml\n' +
    '  lettactl export agents --match "support-*" -f yaml -o fleet.yaml\n' +
    '  lettactl export agents --tags "tenant:acme" -f yaml -o fleet.yaml'
  );
}

/**
 * Export multiple agents to a single fleet YAML file
 */
async function exportBulkAsYaml(
  client: LettaClientWrapper,
  agents: Array<{ id: string; name: string }>,
  options: { output?: string; skipFirstMessage?: boolean },
  verbose: boolean,
  spinnerEnabled: boolean
): Promise<void> {
  const spinner = createSpinner(
    `Exporting ${agents.length} agent(s)...`, spinnerEnabled
  ).start();

  const agentConfigs: any[] = [];
  const failures: Array<{ name: string; error: string }> = [];
  let completed = 0;

  const processAgent = async (agent: { id: string; name: string }) => {
    try {
      const config = await buildAgentYamlConfig(client, agent, options);
      agentConfigs.push(config);
    } catch (err: any) {
      failures.push({ name: agent.name, error: err.message });
    }
    completed++;
    spinner.text = `Exporting agents... ${completed}/${agents.length}`;
  };

  // Concurrency-limited processing
  const queue = [...agents];
  const inProgress: Promise<void>[] = [];

  while (queue.length > 0 || inProgress.length > 0) {
    while (queue.length > 0 && inProgress.length < EXPORT_CONCURRENCY) {
      const agent = queue.shift()!;
      const promise = processAgent(agent).then(() => {
        const idx = inProgress.indexOf(promise);
        if (idx !== -1) inProgress.splice(idx, 1);
      });
      inProgress.push(promise);
    }
    if (inProgress.length >= EXPORT_CONCURRENCY ||
        (queue.length === 0 && inProgress.length > 0)) {
      await Promise.race(inProgress);
    }
  }

  if (agentConfigs.length === 0) {
    spinner.fail('No agents were successfully exported');
    return;
  }

  // Sort alphabetically for deterministic output
  agentConfigs.sort((a, b) => a.name.localeCompare(b.name));

  const fleetConfig = { agents: agentConfigs };

  spinner.succeed(`Exported ${agentConfigs.length} agent(s)`);

  writeYamlOutput(
    fleetConfig,
    options.output,
    `${agentConfigs.length} agent(s)`,
    verbose
  );

  // Report failures
  if (failures.length > 0) {
    warn(`${failures.length} agent(s) failed to export:`);
    for (const f of failures) {
      warn(`  - ${f.name}: ${f.error}`);
    }
  }
}

/**
 * Build the lettabot server block from environment
 */
function buildServerBlock(): Record<string, any> {
  const baseUrl = process.env.LETTA_BASE_URL!;
  const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

  if (isLocal) {
    return { mode: 'docker', baseUrl };
  }

  const block: Record<string, any> = { mode: 'api' };
  if (process.env.LETTA_API_KEY) {
    block.apiKey = process.env.LETTA_API_KEY;
  }
  return block;
}

/**
 * Extract lettabot config from agent metadata.
 * Returns null if the agent has no lettabot config.
 */
async function getLettaBotMetadata(
  client: LettaClientWrapper,
  agentId: string
): Promise<Record<string, any> | null> {
  const fullAgent = await client.getAgent(agentId);
  return (fullAgent as any).metadata?.['lettactl.lettabotConfig'] || null;
}

/**
 * Export a single agent's lettabot config as a standalone lettabot.yaml
 */
async function exportLettaBotConfig(
  client: LettaClientWrapper,
  agent: { id: string; name: string },
  options: { output?: string },
  verbose: boolean
): Promise<void> {
  const lettabotConfig = await getLettaBotMetadata(client, agent.id);

  if (!lettabotConfig) {
    throw new Error(
      `Agent "${agent.name}" has no lettabot config in metadata.\n` +
      'Add a lettabot: section to your fleet YAML and run lettactl apply first.'
    );
  }

  const config: Record<string, any> = {
    server: buildServerBlock(),
    agent: { name: agent.name, id: agent.id },
  };

  // Passthrough runtime config sections
  if (lettabotConfig.channels) config.channels = lettabotConfig.channels;
  if (lettabotConfig.features) config.features = lettabotConfig.features;
  if (lettabotConfig.polling) config.polling = lettabotConfig.polling;
  if (lettabotConfig.transcription) config.transcription = lettabotConfig.transcription;
  if (lettabotConfig.attachments) config.attachments = lettabotConfig.attachments;

  writeYamlOutput(config, options.output, `LettaBot config for ${agent.name}`, verbose);
}

/**
 * Export multiple agents' lettabot configs as a multi-agent lettabot.yaml
 */
async function exportLettaBotFleet(
  client: LettaClientWrapper,
  agents: Array<{ id: string; name: string }>,
  options: { output?: string },
  verbose: boolean,
  spinnerEnabled: boolean
): Promise<void> {
  const spinner = createSpinner(
    `Scanning ${agents.length} agent(s) for lettabot config...`, spinnerEnabled
  ).start();

  const agentConfigs: any[] = [];
  let scanned = 0;

  for (const agent of agents) {
    const lettabotConfig = await getLettaBotMetadata(client, agent.id);
    scanned++;
    spinner.text = `Scanning agents for lettabot config... ${scanned}/${agents.length}`;

    if (!lettabotConfig) continue;

    const entry: Record<string, any> = {
      name: agent.name,
      id: agent.id,
    };

    if (lettabotConfig.channels) entry.channels = lettabotConfig.channels;
    if (lettabotConfig.features) entry.features = lettabotConfig.features;
    if (lettabotConfig.polling) entry.polling = lettabotConfig.polling;

    agentConfigs.push(entry);
  }

  if (agentConfigs.length === 0) {
    spinner.fail('No agents found with lettabot config in metadata');
    throw new Error(
      'None of the matched agents have a lettabot: section.\n' +
      'Add lettabot: config to your fleet YAML and run lettactl apply first.'
    );
  }

  // Sort alphabetically for deterministic output
  agentConfigs.sort((a, b) => a.name.localeCompare(b.name));

  // Server-wide settings from the first agent that has them
  const firstConfig = await getLettaBotMetadata(client, agentConfigs[0].id || agents.find(a => a.name === agentConfigs[0].name)!.id);

  const config: Record<string, any> = {
    server: buildServerBlock(),
    agents: agentConfigs,
  };

  // Promote server-wide settings (transcription, attachments) to top level
  if (firstConfig?.transcription) config.transcription = firstConfig.transcription;
  if (firstConfig?.attachments) config.attachments = firstConfig.attachments;

  spinner.succeed(`Found ${agentConfigs.length} agent(s) with lettabot config`);

  writeYamlOutput(config, options.output, `Multi-agent LettaBot config`, verbose);
}
