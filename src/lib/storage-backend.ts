/**
 * Storage backend interface for lettactl
 * Allows reading content from various sources (filesystem, cloud storage, etc.)
 */

export interface StorageBackend {
  readContent(uri: string): Promise<string>
  listFiles(pattern: string): Promise<string[]>
  canHandle(uri: string): boolean
}

export interface BucketConfig {
  provider: 'supabase'; // TODO: Add 's3' | 'gcs' support
  bucket: string;
  path: string;
}

/**
 * Storage backend manager that routes requests to appropriate backends
 */
export class StorageBackendManager {
  private backends: StorageBackend[] = [];
  private supabaseBackend?: SupabaseStorageBackend;
  
  constructor(options: { supabaseBackend?: SupabaseStorageBackend } = {}) {
    // Always include filesystem backend
    this.backends.push(new FileSystemBackend());
    
    // Store Supabase backend separately since it has different interface
    this.supabaseBackend = options.supabaseBackend;
  }
  
  async readContent(uri: string): Promise<string> {
    const backend = this.backends.find(b => b.canHandle(uri));
    if (!backend) {
      throw new Error(`No backend available for URI: ${uri}`);
    }
    return backend.readContent(uri);
  }
  
  async listFiles(pattern: string): Promise<string[]> {
    const backend = this.backends.find(b => b.canHandle(pattern));
    if (!backend) {
      throw new Error(`No backend available for pattern: ${pattern}`);
    }
    return backend.listFiles(pattern);
  }
  
  /**
   * Convert bucket config to URI for backend routing
   */
  async readFromBucket(config: BucketConfig): Promise<string> {
    // Validate bucket config structure
    this.validateBucketConfig(config);
    
    if (config.provider === 'supabase') {
      if (!this.supabaseBackend) {
        throw new Error('Supabase backend not configured');
      }
      return this.supabaseBackend.readFromBucket(config.bucket, config.path);
    }
    // Check for common typos
    const provider = String(config.provider).toLowerCase();
    if (provider.includes('supab') || provider.includes('suapb')) {
      throw new Error(`Provider '${config.provider}' not recognized. Did you mean 'supabase'?`);
    }
    
    // TODO: Add s3, gcs support
    throw new Error(`Provider '${config.provider}' not yet supported. Supported: supabase. Coming soon: s3, gcs`);
  }
  
  private validateBucketConfig(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new Error(
        'Invalid from_bucket configuration. Expected object with provider, bucket, and path fields.\n' +
        'Example:\n' +
        'from_bucket:\n' +
        '  provider: supabase\n' +
        '  bucket: my-bucket\n' +
        '  path: file.md'
      );
    }
    
    const requiredFields = ['provider', 'bucket', 'path'];
    const missing = requiredFields.filter(field => !(field in config));
    
    if (missing.length > 0) {
      throw new Error(
        `Missing required fields in from_bucket config: ${missing.join(', ')}\n` +
        'Required fields: provider, bucket, path\n' +
        'Example:\n' +
        'from_bucket:\n' +
        '  provider: supabase\n' +
        '  bucket: my-bucket\n' +
        '  path: file.md'
      );
    }
    
    // Check for empty/null values
    const emptyFields = requiredFields.filter(field => {
      const value = config[field];
      return value === null || value === undefined || value === '' || (typeof value === 'string' && value.trim() === '');
    });
    
    if (emptyFields.length > 0) {
      throw new Error(
        `Empty values not allowed in from_bucket config: ${emptyFields.join(', ')}\n` +
        'All fields must have non-empty values.\n' +
        'Example:\n' +
        'from_bucket:\n' +
        '  provider: supabase\n' +
        '  bucket: my-bucket\n' +
        '  path: file.md'
      );
    }
  }
}

/**
 * File system storage backend (existing behavior)
 */
import * as fs from 'fs'
import * as path from 'path'
import { globSync } from 'glob'

export class FileSystemBackend implements StorageBackend {
  constructor(private basePath: string = '') {}

  canHandle(uri: string): boolean {
    return !uri.includes('://') || uri.startsWith('file://')
  }

  async readContent(uri: string): Promise<string> {
    const filePath = this.resolvePath(uri)
    return fs.readFileSync(filePath, 'utf8')
  }

