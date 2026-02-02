import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { FleetConfig, FolderConfig, FolderFileConfig } from '../../types/fleet-config';
import { StorageBackendManager, SupabaseStorageBackend, BucketConfig } from '../storage/storage-backend';
import { FleetConfigValidator } from '../validation/config-validators';
import { isBuiltinTool, formatBuiltinToolWarning, CORE_MEMORY_TOOLS } from '../tools/builtin-tools';
import { log, warn } from '../shared/logger';

export interface FleetParserOptions {
  supabaseBackend?: SupabaseStorageBackend;
  rootPath?: string;
}

export class FleetParser {
  public basePath: string;
  private storageManager: StorageBackendManager;
  public toolConfigs: Map<string, any> = new Map();

  constructor(configPath: string, options: FleetParserOptions = {}) {
    this.basePath = options.rootPath || path.dirname(configPath);
    this.storageManager = new StorageBackendManager({ 
      supabaseBackend: options.supabaseBackend 
    });
  }

  get storageBackend(): StorageBackendManager {
    return this.storageManager;
  }

  async parseFleetConfig(configPath: string): Promise<FleetConfig> {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(configContent) as FleetConfig;
    
    // If config specifies root_path, update our basePath
    if (config.root_path) {
      this.basePath = path.resolve(path.dirname(configPath), config.root_path);
    }
    
    return await this.resolveConfig(config);
  }

  async resolveConfig(config: FleetConfig): Promise<FleetConfig> {
    // Validate configuration before processing
    FleetConfigValidator.validate(config);

    // Auto-expand folders that reference "files" directory
    this.expandFileFolders(config);
    
    // Auto-discover tools from tools directory
    this.expandToolReferences(config);
    
    // Resolve file references
    if (config.shared_blocks) {
      for (const block of config.shared_blocks) {
        await this.resolveBlockContent(block);
      }
    }

    for (const agent of config.agents) {
      // Resolve system prompt
      await this.resolvePromptContent(agent.system_prompt);

      // Resolve memory blocks
      if (agent.memory_blocks) {
        for (const block of agent.memory_blocks) {
          await this.resolveBlockContent(block);
        }
      }
    }

    return config;
  }

  /**
   * Generic content resolver for any resource with from_file, from_bucket, value, or source_code
   */
  private async resolveContent(config: {
    from_file?: string;
    from_bucket?: any;
    value?: string;
    source_code?: string;
  }, defaultPath?: string, resourceName?: string): Promise<string> {
    if (config.from_file) {
      // Read from local filesystem
      const filePath = path.resolve(this.basePath, config.from_file);
      return fs.readFileSync(filePath, 'utf8');
    } else if (config.from_bucket) {
      // Read from cloud bucket
      const bucketConfig: BucketConfig = config.from_bucket;
      return await this.storageManager.readFromBucket(bucketConfig);
    } else if (config.source_code) {
      // Inline source code (for tools)
      return config.source_code;
    } else if (config.value) {
      return config.value;
    } else if (defaultPath && fs.existsSync(defaultPath)) {
      // Smart default fallback
      const content = fs.readFileSync(defaultPath, 'utf8');
      if (resourceName) {
        log(`Auto-loaded ${resourceName} from ${path.relative(this.basePath, defaultPath)}`);
      }
      return content;
    } else {
      throw new Error(`Resource has no value, from_file, or from_bucket specified${defaultPath ? `, and default file ${path.relative(this.basePath, defaultPath)} not found` : ''}`);
    }
  }

  private async resolveBlockContent(block: any): Promise<void> {
    const defaultPath = path.resolve(this.basePath, 'memory-blocks', `${block.name}.md`);
    block.value = await this.resolveContent(block, defaultPath, `memory block: ${block.name}`);
  }

  private async resolvePromptContent(prompt: any): Promise<void> {
    // Use generic content resolver
    let userPrompt = (await this.resolveContent(prompt, undefined, 'system prompt')).trim();

    // Strip wrapping fences if the entire prompt is a fenced block
    if (userPrompt.startsWith('```') && userPrompt.endsWith('```')) {
      userPrompt = userPrompt.slice(3, -3).trim();
    }
    
    // Check if base prompt combination should be disabled
    if (prompt.disable_base_prompt) {
      prompt.value = userPrompt;
      return;
    }
    
    // Load base Letta system instructions
    const basePath = path.resolve(this.basePath, 'config', 'base-letta-system.md');
    let baseInstructions = '';
    if (fs.existsSync(basePath)) {
      baseInstructions = fs.readFileSync(basePath, 'utf8').trim();
    }
    
    // Concatenate base instructions with user prompt
    if (baseInstructions) {
      prompt.value = baseInstructions + '\n\n' + userPrompt;
    } else {
      prompt.value = userPrompt;
    }
  }

