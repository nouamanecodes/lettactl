export const SUPPORTED_RESOURCES = ['agents', 'blocks', 'archives', 'tools', 'folders', 'files', 'mcp-servers', 'archival'];

export interface GetOptions {
  output?: string;
  agent?: string;
  shared?: boolean;
  orphaned?: boolean;
  short?: boolean;
  full?: boolean;
  query?: string;
  tags?: string;
  canary?: boolean;
}
