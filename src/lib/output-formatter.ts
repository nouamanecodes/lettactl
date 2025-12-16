import Table from 'cli-table3';
import { AgentUpdateOperations } from './diff-engine';

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
   * Creates a table for agent listing
   */
  static createAgentTable(agents: any[]): string {
    const table = new Table({
      head: ['NAME', 'ID'],
      colWidths: [30, 50]
    });

    for (const agent of agents) {
      table.push([
        agent.name || 'Unknown',
        agent.id || 'Unknown'
      ]);
    }

    return table.toString();
  }

  /**
   * Creates a table for block listing
   */
  static createBlockTable(blocks: any[]): string {
    const table = new Table({
      head: ['NAME', 'ID', 'LIMIT'],
      colWidths: [35, 40, 10]
    });

    for (const block of blocks) {
      table.push([
        block.label || block.name || 'Unknown',
        block.id || 'Unknown',
        block.limit?.toString() || '-'
      ]);
    }

    return table.toString();
  }

  /**
   * Creates a table for tool listing
   */
  static createToolTable(tools: any[]): string {
    const table = new Table({
      head: ['NAME', 'ID'],
      colWidths: [35, 50]
    });

    for (const tool of tools) {
      table.push([
        tool.name || 'Unknown',
        tool.id || 'Unknown'
      ]);
    }

    return table.toString();
  }

  /**
   * Creates a table for folder listing
   */
  static createFolderTable(folders: any[]): string {
    const table = new Table({
      head: ['NAME', 'ID'],
      colWidths: [35, 50]
    });

    for (const folder of folders) {
      table.push([
        folder.name || 'Unknown',
        folder.id || 'Unknown'
      ]);
    }

    return table.toString();
  }

  /**
   * Handles JSON output if requested, returns true if handled
   */
  static handleJsonOutput(data: any, format?: string): boolean {
    if (format === 'json') {
      console.log(JSON.stringify(data, null, 2));
      return true;
    }
    return false;
  }

  /**
   * Display granular diff information for agent updates
   * Shows what exactly changed in a CI/CD friendly format
   */
  static showAgentUpdateDiff(operations: AgentUpdateOperations): void {
    // System prompt and basic field changes
    if (operations.updateFields) {
      if (operations.updateFields.systemPrompt !== undefined) {
        console.log(`  ~ System prompt: updated`);
      }
      if (operations.updateFields.model !== undefined) {
        console.log(`  ~ Model: updated to ${operations.updateFields.model}`);
      }
      if (operations.updateFields.embedding !== undefined) {
        console.log(`  ~ Embedding: updated to ${operations.updateFields.embedding}`);
      }
      if (operations.updateFields.contextWindow !== undefined) {
        console.log(`  ~ Context window: updated to ${operations.updateFields.contextWindow}`);
      }
    } else {
      console.log(`  = Basic fields: unchanged`);
    }

    // Tools changes
    if (operations.tools) {
      const { toAdd, toRemove, toUpdate, unchanged } = operations.tools;
      
      if (toAdd.length > 0 || toRemove.length > 0 || toUpdate.length > 0) {
        console.log(`  ~ Tools: ${unchanged.length} unchanged, ${toAdd.length + toRemove.length + toUpdate.length} modified`);
        
        toAdd.forEach(tool => console.log(`    + Added tool: ${tool.name}`));
        toRemove.forEach(tool => console.log(`    - Removed tool: ${tool.name}`));
        toUpdate.forEach(tool => console.log(`    ~ Updated tool: ${tool.name} (${tool.reason})`));
      } else {
        console.log(`  = Tools: unchanged`);
      }
    } else {
      console.log(`  = Tools: unchanged`);
    }

    // Memory blocks changes  
    if (operations.blocks) {
      const { toAdd, toRemove, toUpdate, unchanged } = operations.blocks;
      
      if (toAdd.length > 0 || toRemove.length > 0 || toUpdate.length > 0) {
        console.log(`  ~ Memory blocks: ${unchanged.length} unchanged, ${toAdd.length + toRemove.length + toUpdate.length} modified`);
        
        toAdd.forEach(block => console.log(`    + Added block: ${block.name}`));
        toRemove.forEach(block => console.log(`    - Removed block: ${block.name}`));
        toUpdate.forEach(block => console.log(`    ~ Updated block: ${block.name}`));
      } else {
        console.log(`  = Memory blocks: unchanged`);
      }
    } else {
      console.log(`  = Memory blocks: unchanged`);
    }

    // Folders changes
    if (operations.folders) {
      const { toAttach, toDetach, toUpdate, unchanged } = operations.folders;
      
      if (toAttach.length > 0 || toDetach.length > 0 || toUpdate.length > 0) {
        console.log(`  ~ Folders: ${unchanged.length} unchanged, ${toAttach.length + toDetach.length + toUpdate.length} modified`);
        
        toAttach.forEach(folder => console.log(`    + Added folder: ${folder.name}`));
        toDetach.forEach(folder => console.log(`    - Removed folder: ${folder.name}`));
        toUpdate.forEach(folder => {
          console.log(`    ~ Updated folder: ${folder.name}`);
          folder.filesToAdd.forEach(file => console.log(`      + Added file: ${file}`));
          folder.filesToRemove.forEach(file => console.log(`      - Removed file: ${file}`));
          folder.filesToUpdate.forEach(file => console.log(`      ~ Updated file: ${file}`));
        });
      } else {
        console.log(`  = Folders: unchanged`);
      }
    } else {
      console.log(`  = Folders: unchanged`);
    }

    console.log(`  Total operations: ${operations.operationCount}, preserves conversation: ${operations.preservesConversation}`);
  }
}