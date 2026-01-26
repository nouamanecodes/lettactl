import chalk from 'chalk';
import { LETTA_PURPLE, STATUS } from './constants';

const purple = chalk.hex(LETTA_PURPLE);

// Box drawing characters
export const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
};

/**
 * Strip ANSI codes for length calculation
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLen: number): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}

/**
 * Format date to short readable format
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  } catch {
    return '-';
  }
}

/**
 * Check if fancy UX should be used (TTY and no --no-ux flag)
 */
export function shouldUseFancyUx(): boolean {
  return !process.argv.includes('--no-ux') && process.stdout.isTTY === true;
}

/**
 * Row data for a box - two columns: key and value
 */
export interface BoxRow {
  key: string;
  value: string;
}

/**
 * Create a box with title and two-column rows
 * Matches the style from the help menu
 */
export function createBox(title: string, rows: BoxRow[], width: number): string[] {
  const lines: string[] = [];
  const innerWidth = width - 2; // Account for side borders

  // Calculate column widths
  const maxKeyLen = Math.max(...rows.map(r => r.key.length));
  const keyColWidth = maxKeyLen + 1; // +1 for space after key
  const valueColWidth = innerWidth - keyColWidth - 1;

  // Top border with title
  const topBorder = purple(BOX.topLeft + BOX.horizontal.repeat(2)) +
    ' ' + purple(title) + ' ' +
    purple(BOX.horizontal.repeat(Math.max(0, innerWidth - title.length - 4)) + BOX.topRight);
  lines.push(topBorder);

  // Data rows
  for (const row of rows) {
    const key = row.key.padEnd(keyColWidth);
    let value = row.value;
    if (value.length > valueColWidth) {
      value = value.substring(0, valueColWidth - 1) + '…';
    }
    value = value.padEnd(valueColWidth);

    const line = purple(BOX.vertical) + ' ' +
      purple(key) +
      chalk.dim(value) +
      purple(BOX.vertical);
    lines.push(line);
  }

  // Bottom border
  lines.push(purple(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));

  return lines;
}

/**
 * Create a box with custom row formatting
 * Each row is a pre-formatted string (without borders)
 */
export function createBoxWithRows(title: string, rows: string[], width: number): string[] {
  const lines: string[] = [];
  const innerWidth = width - 2;

  // Top border with title
  const topBorder = purple(BOX.topLeft + BOX.horizontal.repeat(2)) +
    ' ' + purple(title) + ' ' +
    purple(BOX.horizontal.repeat(Math.max(0, innerWidth - title.length - 4)) + BOX.topRight);
  lines.push(topBorder);

  // Data rows - add borders
  for (const row of rows) {
    const rowLen = stripAnsi(row).length;
    const padding = Math.max(0, innerWidth - rowLen - 1);
    const line = purple(BOX.vertical) + ' ' + row + ' '.repeat(padding) + purple(BOX.vertical);
    lines.push(line);
  }

  // Bottom border
  lines.push(purple(BOX.bottomLeft + BOX.horizontal.repeat(innerWidth) + BOX.bottomRight));

  return lines;
}

/**
 * Merge two columns of box lines side by side
 */
export function mergeColumns(left: string[], right: string[], gap: number = 2): string[] {
  const maxLen = Math.max(left.length, right.length);
  const lines: string[] = [];

  const leftWidth = left.length > 0 ? stripAnsi(left[0]).length : 0;

  for (let i = 0; i < maxLen; i++) {
    const leftLine = left[i] || ' '.repeat(leftWidth);
    const rightLine = right[i] || '';
    const leftPadded = leftLine + ' '.repeat(Math.max(0, leftWidth - stripAnsi(leftLine).length));
    lines.push(leftPadded + ' '.repeat(gap) + rightLine);
  }

  return lines;
}

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
  created?: string;
}

/**
 * Display agents in box format or plain table
 * @param wide - Show additional columns (folders, MCP servers, files)
 */
