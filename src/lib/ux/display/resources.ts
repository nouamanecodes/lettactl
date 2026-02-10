import chalk from 'chalk';
import { purple, STATUS, blockTypeTag } from '../constants';
import { BOX, createBoxWithRows, stripAnsi, truncate, formatDate, shouldUseFancyUx } from '../box';

// ============================================================================
// Agent Display
// ============================================================================

export interface AgentData {
  name: string;
  id: string;
  description?: string;
  model?: string;
  blockCount: number;
  toolCount: number;
  folderCount?: number;
  mcpServerCount?: number;
  fileCount?: number;
  tags?: string[];
  created?: string;
}

export function displayAgents(agents: AgentData[], wide: boolean = false): string {
  if (!shouldUseFancyUx()) {
    return displayAgentsPlain(agents, wide);
  }

  const rows: string[] = [];

  const maxNameLen = Math.max(...agents.map(a => a.name.length), 4);
  const nameW = maxNameLen + 1;
  const modelW = wide ? 20 : 24;

  const hasTags = agents.some(a => a.tags && a.tags.length > 0);
  const tagsW = hasTags ? Math.max(...agents.map(a => (a.tags || []).join(', ').length), 4) + 1 : 0;

  for (const agent of agents) {
    const status = STATUS.ok;
    const name = agent.name;
    const model = truncate(agent.model || '-', modelW - 1);
    const blocks = agent.blockCount.toString().padStart(6);
    const tools = agent.toolCount.toString().padStart(5);
    const created = formatDate(agent.created);

    let row = status + '  ' +
      chalk.white(name.padEnd(nameW)) + ' ' +
      purple(model.padEnd(modelW)) + ' ' +
      chalk.white(blocks) + ' ' +
      chalk.white(tools);

    if (hasTags) {
      const tagsStr = (agent.tags || []).join(', ') || '-';
      row += '  ' + chalk.cyan(tagsStr.padEnd(tagsW));
    }

    if (wide) {
      const folders = agent.folderCount !== undefined ? agent.folderCount.toString().padStart(7) : '      -';
      const mcps = agent.mcpServerCount !== undefined ? agent.mcpServerCount.toString().padStart(3) : '  -';
      const files = agent.fileCount !== undefined ? agent.fileCount.toString().padStart(5) : '    -';
      row += ' ' + chalk.white(folders) + ' ' + chalk.white(mcps) + ' ' + chalk.white(files);
    }

    row += '  ' + chalk.dim(created);
    rows.push(row);
  }

  let header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + ' ' +
    chalk.dim('MODEL'.padEnd(modelW)) + ' ' +
    chalk.dim('BLOCKS') + ' ' +
    chalk.dim('TOOLS');

  if (hasTags) {
    header += '  ' + chalk.dim('TAGS'.padEnd(tagsW));
  }

  if (wide) {
    header += ' ' + chalk.dim('FOLDERS') + ' ' + chalk.dim('MCP') + ' ' + chalk.dim('FILES');
  }

  header += '  ' + chalk.dim('CREATED');

  const baseWidth = wide ? 85 : 60;
  const tagsExtra = hasTags ? tagsW + 2 : 0;
  const width = baseWidth + nameW + tagsExtra;
  const boxLines = createBoxWithRows(`Agents (${agents.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayAgentsPlain(agents: AgentData[], wide: boolean = false): string {
  const lines: string[] = [];

  const hasTags = agents.some(a => a.tags && a.tags.length > 0);
  const maxNameLen = Math.max(...agents.map(a => a.name.length), 4);
  const nameW = maxNameLen + 1;
  const modelW = wide ? 20 : 24;
  const tagsW = hasTags ? Math.max(...agents.map(a => (a.tags || []).join(', ').length), 4) + 1 : 0;

  let header = 'NAME'.padEnd(nameW) + ' MODEL'.padEnd(modelW + 1) + ' BLOCKS TOOLS';
  if (hasTags) {
    header += '  ' + 'TAGS'.padEnd(tagsW);
  }
  if (wide) {
    header += ' FOLDERS MCP FILES';
  }
  header += '  CREATED';

  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const agent of agents) {
    const name = agent.name.padEnd(nameW);
    const model = truncate(agent.model || '-', modelW - 1).padEnd(modelW);
    const blocks = agent.blockCount.toString().padStart(6);
    const tools = agent.toolCount.toString().padStart(5);
    const created = formatDate(agent.created);

    let line = `${name} ${model} ${blocks} ${tools}`;

    if (hasTags) {
      const tagsStr = (agent.tags || []).join(', ') || '-';
      line += `  ${tagsStr.padEnd(tagsW)}`;
    }

    if (wide) {
      const folders = agent.folderCount !== undefined ? agent.folderCount.toString().padStart(7) : '      -';
      const mcps = agent.mcpServerCount !== undefined ? agent.mcpServerCount.toString().padStart(3) : '  -';
      const files = agent.fileCount !== undefined ? agent.fileCount.toString().padStart(5) : '    -';
      line += ` ${folders} ${mcps} ${files}`;
    }

    line += `  ${created}`;
    lines.push(line);
  }

  return lines.join('\n');
}

// ============================================================================
// Block Display
// ============================================================================

export interface BlockData {
  name: string;
  id: string;
  limit?: number;
  size?: number;
  agentCount?: number;
}

export function displayBlocks(blocks: BlockData[]): string {
  if (!shouldUseFancyUx()) {
    return displayBlocksPlain(blocks);
  }

  const rows: string[] = [];
  const hasAgentCounts = blocks.some(b => b.agentCount !== undefined);

  const maxNameLen = Math.max(...blocks.map(b => b.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...blocks.map(b => b.id.length), 2);
  const idW = maxIdLen + 1;
  const typeW = 9; // "orphaned" = 8 + padding
  const baseWidth = hasAgentCounts ? 32 + typeW : 32;
  const width = baseWidth + nameW + idW;

  for (const block of blocks) {
    const name = block.name;
    const id = block.id;
    const limit = (block.limit?.toString() || '-').padStart(6);
    const size = (block.size?.toString() || '-').padStart(6);
    const agents = block.agentCount !== undefined ? block.agentCount.toString().padStart(4) : '   -';
    const type = blockTypeTag(block.agentCount);

    let row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(idW)) + '  ' +
      purple(limit) + '   ' +
      chalk.white(size) + '   ' +
      chalk.white(agents);

    if (hasAgentCounts) {
      row += '  ' + type;
    }

    rows.push(row);
  }

  let header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(idW)) + '  ' +
    chalk.dim('LIMIT'.padStart(6)) + '   ' +
    chalk.dim('SIZE'.padStart(6)) + '   ' +
    chalk.dim('AGENTS');

  if (hasAgentCounts) {
    header += '  ' + chalk.dim('TYPE');
  }

  const boxLines = createBoxWithRows(`Memory Blocks (${blocks.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayBlocksPlain(blocks: BlockData[]): string {
  const lines: string[] = [];
  const hasAgentCounts = blocks.some(b => b.agentCount !== undefined);

  const maxNameLen = Math.max(...blocks.map(b => b.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...blocks.map(b => b.id.length), 2);
  const idW = maxIdLen + 1;

  let header = 'NAME'.padEnd(nameW) + '  ' + 'ID'.padEnd(idW) + '   LIMIT    SIZE  AGENTS';
  if (hasAgentCounts) header += '  TYPE';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const block of blocks) {
    const name = block.name.padEnd(nameW);
    const id = block.id.padEnd(idW);
    const limit = (block.limit?.toString() || '-').padStart(6);
    const size = (block.size?.toString() || '-').padStart(6);
    const agents = block.agentCount !== undefined ? block.agentCount.toString().padStart(6) : '     -';
    const type = blockTypeTag(block.agentCount, false);

    let line = `${name}  ${id}   ${limit}   ${size}  ${agents}`;
    if (hasAgentCounts) line += `  ${type}`;
    lines.push(line);
  }

  return lines.join('\n');
}

// ============================================================================
// Archive Display
// ============================================================================

export interface ArchiveData {
  name: string;
  id: string;
  embedding?: string;
  agentCount?: number;
}

export function displayArchives(archives: ArchiveData[]): string {
  if (!shouldUseFancyUx()) {
    return displayArchivesPlain(archives);
  }

  const rows: string[] = [];
  const maxNameLen = Math.max(...archives.map(a => a.name.length), 4);
  const nameW = maxNameLen + 1;
  const embedW = 24;
  const baseWidth = 64;
  const width = baseWidth + nameW;

  for (const archive of archives) {
    const name = archive.name;
    const id = truncate(archive.id, 26);
    const embedding = truncate(archive.embedding || '-', embedW - 1).padEnd(embedW);
    const agents = archive.agentCount !== undefined ? archive.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(28)) + '  ' +
      chalk.cyan(embedding) + '  ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(28)) + '  ' +
    chalk.dim('EMBEDDING'.padEnd(embedW)) + '  ' +
    chalk.dim('AGENTS');

  const boxLines = createBoxWithRows(`Archives (${archives.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayArchivesPlain(archives: ArchiveData[]): string {
  const lines: string[] = [];

  const maxNameLen = Math.max(...archives.map(a => a.name.length), 4);
  const nameW = maxNameLen + 1;
  const embedW = 24;

  const header = 'NAME'.padEnd(nameW) + '  ID'.padEnd(30) + '  EMBEDDING'.padEnd(embedW + 2) + '  AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const archive of archives) {
    const name = archive.name.padEnd(nameW);
    const id = truncate(archive.id, 26).padEnd(28);
    const embedding = truncate(archive.embedding || '-', embedW - 1).padEnd(embedW);
    const agents = archive.agentCount !== undefined ? archive.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name}  ${id}  ${embedding}  ${agents}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Tool Display
// ============================================================================

export interface ToolData {
  name: string;
  id: string;
  agentCount?: number;
}

export function displayTools(tools: ToolData[]): string {
  if (!shouldUseFancyUx()) {
    return displayToolsPlain(tools);
  }

  const rows: string[] = [];

  const maxNameLen = Math.max(...tools.map(t => t.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...tools.map(t => t.id.length), 2);
  const idW = maxIdLen + 1;
  const baseWidth = 18;
  const width = baseWidth + nameW + idW;

  for (const tool of tools) {
    const name = tool.name;
    const id = tool.id;
    const agents = tool.agentCount !== undefined ? tool.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(idW)) + '  ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(idW)) + '  ' +
    chalk.dim('AGENTS');

  const boxLines = createBoxWithRows(`Tools (${tools.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayToolsPlain(tools: ToolData[]): string {
  const lines: string[] = [];

  const maxNameLen = Math.max(...tools.map(t => t.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...tools.map(t => t.id.length), 2);
  const idW = maxIdLen + 1;

  const header = 'NAME'.padEnd(nameW) + '  ' + 'ID'.padEnd(idW) + '  AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const tool of tools) {
    const name = tool.name.padEnd(nameW);
    const id = tool.id.padEnd(idW);
    const agents = tool.agentCount !== undefined ? tool.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name}  ${id}  ${agents}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Folder Display
// ============================================================================

export interface FolderData {
  name: string;
  id: string;
  fileCount?: number;
  agentCount?: number;
}

export function displayFolders(folders: FolderData[]): string {
  if (!shouldUseFancyUx()) {
    return displayFoldersPlain(folders);
  }

  const rows: string[] = [];
  const hasAgentCounts = folders.some(f => f.agentCount !== undefined);

  const maxNameLen = Math.max(...folders.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...folders.map(f => f.id.length), 2);
  const idW = maxIdLen + 1;
  const typeW = 9;
  const baseWidth = hasAgentCounts ? 26 + typeW : 26;
  const width = baseWidth + nameW + idW;

  for (const folder of folders) {
    const name = folder.name;
    const id = folder.id;
    const files = folder.fileCount !== undefined ? folder.fileCount.toString().padStart(5) : '    -';
    const agents = folder.agentCount !== undefined ? folder.agentCount.toString().padStart(6) : '     -';
    const type = blockTypeTag(folder.agentCount);

    let row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(idW)) + '  ' +
      chalk.white(files) + '  ' +
      chalk.white(agents);

    if (hasAgentCounts) {
      row += '  ' + type;
    }

    rows.push(row);
  }

  let header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(idW)) + '  ' +
    chalk.dim('FILES') + '  ' +
    chalk.dim('AGENTS');

  if (hasAgentCounts) {
    header += '  ' + chalk.dim('TYPE');
  }

  const boxLines = createBoxWithRows(`Folders (${folders.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayFoldersPlain(folders: FolderData[]): string {
  const lines: string[] = [];
  const hasAgentCounts = folders.some(f => f.agentCount !== undefined);

  const maxNameLen = Math.max(...folders.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...folders.map(f => f.id.length), 2);
  const idW = maxIdLen + 1;

  let header = 'NAME'.padEnd(nameW) + '  ' + 'ID'.padEnd(idW) + '  FILES  AGENTS';
  if (hasAgentCounts) header += '  TYPE';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const folder of folders) {
    const name = folder.name.padEnd(nameW);
    const id = folder.id.padEnd(idW);
    const files = folder.fileCount !== undefined ? folder.fileCount.toString().padStart(5) : '    -';
    const agents = folder.agentCount !== undefined ? folder.agentCount.toString().padStart(6) : '     -';
    const type = blockTypeTag(folder.agentCount, false);

    let line = `${name}  ${id}  ${files}  ${agents}`;
    if (hasAgentCounts) line += `  ${type}`;
    lines.push(line);
  }

  return lines.join('\n');
}

// ============================================================================
// MCP Server Display
// ============================================================================

export interface McpServerData {
  name: string;
  id: string;
  type?: string;
  url?: string;
}

export function displayMcpServers(servers: McpServerData[]): string {
  if (!shouldUseFancyUx()) {
    return displayMcpServersPlain(servers);
  }

  const rows: string[] = [];

  const maxNameLen = Math.max(...servers.map(s => s.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...servers.map(s => s.id.length), 2);
  const idW = maxIdLen + 1;
  const baseWidth = 30;
  const width = baseWidth + nameW + idW;

  for (const server of servers) {
    const name = server.name;
    const id = server.id;
    const type = (server.type || '-').padEnd(10);
    const url = server.url || '-';

    const row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(idW)) + '  ' +
      purple(type) + '  ' +
      chalk.dim(url);

    rows.push(row);
  }

  const header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(idW)) + '  ' +
    chalk.dim('TYPE'.padEnd(10)) + '  ' +
    chalk.dim('URL/COMMAND');

  const boxLines = createBoxWithRows(`MCP Servers (${servers.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayMcpServersPlain(servers: McpServerData[]): string {
  const lines: string[] = [];

  const maxNameLen = Math.max(...servers.map(s => s.name.length), 4);
  const nameW = maxNameLen + 1;
  const maxIdLen = Math.max(...servers.map(s => s.id.length), 2);
  const idW = maxIdLen + 1;

  const header = 'NAME'.padEnd(nameW) + '  ' + 'ID'.padEnd(idW) + '  ' + 'TYPE'.padEnd(10) + '  URL/COMMAND';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const server of servers) {
    const name = server.name.padEnd(nameW);
    const id = server.id.padEnd(idW);
    const type = (server.type || '-').padEnd(10);
    const url = server.url || '-';

    lines.push(`${name}  ${id}  ${type}  ${url}`);
  }

  return lines.join('\n');
}

// ============================================================================
// File Display
// ============================================================================

export interface FileData {
  name: string;
  id: string;
  folderName: string;
  folderId: string;
  folderCount?: number;
  agentCount?: number;
}

function deduplicateFiles(files: FileData[]): Map<string, { file: FileData; allFolders: string[] }> {
  const byName = new Map<string, { file: FileData; allFolders: string[] }>();

  for (const file of files) {
    const existing = byName.get(file.name);
    if (!existing) {
      byName.set(file.name, { file, allFolders: [file.folderName] });
    } else {
      existing.allFolders.push(file.folderName);
      if ((file.agentCount || 0) > (existing.file.agentCount || 0)) {
        existing.file = file;
      }
    }
  }

  return byName;
}

export function displayFiles(files: FileData[], wide: boolean = false): string {
  if (!shouldUseFancyUx()) {
    return displayFilesPlain(files, wide);
  }

  if (wide) {
    return displayFilesWide(files);
  }

  // Default: deduplicated view
  const deduped = deduplicateFiles(files);
  const rows: string[] = [];

  const maxNameLen = Math.max(...files.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;

  const folderSummaries: string[] = [];
  for (const [, { file, allFolders }] of deduped) {
    const folderCount = allFolders.length;
    if (folderCount === 1) {
      folderSummaries.push(file.folderName);
    } else {
      const extra = folderCount - 1;
      folderSummaries.push(`${file.folderName}, +${extra} more`);
    }
  }
  const maxFolderSummaryLen = Math.max(...folderSummaries.map(s => s.length), 7);
  const folderSummaryW = maxFolderSummaryLen + 1;
  const width = nameW + folderSummaryW + 22;

  let idx = 0;
  for (const [, { file, allFolders }] of deduped) {
    const name = file.name;
    const folderSummary = folderSummaries[idx++];
    const count = allFolders.length.toString().padStart(5);
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + ' ' +
      chalk.white(name.padEnd(nameW)) + ' ' +
      purple(folderSummary.padEnd(folderSummaryW)) + ' ' +
      chalk.white(count) + ' ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '  ' +
    chalk.dim('NAME'.padEnd(nameW)) + ' ' +
    chalk.dim('FOLDERS'.padEnd(folderSummaryW)) + ' ' +
    chalk.dim('COUNT') + ' ' +
    chalk.dim('AGENTS');

  const uniqueCount = deduped.size;
  const boxLines = createBoxWithRows(`Files (${uniqueCount} unique, ${files.length} total)`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayFilesWide(files: FileData[]): string {
  const rows: string[] = [];

  const maxNameLen = Math.max(...files.map(f => f.name.length), 8);
  const nameW = maxNameLen + 1;
  const maxFolderLen = Math.max(...files.map(f => f.folderName.length), 6);
  const folderW = maxFolderLen + 1;
  const maxIdLen = Math.max(...files.map(f => f.id.length), 2);
  const idW = maxIdLen + 1;
  const width = nameW + folderW + idW + 16;

  for (const file of files) {
    const name = file.name;
    const folder = file.folderName;
    const id = file.id;
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + ' ' +
      chalk.white(name.padEnd(nameW)) + ' ' +
      purple(folder.padEnd(folderW)) + ' ' +
      chalk.dim(id.padEnd(idW)) + ' ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '  ' +
    chalk.dim('NAME'.padEnd(nameW)) + ' ' +
    chalk.dim('FOLDER'.padEnd(folderW)) + ' ' +
    chalk.dim('ID'.padEnd(idW)) + ' ' +
    chalk.dim('AGENTS');

  const boxLines = createBoxWithRows(`Files (${files.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayFilesPlain(files: FileData[], wide: boolean = false): string {
  if (wide) {
    return displayFilesPlainWide(files);
  }

  const deduped = deduplicateFiles(files);
  const lines: string[] = [];

  const maxNameLen = Math.max(...files.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;

  const folderSummaries: string[] = [];
  for (const [, { file, allFolders }] of deduped) {
    const folderCount = allFolders.length;
    if (folderCount === 1) {
      folderSummaries.push(file.folderName);
    } else {
      const extra = folderCount - 1;
      folderSummaries.push(`${file.folderName}, +${extra} more`);
    }
  }
  const maxFolderSummaryLen = Math.max(...folderSummaries.map(s => s.length), 7);
  const folderSummaryW = maxFolderSummaryLen + 1;

  const header = 'NAME'.padEnd(nameW) + ' ' + 'FOLDERS'.padEnd(folderSummaryW) + ' COUNT  AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  let idx = 0;
  for (const [, { file, allFolders }] of deduped) {
    const name = file.name.padEnd(nameW);
    const folderSummary = folderSummaries[idx++];
    const count = allFolders.length.toString().padStart(5);
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name} ${folderSummary.padEnd(folderSummaryW)} ${count}  ${agents}`);
  }

  return lines.join('\n');
}

function displayFilesPlainWide(files: FileData[]): string {
  const lines: string[] = [];

  const maxNameLen = Math.max(...files.map(f => f.name.length), 8);
  const nameW = maxNameLen + 1;
  const maxFolderLen = Math.max(...files.map(f => f.folderName.length), 6);
  const folderW = maxFolderLen + 1;
  const maxIdLen = Math.max(...files.map(f => f.id.length), 2);
  const idW = maxIdLen + 1;

  const header = 'NAME'.padEnd(nameW) + ' ' + 'FOLDER'.padEnd(folderW) + ' ' + 'ID'.padEnd(idW) + ' AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const file of files) {
    const name = file.name.padEnd(nameW);
    const folder = file.folderName.padEnd(folderW);
    const id = file.id.padEnd(idW);
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name} ${folder} ${id} ${agents}`);
  }

  return lines.join('\n');
}
