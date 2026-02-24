import { LettaClientWrapper } from '../client/letta-client';
import { log } from '../shared/logger';

export interface FolderInfo {
  id: string;
  name: string;
  embedding?: string | null;
}

export class FolderManager {
  private client: LettaClientWrapper;
  private folderRegistry = new Map<string, FolderInfo>();

  constructor(client: LettaClientWrapper) {
    this.client = client;
  }

  /**
   * Loads existing folders from the server and builds the registry.
   * When desiredNames is provided, only folders matching those names are registered,
   * preventing cross-tenant contamination via unscoped global lookups.
   */
  async loadExistingFolders(desiredNames?: Set<string>): Promise<void> {
    const folders = await this.client.listFolders();
    const folderList = Array.isArray(folders) ? folders : (folders as any).items || [];

    for (const folder of folderList) {
      if (!folder.name || !folder.id) {
        continue;
      }
      // Skip folders not in the current fleet config to prevent cross-tenant contamination
      if (desiredNames && !desiredNames.has(folder.name)) {
        continue;
      }
      this.folderRegistry.set(folder.name, {
        id: folder.id,
        name: folder.name,
        embedding: folder.embedding,
      });
    }
  }

  getFolderId(name: string): string | null {
    const existing = this.folderRegistry.get(name);
    return existing ? existing.id : null;
  }

  async getOrCreateFolder(config: {
    name: string;
    embedding?: string;
  }): Promise<string> {
    const existing = this.folderRegistry.get(config.name);
    if (existing) {
      return existing.id;
    }

    log(`Creating folder: ${config.name}`);
    const newFolder = await this.client.createFolder({
      name: config.name,
      embedding: config.embedding,
    });

    this.folderRegistry.set(config.name, {
      id: newFolder.id,
      name: newFolder.name,
      embedding: config.embedding || null,
    });

    return newFolder.id;
  }

  getFolderRegistry(): Map<string, FolderInfo> {
    return new Map(this.folderRegistry);
  }
}
