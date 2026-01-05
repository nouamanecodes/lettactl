/**
 * Centralized error handling for storage backends
 * Provides consistent error messages and handling across different cloud providers
 */

export interface StorageErrorContext {
  provider: string;
  operation: string;
  bucket?: string;
  filePath?: string;
  pattern?: string;
}

export class StorageErrorHandler {
  
  /**
   * Handle HTTP status-based errors with provider-specific context
   */
  static handleHttpError(
    error: any, 
    context: StorageErrorContext,
    statusCode?: number
  ): never {
    const { provider, operation, bucket, filePath } = context;
    const resource = bucket && filePath ? `${bucket}/${filePath}` : bucket || filePath || 'resource';
    
    let errorMessage = `Failed to ${operation} ${resource} (${provider})`;
    
    const status = statusCode || error.status || error.originalError?.status;
    
    switch (status) {
      case 400:
        if (provider.toLowerCase() === 'supabase') {
          // Check if error indicates bucket doesn't exist
          if (error.message && (error.message.includes('bucket') || error.message.includes('not found'))) {
            errorMessage += `: Bucket '${bucket}' not found. Check: 1) bucket name is spelled correctly, 2) bucket exists in your Supabase project, 3) you're connected to the right project.`;
          } else {
            errorMessage += `: Bad request - this could be: 1) bucket '${bucket}' doesn't exist, 2) file '${filePath}' doesn't exist, 3) bucket is private (needs RLS policy or make bucket public), 4) wrong RLS policy configuration, 5) invalid file path '${filePath}', 6) malformed request, or 7) something else (Supabase error messages aren't clear here). Check: bucket exists, file exists, is public or has proper RLS, and file path is correct.`;
          }
        } else {
          errorMessage += `: Bad request - this could be: 1) bucket '${bucket}' doesn't exist, 2) invalid file path '${filePath}', or 3) malformed request. Check bucket exists and path is correct.`;
        }
        break;
      case 401:
        errorMessage += `: Unauthorized. Please check your ${provider} credentials.`;
        break;
      case 403:
        errorMessage += `: Access denied. Please check your ${provider} credentials and bucket permissions.`;
        break;
      case 404:
        if (filePath) {
          errorMessage += `: File not found. Please check that '${filePath}' exists in the '${bucket}' bucket.`;
        } else {
          errorMessage += `: Resource not found. Please check the bucket or path exists.`;
        }
        break;
      case 429:
        errorMessage += `: Rate limit exceeded. Please try again later.`;
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        errorMessage += `: ${provider} service outage or maintenance (HTTP ${status}). This is a server-side issue. Please try again in a few minutes or check ${provider} status page.`;
        break;
      default:
        if (status >= 500 && status < 600) {
          errorMessage += `: ${provider} server error (HTTP ${status}). Please try again or contact ${provider} support.`;
        } else if (status) {
          errorMessage += `: HTTP ${status} error. Check ${provider} Storage configuration.`;
        } else {
          errorMessage += `: Unknown error. Check ${provider} Storage configuration and network connectivity.`;
        }
    }
    
    throw new Error(errorMessage);
  }
  
  /**
   * Handle provider-specific errors with fallback to generic handling
   */
  static handleProviderError(
    error: any, 
    context: StorageErrorContext
  ): never {
    const { provider } = context;
    
    switch (provider.toLowerCase()) {
      case 'supabase':
        return this.handleSupabaseError(error, context);
      case 's3':
        return this.handleS3Error(error, context);
      case 'gcs':
        return this.handleGCSError(error, context);
      default:
        return this.handleGenericError(error, context);
    }
  }
  
