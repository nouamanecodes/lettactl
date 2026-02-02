import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import type { FleetConfig, AgentConfig } from '../../types/fleet-config';
import { BlockManager } from '../managers/block-manager';
import { ArchiveManager } from '../managers/archive-manager';
import { AgentManager } from '../managers/agent-manager';
import { FILE_SEARCH_TOOLS } from '../tools/builtin-tools';

export interface ManifestItem {
  name: string;
  id: string | null;
}

export interface ManifestBlockItem extends ManifestItem {
  shared: boolean;
  agent?: string;
}

export interface ManifestAgentEntry {
  name: string;
  id: string | null;
  resolved_name?: string;
  tools: ManifestItem[];
  blocks: ManifestBlockItem[];
  archives: ManifestItem[];
  folders: ManifestItem[];
}

export interface AgentManifest {
  manifest_version: 1;
  generated_at: string;
  config_file: string;
  base_path: string;
  agents: ManifestAgentEntry[];
  resources: {
    tools: ManifestItem[];
    blocks: ManifestBlockItem[];
    archives: ManifestItem[];
    folders: ManifestItem[];
    mcp_servers: ManifestItem[];
  };
}

export interface BuildAgentManifestOptions {
  config: FleetConfig;
  configPath: string;
  basePath: string;
  appliedAgents: Map<string, { id: string; resolvedName: string }>;
  agentManager: AgentManager;
  blockManager: BlockManager;
  archiveManager: ArchiveManager;
  sharedBlockIds: Map<string, string>;
  toolNameToId: Map<string, string>;
  folderNameToId: Map<string, string>;
  mcpServerNameToId: Map<string, string>;
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

function resolveAgentTools(agent: AgentConfig): string[] {
  let tools = agent.tools ? [...agent.tools] : [];
  const hasFolders = (agent.folders || []).length > 0;

  if (hasFolders) {
    for (const tool of FILE_SEARCH_TOOLS) {
      tools.push(tool);
    }
  } else {
    tools = tools.filter((tool) => !FILE_SEARCH_TOOLS.includes(tool));
  }

  return Array.from(new Set(tools)).sort((a, b) => a.localeCompare(b));
}

function addResource<T extends ManifestItem>(
  map: Map<string, T>,
  item: T,
  key: string = item.name
): void {
  if (!map.has(key)) {
    map.set(key, item);
  }
}

export function getDefaultManifestPath(configPath: string): string {
  const dir = path.dirname(configPath);
  const baseName = path.basename(configPath, path.extname(configPath));
  return path.resolve(dir, `${baseName}.manifest.json`);
}

export function buildAgentManifest(options: BuildAgentManifestOptions): AgentManifest {
  const {
    config,
    configPath,
    basePath,
    appliedAgents,
    agentManager,
    blockManager,
    archiveManager,
    sharedBlockIds,
    toolNameToId,
    folderNameToId,
    mcpServerNameToId
  } = options;

  const toolsMap = new Map<string, ManifestItem>();
  const blocksMap = new Map<string, ManifestBlockItem>();
  const archivesMap = new Map<string, ManifestItem>();
  const foldersMap = new Map<string, ManifestItem>();
  const mcpServersMap = new Map<string, ManifestItem>();

  if (config.shared_blocks) {
    for (const sharedBlock of config.shared_blocks) {
      const id = sharedBlockIds.get(sharedBlock.name) || blockManager.getSharedBlockId(sharedBlock.name);
      addResource(blocksMap, {
        name: sharedBlock.name,
        id: id || null,
        shared: true
      }, `shared:${sharedBlock.name}`);
    }
  }

  const mcpServerNames = new Set<string>();
  if (config.mcp_servers) {
    for (const server of config.mcp_servers) {
      if (server.name) {
        mcpServerNames.add(server.name);
      }
    }
  }
  for (const agent of config.agents || []) {
    for (const selection of agent.mcp_tools || []) {
      if (selection?.server) {
        mcpServerNames.add(selection.server);
      }
    }
  }
  for (const name of mcpServerNames) {
    addResource(mcpServersMap, {
      name,
      id: mcpServerNameToId.get(name) || null
    });
  }

  const agents: ManifestAgentEntry[] = [];

  for (const agent of config.agents || []) {
    const applied = appliedAgents.get(agent.name);
    const fallback = agentManager.getAgentVersions(agent.name)[0];
    const resolvedName = applied?.resolvedName || fallback?.name || agent.name;
    const agentId = applied?.id || fallback?.id || null;

    const entry: ManifestAgentEntry = {
      name: agent.name,
      id: agentId,
      tools: [],
      blocks: [],
      archives: [],
      folders: []
    };

    if (resolvedName !== agent.name) {
      entry.resolved_name = resolvedName;
    }

    for (const toolName of resolveAgentTools(agent)) {
      const toolEntry: ManifestItem = {
        name: toolName,
        id: toolNameToId.get(toolName) || null
      };
      entry.tools.push(toolEntry);
      addResource(toolsMap, toolEntry);
    }

    if (agent.shared_blocks) {
      for (const blockName of agent.shared_blocks) {
        const id = sharedBlockIds.get(blockName) || blockManager.getSharedBlockId(blockName);
        const blockEntry: ManifestBlockItem = {
          name: blockName,
          id: id || null,
          shared: true
        };
        entry.blocks.push(blockEntry);
        addResource(blocksMap, blockEntry, `shared:${blockName}`);
      }
    }

    if (agent.memory_blocks) {
      for (const block of agent.memory_blocks) {
        const id = blockManager.getAgentBlockId(block.name, agent.name) || blockManager.getAgentBlockId(block.name);
        const blockEntry: ManifestBlockItem = {
          name: block.name,
          id: id || null,
          shared: false,
          agent: agent.name
        };
        entry.blocks.push(blockEntry);
        addResource(blocksMap, blockEntry, `agent:${agent.name}:${block.name}`);
      }
    }

    if (agent.archives) {
      for (const archive of agent.archives) {
        const archiveEntry: ManifestItem = {
          name: archive.name,
          id: archiveManager.getArchiveId(archive.name)
        };
        entry.archives.push(archiveEntry);
        addResource(archivesMap, archiveEntry);
      }
    }

    if (agent.folders) {
      for (const folder of agent.folders) {
        const folderEntry: ManifestItem = {
          name: folder.name,
          id: folderNameToId.get(folder.name) || null
        };
        entry.folders.push(folderEntry);
        addResource(foldersMap, folderEntry);
      }
    }

    sortByName(entry.tools);
    entry.blocks.sort((a, b) => a.name.localeCompare(b.name));
    sortByName(entry.archives);
    sortByName(entry.folders);
    agents.push(entry);
  }

  return {
    manifest_version: 1,
    generated_at: new Date().toISOString(),
    config_file: path.resolve(configPath),
    base_path: basePath,
    agents: sortByName(agents),
    resources: {
      tools: sortByName(Array.from(toolsMap.values())),
      blocks: Array.from(blocksMap.values()).sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;
        return (a.agent || '').localeCompare(b.agent || '');
      }),
      archives: sortByName(Array.from(archivesMap.values())),
      folders: sortByName(Array.from(foldersMap.values())),
      mcp_servers: sortByName(Array.from(mcpServersMap.values()))
    }
  };
}

export function writeAgentManifest(manifest: AgentManifest, manifestPath: string): void {
  const ext = path.extname(manifestPath).toLowerCase();
  const contents = ext === '.json'
    ? JSON.stringify(manifest, null, 2)
    : yaml.dump(manifest, { noRefs: true, lineWidth: 120 });

  fs.writeFileSync(manifestPath, contents, 'utf8');
}
