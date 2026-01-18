import { error } from './logger';

/**
 * Validates resource types for commands
 */
export function validateResourceType(resource: string, validTypes: string[]): void {
  if (!validTypes.includes(resource)) {
    error(`Error: Only "${validTypes.join('/')}" resource is currently supported`);
    process.exit(1);
  }
}

/**
 * Validates that a required parameter is provided
 */
export function validateRequired(value: any, paramName: string, usage?: string): void {
  if (!value) {
    error(`Error: ${paramName} is required`);
    if (usage) {
      error(`Usage: ${usage}`);
    }
    process.exit(1);
  }
}