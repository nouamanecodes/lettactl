import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LettaClientWrapper } from '../client/letta-client';
import { AgentUpdateOperations } from './diff-engine';
import { StorageBackendManager, SupabaseStorageBackend, hasSupabaseConfig } from '../storage/storage-backend';
import { isBuiltinTool } from '../tools/builtin-tools';
import { log, error } from '../shared/logger';

/**
 * DiffApplier applies update operations to agents
 */
export class DiffApplier {
  private client: LettaClientWrapper;
  private basePath: string;

  constructor(client: LettaClientWrapper, basePath: string = '') {
    this.client = client;
    this.basePath = basePath;
  }

  /**
   * Applies the update operations to the agent
   * @param force - When true, removes ALL resources not in config (blocks, tools,
   *   folders, archives) — strict reconciliation. Detaching folders/archives can
   *   lose data (#257), which is why force is normally avoided.
   * @param prune - When true, detaches blocks/tools not in config (safe
   *   reconciliation). Does NOT touch folders/archives. Lets you reconcile the
   *   common case without the data-loss risk of --force (#384).
   */
  async applyUpdateOperations(
    agentId: string,
    operations: AgentUpdateOperations,
    verbose: boolean = false,
    force: boolean = false,
    prune: boolean = false
  ): Promise<void> {
    if (operations.operationCount === 0) {
      if (verbose) log('  No changes needed');
      return;
    }

    if (verbose) log(`  Applying ${operations.operationCount} updates (preserves conversation: ${operations.preservesConversation})`);

    // Apply field updates
    if (operations.updateFields) {
      if (verbose) log('  Updating agent fields...');
      const apiFields: any = {};
      const fields = operations.updateFields;

      if (fields.system !== undefined) {
        apiFields.system = fields.system.to;
      }
      if (fields.description !== undefined) {
        apiFields.description = fields.description.to;
      }
      if (fields.model !== undefined) {
        apiFields.model = fields.model.to;
      }
      if (fields.embedding !== undefined) {
        apiFields.embedding = fields.embedding.to;
      }
      if (fields.embeddingConfig !== undefined) {
        apiFields.embedding_config = fields.embeddingConfig.to;
      }
      if (fields.compactionSettings !== undefined) {
        apiFields.compaction_settings = fields.compactionSettings.to;
      }
      if (fields.contextWindow !== undefined) {
        apiFields.context_window_limit = fields.contextWindow.to;
      }
      if (fields.maxTokens !== undefined) {
        apiFields.max_tokens = fields.maxTokens.to;
      }
      if (fields.reasoning !== undefined) {
        apiFields.reasoning = fields.reasoning.to;
      }
      if (fields.includeBaseTools !== undefined) {
        apiFields.include_base_tools = fields.includeBaseTools.to;
      }
      if (fields.includeBaseToolRules !== undefined) {
        apiFields.include_base_tool_rules = fields.includeBaseToolRules.to;
      }
      if (fields.tags !== undefined) {
        // Preserve memfs-owned tag if currently set — the memfs reconciler is its sole owner,
        // operators never write it in YAML, and a bare PATCH would silently strip it (rolling
        // back the migration without consent).
        const current = await this.client.getAgent(agentId);
        const hadMemfsTag = ((current as any).tags || []).includes('git-memory-enabled');
        apiFields.tags = hadMemfsTag ? [...fields.tags.to, 'git-memory-enabled'] : fields.tags.to;
      }

      await this.client.updateAgent(agentId, apiFields);

      // Update metadata for fields that need raw value tracking
      const needsMetadataUpdate = fields.model !== undefined || fields.embedding !== undefined || fields.lettabotConfig !== undefined || fields.firstMessage !== undefined || fields.includeBaseTools !== undefined || fields.includeBaseToolRules !== undefined;
      if (needsMetadataUpdate) {
        const agent = await this.client.getAgent(agentId);
        const metadata = { ...(agent as any).metadata };
        if (fields.model !== undefined) {
          metadata['lettactl.model'] = fields.model.to;
        }
        if (fields.embedding !== undefined) {
          metadata['lettactl.embedding'] = fields.embedding.to;
        }
        if (fields.lettabotConfig !== undefined) {
          if (fields.lettabotConfig.to) {
            metadata['lettactl.lettabotConfig'] = fields.lettabotConfig.to;
          } else {
            delete metadata['lettactl.lettabotConfig'];
          }
        }
        if (fields.firstMessage !== undefined) {
          if (fields.firstMessage.to) {
            metadata['lettactl.firstMessage'] = fields.firstMessage.to;
          } else {
            delete metadata['lettactl.firstMessage'];
          }
        }
        if (fields.includeBaseTools !== undefined) {
          metadata['lettactl.includeBaseTools'] = fields.includeBaseTools.to;
        }
        if (fields.includeBaseToolRules !== undefined) {
          metadata['lettactl.includeBaseToolRules'] = fields.includeBaseToolRules.to;
        }
        await this.client.updateAgent(agentId, { metadata });
      }
    }

    // Apply tool changes
    if (operations.tools) {
      const getBuiltinTag = (name: string) => isBuiltinTool(name) ? ' [builtin]' : '';

      for (const tool of operations.tools.toAdd) {
        if (verbose) log(`  Attaching tool: ${tool.name}${getBuiltinTag(tool.name)}`);
        await this.client.attachToolToAgent(agentId, tool.id);
      }

      for (const tool of operations.tools.toUpdate) {
        if (verbose) log(`  Updating tool: ${tool.name} (${tool.reason})`);
        // Detach old version and attach new version
        await this.client.detachToolFromAgent(agentId, tool.currentId);
        await this.client.attachToolToAgent(agentId, tool.newId);
      }

      // Remove tools not in config when --prune or --force is specified.
      if (force || prune) {
        for (const tool of operations.tools.toRemove) {
          if (verbose) log(`  Detaching tool: ${tool.name}${getBuiltinTag(tool.name)}`);
          await this.client.detachToolFromAgent(agentId, tool.id);
        }
      }
    }

    // Apply block changes
    if (operations.blocks) {
      for (const block of operations.blocks.toAdd) {
        if (verbose) log(`  Attaching block: ${block.name}`);
        await this.client.attachBlockToAgent(agentId, block.id);
      }

      // Remove blocks not in config when --prune or --force is specified.
      if (force || prune) {
        for (const block of operations.blocks.toRemove) {
          if (verbose) log(`  Detaching block: ${block.name}`);
          await this.client.detachBlockFromAgent(agentId, block.id);
        }
      }

      for (const block of operations.blocks.toUpdate) {
        if (verbose) log(`  Updating block: ${block.name}`);
        // First detach old, then attach new
        await this.client.detachBlockFromAgent(agentId, block.currentId);
        await this.client.attachBlockToAgent(agentId, block.newId);
      }

      for (const block of operations.blocks.toUpdateValue) {
        if (verbose) log(`  Syncing block value: ${block.name}`);
        // Update limit first if increasing (avoids value-exceeds-limit errors)
        if (block.newLimit) {
          await this.client.updateBlock(block.id, { limit: block.newLimit });
        }
        const updateData: { value?: string; description?: string } = {};
        if (block.oldValue !== block.newValue) updateData.value = block.newValue;
        if (block.newDescription) updateData.description = block.newDescription;
        if (Object.keys(updateData).length > 0) {
          await this.client.updateBlock(block.id, updateData);
        }
      }
    }

    // Apply folder changes
    if (operations.folders) {
      for (const folder of operations.folders.toAttach) {
        if (verbose) log(`  Attaching folder: ${folder.name}`);
        await this.client.attachFolderToAgent(agentId, folder.id);
      }

      // Only detach folders when --force is specified
      if (force) {
        for (const folder of operations.folders.toDetach) {
          if (verbose) log(`  Detaching folder: ${folder.name}`);
          await this.client.detachFolderFromAgent(agentId, folder.id);
        }
      }

      for (const folder of operations.folders.toUpdate) {
        if (verbose) log(`  Updating folder: ${folder.name}`);

        // Add new files to the folder
        for (const filePath of folder.filesToAdd) {
          try {
            if (verbose) log(`    Adding file: ${filePath}`);
            await this.addFileToFolder(folder.id, filePath);
          } catch (err) {
            error(`    Failed to add file ${filePath}:`, (err as Error).message);
          }
        }

        // Remove files from the folder
        for (const fileName of folder.filesToRemove) {
          try {
            if (verbose) log(`    Removing file: ${fileName}`);
            await this.removeFileFromFolder(folder.id, fileName);
          } catch (err) {
            error(`    Failed to remove file ${fileName}:`, (err as Error).message);
          }
        }

        // Update existing files in the folder
        for (const filePath of folder.filesToUpdate) {
          try {
            if (verbose) log(`    Updating file: ${filePath}`);
            await this.updateFileInFolder(folder.id, filePath);
          } catch (err) {
            error(`    Failed to update file ${filePath}:`, (err as Error).message);
          }
        }
      }

      // Close files after folder operations to prevent context-window bloat.
      // Folders are typically SHARED across many agents (and agencies): adding or updating
      // a file opens it (is_open=true) on EVERY agent attached to the folder, not just this
      // one. Since lettactl applies per-agency, closing only `agentId` leaves the file open
      // on every other agent that shares the folder, silently bloating their context until
      // some future apply happens to touch a file for them. So when a shared folder's files
      // change, close-all across that folder's full agent set. (A freshly attached folder
      // only affects the current agent.)
      const changedFolders = operations.folders.toUpdate.filter(
        f => f.filesToAdd.length > 0 || f.filesToUpdate.length > 0 || f.filesToRemove.length > 0
      );
      const agentsToClose = new Set<string>();
      if (operations.folders.toAttach.length > 0) agentsToClose.add(agentId);
      for (const folder of changedFolders) {
        try {
          const ids = (await this.client.listFolderAgents(folder.id))
            .map((a: any) => (typeof a === 'string' ? a : a?.id))
            .filter(Boolean);
          for (const id of ids) agentsToClose.add(id);
        } catch (err) {
          error(`    Failed to list agents for folder ${folder.name}, closing current agent only:`, (err as Error).message);
          agentsToClose.add(agentId);
        }
      }
      for (const id of agentsToClose) {
        await this.client.closeAllAgentFiles(id).catch((err: Error) =>
          error(`    Failed to close files for agent ${id}:`, err.message));
      }
    }

    // Apply archive changes
    if (operations.archives) {
      for (const archive of operations.archives.toUpdate) {
        if (verbose) log(`  Updating archive: ${archive.name}`);
        await this.client.updateArchive(archive.id, { description: archive.description, name: archive.name });
      }

      for (const archive of operations.archives.toAttach) {
        if (verbose) log(`  Attaching archive: ${archive.name}`);
        await this.client.attachArchiveToAgent(agentId, archive.id);
      }

      if (force) {
        for (const archive of operations.archives.toDetach) {
          if (verbose) log(`  Detaching archive: ${archive.name}`);
          await this.client.detachArchiveFromAgent(agentId, archive.id);
        }
      }
    }

    // Create new conversations
    if (operations.conversations?.toCreate) {
      for (const conv of operations.conversations.toCreate) {
        if (verbose) log(`  Creating conversation: ${conv.summary}`);
        await this.client.createConversation(agentId, {
          summary: conv.summary,
          isolated_block_labels: conv.isolatedBlocks,
        });
      }
    }

    if (verbose) log('  Updates completed successfully');
  }

