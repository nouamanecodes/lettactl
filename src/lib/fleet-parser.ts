import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { FleetConfig, FolderConfig } from '../types/fleet-config';
import { StorageBackendManager, SupabaseStorageBackend, BucketConfig } from './storage-backend';
import { FleetConfigValidator } from './config-validators';

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
   * Generic content resolver for any resource with from_file, from_bucket, or value
   */
  private async resolveContent(config: {
    from_file?: string;
    from_bucket?: any;
    value?: string;
  }, defaultPath?: string, resourceName?: string): Promise<string> {
    if (config.from_file) {
      // Read from local filesystem
      const filePath = path.resolve(this.basePath, config.from_file);
      return fs.readFileSync(filePath, 'utf8');
    } else if (config.from_bucket) {
      // Read from cloud bucket
      const bucketConfig: BucketConfig = config.from_bucket;
      return await this.storageManager.readFromBucket(bucketConfig);
    } else if (config.value) {
      return config.value;
    } else if (defaultPath && fs.existsSync(defaultPath)) {
      // Smart default fallback
      const content = fs.readFileSync(defaultPath, 'utf8');
      if (resourceName) {
        console.log(`Auto-loaded ${resourceName} from ${path.relative(this.basePath, defaultPath)}`);
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
    const userPrompt = (await this.resolveContent(prompt, undefined, 'system prompt')).trim();
    
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
    const expandedFiles: string[] = [];
    const filesDir = path.resolve(this.basePath, 'files');

    for (const file of folder.files) {
      if (file === 'files/*' || file === 'files/**/*') {
        // Glob all files in the files directory
        if (fs.existsSync(filesDir)) {
          const allFiles = this.getAllFilesRecursive(filesDir);
          expandedFiles.push(...allFiles.map(f => path.relative(this.basePath, f)));
        }
      } else if (file.startsWith('files/')) {
        // Individual file in files directory
        const fullPath = path.resolve(this.basePath, file);
        if (fs.existsSync(fullPath)) {
          expandedFiles.push(file);
        }
      } else {
        // Regular file path
        expandedFiles.push(file);
      }
    }

    // Remove duplicates
    folder.files = [...new Set(expandedFiles)];
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
                  .filter(file => file.endsWith('.py'))
                  .map(file => path.basename(file, '.py'));
                expandedTools.push(...toolFiles);
                console.log(`Auto-discovered ${toolFiles.length} tools: ${toolFiles.join(', ')}`);
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
  ): Promise<Map<string, string>> {
    const toolNameToId = new Map<string, string>();

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

      // Skip built-in tools
      if (['archival_memory_insert', 'archival_memory_search'].includes(toolName)) {
        const existingTool = existingToolsArray.find((t: any) => t.name === toolName);
        if (existingTool) {
          toolNameToId.set(toolName, existingTool.id);
        }
        continue;
      }

      // Check if tool already exists
      let tool = existingToolsArray.find((t: any) => t.name === toolName);

      if (!tool) {
        // Tool doesn't exist - register it
        try {
          if (verbose) console.log(`Registering tool: ${toolName}`);

          const defaultPath = path.join(this.basePath, 'tools', `${toolName}.py`);

          const sourceCode = await this.resolveContent(
            typeof toolConfig === 'object' ? toolConfig : {},
            defaultPath,
            `tool: ${toolName}`
          );

          tool = await client.createTool({ source_code: sourceCode });
          if (verbose) console.log(`Tool ${toolName} registered`);
        } catch (error: any) {
          console.warn(`Failed to register tool ${toolName}: ${error.message}`);
          continue;
        }
      } else {
        // Tool exists - check if source code has changed
        const currentSourceHash = toolSourceHashes[toolName];

        if (currentSourceHash) {
          // We have a hash for this tool, meaning source code is being tracked
          if (verbose) console.log(`Re-registering tool due to potential source changes: ${toolName}`);
          try {
            const defaultPath = path.join(this.basePath, 'tools', `${toolName}.py`);

            const sourceCode = await this.resolveContent(
              typeof toolConfig === 'object' ? toolConfig : {},
              defaultPath,
              `tool: ${toolName}`
            );

            tool = await client.createTool({ source_code: sourceCode });
            if (verbose) console.log(`Tool ${toolName} re-registered`);
          } catch (error: any) {
            console.warn(`Failed to re-register tool ${toolName}: ${error.message}`);
            // Continue with existing tool if re-registration fails
          }
        } else {
          if (verbose) console.log(`Using existing tool: ${toolName}`);
        }
      }

      toolNameToId.set(toolName, tool.id);
    }

    return toolNameToId;
  }
}