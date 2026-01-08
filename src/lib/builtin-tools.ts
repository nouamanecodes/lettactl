/**
 * Registry of Letta built-in tools and their server-side requirements
 *
 * Built-in tools are maintained by Letta and execute in a privileged server context.
 * They have fixed implementations that cannot be modified - you can only attach them to agents.
 *
 * @see https://docs.letta.com/guides/agents/tool-execution-builtin
 */

export interface BuiltinToolInfo {
  name: string;
  description: string;
  requiredEnvVar?: string;       // Required for the tool to be available
  optionalEnvVar?: string;       // Optional enhancement
  docsUrl: string;
}

/**
 * Registry of all known Letta built-in tools
 */
export const BUILTIN_TOOLS: Record<string, BuiltinToolInfo> = {
  web_search: {
    name: 'web_search',
    description: 'Search the web using Exa AI-powered search engine',
    requiredEnvVar: 'EXA_API_KEY',
    docsUrl: 'https://docs.letta.com/guides/agents/web-search'
  },
  run_code: {
    name: 'run_code',
    description: 'Execute code in a secure E2B sandbox',
    requiredEnvVar: 'E2B_API_KEY',
    docsUrl: 'https://docs.letta.com/guides/agents/code-interpreter'
  },
  fetch_webpage: {
    name: 'fetch_webpage',
    description: 'Fetch and convert webpages to readable text/markdown',
    optionalEnvVar: 'EXA_API_KEY',
    docsUrl: 'https://docs.letta.com/guides/agents/prebuilt-tools'
  }
};

/**
 * Core memory tools that are always available (no configuration needed)
 */
export const CORE_MEMORY_TOOLS = [
  'archival_memory_insert',
  'archival_memory_search',
  'conversation_search',
  'memory_insert',
  'memory_replace',
  'memory_rethink'
];

/**
 * Check if a tool name is a known built-in tool
 */
export function isBuiltinTool(toolName: string): boolean {
  return toolName in BUILTIN_TOOLS || CORE_MEMORY_TOOLS.includes(toolName);
}

/**
 * Get info about a built-in tool if it exists
 */
export function getBuiltinToolInfo(toolName: string): BuiltinToolInfo | null {
  return BUILTIN_TOOLS[toolName] || null;
}

/**
 * Get the required environment variable for a built-in tool
 */
export function getRequiredEnvVar(toolName: string): string | undefined {
  return BUILTIN_TOOLS[toolName]?.requiredEnvVar;
}

/**
 * Format a helpful message when a built-in tool is not available on the server
 */
export function formatBuiltinToolWarning(toolName: string): string {
  const info = BUILTIN_TOOLS[toolName];
  if (!info) return `Tool '${toolName}' not found on server.`;

  const lines = [
    `Built-in tool '${toolName}' not found on server.`
  ];

  if (info.requiredEnvVar) {
    lines.push(`This tool requires ${info.requiredEnvVar} to be set on your Letta server.`);
    lines.push(`Restart your Letta server with: -e ${info.requiredEnvVar}=your_key`);
  }

  lines.push(`See: ${info.docsUrl}`);

  return lines.join('\n');
}