  private expandFileFolders(config: FleetConfig): void {
    if (!config.agents) return;

    for (const agent of config.agents) {
      if (agent.folders) {
        for (const folder of agent.folders) {
          this.expandFolderFiles(folder);
        }
      }
    }
  }

  private expandFolderFiles(folder: FolderConfig): void {
    const expandedFiles: FolderFileConfig[] = [];
    const filesDir = path.resolve(this.basePath, 'files');

    for (const file of folder.files) {
      // Pass through from_bucket configs unchanged
      if (typeof file === 'object' && 'from_bucket' in file) {
        expandedFiles.push(file);
        continue;
      }

      // Handle string file paths
      const filePath = file as string;
      if (filePath === 'files/*' || filePath === 'files/**/*') {
        // Glob all files in the files directory
        if (fs.existsSync(filesDir)) {
          const allFiles = this.getAllFilesRecursive(filesDir);
          expandedFiles.push(...allFiles.map(f => path.relative(this.basePath, f)));
        }
      } else if (filePath.startsWith('files/')) {
        // Individual file in files directory
        const fullPath = path.resolve(this.basePath, filePath);
        if (fs.existsSync(fullPath)) {
          expandedFiles.push(filePath);
        }
      } else {
        // Regular file path
        expandedFiles.push(filePath);
      }
    }

    // Remove duplicates (only for string paths)
    const seen = new Set<string>();
    folder.files = expandedFiles.filter(f => {
      if (typeof f === 'object') return true; // Keep all from_bucket configs
      if (seen.has(f)) return false;
      seen.add(f);
      return true;
    });
  }

  private getAllFilesRecursive(dir: string): string[] {
    const files: string[] = [];
    
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          files.push(...this.getAllFilesRecursive(fullPath));
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
    
    return files;
  }

  private expandToolReferences(config: FleetConfig): void {
    if (!config.agents) return;

    for (const agent of config.agents) {
      if (agent.tools) {
        // Cast to any[] to handle YAML parsing that can contain objects
        const rawTools = agent.tools as any[];
        const expandedTools: string[] = [];

        for (const tool of rawTools) {
          if (typeof tool === 'string') {
            if (tool === 'tools/*') {
              // User explicitly requested auto-discovery of all tools
              const toolsDir = path.resolve(this.basePath, 'tools');
              if (fs.existsSync(toolsDir)) {
                const toolFiles = fs.readdirSync(toolsDir)
                  .filter(file => file.endsWith('.py') && file !== '__init__.py' && !file.startsWith('_'))
                  .map(file => path.basename(file, '.py'));
                expandedTools.push(...toolFiles);
                log(`Auto-discovered ${toolFiles.length} tools: ${toolFiles.join(', ')}`);
              }
            } else {
              // Regular tool name specified explicitly
              expandedTools.push(tool);
            }
          } else if (typeof tool === 'object' && tool.name) {
            // Tool configuration object with bucket source
            // Store the full config for later retrieval in registerRequiredTools
            this.toolConfigs.set(tool.name, tool);
            expandedTools.push(tool.name);
          } else {
            // Regular tool name specified explicitly (backward compatibility)
            expandedTools.push(tool);
          }
        }
        
        // Set normalized tool names
        agent.tools = [...new Set(expandedTools)];
      }
    }
  }

