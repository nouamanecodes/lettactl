import { LettaClientWrapper } from '../client/letta-client';
import { normalizeResponse } from '../shared/response-normalizer';
import { log } from '../shared/logger';

export interface ArchiveInfo {
  id: string;
  name: string;
  description?: string | null;
  embedding?: string | null;
  embedding_config?: Record<string, any> | null;
}

export class ArchiveManager {
  private client: LettaClientWrapper;
  private archiveRegistry = new Map<string, ArchiveInfo>();

  constructor(client: LettaClientWrapper) {
    this.client = client;
  }

  /**
   * Loads existing archives from the server and builds the registry.
   * When desiredNames is provided, only archives matching those names are registered,
   * preventing cross-tenant contamination via unscoped global lookups.
   */
  async loadExistingArchives(desiredNames?: Set<string>): Promise<void> {
    const archives = await this.client.listArchives();
    const archiveList = normalizeResponse(archives);

    for (const archive of archiveList) {
      if (!archive.name || !archive.id) {
        continue;
      }
      // Skip archives not in the current fleet config to prevent cross-tenant contamination
      if (desiredNames && !desiredNames.has(archive.name)) {
        continue;
      }
      this.archiveRegistry.set(archive.name, {
        id: archive.id,
        name: archive.name,
        description: archive.description,
        embedding: archive.embedding,
        embedding_config: archive.embedding_config,
      });
    }
  }

  getArchiveId(name: string): string | null {
    const existing = this.archiveRegistry.get(name);
    return existing ? existing.id : null;
  }

  getArchiveInfo(name: string): ArchiveInfo | null {
    return this.archiveRegistry.get(name) || null;
  }

  async getOrCreateArchive(config: {
    name: string;
    description?: string;
    embedding?: string;
    embedding_config?: Record<string, any>;
  }): Promise<string> {
    const existing = this.archiveRegistry.get(config.name);
    if (existing) {
      return existing.id;
    }

    log(`Creating archive: ${config.name}`);
    const newArchive = await this.client.createArchive({
      name: config.name,
      description: config.description,
      embedding: config.embedding,
      embedding_config: config.embedding_config,
    });

    const createdEmbedding = config.embedding || newArchive.embedding_config?.embedding_model;
    this.archiveRegistry.set(config.name, {
      id: newArchive.id,
      name: newArchive.name,
      description: newArchive.description,
      embedding: createdEmbedding,
      embedding_config: newArchive.embedding_config,
    });

    return newArchive.id;
  }
}
