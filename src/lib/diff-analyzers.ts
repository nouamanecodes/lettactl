import { LettaClientWrapper } from './letta-client';
import { BlockManager } from './block-manager';
import { normalizeResponse } from './response-normalizer';
import { ToolDiff, BlockDiff, FolderDiff } from './diff-engine';
import { FolderFileConfig } from '../types/fleet-config';

// Helper to extract file name from FolderFileConfig (string or from_bucket object)
function getFileName(fileConfig: FolderFileConfig): string {
  if (typeof fileConfig === 'string') {
    return fileConfig.split('/').pop() || fileConfig;
  }
  // from_bucket object
  return fileConfig.from_bucket.path.split('/').pop() || fileConfig.from_bucket.path;
}

/**
 * Normalize file name by stripping Letta's auto-rename suffix _(N)
 * e.g., "file-a_(1).md" -> "file-a.md", "doc_(23).txt" -> "doc.txt"
 */
function normalizeFileName(fileName: string): string {
  return fileName.replace(/_\(\d+\)(\.[^.]+)$/, '$1');
}

// Helper to get file identifier for comparison
function getFileIdentifier(fileConfig: FolderFileConfig): string {
  if (typeof fileConfig === 'string') {
    return fileConfig;
  }
  return `bucket:${fileConfig.from_bucket.bucket}/${fileConfig.from_bucket.path}`;
}

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
  desiredBlocks: Array<{ name: string; isShared?: boolean; description?: string; limit?: number; value?: string; mutable?: boolean }>,
  blockManager: BlockManager,
  agentName?: string,
  dryRun: boolean = false
): Promise<BlockDiff> {
  const currentBlockNames = new Set(currentBlocks.map(b => b.label));
  const desiredBlockNames = new Set(desiredBlocks.map(b => b.name));

  const toAdd: Array<{ name: string; id: string }> = [];
  const toRemove: Array<{ name: string; id: string }> = [];
  const toUpdate: Array<{ name: string; currentId: string; newId: string }> = [];
  const toUpdateValue: Array<{ name: string; id: string; oldValue: string; newValue: string }> = [];
  const unchanged: Array<{ name: string; id: string }> = [];

  // Find blocks to add
  for (const blockConfig of desiredBlocks) {
    if (!currentBlockNames.has(blockConfig.name)) {
      let blockId = blockConfig.isShared
        ? blockManager.getSharedBlockId(blockConfig.name)
        : blockManager.getAgentBlockId(blockConfig.name);

      // If block doesn't exist yet, create it (unless dry-run)
      if (!blockId && !blockConfig.isShared && blockConfig.description && agentName) {
        if (dryRun) {
          // In dry-run, just mark as new without creating
          toAdd.push({ name: blockConfig.name, id: '(new)' });
          continue;
        }
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

  // Find blocks to remove, update value, or mark as unchanged
  for (const block of currentBlocks) {
    if (desiredBlockNames.has(block.label)) {
      // Block exists on both sides - check if value needs updating
      const desiredConfig = desiredBlocks.find(b => b.name === block.label);

      // For mutable: false blocks, compare values and update if different
      if (desiredConfig && desiredConfig.mutable === false && !desiredConfig.isShared) {
        const desiredValue = desiredConfig.value || '';
        const currentValue = block.value || '';

        if (desiredValue !== currentValue) {
          toUpdateValue.push({ name: block.label, id: block.id, oldValue: currentValue, newValue: desiredValue });
          continue;
        }
      }

      unchanged.push({ name: block.label, id: block.id });
    } else {
      toRemove.push({ name: block.label, id: block.id });
    }
  }

  return { toAdd, toRemove, toUpdate, toUpdateValue, unchanged };
}

export async function analyzeFolderChanges(
  currentFolders: any[],
  desiredFolders: Array<{ name: string; files: FolderFileConfig[]; fileContentHashes?: Record<string, string> }>,
  folderRegistry: Map<string, string>,
  client: LettaClientWrapper,
  previousFolderFileHashes?: Record<string, Record<string, string>>,
  dryRun: boolean = false
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
      } else if (dryRun) {
        // In dry-run, show folders that would be created
        toAttach.push({ name: folderConfig.name, id: '(new)' });
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

          // Build normalized lookup: normalized name -> actual file names on server
          const normalizedToActual = new Map<string, string[]>();
          for (const f of currentFiles) {
            const actualName = f.name || f.file_name || String(f);
            if (actualName) {
              const normalized = normalizeFileName(actualName);
              if (!normalizedToActual.has(normalized)) {
                normalizedToActual.set(normalized, []);
              }
              normalizedToActual.get(normalized)!.push(actualName);
            }
          }

          // Desired files come from expanded hashes (includes bucket glob expansions)
          const desiredFileNames = new Set(Object.keys(desiredFolder.fileContentHashes));

          const filesToAdd: string[] = [];
          const filesToRemove: string[] = [];
          const filesToUpdate: string[] = [];

          // Helper to get the identifier for a file - for bucket globs, construct full path
          const getFileId = (fileName: string): string => {
            const config = desiredFolder.files.find(f => {
              if (typeof f === 'string') {
                return f.split('/').pop() === fileName;
              }
              if (f.from_bucket) {
                if (f.from_bucket.path.includes('*')) {
                  return true; // Glob could match any expanded file
                }
                return f.from_bucket.path.split('/').pop() === fileName;
              }
              return false;
            });
            // For bucket globs, construct the full bucket path for the individual file
            if (config && typeof config !== 'string' && config.from_bucket?.path.includes('*')) {
              const { bucket, path: globPath } = config.from_bucket;
              // Replace glob pattern with the actual filename
              const dir = globPath.substring(0, globPath.lastIndexOf('/') + 1);
              return `bucket:${bucket}/${dir}${fileName}`;
            }
            return config ? getFileIdentifier(config) : fileName;
          };

          // Find files to add or update
          const prevHashes = previousFolderFileHashes?.[folder.name] || {};
          for (const fileName of desiredFileNames) {
            const currentHash = desiredFolder.fileContentHashes[fileName];
            const previousHash = prevHashes[fileName];

            // Check if file exists on server (exact or _(N) variant)
            const variants = normalizedToActual.get(fileName) || [];
            const hasExactMatch = variants.includes(fileName);
            const suffixedVariants = variants.filter(v => v !== fileName);

            if (!hasExactMatch && suffixedVariants.length === 0) {
              // File doesn't exist at all - need to add
              filesToAdd.push(getFileId(fileName));
            } else if (suffixedVariants.length > 0 && !hasExactMatch) {
              // Only _(N) variant exists - remove variants and re-add clean
              for (const variant of suffixedVariants) {
                filesToRemove.push(variant);
              }
              filesToAdd.push(getFileId(fileName));
            } else {
              // Exact match exists - check for content changes
              if (currentHash && currentHash !== previousHash) {
                filesToUpdate.push(getFileId(fileName));
              }
              // Also clean up any _(N) variants if exact match exists
              for (const variant of suffixedVariants) {
                filesToRemove.push(variant);
              }
            }
          }

          // Find files to remove (on server but not in desired)
          for (const [normalized, actuals] of normalizedToActual) {
            if (!desiredFileNames.has(normalized)) {
              for (const actual of actuals) {
                filesToRemove.push(actual);
              }
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
