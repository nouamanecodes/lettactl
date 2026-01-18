import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { StorageBackendManager, BucketConfig } from './storage-backend';
import { FolderConfig, FolderFileConfig } from '../types/fleet-config';
import { isBuiltinTool } from './builtin-tools';
import { warn } from './logger';

export interface FileContentMap {
  [filePath: string]: string; // filePath -> content hash
}

/**
 * Centralized file content tracking for change detection across tools, folders, and memory blocks
 */
export class FileContentTracker {
  private basePath: string;
  private storageManager?: StorageBackendManager;

  constructor(basePath: string, storageManager?: StorageBackendManager) {
    this.basePath = basePath;
    this.storageManager = storageManager;
  }

  /**
   * Generates a content hash for a single file
   */
  generateFileContentHash(filePath: string): string {
    try {
      const fullPath = path.resolve(this.basePath, filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    } catch (error) {
      warn(`Warning: Could not read file ${filePath} for hashing:`, (error as Error).message);
      return crypto.createHash('sha256').update(`file-not-found:${filePath}`).digest('hex').substring(0, 16);
    }
  }

  /**
   * Generates content hashes for multiple files
   */
  generateFileContentHashes(filePaths: string[]): FileContentMap {
    const contentHashes: FileContentMap = {};
    
    for (const filePath of filePaths) {
      contentHashes[filePath] = this.generateFileContentHash(filePath);
    }
    
    return contentHashes;
  }

  /**
   * Generates content hashes for tool source files or inline source code
   */
  generateToolSourceHashes(toolNames: string[], toolConfigs?: Map<string, any>): FileContentMap {
    const toolHashes: FileContentMap = {};

    for (const toolName of toolNames) {
      // Skip built-in tools that don't have source files
      if (isBuiltinTool(toolName)) {
        continue;
      }

      const toolConfig = toolConfigs?.get(toolName);

      // Priority: 1. inline source_code, 2. from_file, 3. default path
      if (toolConfig && typeof toolConfig === 'object' && toolConfig.source_code) {
        // Inline source code - hash it directly
        toolHashes[toolName] = crypto.createHash('sha256').update(toolConfig.source_code).digest('hex').substring(0, 16);
      } else if (toolConfig && typeof toolConfig === 'object' && toolConfig.from_file) {
        // File-based source code
        toolHashes[toolName] = this.generateFileContentHash(toolConfig.from_file);
      } else {
        // Default to tools/ directory
        const toolPath = path.join('tools', `${toolName}.py`);
        toolHashes[toolName] = this.generateFileContentHash(toolPath);
      }
    }

    return toolHashes;
  }

  /**
   * Generates content hashes for memory block files
   */
  async generateMemoryBlockFileHashes(memoryBlocks: Array<{
    name: string;
    from_file?: string;
    from_bucket?: BucketConfig;
    value?: string;
  }>): Promise<FileContentMap> {
    const blockHashes: FileContentMap = {};
    
    for (const block of memoryBlocks) {
      if (block.from_file) {
        // Memory block loads content from file
        blockHashes[block.name] = this.generateFileContentHash(block.from_file);
      } else if (block.from_bucket) {
        // Memory block loads content from cloud bucket
        if (!this.storageManager) {
          warn(`Warning: Cannot hash bucket content for block '${block.name}' - no storage manager available`);
          blockHashes[block.name] = crypto.createHash('sha256').update(`bucket:${block.from_bucket.bucket}/${block.from_bucket.path}`).digest('hex').substring(0, 16);
        } else {
          try {
            const bucketContent = await this.storageManager.readFromBucket(block.from_bucket);
            blockHashes[block.name] = crypto.createHash('sha256').update(bucketContent).digest('hex').substring(0, 16);
          } catch (error) {
            warn(`Warning: Could not read bucket content for block '${block.name}':`, (error as Error).message);
            blockHashes[block.name] = crypto.createHash('sha256').update(`bucket-error:${block.from_bucket.bucket}/${block.from_bucket.path}`).digest('hex').substring(0, 16);
          }
        }
      } else if (block.value) {
        // Memory block has inline value - hash it directly
        blockHashes[block.name] = crypto.createHash('sha256').update(block.value).digest('hex').substring(0, 16);
      }
    }
    
    return blockHashes;
  }

  /**
   * Generates content hashes for folder files (grouped by folder)
   * Includes both local files and bucket files (with glob expansion)
   */
  async generateFolderFileHashes(folderConfigs: FolderConfig[]): Promise<Map<string, FileContentMap>> {
    const folderHashes = new Map<string, FileContentMap>();

    for (const folder of folderConfigs) {
      const fileHashes: FileContentMap = {};

      for (const fileConfig of folder.files) {
        if (typeof fileConfig === 'string') {
          // Local file
          const fileName = fileConfig.split('/').pop() || fileConfig;
          fileHashes[fileName] = this.generateFileContentHash(fileConfig);
        } else if (fileConfig.from_bucket && this.storageManager) {
          // Bucket file - may be a glob pattern
          const { bucket, path: filePath } = fileConfig.from_bucket;

          if (filePath.includes('*')) {
            // Glob pattern - expand and hash each file
            try {
              const prefix = filePath.split('*')[0];
              const files = await this.storageManager.listBucketFiles(bucket, prefix);

              for (const file of files) {
                const fileName = file.split('/').pop() || file;
                try {
                  const content = await this.storageManager.downloadFromBucket({
                    provider: fileConfig.from_bucket.provider || 'supabase',
                    bucket,
                    path: file
                  });
                  fileHashes[fileName] = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
                } catch (error) {
                  warn(`Could not hash bucket file ${file}:`, (error as Error).message);
                }
              }
            } catch (error) {
              warn(`Could not list bucket files for glob ${filePath}:`, (error as Error).message);
            }
          } else {
            // Single bucket file
            const fileName = filePath.split('/').pop() || filePath;
            try {
              const content = await this.storageManager.downloadFromBucket({
                provider: fileConfig.from_bucket.provider || 'supabase',
                bucket,
                path: filePath
              });
              fileHashes[fileName] = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
            } catch (error) {
              warn(`Could not hash bucket file ${filePath}:`, (error as Error).message);
            }
          }
        }
      }

      folderHashes.set(folder.name, fileHashes);
    }

    return folderHashes;
  }

  /**
   * Checks if a file exists
   */
  fileExists(filePath: string): boolean {
    try {
      const fullPath = path.resolve(this.basePath, filePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }
}