  /**
   * Handle Supabase-specific error patterns
   */
  private static handleSupabaseError(error: any, context: StorageErrorContext): never {
    
    // Handle StorageUnknownError - check status to differentiate bucket vs auth issues
    if (error.__isStorageError && error.name === 'StorageUnknownError') {
      const status = error.originalError?.status;

      if (status === 400) {
        throw new Error(
          `Failed to ${context.operation} ${context.bucket}/${context.filePath} (supabase): ` +
          `Bucket '${context.bucket}' not accessible. This could mean: 1) bucket doesn't exist, ` +
          `2) bucket is private and requires SUPABASE_SERVICE_ROLE_KEY instead of SUPABASE_ANON_KEY. ` +
          `For private buckets, set SUPABASE_SERVICE_ROLE_KEY in your environment.`
        );
      } else if (!error.originalError || Object.keys(error.originalError).length === 0) {
        throw new Error(
          `Failed to ${context.operation} ${context.bucket}/${context.filePath} (supabase): ` +
          'Authentication error. Check your Supabase credentials. ' +
          'For private buckets, use SUPABASE_SERVICE_ROLE_KEY instead of SUPABASE_ANON_KEY.'
        );
      }
    }
    
    // Handle Supabase StorageError with originalError
    if (error.__isStorageError && error.originalError && error.originalError.status) {
      return this.handleHttpError(error, context, error.originalError.status);
    }
    
    // Handle direct Supabase error messages
    if (error.message) {
      if (error.message.includes('Object not found')) {
        context.operation = 'download';
        return this.handleHttpError(error, context, 404);
      }
      if (error.message.includes('Bucket not found') || error.message.includes('The resource you requested could not be found')) {
        throw new Error(
          `Failed to ${context.operation} ${context.bucket}/${context.filePath} (supabase): ` +
          `Bucket '${context.bucket}' not accessible. Check: 1) bucket name is correct, ` +
          `2) bucket exists in your Supabase project. If bucket is private, ` +
          `use SUPABASE_SERVICE_ROLE_KEY instead of SUPABASE_ANON_KEY.`
        );
      }
    }
    
    // Fallback to generic handling
    return this.handleGenericError(error, context);
  }
  
  /**
   * Handle AWS S3-specific error patterns
   * TODO: Implement when S3 backend is added
   */
  private static handleS3Error(error: any, context: StorageErrorContext): never {
    // S3-specific error handling will go here
    // e.g., NoSuchBucket, NoSuchKey, AccessDenied, etc.
    return this.handleGenericError(error, context);
  }
  
  /**
   * Handle Google Cloud Storage-specific error patterns  
   * TODO: Implement when GCS backend is added
   */
  private static handleGCSError(error: any, context: StorageErrorContext): never {
    // GCS-specific error handling will go here
    return this.handleGenericError(error, context);
  }
  
  /**
   * Generic error handling for unknown or unexpected errors
   */
  private static handleGenericError(error: any, context: StorageErrorContext): never {
    const { provider, operation, bucket, filePath } = context;
    const resource = bucket && filePath ? `${bucket}/${filePath}` : bucket || filePath || 'resource';
    
    // Handle SSL/certificate issues common in corporate environments
    if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || 
        error.code === 'CERT_UNTRUSTED' || 
        error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
        error.message?.includes('certificate') ||
        error.message?.includes('SSL') ||
        error.message?.includes('TLS')) {
      throw new Error(
        `SSL/Certificate error connecting to ${provider}: ${error.message}. ` +
        `If you're on a corporate network, try: 1) disconnect/reconnect VPN, 2) check with IT about certificate issues, 3) try from a different network.`
      );
    }
    
    let errorMessage = `${provider} storage error while trying to ${operation} ${resource}`;
    
    if (error.message) {
      errorMessage += `: ${error.message}`;
    } else {
      errorMessage += `: ${JSON.stringify(error)}`;
    }
    
    throw new Error(errorMessage);
  }
  
  /**
   * Wrap async storage operations with consistent error handling
   */
  static async wrapStorageOperation<T>(
    operation: () => Promise<T>,
    context: StorageErrorContext
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      this.handleProviderError(error, context);
    }
  }
}