export const DELETE_SUPPORTED_RESOURCES = ['agent', 'agents', 'mcp-servers'];
export const DELETE_ALL_SUPPORTED_RESOURCES = ['agent', 'agents', 'folders', 'folder', 'blocks', 'block', 'tools', 'tool', 'mcp-servers'];

export interface DeleteOptions {
  force?: boolean;
}

export interface DeleteAllOptions {
  force?: boolean;
  pattern?: string;
}
