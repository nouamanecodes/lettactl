/**
 * Validation for bucket configuration objects
 * Handles all edge cases for from_bucket YAML syntax
 */

import { BucketConfig } from './storage-backend';

export class BucketConfigValidator {
  
  /**
   * Validates a bucket config object and throws descriptive errors
   */
  static validate(config: any): void {
    this.validateStructure(config);
    this.validateRequiredFields(config);
    this.validateValues(config);
    this.validateDataTypes(config);
    this.validateProvider(config);
  }
  
  private static validateStructure(config: any): void {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(
        'Invalid from_bucket configuration. Expected object with provider, bucket, and path fields.\n' +
        'Example:\n' +
        'from_bucket:\n' +
        '  provider: supabase\n' +
        '  bucket: my-bucket\n' +
        '  path: file.md'
      );
    }
  }
  
  private static validateRequiredFields(config: any): void {
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
  }
  
  private static validateValues(config: any): void {
    const requiredFields = ['provider', 'bucket', 'path'];
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
  
  private static validateDataTypes(config: any): void {
    const requiredFields = ['provider', 'bucket', 'path'];
    const wrongTypes = requiredFields.filter(field => {
      const value = config[field];
      return typeof value !== 'string';
    });
    
    if (wrongTypes.length > 0) {
      const typeInfo = wrongTypes.map(field => {
        const value = config[field];
        const type = Array.isArray(value) ? 'array' : typeof value;
        return `${field} (got ${type})`;
      });
      
      throw new Error(
        `Wrong data types in from_bucket config: ${typeInfo.join(', ')}\n` +
        'All fields must be strings.\n' +
        'Example:\n' +
        'from_bucket:\n' +
        '  provider: supabase\n' +
        '  bucket: my-bucket\n' +
        '  path: file.md'
      );
    }
  }
  
  /**
   * Validates provider-specific requirements
   */
  static validateProvider(config: BucketConfig): void {
    if (config.provider !== 'supabase') {
      throw new Error(`Provider '${config.provider}' not supported. Supported: supabase`);
    }
  }
}