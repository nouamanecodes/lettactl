import Table from 'cli-table3';
import { AgentUpdateOperations } from '../diff-engine';
import { isBuiltinTool } from '../builtin-tools';
import { log, output } from '../logger';
import {
  displayAgents,
  displayBlocks,
  displayTools,
  displayFolders,
  displayMcpServers,
  displayFiles,
  AgentData,
  BlockData,
  ToolData,
  FolderData,
  McpServerData,
  FileData,
} from './box';
import { AgentDisplayData } from '../agent-data-fetcher';

/**
 * Formats run/job status as bracketed labels
 */
export function formatStatus(status: string): string {
  switch (status) {
    case 'created':
      return '[CREATED]';
    case 'running':
      return '[RUNNING]';
    case 'completed':
      return '[OK]';
    case 'failed':
      return '[FAILED]';
    case 'cancelled':
      return '[CANCELLED]';
    default:
      return `[${status.toUpperCase()}]`;
  }
}

export class OutputFormatter {
  /**
   * Formats output based on the specified format
   */
  static formatOutput(data: any, format: string): string {
    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);

      case 'yaml':
        // TODO: Implement YAML formatting
        return 'YAML output not yet implemented';

      default:
        return ''; // Default handling should be done by caller
    }
  }

  /**
   * Creates a table for agent listing from standardized AgentDisplayData
   * @param wide - Show additional columns (folders, MCP servers, files)
   */
  static createAgentTable(agents: AgentDisplayData[], wide: boolean = false): string {
    const data: AgentData[] = agents.map(agent => ({
      name: agent.name,
      id: agent.id,
      description: agent.description,
      model: agent.model,
      blockCount: agent.blockCount,
      toolCount: agent.toolCount,
      folderCount: agent.folderCount,
      mcpServerCount: agent.mcpServerCount,
      fileCount: agent.fileCount,
      created: agent.created,
    }));

    return displayAgents(data, wide);
  }

  /**
   * Creates a table for block listing
   * @param agentCounts - Optional map of block ID to agent count (for wide output)
   */
  static createBlockTable(blocks: any[], _wide: boolean = false, agentCounts?: Map<string, number>): string {
    const data: BlockData[] = blocks.map(block => ({
      name: block.label || block.name || 'Unknown',
      id: block.id || 'Unknown',
      limit: block.limit,
      size: block.value?.length || 0,
      agentCount: agentCounts?.get(block.id),
    }));

    return displayBlocks(data);
  }

  /**
   * Creates a table for tool listing
   * @param agentCounts - Optional map of tool ID to agent count (for wide output)
   */
  static createToolTable(tools: any[], _wide: boolean = false, agentCounts?: Map<string, number>): string {
    const data: ToolData[] = tools.map(tool => ({
      name: tool.name || 'Unknown',
      id: tool.id || 'Unknown',
      agentCount: agentCounts?.get(tool.id),
    }));

    return displayTools(data);
  }

  /**
   * Creates a table for folder listing
   * @param agentCounts - Optional map of folder ID to agent count
   * @param fileCounts - Optional map of folder ID to file count
   */
  static createFolderTable(folders: any[], _wide: boolean = false, agentCounts?: Map<string, number>, fileCounts?: Map<string, number>): string {
    const data: FolderData[] = folders.map(folder => ({
      name: folder.name || 'Unknown',
      id: folder.id || 'Unknown',
      fileCount: fileCounts?.get(folder.id),
      agentCount: agentCounts?.get(folder.id),
    }));

    return displayFolders(data);
  }

  /**
   * Creates a table for MCP server listing
   */
  static createMcpServerTable(servers: any[]): string {
    const data: McpServerData[] = servers.map(server => ({
      name: server.server_name || server.name || 'Unknown',
      id: server.id || 'Unknown',
      type: server.mcp_server_type,
      url: server.server_url || server.command,
    }));

    return displayMcpServers(data);
  }

  /**
   * Creates a table for file listing
   * @param files - Raw file data with folder info
   * @param agentCounts - Optional map of folder ID to agent count
   * @param wide - Show all file instances instead of deduplicated view
   */
  static createFileTable(files: any[], agentCounts?: Map<string, number>, wide: boolean = false): string {
    const data: FileData[] = files.map(file => ({
      name: file.name || file.file_name || 'Unknown',
      id: file.id || file.file_id || 'Unknown',
      folderName: file.folderName || file.folder_name || 'Unknown',
      folderId: file.folderId || file.folder_id || 'Unknown',
      agentCount: agentCounts?.get(file.folderId || file.folder_id),
    }));

    return displayFiles(data, wide);
  }

  /**
   * Handles JSON output if requested, returns true if handled
   */
  static handleJsonOutput(data: any, format?: string): boolean {
    if (format === 'json') {
      output(JSON.stringify(data, null, 2));
      return true;
    }
    return false;
  }

  /**
   * Display granular diff information for agent updates
   * Shows what exactly changed in a CI/CD friendly format
   * @param operations - The update operations to display
   * @param builtinTools - Optional set of tool names that are builtins (for tagging)
   */
  static showAgentUpdateDiff(operations: AgentUpdateOperations, builtinTools?: Set<string>): void {
    // System prompt and basic field changes
    if (operations.updateFields) {
      if (operations.updateFields.system !== undefined) {
        log(`  ~ System prompt: updated`);
      }
      if (operations.updateFields.model !== undefined) {
        const { from, to } = operations.updateFields.model;
        log(`  ~ Model: ${from} → ${to}`);
      }
      if (operations.updateFields.embedding !== undefined) {
        const { from, to } = operations.updateFields.embedding;
        log(`  ~ Embedding: ${from} → ${to}`);
      }
      if (operations.updateFields.contextWindow !== undefined) {
        const { from, to } = operations.updateFields.contextWindow;
        log(`  ~ Context window: ${from} → ${to}`);
      }
    } else {
      log(`  = Basic fields: unchanged`);
    }

    // Tools changes
    if (operations.tools) {
      const { toAdd, toRemove, toUpdate, unchanged } = operations.tools;

      // Helper to get builtin tag
      const getBuiltinTag = (name: string) =>
        (builtinTools?.has(name) || isBuiltinTool(name)) ? ' [builtin]' : '';

      if (toAdd.length > 0 || toRemove.length > 0 || toUpdate.length > 0) {
        log(`  ~ Tools: ${unchanged.length} unchanged, ${toAdd.length + toRemove.length + toUpdate.length} modified`);

        toAdd.forEach(tool => log(`    + Added tool: ${tool.name}${getBuiltinTag(tool.name)}`));
        toRemove.forEach(tool => log(`    - Removed tool: ${tool.name}${getBuiltinTag(tool.name)}`));
        toUpdate.forEach(tool => log(`    ~ Updated tool: ${tool.name} (${tool.reason})`));
      } else {
        log(`  = Tools: unchanged`);
      }
    } else {
      log(`  = Tools: unchanged`);
    }

    // Memory blocks changes
    if (operations.blocks) {
      const { toAdd, toRemove, toUpdate, toUpdateValue, unchanged } = operations.blocks;

      if (toAdd.length > 0 || toRemove.length > 0 || toUpdate.length > 0 || toUpdateValue.length > 0) {
        log(`  ~ Memory blocks: ${unchanged.length} unchanged, ${toAdd.length + toRemove.length + toUpdate.length + toUpdateValue.length} modified`);

        toAdd.forEach(block => log(`    + Added block: ${block.name}`));
        toRemove.forEach(block => log(`    - Removed block: ${block.name}`));
        toUpdate.forEach(block => log(`    ~ Updated block: ${block.name}`));
        toUpdateValue.forEach(block => log(`    ~ Synced block: ${block.name} (value from YAML)`));
      } else {
        log(`  = Memory blocks: unchanged`);
      }
    } else {
      log(`  = Memory blocks: unchanged`);
    }

    // Folders changes
    if (operations.folders) {
      const { toAttach, toDetach, toUpdate, unchanged } = operations.folders;

      if (toAttach.length > 0 || toDetach.length > 0 || toUpdate.length > 0) {
        log(`  ~ Folders: ${unchanged.length} unchanged, ${toAttach.length + toDetach.length + toUpdate.length} modified`);

        toAttach.forEach(folder => log(`    + Added folder: ${folder.name}`));
        toDetach.forEach(folder => log(`    - Removed folder: ${folder.name}`));
        toUpdate.forEach(folder => {
          log(`    ~ Updated folder: ${folder.name}`);
          folder.filesToAdd.forEach(file => log(`      + Added file: ${file}`));
          folder.filesToRemove.forEach(file => log(`      - Removed file: ${file}`));
          folder.filesToUpdate.forEach(file => log(`      ~ Updated file: ${file}`));
        });
      } else {
        log(`  = Folders: unchanged`);
      }
    } else {
      log(`  = Folders: unchanged`);
    }

    log(`  Total operations: ${operations.operationCount}, preserves conversation: ${operations.preservesConversation}`);
  }
}
