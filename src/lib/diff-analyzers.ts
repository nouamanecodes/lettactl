import { LettaClientWrapper } from './letta-client';
import { BlockManager } from './block-manager';
import { normalizeResponse } from './response-normalizer';
import { ToolDiff, BlockDiff, FolderDiff } from './diff-engine';

function hasSourceContent(itemName: string, sourceHashes: Record<string, string>): boolean {
  return !!sourceHashes[itemName];
}

export async function analyzeToolChanges(
  currentTools: any[],
  desiredToolNames: string[],
  toolRegistry: Map<string, string>,
  _toolSourceHashes?: Record<string, string>,
  updatedTools?: Set<string>
): Promise<ToolDiff> {
  const currentToolNames = new Set(currentTools.map(t => t.name));
  const desiredToolSet = new Set(desiredToolNames);

  const toAdd: Array<{ name: string; id: string }> = [];
  const toRemove: Array<{ name: string; id: string }> = [];
  const toUpdate: Array<{ name: string; currentId: string; newId: string; reason: string }> = [];
  const unchanged: Array<{ name: string; id: string }> = [];

  // Find tools to add
  for (const toolName of desiredToolNames) {
    if (!currentToolNames.has(toolName)) {
      const toolId = toolRegistry.get(toolName);
      if (toolId) {
        toAdd.push({ name: toolName, id: toolId });
      }
    }
  }

  // Find tools to remove, update (source code changed), or leave unchanged
  for (const tool of currentTools) {
    if (desiredToolSet.has(tool.name)) {
      const toolName = tool.name;

      // Check if tool was already updated by registerRequiredTools
      if (updatedTools?.has(toolName)) {
        const newToolId = toolRegistry.get(toolName);
        toUpdate.push({
          name: toolName,
          currentId: tool.id,
          newId: newToolId || tool.id,
          reason: 'source_code_changed'
        });
      } else {
        unchanged.push({ name: tool.name, id: tool.id });
      }
    } else {
      toRemove.push({ name: tool.name, id: tool.id });
    }
  }

  return { toAdd, toRemove, toUpdate, unchanged };
}

export async function analyzeBlockChanges(
  currentBlocks: any[],
  desiredBlocks: Array<{ name: string; isShared?: boolean; description?: string; limit?: number; value?: string }>,
  blockManager: BlockManager,
  agentName?: string
): Promise<BlockDiff> {
  const currentBlockNames = new Set(currentBlocks.map(b => b.label));
  const desiredBlockNames = new Set(desiredBlocks.map(b => b.name));

  const toAdd: Array<{ name: string; id: string }> = [];
  const toRemove: Array<{ name: string; id: string }> = [];
  const toUpdate: Array<{ name: string; currentId: string; newId: string }> = [];
  const unchanged: Array<{ name: string; id: string }> = [];

  // Find blocks to add
  for (const blockConfig of desiredBlocks) {
    if (!currentBlockNames.has(blockConfig.name)) {
      let blockId = blockConfig.isShared
        ? blockManager.getSharedBlockId(blockConfig.name)
        : blockManager.getAgentBlockId(blockConfig.name);

      // If block doesn't exist yet, create it
      if (!blockId && !blockConfig.isShared && blockConfig.description && agentName) {
        console.log(`Creating new memory block: ${blockConfig.name} for agent ${agentName}`);
        blockId = await blockManager.getOrCreateAgentBlock(
          {
            name: blockConfig.name,
            description: blockConfig.description,
            limit: blockConfig.limit || 2000,
            value: blockConfig.value || ''
          },
          agentName
        );
      }

      if (blockId) {
        toAdd.push({ name: blockConfig.name, id: blockId });
      }
    }
  }

  // Find blocks to remove or mark as unchanged
  for (const block of currentBlocks) {
    if (desiredBlockNames.has(block.label)) {
      unchanged.push({ name: block.label, id: block.id });
    } else {
      toRemove.push({ name: block.label, id: block.id });
    }
  }

  return { toAdd, toRemove, toUpdate, unchanged };
}

export async function analyzeFolderChanges(
  currentFolders: any[],
  desiredFolders: Array<{ name: string; files: string[]; fileContentHashes?: Record<string, string> }>,
  folderRegistry: Map<string, string>,
  client: LettaClientWrapper
): Promise<FolderDiff> {
  const currentFolderNames = new Set(currentFolders.map(f => f.name));
  const desiredFolderNames = new Set(desiredFolders.map(f => f.name));

  const toAttach: Array<{ name: string; id: string }> = [];
  const toDetach: Array<{ name: string; id: string }> = [];
  const toUpdate: Array<{
    name: string;
    id: string;
    filesToAdd: string[];
    filesToRemove: string[];
    filesToUpdate: string[];
  }> = [];
  const unchanged: Array<{ name: string; id: string }> = [];

  // Find folders to attach (new folders)
  for (const folderConfig of desiredFolders) {
    if (!currentFolderNames.has(folderConfig.name)) {
      const folderId = folderRegistry.get(folderConfig.name);
      if (folderId) {
        toAttach.push({ name: folderConfig.name, id: folderId });
      }
    }
  }

  // Find folders to detach, update, or leave unchanged
  for (const folder of currentFolders) {
    if (desiredFolderNames.has(folder.name)) {
      const desiredFolder = desiredFolders.find(f => f.name === folder.name);

      if (desiredFolder && desiredFolder.fileContentHashes) {
        try {
          const currentFilesResponse = await client.listFolderFiles(folder.id);
          const currentFiles = normalizeResponse(currentFilesResponse);
          const currentFileNames = new Set(currentFiles.map((f: any) => f.name || f.file_name || String(f)).filter(Boolean));
          const desiredFileNames = new Set(desiredFolder.files);

          const filesToAdd: string[] = [];
          const filesToRemove: string[] = [];
          const filesToUpdate: string[] = [];

          // Find files to add or update
          for (const filePath of desiredFolder.files) {
            const fileName = filePath.split('/').pop() || filePath;
            if (!currentFileNames.has(fileName)) {
              filesToAdd.push(filePath);
            } else {
              if (hasSourceContent(filePath, desiredFolder.fileContentHashes || {})) {
                console.log(`File ${filePath} has file-based content, checking for updates...`);
                filesToUpdate.push(filePath);
              }
            }
          }

          // Find files to remove
          for (const currentFile of currentFiles) {
            const fileName = currentFile.name || currentFile.file_name || String(currentFile);
            if (fileName && !desiredFileNames.has(fileName)) {
              filesToRemove.push(fileName);
            }
          }

          if (filesToAdd.length > 0 || filesToRemove.length > 0 || filesToUpdate.length > 0) {
            toUpdate.push({
              name: folder.name,
              id: folder.id,
              filesToAdd,
              filesToRemove,
              filesToUpdate
            });
          } else {
            unchanged.push({ name: folder.name, id: folder.id });
          }
        } catch (error) {
          console.warn(`Could not analyze files in folder ${folder.name}:`, error);
          unchanged.push({ name: folder.name, id: folder.id });
        }
      } else {
        unchanged.push({ name: folder.name, id: folder.id });
      }
    } else {
      toDetach.push({ name: folder.name, id: folder.id });
    }
  }

  return { toAttach, toDetach, toUpdate, unchanged };
}