  /**
   * Helper method to add a file to an existing folder
   * Handles both local files and bucket files (bucket:bucket-name/path format)
   */
  private async addFileToFolder(folderId: string, fileIdentifier: string): Promise<void> {
    // Check if this is a bucket file
    if (fileIdentifier.startsWith('bucket:')) {
      const bucketPath = fileIdentifier.substring(7); // Remove 'bucket:' prefix
      const [bucket, ...pathParts] = bucketPath.split('/');
      const filePath = pathParts.join('/');

      // Initialize storage backend
      const supabaseBackend = hasSupabaseConfig() ? new SupabaseStorageBackend() : undefined;

      if (!supabaseBackend) {
        throw new Error('Supabase credentials not configured for bucket file download');
      }

      const storageManager = new StorageBackendManager({ supabaseBackend });

      // Check if path contains glob pattern
      if (filePath.includes('*')) {
        // Extract prefix (everything before the *)
        const prefix = filePath.split('*')[0];

        // List all files matching the prefix
        const files = await supabaseBackend.listFiles(bucket, prefix);

        // Download and upload each file
        for (const file of files) {
          const fileName = path.basename(file);
          const fileBuffer = await storageManager.downloadBinaryFromBucket({
            provider: 'supabase',
            bucket,
            path: file
          });

          const tempPath = path.join(os.tmpdir(), fileName);
          fs.writeFileSync(tempPath, fileBuffer);
          const fileStream = fs.createReadStream(tempPath);
          await this.client.uploadFileToFolder(fileStream, folderId, fileName);
          fs.unlinkSync(tempPath);
        }
      } else {
        // Single file download
        const fileName = pathParts[pathParts.length - 1];
        const fileBuffer = await storageManager.downloadBinaryFromBucket({
          provider: 'supabase',
          bucket,
          path: filePath
        });

        const tempPath = path.join(os.tmpdir(), fileName);
        fs.writeFileSync(tempPath, fileBuffer);
        const fileStream = fs.createReadStream(tempPath);
        await this.client.uploadFileToFolder(fileStream, folderId, fileName);
        fs.unlinkSync(tempPath);
      }
    } else {
      // Local file
      const fullPath = path.resolve(this.basePath, fileIdentifier);
      const fileName = path.basename(fileIdentifier);

      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
      }

      const fileStream = fs.createReadStream(fullPath);
      await this.client.uploadFileToFolder(fileStream, folderId, fileName);
    }
  }

  /**
   * Helper method to remove a file from a folder
   */
  private async removeFileFromFolder(folderId: string, fileName: string): Promise<void> {
    // Get the file ID by name
    const fileId = await this.client.getFileIdByName(folderId, fileName);

    if (!fileId) {
      throw new Error(`File not found in folder: ${fileName}`);
    }

    // Delete the file using the SDK
    await this.client.deleteFileFromFolder(folderId, fileId);
  }

  /**
   * Helper method to update an existing file in a folder.
   *
   * Letta's POST /folders/{id}/upload always CREATES — if a file with the same
   * name exists, the server appends a "_(N)" suffix instead of replacing it.
   * That leaves stale duplicates accumulating across every apply, and
   * downstream tools (grep_files, open_files) start matching both copies.
   *
   * Letta has no PATCH-by-name for file content, so the only idempotent path
   * is: look up the existing file by name → delete it → upload the new copy
   * under the original name. If delete succeeds but upload fails, the file is
   * gone until the next apply — surface a clear error so the operator can
   * retry. (See nouamanecodes/lettactl#375.)
   */
  private async updateFileInFolder(folderId: string, filePath: string): Promise<void> {
    const fullPath = path.resolve(this.basePath, filePath);
    const fileName = path.basename(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    // Delete the existing file first so the new upload keeps the original name.
    // No-op if the file isn't present (e.g. first-time add via this path).
    const existingFileId = await this.client.getFileIdByName(folderId, fileName);
    if (existingFileId) {
      await this.client.deleteFileFromFolder(folderId, existingFileId);
    }

    const fileStream = fs.createReadStream(fullPath);
    await this.client.uploadFileToFolder(fileStream, folderId, fileName);
  }
}
