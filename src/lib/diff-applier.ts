import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LettaClientWrapper } from './letta-client';
import { AgentUpdateOperations } from './diff-engine';
import { StorageBackendManager, SupabaseStorageBackend, hasSupabaseConfig } from './storage-backend';
import { isBuiltinTool } from './builtin-tools';

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
   */
  async applyUpdateOperations(
    agentId: string,
    operations: AgentUpdateOperations,
    verbose: boolean = false
  ): Promise<void> {
    if (operations.operationCount === 0) {
      if (verbose) console.log('  No changes needed');
      return;
    }

    if (verbose) console.log(`  Applying ${operations.operationCount} updates (preserves conversation: ${operations.preservesConversation})`);

    // Apply field updates
    if (operations.updateFields) {
      if (verbose) console.log('  Updating agent fields...');
      const apiFields: any = {};
      const fields = operations.updateFields;

      if (fields.system !== undefined) {
        apiFields.system = fields.system;
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
      if (fields.contextWindow !== undefined) {
        apiFields.context_window_limit = fields.contextWindow.to;
      }

      await this.client.updateAgent(agentId, apiFields);
    }

    // Apply tool changes
    if (operations.tools) {
      const getBuiltinTag = (name: string) => isBuiltinTool(name) ? ' [builtin]' : '';

      for (const tool of operations.tools.toAdd) {
        if (verbose) console.log(`  Attaching tool: ${tool.name}${getBuiltinTag(tool.name)}`);
        await this.client.attachToolToAgent(agentId, tool.id);
      }

      for (const tool of operations.tools.toUpdate) {
        if (verbose) console.log(`  Updating tool: ${tool.name} (${tool.reason})`);
        // Detach old version and attach new version
        await this.client.detachToolFromAgent(agentId, tool.currentId);
        await this.client.attachToolToAgent(agentId, tool.newId);
      }

      for (const tool of operations.tools.toRemove) {
        if (verbose) console.log(`  Detaching tool: ${tool.name}${getBuiltinTag(tool.name)}`);
        await this.client.detachToolFromAgent(agentId, tool.id);
      }
    }

    // Apply block changes
    if (operations.blocks) {
      for (const block of operations.blocks.toAdd) {
        if (verbose) console.log(`  Attaching block: ${block.name}`);
        await this.client.attachBlockToAgent(agentId, block.id);
      }

      for (const block of operations.blocks.toRemove) {
        if (verbose) console.log(`  Detaching block: ${block.name}`);
        await this.client.detachBlockFromAgent(agentId, block.id);
      }

      for (const block of operations.blocks.toUpdate) {
        if (verbose) console.log(`  Updating block: ${block.name}`);
        // First detach old, then attach new
        await this.client.detachBlockFromAgent(agentId, block.currentId);
        await this.client.attachBlockToAgent(agentId, block.newId);
      }
    }

    // Apply folder changes
    if (operations.folders) {
      for (const folder of operations.folders.toAttach) {
        if (verbose) console.log(`  Attaching folder: ${folder.name}`);
        await this.client.attachFolderToAgent(agentId, folder.id);
      }

      for (const folder of operations.folders.toDetach) {
        if (verbose) console.log(`  Detaching folder: ${folder.name}`);
        await this.client.detachFolderFromAgent(agentId, folder.id);
      }

      for (const folder of operations.folders.toUpdate) {
        if (verbose) console.log(`  Updating folder: ${folder.name}`);

        // Add new files to the folder
        for (const filePath of folder.filesToAdd) {
          try {
            if (verbose) console.log(`    Adding file: ${filePath}`);
            await this.addFileToFolder(folder.id, filePath);
          } catch (error) {
            console.error(`    Failed to add file ${filePath}:`, (error as Error).message);
          }
        }

        // Remove files from the folder
        for (const fileName of folder.filesToRemove) {
          try {
            if (verbose) console.log(`    Removing file: ${fileName}`);
            await this.removeFileFromFolder(folder.id, fileName);
          } catch (error) {
            console.error(`    Failed to remove file ${fileName}:`, (error as Error).message);
          }
        }

        // Update existing files in the folder
        for (const filePath of folder.filesToUpdate) {
          try {
            if (verbose) console.log(`    Updating file: ${filePath}`);
            await this.updateFileInFolder(folder.id, filePath);
          } catch (error) {
            console.error(`    Failed to update file ${filePath}:`, (error as Error).message);
          }
        }
      }

      // Close all files after folder operations to prevent context window bloat
      // Files remain searchable but aren't loaded into context
      const hasFileChanges = operations.folders.toAttach.length > 0 ||
        operations.folders.toUpdate.some(f => f.filesToAdd.length > 0 || f.filesToUpdate.length > 0);
      if (hasFileChanges) {
        await this.client.closeAllAgentFiles(agentId);
      }
    }

    if (verbose) console.log('  Updates completed successfully');
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
   * Helper method to update an existing file in a folder
   */
  private async updateFileInFolder(folderId: string, filePath: string): Promise<void> {
    const fullPath = path.resolve(this.basePath, filePath);
    const fileName = path.basename(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${fullPath}`);
    }

    // For file updates, we re-upload the file
    const fileStream = fs.createReadStream(fullPath);
    await this.client.uploadFileToFolder(fileStream, folderId, fileName);
  }
}
