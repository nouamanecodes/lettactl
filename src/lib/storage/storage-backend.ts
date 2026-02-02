/**
 * Storage backend interface for lettactl
 * Allows reading content from various sources (filesystem, cloud storage, etc.)
 */
import { warn } from '../shared/logger';

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
 * Check if Supabase storage is configured
 */
export function hasSupabaseConfig(): boolean {
  return !!(process.env.SUPABASE_URL && (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
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

  /**
   * Download binary file from bucket (for PDFs, images, etc.)
   */
  async downloadBinaryFromBucket(config: BucketConfig): Promise<Buffer> {
    this.validateBucketConfig(config);

    if (config.provider === 'supabase') {
      if (!this.supabaseBackend) {
        throw new Error('Supabase backend not configured');
      }
      return this.supabaseBackend.downloadBinaryFromBucket(config.bucket, config.path);
    }

    const provider = String(config.provider).toLowerCase();
    if (provider.includes('supab') || provider.includes('suapb')) {
      throw new Error(`Provider '${config.provider}' not recognized. Did you mean 'supabase'?`);
    }

    throw new Error(`Provider '${config.provider}' not yet supported. Supported: supabase. Coming soon: s3, gcs`);
  }

  /**
   * List files in a bucket with optional prefix filter
   */
  async listBucketFiles(bucket: string, prefix: string = ''): Promise<string[]> {
    if (!this.supabaseBackend) {
      throw new Error('Supabase backend not configured');
    }
    return this.supabaseBackend.listFiles(bucket, prefix);
  }

  /**
   * Download text content from bucket
   */
  async downloadFromBucket(config: BucketConfig): Promise<string> {
    return this.readFromBucket(config);
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

    // Prefer service role key for private bucket access, fall back to anon key
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;

    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      key,
      {
        auth: { persistSession: false }
      }
    )
  }

  private validateEnvironment(): void {
    if (!process.env.SUPABASE_URL) {
      throw new Error(
        'Missing required environment variable: SUPABASE_URL\n\n' +
        'Set it with:\n' +
        'export SUPABASE_URL=https://your-project.supabase.co\n\n' +
        'Or add it to your .env file.'
      );
    }

    // Require at least one key
    if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        'Missing Supabase credentials. Set one of:\n' +
        '  SUPABASE_ANON_KEY - for public buckets\n' +
        '  SUPABASE_SERVICE_ROLE_KEY - for private buckets (recommended)\n\n' +
        'Example:\n' +
        'export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key\n\n' +
        'Or add to your .env file.'
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
        warn(`Warning: SUPABASE_URL doesn't appear to be a standard Supabase URL: ${url}`);
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

  async downloadBinaryFromBucket(bucket: string, filePath: string): Promise<Buffer> {
    try {
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
        StorageErrorHandler.handleProviderError(
          { message: 'No data returned from download' },
          { provider: 'supabase', operation: 'download', bucket, filePath }
        );
      }

      const arrayBuffer = await data.arrayBuffer()
      return Buffer.from(arrayBuffer)

    } catch (err: any) {
      if (err.message.includes('Failed to download')) {
        throw err;
      }

      StorageErrorHandler.handleProviderError(err, {
        provider: 'supabase',
        operation: 'download',
        bucket,
        filePath
      });
    }
  }

  async readFromBucket(bucket: string, filePath: string): Promise<string> {
    try {
      // Check file metadata first to detect empty files efficiently
      const pathParts = filePath.split('/');
      const fileName = pathParts.pop();
      const folder = pathParts.join('/') || '';
      
      const { data: listData, err: listError } = await this.supabase.storage
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
            warn(
              `Warning: File '${filePath}' in bucket '${bucket}' is very small (${size} bytes). Check file has meaningful content.`
            );
          } else if (size > 50 * 1024 * 1024) { // 50MB
            warn(
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
        StorageErrorHandler.handleProviderError(
          { message: 'No data returned from download' },
          { provider: 'supabase', operation: 'download', bucket, filePath }
        );
      }
      
      return await data.text()
      
    } catch (err: any) {
      // Re-throw our custom errors, handle unexpected ones through error handler
      if (err.message.includes('Failed to download')) {
        throw err;
      }

      StorageErrorHandler.handleProviderError(err, {
        provider: 'supabase',
        operation: 'download', 
        bucket,
        filePath
      });
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
        StorageErrorHandler.handleProviderError(error, {
          provider: 'supabase',
          operation: 'list',
          bucket,
          filePath: pathPrefix
        });
      }
      
      return data?.map((file: any) => 
        pathPrefix ? `${pathPrefix}/${file.name}` : file.name
      ) || []
      
    } catch (err: any) {
      StorageErrorHandler.handleProviderError(err, {
        provider: 'supabase',
        operation: 'list',
        bucket,
        filePath: pathPrefix
      });
    }
  }
}