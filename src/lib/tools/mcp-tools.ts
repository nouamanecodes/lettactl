import { LettaClientWrapper } from '../client/letta-client';
import { normalizeResponse } from '../shared/response-normalizer';
import { log, warn } from '../shared/logger';

type McpToolSelection = { server: string; tools?: string[] | 'all' };

export async function buildMcpServerRegistry(client: LettaClientWrapper): Promise<Map<string, string>> {
  const servers = await client.listMcpServers();
  const serverList = Array.isArray(servers) ? servers : (servers as any).items || [];
  const registry = new Map<string, string>();
  for (const server of serverList) {
    const s = server as any;
    const name = s.server_name || s.name;
    const id = s.id || s.server_id;
    if (name && id) {
      registry.set(name, id);
    }
  }
  return registry;
}

function normalizeToolList(toolsResponse: any): string[] {
  const tools = normalizeResponse(toolsResponse);
  return tools.map((tool: any) => tool.name || tool).filter((name: any) => typeof name === 'string');
}

async function resolveMcpToolsForServer(
  serverName: string,
  serverId: string,
  client: LettaClientWrapper,
  cache: Map<string, string[]>,
  verbose: boolean
): Promise<string[]> {
  if (cache.has(serverName)) {
    return cache.get(serverName)!;
  }

  try {
    const toolsResponse = await client.listMcpServerTools(serverId);
    const toolNames = normalizeToolList(toolsResponse);
    cache.set(serverName, toolNames);
    if (verbose) {
      log(`Loaded ${toolNames.length} MCP tools from ${serverName}`);
    }
    return toolNames;
  } catch (err: any) {
    warn(`Failed to list tools for MCP server ${serverName}: ${err.message}`);
    cache.set(serverName, []);
    return [];
  }
}

export async function expandMcpToolsForAgents(
  config: any,
  client: LettaClientWrapper,
  mcpServerNameToId: Map<string, string>,
  verbose: boolean = false
): Promise<void> {
  const cache = new Map<string, string[]>();

  for (const agent of config.agents || []) {
    const selections: McpToolSelection[] = agent.mcp_tools || [];
    if (!Array.isArray(selections) || selections.length === 0) {
      continue;
    }

    const expandedTools: string[] = [];

    for (const selection of selections) {
      if (!selection || typeof selection !== 'object') {
        continue;
      }

      const serverName = selection.server;
      if (!serverName || typeof serverName !== 'string') {
        continue;
      }

      const serverId = mcpServerNameToId.get(serverName);
      if (!serverId) {
        warn(`MCP server not found: ${serverName} (skipping tool expansion)`);
        continue;
      }

      const serverTools = await resolveMcpToolsForServer(serverName, serverId, client, cache, verbose);
      const selectionTools = selection.tools;

      if (!selectionTools || selectionTools === 'all') {
        expandedTools.push(...serverTools);
      } else if (Array.isArray(selectionTools)) {
        const allowed = new Set(selectionTools);
        const matched = serverTools.filter((name) => allowed.has(name));
        expandedTools.push(...matched);
        const missing = selectionTools.filter((name) => !serverTools.includes(name));
        if (missing.length > 0) {
          warn(`MCP server ${serverName} missing tools: ${missing.join(', ')}`);
        }
      }
    }

    if (expandedTools.length > 0) {
      const combined = new Set<string>([...(agent.tools || []), ...expandedTools]);
      agent.tools = Array.from(combined);
    }
  }
}
