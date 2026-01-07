/**
 * Wraps command functions with consistent error handling
 */
export function withErrorHandling<T extends any[], R>(
  commandName: string,
  fn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error: any) {
      console.error(`${commandName} failed:`, formatLettaError(error.message || error));
      process.exit(1);
    }
  };
}

/**
 * Creates a consistent error for resource not found
 */
export function createNotFoundError(resourceType: string, name: string): Error {
  return new Error(`${resourceType} "${name}" not found`);
}

const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google_ai: 'GOOGLE_AI_API_KEY',
  google_vertex: 'GOOGLE_VERTEX_API_KEY',
  azure: 'AZURE_API_KEY',
  groq: 'GROQ_API_KEY',
  together: 'TOGETHER_API_KEY',
};

/**
 * Formats Letta API errors with helpful context
 */
export function formatLettaError(message: string): string {
  // Check for provider not supported error
  const providerMatch = message.match(/Provider (\w+) is not supported/i);
  if (providerMatch) {
    const provider = providerMatch[1].toLowerCase();
    const envVar = PROVIDER_ENV_VARS[provider] || `${provider.toUpperCase()}_API_KEY`;
    return `Provider '${provider}' is not configured on your Letta server.\n` +
      `To enable it, restart your Letta server with ${envVar} environment variable set.\n` +
      `See: https://docs.letta.com/guides/server/providers/${provider}`;
  }

  return message;
}