  async listFiles(pattern: string): Promise<string[]> {
    const resolvedPattern = this.resolvePath(pattern)
    return globSync(resolvedPattern)
  }

  private resolvePath(uri: string): string {
    const cleanPath = uri.replace('file://', '')
    if (path.isAbsolute(cleanPath)) return cleanPath
    return path.resolve(this.basePath, cleanPath)
  }
}

/**
 * Supabase storage backend for cloud file access
 */
import { createClient } from '@supabase/supabase-js'
import { StorageErrorHandler } from './storage-error-handler'

export class SupabaseStorageBackend {
  private supabase: any

  constructor() {
    this.validateEnvironment();
    
    // Use generic environment variables for standalone library
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false }
      }
    )
  }
  
  private validateEnvironment(): void {
    const requiredVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
    const missing: string[] = [];
    
    for (const envVar of requiredVars) {
      if (!process.env[envVar]) {
        missing.push(envVar);
      }
    }
    
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables for Supabase: ${missing.join(', ')}\n\n` +
        'Set them with:\n' +
        missing.map(v => `export ${v}=<your_value>`).join('\n') +
        '\n\nOr add them to your .env file.'
      );
    }
    
    // Validate URL format
    const url = process.env.SUPABASE_URL!;
    try {
      const parsed = new URL(url);
      if (!parsed.protocol.startsWith('https')) {
        throw new Error(`SUPABASE_URL must use HTTPS protocol, got: ${parsed.protocol}`);
      }
      if (!url.includes('supabase.co') && !url.includes('localhost')) {
        console.warn(`Warning: SUPABASE_URL doesn't appear to be a standard Supabase URL: ${url}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('HTTPS')) {
        throw error; // Re-throw HTTPS-specific error
      }
      throw new Error(
        `Invalid SUPABASE_URL format: ${url}\n` +
        'Expected format: https://your-project.supabase.co'
      );
    }
  }

  async readFromBucket(bucket: string, filePath: string): Promise<string> {
    try {
      // Check file metadata first to detect empty files efficiently
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop();
      const folder = pathParts.join('/') || '';
      
      const { data: listData, error: listError } = await this.supabase.storage
        .from(bucket)
        .list(folder, { 
          search: fileName,
          limit: 1 
        });
      
      if (!listError && listData) {
        const fileInfo = listData.find((f: any) => f.name === fileName);
        if (fileInfo && fileInfo.metadata?.size) {
          const size = fileInfo.metadata.size;
          if (size <= 40) {
            console.warn(
              `Warning: File '${filePath}' in bucket '${bucket}' is very small (${size} bytes). Check file has meaningful content.`
            );
          } else if (size > 50 * 1024 * 1024) { // 50MB
            console.warn(
              `Warning: File '${filePath}' in bucket '${bucket}' is very large (${Math.round(size / 1024 / 1024 * 100) / 100}MB). This may cause memory issues or timeouts.`
            );
          }
        }
      }
      
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .download(filePath)
      
      if (error) {
        StorageErrorHandler.handleProviderError(error, {
          provider: 'supabase',
          operation: 'download',
          bucket,
          filePath
        });
      }
      
      if (!data) {
        throw new Error(`No data returned when downloading ${bucket}/${filePath}`);
      }
      
      return await data.text()
      
    } catch (error: any) {
      // Re-throw our custom errors, wrap unexpected ones
      if (error.message.includes('Failed to download')) {
        throw error;
      }
      
      throw new Error(`Supabase storage error for ${bucket}/${filePath}: ${error.message || 'Unknown error'}`);
    }
  }

  async listFiles(bucket: string, pathPrefix: string = ''): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .list(pathPrefix, {
          limit: 1000,
          sortBy: { column: 'updated_at', order: 'desc' }
        })
      
      if (error) {
        throw new Error(`Failed to list files in ${bucket}/${pathPrefix}: ${error.message}`)
      }
      
      return data?.map((file: any) => 
        pathPrefix ? `${pathPrefix}/${file.name}` : file.name
      ) || []
      
    } catch (error: any) {
      throw new Error(`Supabase list error for ${bucket}/${pathPrefix}: ${error.message}`)
    }
  }
}