import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { isBuiltinTool } from '../../lib/tools/builtin-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { log, output, error } from '../../lib/shared/logger';

export default async function exportCommand(
  resource: string,
  name: string,
  options: {
    output?: string;
    maxSteps?: number;
    legacyFormat?: boolean;
    format?: string;
    skipFirstMessage?: boolean;
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
    error(`Failed to export agent ${name}:`, err.message);
    throw err;
  }
}

/**
 * Export agent to YAML format compatible with lettactl apply
 */
async function exportAsYaml(
  client: LettaClientWrapper,
  agent: any,
  options: { output?: string; skipFirstMessage?: boolean },
  verbose: boolean
): Promise<void> {
  // Fetch full agent details
  const fullAgent = await client.getAgent(agent.id);

  // Fetch attached resources
  const [tools, blocks, folders, archives] = await Promise.all([
    client.listAgentTools(agent.id).then(normalizeResponse),
    client.listAgentBlocks(agent.id).then(normalizeResponse),
    client.listAgentFolders(agent.id).then(normalizeResponse),
    client.listAgentArchives(agent.id).then(normalizeResponse),
  ]);

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

  // Build fleet config wrapper
  const fleetConfig = {
    agents: [agentConfig],
  };

  // Output
  const yamlStr = yaml.dump(fleetConfig, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });

  if (options.output) {
    const resolvedPath = path.resolve(options.output);
    fs.writeFileSync(resolvedPath, yamlStr);
    output(`Agent ${agent.name} exported to ${options.output}`);
    if (verbose) {
      const stats = fs.statSync(resolvedPath);
      output(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
    }
  } else {
    // Print to stdout
    output(yamlStr);
  }
}