export function displayAgents(agents: AgentData[], wide: boolean = false): string {
  if (!shouldUseFancyUx()) {
    return displayAgentsPlain(agents, wide);
  }

  const rows: string[] = [];

  // Calculate max name length - no cap, always show full names
  const maxNameLen = Math.max(...agents.map(a => a.name.length), 4);
  const nameW = maxNameLen + 1;
  const modelW = wide ? 20 : 24;

  for (const agent of agents) {
    const status = STATUS.ok;
    const name = agent.name;  // Full name, no truncation
    const model = truncate(agent.model || '-', modelW - 1);
    const blocks = agent.blockCount.toString().padStart(6);
    const tools = agent.toolCount.toString().padStart(5);
    const created = formatDate(agent.created);

    let row = status + '  ' +
      chalk.white(name.padEnd(nameW)) + ' ' +
      chalk.cyan(model.padEnd(modelW)) + ' ' +
      chalk.white(blocks) + ' ' +
      chalk.white(tools);

    if (wide) {
      const folders = agent.folderCount !== undefined ? agent.folderCount.toString().padStart(7) : '      -';
      const mcps = agent.mcpServerCount !== undefined ? agent.mcpServerCount.toString().padStart(3) : '  -';
      const files = agent.fileCount !== undefined ? agent.fileCount.toString().padStart(5) : '    -';
      row += ' ' + chalk.white(folders) + ' ' + chalk.white(mcps) + ' ' + chalk.white(files);
    }

    row += '  ' + chalk.dim(created);
    rows.push(row);
  }

  // Header row with full names
  let header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + ' ' +
    chalk.dim('MODEL'.padEnd(modelW)) + ' ' +
    chalk.dim('BLOCKS') + ' ' +
    chalk.dim('TOOLS');

  if (wide) {
    header += ' ' + chalk.dim('FOLDERS') + ' ' + chalk.dim('MCP') + ' ' + chalk.dim('FILES');
  }

  header += '  ' + chalk.dim('CREATED');

  // Calculate width based on content
  const baseWidth = wide ? 85 : 60;  // Width without name column
  const width = baseWidth + nameW;
  const boxLines = createBoxWithRows(`Agents (${agents.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayAgentsPlain(agents: AgentData[], wide: boolean = false): string {
  const lines: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...agents.map(a => a.name.length), 4);
  const nameW = maxNameLen + 1;
  const modelW = wide ? 20 : 24;

  let header = 'NAME'.padEnd(nameW) + ' MODEL'.padEnd(modelW + 1) + ' BLOCKS TOOLS';
  if (wide) {
    header += ' FOLDERS MCP FILES';
  }
  header += '  CREATED';

  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const agent of agents) {
    const name = agent.name.padEnd(nameW);  // Full name, no truncation
    const model = truncate(agent.model || '-', modelW - 1).padEnd(modelW);
    const blocks = agent.blockCount.toString().padStart(6);
    const tools = agent.toolCount.toString().padStart(5);
    const created = formatDate(agent.created);

    let line = `${name} ${model} ${blocks} ${tools}`;

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

/**
 * Display blocks in box format or plain table
 */
export function displayBlocks(blocks: BlockData[]): string {
  if (!shouldUseFancyUx()) {
    return displayBlocksPlain(blocks);
  }

  const rows: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...blocks.map(b => b.name.length), 4);
  const nameW = maxNameLen + 1;
  const baseWidth = 58;  // Width without name column
  const width = baseWidth + nameW;

  for (const block of blocks) {
    const name = block.name;  // Full name, no truncation
    const id = truncate(block.id, 26);
    const limit = (block.limit?.toString() || '-').padStart(6);
    const size = (block.size?.toString() || '-').padStart(6);
    const agents = block.agentCount !== undefined ? block.agentCount.toString().padStart(4) : '   -';

    const row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(28)) + '  ' +
      chalk.cyan(limit) + '   ' +
      chalk.white(size) + '   ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(28)) + '  ' +
    chalk.dim('LIMIT'.padStart(6)) + '   ' +
    chalk.dim('SIZE'.padStart(6)) + '   ' +
    chalk.dim('AGENTS');

  const boxLines = createBoxWithRows(`Memory Blocks (${blocks.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayBlocksPlain(blocks: BlockData[]): string {
  const lines: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...blocks.map(b => b.name.length), 4);
  const nameW = maxNameLen + 1;

  const header = 'NAME'.padEnd(nameW) + '  ID'.padEnd(30) + '   LIMIT    SIZE  AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const block of blocks) {
    const name = block.name.padEnd(nameW);  // Full name, no truncation
    const id = truncate(block.id, 26).padEnd(28);
    const limit = (block.limit?.toString() || '-').padStart(6);
    const size = (block.size?.toString() || '-').padStart(6);
    const agents = block.agentCount !== undefined ? block.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name}  ${id}  ${limit}   ${size}  ${agents}`);
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

/**
 * Display tools in box format or plain table
 */
export function displayTools(tools: ToolData[]): string {
  if (!shouldUseFancyUx()) {
    return displayToolsPlain(tools);
  }

  const rows: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...tools.map(t => t.name.length), 4);
  const nameW = maxNameLen + 1;
  const baseWidth = 58;  // Width without name column
  const width = baseWidth + nameW;

  for (const tool of tools) {
    const name = tool.name;  // Full name, no truncation
    const id = truncate(tool.id, 38);
    const agents = tool.agentCount !== undefined ? tool.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(40)) + '  ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(40)) + '  ' +
    chalk.dim('AGENTS');

  const boxLines = createBoxWithRows(`Tools (${tools.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayToolsPlain(tools: ToolData[]): string {
  const lines: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...tools.map(t => t.name.length), 4);
  const nameW = maxNameLen + 1;

  const header = 'NAME'.padEnd(nameW) + '  ID'.padEnd(42) + '  AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const tool of tools) {
    const name = tool.name.padEnd(nameW);  // Full name, no truncation
    const id = truncate(tool.id, 38).padEnd(40);
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

/**
 * Display folders in box format or plain table
 */
export function displayFolders(folders: FolderData[]): string {
  if (!shouldUseFancyUx()) {
    return displayFoldersPlain(folders);
  }

  const rows: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...folders.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;
  const baseWidth = 66;  // Width without name column
  const width = baseWidth + nameW;

  for (const folder of folders) {
    const name = folder.name;  // Full name, no truncation
    const id = truncate(folder.id, 38);
    const files = folder.fileCount !== undefined ? folder.fileCount.toString().padStart(5) : '    -';
    const agents = folder.agentCount !== undefined ? folder.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(40)) + '  ' +
      chalk.white(files) + '  ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(40)) + '  ' +
    chalk.dim('FILES') + '  ' +
    chalk.dim('AGENTS');

  const boxLines = createBoxWithRows(`Folders (${folders.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayFoldersPlain(folders: FolderData[]): string {
  const lines: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...folders.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;

  const header = 'NAME'.padEnd(nameW) + '  ID'.padEnd(42) + '  FILES  AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const folder of folders) {
    const name = folder.name.padEnd(nameW);  // Full name, no truncation
    const id = truncate(folder.id, 38).padEnd(40);
    const files = folder.fileCount !== undefined ? folder.fileCount.toString().padStart(5) : '    -';
    const agents = folder.agentCount !== undefined ? folder.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name}  ${id}  ${files}  ${agents}`);
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

/**
 * Display MCP servers in box format or plain table
 */
export function displayMcpServers(servers: McpServerData[]): string {
  if (!shouldUseFancyUx()) {
    return displayMcpServersPlain(servers);
  }

  const rows: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...servers.map(s => s.name.length), 4);
  const nameW = maxNameLen + 1;
  const baseWidth = 76;  // Width without name column
  const width = baseWidth + nameW;

  for (const server of servers) {
    const name = server.name;  // Full name, no truncation
    const id = truncate(server.id, 28);
    const type = (server.type || '-').padEnd(10);
    const url = truncate(server.url || '-', 24);

    const row = STATUS.ok + '  ' +
      chalk.white(name.padEnd(nameW)) + '  ' +
      chalk.dim(id.padEnd(30)) + '  ' +
      chalk.cyan(type) + '  ' +
      chalk.dim(url);

    rows.push(row);
  }

  const header = '   ' +
    chalk.dim('NAME'.padEnd(nameW)) + '  ' +
    chalk.dim('ID'.padEnd(30)) + '  ' +
    chalk.dim('TYPE'.padEnd(10)) + '  ' +
    chalk.dim('URL/COMMAND');

  const boxLines = createBoxWithRows(`MCP Servers (${servers.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayMcpServersPlain(servers: McpServerData[]): string {
  const lines: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...servers.map(s => s.name.length), 4);
  const nameW = maxNameLen + 1;

  const header = 'NAME'.padEnd(nameW) + '  ID'.padEnd(32) + '  TYPE'.padEnd(12) + '  URL/COMMAND';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const server of servers) {
    const name = server.name.padEnd(nameW);  // Full name, no truncation
    const id = truncate(server.id, 28).padEnd(30);
    const type = (server.type || '-').padEnd(10);
    const url = truncate(server.url || '-', 24);

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
  folderCount?: number;  // How many folders have a file with this name
  agentCount?: number;
}

/**
 * Deduplicate files by name, keeping the one with highest agent count
 * Returns map of fileName -> { file, allFolders }
 */
function deduplicateFiles(files: FileData[]): Map<string, { file: FileData; allFolders: string[] }> {
  const byName = new Map<string, { file: FileData; allFolders: string[] }>();

  for (const file of files) {
    const existing = byName.get(file.name);
    if (!existing) {
      byName.set(file.name, { file, allFolders: [file.folderName] });
    } else {
      existing.allFolders.push(file.folderName);
      // Keep the one with higher agent count
      if ((file.agentCount || 0) > (existing.file.agentCount || 0)) {
        existing.file = file;
      }
    }
  }

  return byName;
}

/**
 * Display files in box format or plain table
 * @param wide - Show all file instances (one per folder) instead of deduplicated view
 */
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

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...files.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;
  const folderSummaryW = 32;
  const width = nameW + folderSummaryW + 30;

  for (const [, { file, allFolders }] of deduped) {
    const name = file.name;  // Full name, no truncation
    const folderCount = allFolders.length;
    let folderSummary: string;
    if (folderCount === 1) {
      folderSummary = truncate(file.folderName, folderSummaryW - 1);
    } else {
      const extra = folderCount - 1;
      const maxFirstLen = folderSummaryW - `, +${extra} more`.length - 1;
      folderSummary = truncate(file.folderName, maxFirstLen) + `, +${extra} more`;
    }
    const count = folderCount.toString().padStart(5);
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + ' ' +
      chalk.white(name.padEnd(nameW)) + ' ' +
      chalk.cyan(folderSummary.padEnd(folderSummaryW)) + ' ' +
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

/**
 * Wide view: show all file instances (one row per file per folder)
 */
function displayFilesWide(files: FileData[]): string {
  const rows: string[] = [];

  // Full filename in wide view - no cap
  const maxNameLen = Math.max(...files.map(f => f.name.length), 8);
  const nameW = maxNameLen + 1;
  const folderW = 24;
  const width = nameW + folderW + 44;

  for (const file of files) {
    const name = file.name;  // Full name, no truncation
    const folder = truncate(file.folderName, folderW - 1);
    const id = truncate(file.id, 24);
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    const row = STATUS.ok + ' ' +
      chalk.white(name.padEnd(nameW)) + ' ' +
      chalk.cyan(folder.padEnd(folderW)) + ' ' +
      chalk.dim(id.padEnd(26)) + ' ' +
      chalk.white(agents);

    rows.push(row);
  }

  const header = '  ' +
    chalk.dim('NAME'.padEnd(nameW)) + ' ' +
    chalk.dim('FOLDER'.padEnd(folderW)) + ' ' +
    chalk.dim('ID'.padEnd(26)) + ' ' +
    chalk.dim('AGENTS');

  const boxLines = createBoxWithRows(`Files (${files.length})`, [header, ...rows], width);
  return boxLines.join('\n');
}

function displayFilesPlain(files: FileData[], wide: boolean = false): string {
  if (wide) {
    return displayFilesPlainWide(files);
  }

  // Default: deduplicated view
  const deduped = deduplicateFiles(files);
  const lines: string[] = [];

  // No cap on name length - always show full names
  const maxNameLen = Math.max(...files.map(f => f.name.length), 4);
  const nameW = maxNameLen + 1;
  const folderSummaryW = 32;

  const header = 'NAME'.padEnd(nameW) + ' FOLDERS'.padEnd(folderSummaryW) + ' COUNT  AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const [, { file, allFolders }] of deduped) {
    const name = file.name.padEnd(nameW);  // Full name, no truncation
    const folderCount = allFolders.length;
    let folderSummary: string;
    if (folderCount === 1) {
      folderSummary = truncate(file.folderName, folderSummaryW - 1);
    } else {
      const extra = folderCount - 1;
      const maxFirstLen = folderSummaryW - `, +${extra} more`.length - 1;
      folderSummary = truncate(file.folderName, maxFirstLen) + `, +${extra} more`;
    }
    const count = folderCount.toString().padStart(5);
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name} ${folderSummary.padEnd(folderSummaryW)} ${count}  ${agents}`);
  }

  return lines.join('\n');
}

function displayFilesPlainWide(files: FileData[]): string {
  const lines: string[] = [];

  // Full filename in wide view - no cap
  const maxNameLen = Math.max(...files.map(f => f.name.length), 8);
  const nameW = maxNameLen + 1;
  const folderW = 24;

  const header = 'NAME'.padEnd(nameW) + ' FOLDER'.padEnd(folderW) + ' ID'.padEnd(28) + ' AGENTS';
  lines.push(header);
  lines.push('-'.repeat(header.length));

  for (const file of files) {
    const name = file.name.padEnd(nameW);  // Full name, no truncation
    const folder = truncate(file.folderName, folderW - 1).padEnd(folderW);
    const id = truncate(file.id, 24).padEnd(26);
    const agents = file.agentCount !== undefined ? file.agentCount.toString().padStart(6) : '     -';

    lines.push(`${name} ${folder} ${id} ${agents}`);
  }

  return lines.join('\n');
}

// ============================================================================
// Detail Views (for describe command)
// ============================================================================

/**
 * Data for agent details view
 */
export interface AgentDetailsData {
  id: string;
  name: string;
  description?: string;
  model?: string;
  contextWindow?: number | string;
  embedding?: string;
  created?: string;
  updated?: string;
  systemPrompt?: string;
  blocks?: { label: string; description?: string; limit?: number; valueLength?: number }[];
  tools?: { name: string; description?: string }[];
  folders?: { name: string; id: string; fileCount?: number; files?: string[] }[];
  messages?: { createdAt?: string; role?: string; preview?: string }[];
}

/**
 * Data for block details view
 */
export interface BlockDetailsData {
  id: string;
  label: string;
  description?: string;
  limit?: number;
  currentSize?: number;
  created?: string;
  attachedAgents?: { name: string; id: string }[];
  valuePreview?: string;
}

/**
 * Data for tool details view
 */
export interface ToolDetailsData {
  id: string;
  name: string;
  description?: string;
  module?: string;
  created?: string;
  attachedAgents?: { name: string; id: string }[];
  sourceCode?: string;
}

/**
 * Data for folder details view
 */
export interface FolderDetailsData {
  id: string;
  name: string;
  description?: string;
  created?: string;
  attachedAgents?: { name: string; id: string }[];
  files?: string[];
}

/**
 * Data for file details view
 */
export interface FileDetailsData {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  created?: string;
  folders?: { name: string; id: string; agentCount?: number }[];
}

/**
 * Data for MCP server details view
 */
export interface McpServerDetailsData {
  id: string;
  name: string;
  type?: string;
  serverUrl?: string;
  command?: string;
  args?: string[];
  authHeader?: string;
  tools?: { name: string; description?: string }[];
}

/**
 * Display detailed agent info
 */
export function displayAgentDetails(data: AgentDetailsData, verbose: boolean = false): string {
  if (!shouldUseFancyUx()) {
    return displayAgentDetailsPlain(data, verbose);
  }

  const width = 80;
  const lines: string[] = [];

  // Header box
  const headerRows: BoxRow[] = [
    { key: 'ID', value: data.id },
    { key: 'Name', value: data.name },
    { key: 'Description', value: data.description || '-' },
    { key: 'Model', value: data.model || 'Unknown' },
    { key: 'Context Window', value: String(data.contextWindow || 'Default') },
    { key: 'Embedding', value: data.embedding || 'Unknown' },
    { key: 'Created', value: formatDate(data.created) },
    { key: 'Updated', value: formatDate(data.updated) },
  ];
  lines.push(...createBox(`Agent: ${data.name}`, headerRows, width));

  // System prompt section
  if (data.systemPrompt) {
    lines.push('');
    const promptPreview = verbose
      ? data.systemPrompt
      : (data.systemPrompt.length > 200 ? data.systemPrompt.substring(0, 200) + '...' : data.systemPrompt);
    const promptRows = promptPreview.split('\n').slice(0, verbose ? 20 : 5).map(line => ({
      key: '',
      value: truncate(line, width - 6),
    }));
    lines.push(...createBox('System Prompt', promptRows, width));
  }

  // Memory blocks section
  if (data.blocks && data.blocks.length > 0) {
    lines.push('');
    const blockRows: string[] = [];
    for (const block of data.blocks) {
      blockRows.push(purple(block.label));
      blockRows.push(chalk.dim(`  Description: ${block.description || 'No description'}`));
      blockRows.push(chalk.dim(`  Limit: ${block.limit || 'No limit'} chars, Value: ${block.valueLength || 0} chars`));
    }
    lines.push(...createBoxWithRows(`Memory Blocks (${data.blocks.length})`, blockRows, width));
  }

  // Tools section
  if (data.tools && data.tools.length > 0) {
    lines.push('');
    const toolRows: string[] = data.tools.map(tool => chalk.white(tool.name));
    lines.push(...createBoxWithRows(`Tools (${data.tools.length})`, toolRows, width));
  }

  // Folders section
  if (data.folders && data.folders.length > 0) {
    lines.push('');
    const folderRows: string[] = [];
    for (const folder of data.folders) {
      folderRows.push(chalk.white(folder.name) + chalk.dim(` (${folder.fileCount || 0} files)`));
      if (folder.files && folder.files.length > 0) {
        const showFiles = folder.files.slice(0, 3);
        for (const file of showFiles) {
          folderRows.push(chalk.dim(`  - ${file}`));
        }
        if (folder.files.length > 3) {
          folderRows.push(chalk.dim(`  ... and ${folder.files.length - 3} more`));
        }
      }
    }
    lines.push(...createBoxWithRows(`Folders (${data.folders.length})`, folderRows, width));
  }

  // Recent messages section - header only, no box around content
  if (data.messages && data.messages.length > 0) {
    lines.push('');
    // Just the styled header line
    const title = 'Recent Messages';
    lines.push(purple(BOX.horizontal.repeat(3)) + ' ' + purple(title) + ' ' + purple(BOX.horizontal.repeat(width - title.length - 6)));

    for (const msg of data.messages.slice(-3)) {
      lines.push(chalk.dim(msg.createdAt || 'Unknown time') + chalk.cyan(` [${msg.role}]`));
      if (msg.preview) {
        lines.push('  ' + chalk.white(truncate(msg.preview, width - 4)));
      }
    }
  }

  return lines.join('\n');
}

function displayAgentDetailsPlain(data: AgentDetailsData, _verbose: boolean = false): string {
  const lines: string[] = [];

  lines.push(`Agent Details: ${data.name}`);
  lines.push('='.repeat(50));
  lines.push(`ID:               ${data.id}`);
  lines.push(`Name:             ${data.name}`);
  lines.push(`Description:      ${data.description || '-'}`);
  lines.push(`Model:            ${data.model || 'Unknown'}`);
  lines.push(`Context Window:   ${data.contextWindow || 'Default'}`);
  lines.push(`Embedding:        ${data.embedding || 'Unknown'}`);
  lines.push(`Created:          ${data.created || 'Unknown'}`);
  lines.push(`Last Updated:     ${data.updated || 'Unknown'}`);

  if (data.systemPrompt) {
    lines.push('');
    lines.push('System Prompt:');
    const truncated = data.systemPrompt.length > 200
      ? data.systemPrompt.substring(0, 200) + '...'
      : data.systemPrompt;
    lines.push(truncated);
  }

  if (data.blocks && data.blocks.length > 0) {
    lines.push('');
    lines.push(`Memory Blocks (${data.blocks.length}):`);
    for (const block of data.blocks) {
      lines.push(`  - ${block.label}`);
      lines.push(`    Description: ${block.description || 'No description'}`);
      lines.push(`    Limit: ${block.limit || 'No limit'} characters`);
      lines.push(`    Value: ${block.valueLength ? `${block.valueLength} characters` : 'No content'}`);
    }
  } else {
    lines.push('');
    lines.push('Memory Blocks: None');
  }

  if (data.tools && data.tools.length > 0) {
    lines.push('');
    lines.push(`Tools (${data.tools.length}):`);
    for (const tool of data.tools) {
      lines.push(`  - ${tool.name}`);
    }
  } else {
    lines.push('');
    lines.push('Tools: None');
  }

  if (data.folders && data.folders.length > 0) {
    lines.push('');
    lines.push(`Attached Folders (${data.folders.length}):`);
    for (const folder of data.folders) {
      lines.push(`  - ${folder.name}`);
      lines.push(`    ID: ${folder.id}`);
      lines.push(`    Files: ${folder.fileCount || 0}`);
      if (folder.files && folder.files.length > 0) {
        const showFiles = folder.files.slice(0, 3);
        for (const file of showFiles) {
          lines.push(`      - ${file}`);
        }
        if (folder.files.length > 3) {
          lines.push(`      ... and ${folder.files.length - 3} more files`);
        }
      }
    }
  } else {
    lines.push('');
    lines.push('Attached Folders: None');
  }

  if (data.messages && data.messages.length > 0) {
    lines.push('');
    lines.push(`--- Recent Messages ---`);
    for (const msg of data.messages.slice(-3)) {
      lines.push(`${msg.createdAt || 'Unknown time'} [${msg.role}]`);
      if (msg.preview) {
        lines.push(`  ${msg.preview}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Display detailed block info
 */
export function displayBlockDetails(data: BlockDetailsData): string {
  if (!shouldUseFancyUx()) {
    return displayBlockDetailsPlain(data);
  }

  const width = 70;
  const lines: string[] = [];

  const headerRows: BoxRow[] = [
    { key: 'ID', value: data.id },
    { key: 'Label', value: data.label },
    { key: 'Description', value: data.description || '-' },
    { key: 'Limit', value: `${data.limit || 'No limit'} characters` },
    { key: 'Current Size', value: `${data.currentSize || 0} characters` },
    { key: 'Created', value: formatDate(data.created) },
  ];
  lines.push(...createBox(`Block: ${data.label}`, headerRows, width));

  // Attached agents
  lines.push('');
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    const agentRows = data.attachedAgents.map(a =>
      chalk.white(a.name) + chalk.dim(` (${a.id})`)
    );
    lines.push(...createBoxWithRows(`Attached Agents (${data.attachedAgents.length})`, agentRows, width));
  } else {
    lines.push(...createBoxWithRows('Attached Agents (0)', [chalk.dim('(none - orphaned block)')], width));
  }

  // Value preview
  if (data.valuePreview) {
    lines.push('');
    const previewLines = data.valuePreview.split('\n').slice(0, 10).map(line =>
      truncate(line, width - 4)
    );
    lines.push(...createBoxWithRows('Value Preview', previewLines, width));
  }

  return lines.join('\n');
}

function displayBlockDetailsPlain(data: BlockDetailsData): string {
  const lines: string[] = [];

  lines.push(`Block Details: ${data.label}`);
  lines.push('='.repeat(50));
  lines.push(`ID:            ${data.id}`);
  lines.push(`Label:         ${data.label || '-'}`);
  lines.push(`Description:   ${data.description || '-'}`);
  lines.push(`Limit:         ${data.limit || 'No limit'} characters`);
  lines.push(`Current Size:  ${data.currentSize || 0} characters`);
  lines.push(`Created:       ${data.created || 'Unknown'}`);

  lines.push('');
  lines.push(`Attached Agents (${data.attachedAgents?.length || 0}):`);
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    for (const agent of data.attachedAgents) {
      lines.push(`  - ${agent.name} (${agent.id})`);
    }
  } else {
    lines.push('  (none - orphaned block)');
  }

  lines.push('');
  lines.push('Value Preview:');
  if (data.valuePreview) {
    const preview = data.valuePreview.length > 500
      ? data.valuePreview.substring(0, 500) + '...'
      : data.valuePreview;
    lines.push(preview);
  } else {
    lines.push('  (empty)');
  }

  return lines.join('\n');
}

/**
 * Display detailed tool info
 */
export function displayToolDetails(data: ToolDetailsData): string {
  if (!shouldUseFancyUx()) {
    return displayToolDetailsPlain(data);
  }

  const width = 70;
  const lines: string[] = [];

  const headerRows: BoxRow[] = [
    { key: 'ID', value: data.id },
    { key: 'Name', value: data.name },
    { key: 'Description', value: data.description || '-' },
    { key: 'Module', value: data.module || '-' },
    { key: 'Created', value: formatDate(data.created) },
  ];
  lines.push(...createBox(`Tool: ${data.name}`, headerRows, width));

  // Attached agents
  lines.push('');
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    const agentRows = data.attachedAgents.map(a =>
      chalk.white(a.name) + chalk.dim(` (${a.id})`)
    );
    lines.push(...createBoxWithRows(`Attached Agents (${data.attachedAgents.length})`, agentRows, width));
  } else {
    lines.push(...createBoxWithRows('Attached Agents (0)', [chalk.dim('(none - orphaned tool)')], width));
  }

  // Source code
  if (data.sourceCode) {
    lines.push('');
    const codeLines = data.sourceCode.split('\n').slice(0, 20).map(line =>
      truncate(line, width - 4)
    );
    if (data.sourceCode.split('\n').length > 20) {
      codeLines.push(chalk.dim('...(truncated)'));
    }
    lines.push(...createBoxWithRows('Source Code', codeLines, width));
  }

  return lines.join('\n');
}

function displayToolDetailsPlain(data: ToolDetailsData): string {
  const lines: string[] = [];

  lines.push(`Tool Details: ${data.name}`);
  lines.push('='.repeat(50));
  lines.push(`ID:            ${data.id}`);
  lines.push(`Name:          ${data.name}`);
  lines.push(`Description:   ${data.description || '-'}`);
  lines.push(`Module:        ${data.module || '-'}`);
  lines.push(`Created:       ${data.created || 'Unknown'}`);

  lines.push('');
  lines.push(`Attached Agents (${data.attachedAgents?.length || 0}):`);
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    for (const agent of data.attachedAgents) {
      lines.push(`  - ${agent.name} (${agent.id})`);
    }
  } else {
    lines.push('  (none - orphaned tool)');
  }

  if (data.sourceCode) {
    lines.push('');
    lines.push('Source Code:');
    const preview = data.sourceCode.length > 1000
      ? data.sourceCode.substring(0, 1000) + '\n...(truncated)'
      : data.sourceCode;
    lines.push(preview);
  }

  return lines.join('\n');
}

/**
 * Display detailed folder info
 */
export function displayFolderDetails(data: FolderDetailsData): string {
  if (!shouldUseFancyUx()) {
    return displayFolderDetailsPlain(data);
  }

  const width = 70;
  const lines: string[] = [];

  const headerRows: BoxRow[] = [
    { key: 'ID', value: data.id },
    { key: 'Name', value: data.name },
    { key: 'Description', value: data.description || '-' },
    { key: 'Created', value: formatDate(data.created) },
  ];
  lines.push(...createBox(`Folder: ${data.name}`, headerRows, width));

  // Attached agents
  lines.push('');
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    const agentRows = data.attachedAgents.map(a =>
      chalk.white(a.name) + chalk.dim(` (${a.id})`)
    );
    lines.push(...createBoxWithRows(`Attached Agents (${data.attachedAgents.length})`, agentRows, width));
  } else {
    lines.push(...createBoxWithRows('Attached Agents (0)', [chalk.dim('(none - orphaned folder)')], width));
  }

  // Files
  lines.push('');
  if (data.files && data.files.length > 0) {
    const fileRows = data.files.map(f => chalk.white(f));
    lines.push(...createBoxWithRows(`Files (${data.files.length})`, fileRows, width));
  } else {
    lines.push(...createBoxWithRows('Files (0)', [chalk.dim('(empty folder)')], width));
  }

  return lines.join('\n');
}

function displayFolderDetailsPlain(data: FolderDetailsData): string {
  const lines: string[] = [];

  lines.push(`Folder Details: ${data.name}`);
  lines.push('='.repeat(50));
  lines.push(`ID:            ${data.id}`);
  lines.push(`Name:          ${data.name}`);
  lines.push(`Description:   ${data.description || '-'}`);
  lines.push(`Created:       ${data.created || 'Unknown'}`);

  lines.push('');
  lines.push(`Attached Agents (${data.attachedAgents?.length || 0}):`);
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    for (const agent of data.attachedAgents) {
      lines.push(`  - ${agent.name} (${agent.id})`);
    }
  } else {
    lines.push('  (none - orphaned folder)');
  }

  lines.push('');
  lines.push(`Files (${data.files?.length || 0}):`);
  if (data.files && data.files.length > 0) {
    for (const file of data.files) {
      lines.push(`  - ${file}`);
    }
  } else {
    lines.push('  (empty folder)');
  }

  return lines.join('\n');
}

/**
 * Display detailed file info
 */
export function displayFileDetails(data: FileDetailsData): string {
  if (!shouldUseFancyUx()) {
    return displayFileDetailsPlain(data);
  }

  const width = 70;
  const lines: string[] = [];

  const headerRows: BoxRow[] = [
    { key: 'ID', value: data.id },
    { key: 'Name', value: data.name },
    { key: 'Size', value: data.size ? formatBytes(data.size) : '-' },
    { key: 'Type', value: data.mimeType || '-' },
    { key: 'Created', value: formatDate(data.created) },
  ];
  lines.push(...createBox(`File: ${data.name}`, headerRows, width));

  // Folders containing this file
  lines.push('');
  if (data.folders && data.folders.length > 0) {
    const folderRows = data.folders.map(f =>
      chalk.white(f.name) + chalk.dim(` (${f.id})`) +
      (f.agentCount !== undefined ? chalk.cyan(` → ${f.agentCount} agents`) : '')
    );
    lines.push(...createBoxWithRows(`In Folders (${data.folders.length})`, folderRows, width));
  } else {
    lines.push(...createBoxWithRows('In Folders (0)', [chalk.dim('(orphaned file)')], width));
  }

  return lines.join('\n');
}

function displayFileDetailsPlain(data: FileDetailsData): string {
  const lines: string[] = [];

  lines.push(`File Details: ${data.name}`);
  lines.push('='.repeat(50));
  lines.push(`ID:            ${data.id}`);
  lines.push(`Name:          ${data.name}`);
  lines.push(`Size:          ${data.size ? formatBytes(data.size) : '-'}`);
  lines.push(`Type:          ${data.mimeType || '-'}`);
  lines.push(`Created:       ${data.created || 'Unknown'}`);

  lines.push('');
  lines.push(`In Folders (${data.folders?.length || 0}):`);
  if (data.folders && data.folders.length > 0) {
    for (const folder of data.folders) {
      const agentInfo = folder.agentCount !== undefined ? ` → ${folder.agentCount} agents` : '';
      lines.push(`  - ${folder.name} (${folder.id})${agentInfo}`);
    }
  } else {
    lines.push('  (orphaned file)');
  }

  return lines.join('\n');
}

/**
 * Display detailed MCP server info
 */
export function displayMcpServerDetails(data: McpServerDetailsData): string {
  if (!shouldUseFancyUx()) {
    return displayMcpServerDetailsPlain(data);
  }

  const width = 70;
  const lines: string[] = [];

  const headerRows: BoxRow[] = [
    { key: 'ID', value: data.id },
    { key: 'Name', value: data.name },
    { key: 'Type', value: data.type || '-' },
  ];

  if (data.serverUrl) {
    headerRows.push({ key: 'Server URL', value: data.serverUrl });
  }
  if (data.command) {
    headerRows.push({ key: 'Command', value: data.command });
    if (data.args && data.args.length > 0) {
      headerRows.push({ key: 'Args', value: data.args.join(' ') });
    }
  }
  if (data.authHeader) {
    headerRows.push({ key: 'Auth Header', value: data.authHeader });
  }

  lines.push(...createBox(`MCP Server: ${data.name}`, headerRows, width));

  // Tools
  lines.push('');
  if (data.tools && data.tools.length > 0) {
    const toolRows: string[] = [];
    for (const tool of data.tools) {
      const desc = tool.description ? truncate(tool.description, 50) : '';
      toolRows.push(chalk.white(tool.name) + (desc ? chalk.dim(` - ${desc}`) : ''));
    }
    lines.push(...createBoxWithRows(`Tools (${data.tools.length})`, toolRows, width));
  } else {
    lines.push(...createBoxWithRows('Tools (0)', [chalk.dim('(no tools registered)')], width));
  }

  return lines.join('\n');
}

function displayMcpServerDetailsPlain(data: McpServerDetailsData): string {
  const lines: string[] = [];

  lines.push(`MCP Server Details: ${data.name}`);
  lines.push('='.repeat(50));
  lines.push(`ID:            ${data.id}`);
  lines.push(`Name:          ${data.name || '-'}`);
  lines.push(`Type:          ${data.type || '-'}`);

  if (data.serverUrl) {
    lines.push(`Server URL:    ${data.serverUrl}`);
  }
  if (data.command) {
    lines.push(`Command:       ${data.command}`);
    if (data.args && data.args.length > 0) {
      lines.push(`Args:          ${data.args.join(' ')}`);
    }
  }
  if (data.authHeader) {
    lines.push(`Auth Header:   ${data.authHeader}`);
  }

  lines.push('');
  lines.push(`Tools (${data.tools?.length || 0}):`);
  if (data.tools && data.tools.length > 0) {
    for (const tool of data.tools) {
      lines.push(`  - ${tool.name}`);
      if (tool.description) {
        const truncated = tool.description.length > 80
          ? tool.description.substring(0, 77) + '...'
          : tool.description;
        lines.push(`    ${truncated}`);
      }
    }
  } else {
    lines.push('  (no tools registered)');
  }

  return lines.join('\n');
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
