import chalk from 'chalk';
import { purple, STATUS } from '../constants';
import { BOX, BoxRow, createBox, createBoxWithRows, truncate, formatDate, shouldUseFancyUx } from '../box';

// ============================================================================
// Detail View Interfaces
// ============================================================================

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

export interface ToolDetailsData {
  id: string;
  name: string;
  description?: string;
  module?: string;
  created?: string;
  attachedAgents?: { name: string; id: string }[];
  sourceCode?: string;
}

export interface FolderDetailsData {
  id: string;
  name: string;
  description?: string;
  created?: string;
  attachedAgents?: { name: string; id: string }[];
  files?: string[];
}

export interface FileDetailsData {
  id: string;
  name: string;
  size?: number;
  mimeType?: string;
  created?: string;
  folders?: { name: string; id: string; agentCount?: number }[];
}

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

// ============================================================================
// Agent Details
// ============================================================================

export function displayAgentDetails(data: AgentDetailsData, verbose: boolean = false): string {
  if (!shouldUseFancyUx()) {
    return displayAgentDetailsPlain(data, verbose);
  }

  const width = 80;
  const lines: string[] = [];

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

  if (data.tools && data.tools.length > 0) {
    lines.push('');
    const toolRows: string[] = data.tools.map(tool => chalk.white(tool.name));
    lines.push(...createBoxWithRows(`Tools (${data.tools.length})`, toolRows, width));
  }

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

  if (data.messages && data.messages.length > 0) {
    lines.push('');
    const title = 'Recent Messages';
    lines.push(purple(BOX.horizontal.repeat(3)) + ' ' + purple(title) + ' ' + purple(BOX.horizontal.repeat(width - title.length - 6)));

    for (const msg of data.messages.slice(-3)) {
      const roleColor = msg.role === 'user_message' ? chalk.green
        : msg.role === 'assistant_message' ? purple
        : chalk.dim;
      lines.push(chalk.dim(msg.createdAt || 'Unknown time') + roleColor(` [${msg.role}]`));
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

// ============================================================================
// Block Details
// ============================================================================

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

  lines.push('');
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    const agentRows = data.attachedAgents.map(a =>
      chalk.white(a.name) + chalk.dim(` (${a.id})`)
    );
    lines.push(...createBoxWithRows(`Attached Agents (${data.attachedAgents.length})`, agentRows, width));
  } else {
    lines.push(...createBoxWithRows('Attached Agents (0)', [chalk.dim('(none - orphaned block)')], width));
  }

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

// ============================================================================
// Tool Details
// ============================================================================

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

  lines.push('');
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    const agentRows = data.attachedAgents.map(a =>
      chalk.white(a.name) + chalk.dim(` (${a.id})`)
    );
    lines.push(...createBoxWithRows(`Attached Agents (${data.attachedAgents.length})`, agentRows, width));
  } else {
    lines.push(...createBoxWithRows('Attached Agents (0)', [chalk.dim('(none - orphaned tool)')], width));
  }

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

// ============================================================================
// Folder Details
// ============================================================================

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

  lines.push('');
  if (data.attachedAgents && data.attachedAgents.length > 0) {
    const agentRows = data.attachedAgents.map(a =>
      chalk.white(a.name) + chalk.dim(` (${a.id})`)
    );
    lines.push(...createBoxWithRows(`Attached Agents (${data.attachedAgents.length})`, agentRows, width));
  } else {
    lines.push(...createBoxWithRows('Attached Agents (0)', [chalk.dim('(none - orphaned folder)')], width));
  }

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

// ============================================================================
// File Details
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

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

  lines.push('');
  if (data.folders && data.folders.length > 0) {
    const folderRows = data.folders.map(f =>
      chalk.white(f.name) + chalk.dim(` (${f.id})`) +
      (f.agentCount !== undefined ? purple(` → ${f.agentCount} agents`) : '')
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

// ============================================================================
// MCP Server Details
// ============================================================================

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