  async registerRequiredTools(
    config: FleetConfig,
    client: any,
    verbose: boolean = false,
    toolSourceHashes: Record<string, string> = {}
  ): Promise<{ toolNameToId: Map<string, string>; updatedTools: Set<string>; builtinTools: Set<string> }> {
    const toolNameToId = new Map<string, string>();
    const updatedTools = new Set<string>();
    const builtinTools = new Set<string>();

    // Get existing tools
    const existingTools = await client.listTools();
    const existingToolsArray = Array.isArray(existingTools)
      ? existingTools
      : ((existingTools as any).items || []);

    // Collect all unique tool names from all agents
    const requiredToolNames = new Set<string>();
    if (config.agents) {
      for (const agent of config.agents) {
        if (agent.tools) {
          agent.tools.forEach(toolName => requiredToolNames.add(toolName));
        }
      }
    }

    // Register missing tools
    for (const toolName of requiredToolNames) {
      const toolConfig = this.toolConfigs.get(toolName);
      const isBuiltin = isBuiltinTool(toolName);

      // Check if tool already exists
      let tool = existingToolsArray.find((t: any) => t.name === toolName);

      // If not in the list, try fetching by name directly (handles core/hidden tools)
      if (!tool) {
        try {
          tool = await client.getToolByName(toolName);
          if (tool && verbose) log(`Found existing tool ${toolName} via direct lookup`);
        } catch (e) {
          // Ignore error, proceed to creation
        }
      }

      if (!tool) {
        // Tool doesn't exist on server
        if (isBuiltin) {
          // Built-in tool not available - show helpful warning and skip
          warn(`\n${formatBuiltinToolWarning(toolName)}\n`);
          continue;
        }

        // Custom tool - try to register it
        try {
          if (verbose) log(`Registering tool: ${toolName}`);

          const defaultPath = path.join(this.basePath, 'tools', `${toolName}.py`);

          const sourceCode = await this.resolveContent(
            typeof toolConfig === 'object' ? toolConfig : {},
            defaultPath,
            `tool: ${toolName}`
          );

          tool = await client.createTool({ source_code: sourceCode });
          if (verbose) log(`Tool ${toolName} registered`);
        } catch (err: any) {
          warn(`Failed to register tool ${toolName}: ${err.message}`);
          continue;
        }
      } else {
        // Tool exists on server
        if (isBuiltin) {
          // Mark as builtin for logging
          builtinTools.add(toolName);
          if (verbose) log(`Using built-in tool: ${toolName}`);
        } else {
          // Custom tool exists - check if source code has actually changed
          const defaultPath = path.join(this.basePath, 'tools', `${toolName}.py`);

          try {
            const newSourceCode = await this.resolveContent(
              typeof toolConfig === 'object' ? toolConfig : {},
              defaultPath,
              `tool: ${toolName}`
            );

            // Hash both old and new source code for comparison
            const newHash = crypto.createHash('md5').update(newSourceCode).digest('hex').substring(0, 12);
            const existingHash = tool.source_code
              ? crypto.createHash('md5').update(tool.source_code).digest('hex').substring(0, 12)
              : '';

            if (newHash !== existingHash) {
              // Source code actually changed - re-register
              if (verbose) log(`Tool ${toolName} source changed (${existingHash} -> ${newHash}), re-registering`);
              tool = await client.createTool({ source_code: newSourceCode });
              updatedTools.add(toolName);
            } else {
              if (verbose) log(`Tool ${toolName} unchanged, reusing existing`);
            }
          } catch (err: any) {
            // Only warn if it's NOT a "file not found" error, as missing local source for existing tool is valid
            if (!err.message.includes('not found') && !err.message.includes('no value')) {
               warn(`Failed to check tool ${toolName}: ${err.message}`);
            } else if (verbose) {
               log(`Using existing tool ${toolName} (local source not found)`);
            }
            // Continue with existing tool
          }
        }
      }

      toolNameToId.set(toolName, tool.id);
    }

    return { toolNameToId, updatedTools, builtinTools };
  }

  async registerMcpServers(
    config: FleetConfig,
    client: any,
    verbose: boolean = false
  ): Promise<{
    mcpServerNameToId: Map<string, string>;
    created: string[];
    updated: string[];
    unchanged: string[];
    failed: string[];
  }> {
    const mcpServerNameToId = new Map<string, string>();
    const created: string[] = [];
    const updated: string[] = [];
    const unchanged: string[] = [];
    const failed: string[] = [];

    if (!config.mcp_servers || config.mcp_servers.length === 0) {
      return { mcpServerNameToId, created, updated, unchanged, failed };
    }

    // Get existing MCP servers
    const existingServers = await client.listMcpServers();
    const existingServersArray = Array.isArray(existingServers) ? existingServers : [];
    const existingServerMap = new Map<string, any>();
    for (const server of existingServersArray) {
      existingServerMap.set(server.server_name || server.name, server);
    }

    // Register/update MCP servers
    for (const serverConfig of config.mcp_servers) {
      const resolvedConfig = this.expandEnvVars(serverConfig);
      const serverName = resolvedConfig.name;
      let server = existingServerMap.get(serverName);

      if (!server) {
        // Create new MCP server
        if (verbose) log(`Creating MCP server: ${serverName}`);

        const createParams = this.buildMcpServerParams(resolvedConfig);
        try {
          server = await client.createMcpServer(createParams);
          created.push(serverName);
          if (verbose) log(`MCP server ${serverName} created`);
          try {
            await client.refreshMcpServer(server.id);
          } catch (err: any) {
            warn(`Failed to refresh MCP server ${serverName}: ${err.message}`);
          }
        } catch (err: any) {
          failed.push(serverName);
          warn(`Failed to create MCP server ${serverName}: ${err.message}`);
          continue;
        }
      } else {
        // Check if config has changed
        const configChanged = this.mcpServerConfigChanged(server, resolvedConfig);

        if (configChanged) {
          if (verbose) log(`Updating MCP server: ${serverName}`);
          const updateParams = this.buildMcpServerParams(resolvedConfig);
          try {
            server = await client.updateMcpServer(server.id, updateParams);
            updated.push(serverName);
            if (verbose) log(`MCP server ${serverName} updated`);
            try {
              await client.refreshMcpServer(server.id);
            } catch (err: any) {
              warn(`Failed to refresh MCP server ${serverName}: ${err.message}`);
            }
          } catch (err: any) {
            failed.push(serverName);
            warn(`Failed to update MCP server ${serverName}: ${err.message}`);
            continue;
          }
        } else {
          unchanged.push(serverName);
          if (verbose) log(`MCP server ${serverName} unchanged`);
        }
      }

      mcpServerNameToId.set(serverName, server.id);
    }

    return { mcpServerNameToId, created, updated, unchanged, failed };
  }

  private expandEnvVars(value: any): any {
    if (typeof value === 'string') {
      return value.replace(/\$\{([A-Z0-9_]+)\}|\$([A-Z0-9_]+)/g, (_match, braced, bare) => {
        const key = braced || bare;
        return process.env[key] ?? '';
      });
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.expandEnvVars(entry));
    }

    if (value && typeof value === 'object') {
      const result: any = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = this.expandEnvVars(entry);
      }
      return result;
    }

    return value;
  }

  private mcpServerConfigChanged(existing: any, desired: any): boolean {
    // Compare based on server type
    if (desired.type === 'sse' || desired.type === 'streamable_http') {
      if (existing.server_url !== desired.server_url) return true;
      if (existing.mcp_server_type !== desired.type) return true;
    } else if (desired.type === 'stdio') {
      if (existing.command !== desired.command) return true;
      const existingArgs = existing.args || [];
      const desiredArgs = desired.args || [];
      if (JSON.stringify(existingArgs) !== JSON.stringify(desiredArgs)) return true;
    }
    return false;
  }

  private buildMcpServerParams(serverConfig: any): any {
    const params: any = {
      server_name: serverConfig.name,
      config: {}
    };

    if (serverConfig.type === 'sse') {
      params.config = {
        server_url: serverConfig.server_url,
        mcp_server_type: 'sse'
      };
      if (serverConfig.auth_header) params.config.auth_header = serverConfig.auth_header;
      if (serverConfig.auth_token) params.config.auth_token = serverConfig.auth_token;
      if (serverConfig.custom_headers) params.config.custom_headers = serverConfig.custom_headers;
    } else if (serverConfig.type === 'stdio') {
      params.config = {
        command: serverConfig.command,
        args: serverConfig.args || [],
        mcp_server_type: 'stdio'
      };
      if (serverConfig.env) params.config.env = serverConfig.env;
    } else if (serverConfig.type === 'streamable_http') {
      params.config = {
        server_url: serverConfig.server_url,
        mcp_server_type: 'streamable_http'
      };
      if (serverConfig.auth_header) params.config.auth_header = serverConfig.auth_header;
      if (serverConfig.auth_token) params.config.auth_token = serverConfig.auth_token;
      if (serverConfig.custom_headers) params.config.custom_headers = serverConfig.custom_headers;
    } else {
      throw new Error(`Unknown MCP server type: ${serverConfig.type}`);
    }

    return params;
  }
}
