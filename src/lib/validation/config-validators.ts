/**
 * Comprehensive YAML configuration validation system
 * Composition-based validators for different config sections
 */

import { BucketConfigValidator } from '../storage/bucket-config-validator';
import { warn } from '../shared/logger';

/**
 * Main orchestrator for fleet configuration validation
 */
export class FleetConfigValidator {
  static validate(config: any): void {
    this.validateStructure(config);
    
    if (config.shared_blocks) {
      SharedBlockValidator.validate(config.shared_blocks);
    }

    if (config.shared_folders) {
      SharedFolderValidator.validate(config.shared_folders);
    }

    if (config.agents) {
      this.validateAgents(config.agents, config);
    }
  }
  
  private static validateStructure(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new Error(
        'Invalid fleet configuration. Expected YAML object with agents array.\n' +
        'Example:\n' +
        'agents:\n' +
        '  - name: my-agent\n' +
        '    system_prompt:\n' +
        '      value: "You are helpful"'
      );
    }
    
    if (!config.agents || !Array.isArray(config.agents)) {
      throw new Error(
        'Fleet configuration must have an "agents" array.\n' +
        'Example:\n' +
        'agents:\n' +
        '  - name: my-agent\n' +
        '    system_prompt:\n' +
        '      value: "You are helpful"'
      );
    }
    
    if (config.agents.length === 0) {
      throw new Error('Fleet configuration must have at least one agent.');
    }
  }
  
  private static validateAgents(agents: any[], config?: any): void {
    // Check for duplicate agent names
    const agentNames = new Set<string>();
    
    agents.forEach((agent, index) => {
      try {
        AgentValidator.validate(agent);
        
        // Check name uniqueness
        if (agent.name) {
          if (agentNames.has(agent.name)) {
            throw new Error(`Duplicate agent name "${agent.name}". Agent names must be unique.`);
          }
          agentNames.add(agent.name);
        }
      } catch (err: any) {
        throw new Error(`Agent ${index + 1}: ${err.message}`);
      }
    });

    // Check for duplicate inline folder names across agents
    const folderOwners = new Map<string, string[]>();
    for (const agent of agents) {
      if (agent.folders) {
        for (const folder of agent.folders) {
          const owners = folderOwners.get(folder.name) || [];
          owners.push(agent.name);
          folderOwners.set(folder.name, owners);
        }
      }
    }

    for (const [folderName, owners] of folderOwners) {
      if (owners.length > 1) {
        throw new Error(
          `Folder "${folderName}" defined on multiple agents (${owners.join(', ')}).\n` +
          `Use shared_folders to share a folder across agents:\n\n` +
          `shared_folders:\n` +
          `  - name: ${folderName}\n` +
          `    files: [...]\n\n` +
          `agents:\n` +
          owners.map(o => `  - name: ${o}\n    shared_folders:\n      - ${folderName}`).join('\n')
        );
      }
    }
  }
}

/**
 * Validator for individual agent configurations
 */
export class AgentValidator {
  static validate(agent: any): void {
    this.validateStructure(agent);
    this.validateUnknownFields(agent);
    this.validateRequiredFields(agent);
    
    // Validate sub-components
    SystemPromptValidator.validate(agent.system_prompt);
    
    if (agent.memory_blocks) {
      MemoryBlockValidator.validate(agent.memory_blocks);
    }

    if (agent.archives) {
      ArchiveValidator.validate(agent.archives);
    }
    
    if (agent.tools) {
      ToolsValidator.validate(agent.tools);
    }

    if (agent.mcp_tools) {
      McpToolsValidator.validate(agent.mcp_tools);
    }
    
    if (agent.folders) {
      FoldersValidator.validate(agent.folders);
    }
    
    if (agent.llm_config) {
      LLMConfigValidator.validate(agent.llm_config);
    }
    
    if (agent.embedding) {
      this.validateEmbedding(agent.embedding);
    }

    if (agent.embedding_config) {
      this.validateEmbeddingConfig(agent.embedding_config);
    }
    
    if (agent.shared_blocks) {
      this.validateSharedBlockReferences(agent.shared_blocks);
    }

    if (agent.shared_folders) {
      this.validateSharedFolderReferences(agent.shared_folders);
    }

    if (agent.tags) {
      this.validateTags(agent.tags);
    }
  }
  
  private static validateStructure(agent: any): void {
    if (!agent || typeof agent !== 'object') {
      throw new Error('Agent configuration must be an object.');
    }
  }
  
  private static validateRequiredFields(agent: any): void {
    const requiredFields = ['name', 'description', 'system_prompt', 'llm_config'];
    const missing = requiredFields.filter(field => !(field in agent));
    
    if (missing.length > 0) {
      throw new Error(
        `Missing required fields: ${missing.join(', ')}\n` +
        'Required fields: name, description, system_prompt, llm_config\n' +
        'Example:\n' +
        '- name: my-agent\n' +
        '  description: "What this agent does"\n' +
        '  llm_config:\n' +
        '    model: "google_ai/gemini-2.5-pro"\n' +
        '    context_window: 32000\n' +
        '  system_prompt:\n' +
        '    value: "You are helpful"'
      );
    }
    
    // Validate name is non-empty string
    if (!agent.name || typeof agent.name !== 'string' || agent.name.trim() === '') {
      throw new Error('Agent name must be a non-empty string.');
    }
    
    // Validate agent name format (no special characters that could break system)
    if (!/^[a-zA-Z0-9_-]+$/.test(agent.name)) {
      throw new Error('Agent name can only contain letters, numbers, hyphens, and underscores.');
    }
    
    // Validate description is non-empty string
    if (!agent.description || typeof agent.description !== 'string' || agent.description.trim() === '') {
      throw new Error('Agent description must be a non-empty string.');
    }
  }
  
  private static validateUnknownFields(agent: any): void {
    const allowedFields = [
      'name', 'description', 'system_prompt', 'llm_config',
      'tools', 'mcp_tools', 'memory_blocks', 'archives', 'folders',
      'embedding', 'embedding_config', 'shared_blocks', 'shared_folders',
      'first_message', 'reasoning', 'tags'
    ];
    
    const unknownFields = Object.keys(agent).filter(field => !allowedFields.includes(field));
    
    if (unknownFields.length > 0) {
      throw new Error(
        `Unknown fields: ${unknownFields.join(', ')}\n` +
        `Allowed fields: ${allowedFields.join(', ')}\n` +
        'Check for typos in field names.'
      );
    }
  }
  
  private static validateEmbedding(embedding: any): void {
    if (!embedding || typeof embedding !== 'string' || embedding.trim() === '') {
      throw new Error('Embedding must be a non-empty string.');
    }
  }

  private static validateEmbeddingConfig(embeddingConfig: any): void {
    if (!embeddingConfig || typeof embeddingConfig !== 'object' || Array.isArray(embeddingConfig)) {
      throw new Error('Embedding config must be an object.');
    }
  }
  
  private static validateSharedBlockReferences(sharedBlocks: any): void {
    if (!Array.isArray(sharedBlocks)) {
      throw new Error('Agent shared_blocks must be an array.');
    }

    sharedBlocks.forEach((blockName, index) => {
      if (!blockName || typeof blockName !== 'string' || blockName.trim() === '') {
        throw new Error(`Shared block reference ${index + 1} must be a non-empty string (block name).`);
      }
    });
  }

  private static validateSharedFolderReferences(sharedFolders: any): void {
    if (!Array.isArray(sharedFolders)) {
      throw new Error('Agent shared_folders must be an array.');
    }

    sharedFolders.forEach((folderName, index) => {
      if (!folderName || typeof folderName !== 'string' || folderName.trim() === '') {
        throw new Error(`Shared folder reference ${index + 1} must be a non-empty string (folder name).`);
      }
    });
  }

  private static validateTags(tags: any): void {
    if (!Array.isArray(tags)) {
      throw new Error('Agent tags must be an array of strings.');
    }

    tags.forEach((tag, index) => {
      if (!tag || typeof tag !== 'string' || tag.trim() === '') {
        throw new Error(`Tag ${index + 1} must be a non-empty string.`);
      }
      if (tag.includes(',')) {
        throw new Error(`Tag "${tag}" must not contain commas (commas are used as delimiters in CLI filters).`);
      }
    });
  }
}

/**
 * Validator for system prompt configurations
 */
export class SystemPromptValidator {
  static validate(prompt: any): void {
    if (!prompt || typeof prompt !== 'object') {
      throw new Error(
        'System prompt must be an object with value, from_file, or from_bucket.\n' +
        'Example:\n' +
        'system_prompt:\n' +
        '  value: "You are helpful"'
      );
    }
    
    const hasValue = 'value' in prompt;
    const hasFile = 'from_file' in prompt;
    const hasBucket = 'from_bucket' in prompt;
    
    if (!hasValue && !hasFile && !hasBucket) {
      throw new Error(
        'System prompt must have one of: value, from_file, or from_bucket.\n' +
        'Examples:\n' +
        'system_prompt:\n' +
        '  value: "You are helpful"\n' +
        '# OR\n' +
        'system_prompt:\n' +
        '  from_file: "prompts/my-prompt.md"\n' +
        '# OR\n' +
        'system_prompt:\n' +
        '  from_bucket:\n' +
        '    provider: supabase\n' +
        '    bucket: my-bucket\n' +
        '    path: prompts/my-prompt.md'
      );
    }
    
    // Only one source allowed
    const sources = [hasValue, hasFile, hasBucket].filter(Boolean);
    if (sources.length > 1) {
      throw new Error('System prompt can only have one of: value, from_file, or from_bucket (not multiple).');
    }
    
    // Validate bucket config if present
    if (hasBucket) {
      BucketConfigValidator.validate(prompt.from_bucket);
    }
    
    // Validate string values are non-empty
    if (hasValue && (!prompt.value || typeof prompt.value !== 'string' || prompt.value.trim() === '')) {
      throw new Error('System prompt value must be a non-empty string.');
    }
    
    if (hasFile && (!prompt.from_file || typeof prompt.from_file !== 'string' || prompt.from_file.trim() === '')) {
      throw new Error('System prompt from_file must be a non-empty string.');
    }
  }
}

/**
 * Validator for memory blocks
 */
export class MemoryBlockValidator {
  static validate(blocks: any): void {
    if (!Array.isArray(blocks)) {
      throw new Error('Memory blocks must be an array.');
    }
    
    // Check for duplicate block names
    const blockNames = new Set<string>();
    
    blocks.forEach((block, index) => {
      try {
        this.validateBlock(block);
        
        // Check name uniqueness
        if (block.name) {
          if (blockNames.has(block.name)) {
            throw new Error(`Duplicate memory block name "${block.name}". Block names must be unique within an agent.`);
          }
          blockNames.add(block.name);
        }
      } catch (err: any) {
        throw new Error(`Memory block ${index + 1}: ${err.message}`);
      }
    });
  }
  
  private static validateBlock(block: any): void {
    if (!block || typeof block !== 'object') {
      throw new Error('Memory block must be an object.');
    }
    
    // Required fields
    if (!block.name || typeof block.name !== 'string' || block.name.trim() === '') {
      throw new Error('Memory block must have a non-empty name.');
    }
    
    // Description is required
    if (!block.description || typeof block.description !== 'string' || block.description.trim() === '') {
      throw new Error(`Memory block "${block.name}" must have a non-empty description.`);
    }
    
    // Limit is required
    if (!block.limit) {
      throw new Error(`Memory block "${block.name}" must have a limit field.`);
    }
    
    if (!Number.isInteger(block.limit) || block.limit <= 0) {
      throw new Error(`Memory block "${block.name}" limit must be a positive integer.`);
    }
    
    // Must have content source
    const hasValue = 'value' in block;
    const hasFile = 'from_file' in block;
    const hasBucket = 'from_bucket' in block;
    
    if (!hasValue && !hasFile && !hasBucket) {
      throw new Error(
        `Memory block "${block.name}" must have one of: value, from_file, or from_bucket.`
      );
    }
    
    // Only one content source allowed
    const sources = [hasValue, hasFile, hasBucket].filter(Boolean);
    if (sources.length > 1) {
      throw new Error(`Memory block "${block.name}" can only have one of: value, from_file, or from_bucket (not multiple).`);
    }
    
    // Validate string values are non-empty
    if (hasValue && (!block.value || typeof block.value !== 'string' || block.value.trim() === '')) {
      throw new Error(`Memory block "${block.name}" value must be a non-empty string.`);
    }
    
    if (hasFile && (!block.from_file || typeof block.from_file !== 'string' || block.from_file.trim() === '')) {
      throw new Error(`Memory block "${block.name}" from_file must be a non-empty string.`);
    }
    
    // Validate bucket config if present
    if (hasBucket) {
      BucketConfigValidator.validate(block.from_bucket);
    }

    // agent_owned is required - no silent defaults
    if (!('agent_owned' in block)) {
      throw new Error(
        `Memory block "${block.name}" missing required field 'agent_owned'\n` +
        '  agent_owned: true  - agent can modify, YAML won\'t overwrite\n' +
        '  agent_owned: false - YAML overwrites on every apply'
      );
    }

    if (typeof block.agent_owned !== 'boolean') {
      throw new Error(`Memory block "${block.name}" agent_owned must be true or false.`);
    }
  }
}

/**
 * Validator for archives
 */
export class ArchiveValidator {
  static validate(archives: any): void {
    if (!Array.isArray(archives)) {
      throw new Error('Archives must be an array.');
    }

    if (archives.length > 1) {
      throw new Error('Only one archive is supported per agent.');
    }

    const archiveNames = new Set<string>();

    archives.forEach((archive, index) => {
      try {
        this.validateArchive(archive);

        if (archive.name) {
          if (archiveNames.has(archive.name)) {
            throw new Error(`Duplicate archive name "${archive.name}". Archive names must be unique within an agent.`);
          }
          archiveNames.add(archive.name);
        }
      } catch (err: any) {
        throw new Error(`Archive ${index + 1}: ${err.message}`);
      }
    });
  }

  private static validateArchive(archive: any): void {
    if (!archive || typeof archive !== 'object') {
      throw new Error('Archive must be an object.');
    }

    if (!archive.name || typeof archive.name !== 'string' || archive.name.trim() === '') {
      throw new Error('Archive must have a non-empty name.');
    }

    if (archive.description !== undefined && (typeof archive.description !== 'string' || archive.description.trim() === '')) {
      throw new Error(`Archive "${archive.name}" description must be a non-empty string.`);
    }

    if (archive.embedding !== undefined && (typeof archive.embedding !== 'string' || archive.embedding.trim() === '')) {
      throw new Error(`Archive "${archive.name}" embedding must be a non-empty string.`);
    }

    if (archive.embedding_config !== undefined && (typeof archive.embedding_config !== 'object' || Array.isArray(archive.embedding_config))) {
      throw new Error(`Archive "${archive.name}" embedding_config must be an object.`);
    }
  }
}

/**
 * Validator for MCP tool selection
 */
export class McpToolsValidator {
  static validate(selections: any): void {
    if (!Array.isArray(selections)) {
      throw new Error('mcp_tools must be an array.');
    }

    selections.forEach((selection, index) => {
      if (!selection || typeof selection !== 'object') {
        throw new Error(`mcp_tools ${index + 1} must be an object.`);
      }

      if (!selection.server || typeof selection.server !== 'string' || selection.server.trim() === '') {
        throw new Error(`mcp_tools ${index + 1} must include a non-empty server name.`);
      }

      if (selection.tools !== undefined) {
        if (selection.tools === 'all') {
          return;
        }

        if (!Array.isArray(selection.tools)) {
          throw new Error(`mcp_tools ${index + 1} tools must be an array or "all".`);
        }

        selection.tools.forEach((tool: any, toolIndex: number) => {
          if (!tool || typeof tool !== 'string' || tool.trim() === '') {
            throw new Error(`mcp_tools ${index + 1} tool ${toolIndex + 1} must be a non-empty string.`);
          }
        });
      }
    });
  }
}

/**
 * Validator for tools configuration
 */
export class ToolsValidator {
  static validate(tools: any): void {
    if (!Array.isArray(tools)) {
      throw new Error('Tools must be an array.');
    }
    
    tools.forEach((tool, index) => {
      if (!tool) {
        throw new Error(`Tool ${index + 1} cannot be null or undefined.`);
      }
      
      if (typeof tool === 'string') {
        if (tool.trim() === '') {
          throw new Error(`Tool ${index + 1} must be a non-empty string (tool name).`);
        }
      } else if (typeof tool === 'object') {
        // Tool configuration object with bucket source
        if (!tool.name || typeof tool.name !== 'string' || tool.name.trim() === '') {
          throw new Error(`Tool ${index + 1} object must have a non-empty 'name' property.`);
        }
        
        if (tool.from_bucket) {
          BucketConfigValidator.validate(tool.from_bucket);
        }
      } else {
        throw new Error(`Tool ${index + 1} must be a string (tool name) or object (tool configuration).`);
      }
    });
  }
}

/**
 * Validator for folders configuration
 */
export class FoldersValidator {
  static validate(folders: any): void {
    if (!Array.isArray(folders)) {
      throw new Error('Folders must be an array.');
    }

    folders.forEach((folder, index) => {
      try {
        this.validateFolder(folder);
      } catch (err: any) {
        throw new Error(`Folder ${index + 1}: ${err.message}`);
      }
    });
  }

  private static validateFolder(folder: any): void {
    if (!folder || typeof folder !== 'object') {
      throw new Error('Folder must be an object.');
    }

    if (!folder.name || typeof folder.name !== 'string' || folder.name.trim() === '') {
      throw new Error('Folder must have a non-empty name.');
    }

    if (!folder.files || !Array.isArray(folder.files)) {
      throw new Error(`Folder "${folder.name}" must have a files array.`);
    }

    folder.files.forEach((file: any, index: number) => {
      if (!file) {
        throw new Error(`Folder "${folder.name}" file ${index + 1} cannot be null or undefined.`);
      }

      if (typeof file === 'string') {
        // Local file path
        if (file.trim() === '') {
          throw new Error(`Folder "${folder.name}" file ${index + 1} must be a non-empty string.`);
        }
      } else if (typeof file === 'object' && 'from_bucket' in file) {
        // from_bucket config
        BucketConfigValidator.validate(file.from_bucket);
      } else {
        throw new Error(
          `Folder "${folder.name}" file ${index + 1} must be a string (file path) or object with from_bucket.\n` +
          'Examples:\n' +
          'files:\n' +
          '  - files/doc.pdf\n' +
          '  - from_bucket:\n' +
          '      provider: supabase\n' +
          '      bucket: my-bucket\n' +
          '      path: docs/file.pdf'
        );
      }
    });
  }
}

/**
 * Validator for shared blocks configuration
 */
export class SharedBlockValidator {
  static validate(blocks: any): void {
    if (!Array.isArray(blocks)) {
      throw new Error('Shared blocks must be an array.');
    }

    blocks.forEach((block, index) => {
      try {
        MemoryBlockValidator['validateBlock'](block); // Reuse memory block validation

        // Shared blocks are always agent_owned - warn if explicitly set
        if ('agent_owned' in block) {
          warn(`Shared block "${block.name}": agent_owned is ignored for shared blocks (always agent_owned)`);
        }
      } catch (err: any) {
        throw new Error(`Shared block ${index + 1}: ${err.message}`);
      }
    });
  }
}

/**
 * Validator for shared folders configuration
 */
export class SharedFolderValidator {
  static validate(folders: any): void {
    if (!Array.isArray(folders)) {
      throw new Error('Shared folders must be an array.');
    }

    const folderNames = new Set<string>();

    folders.forEach((folder, index) => {
      try {
        if (!folder || typeof folder !== 'object') {
          throw new Error('Shared folder must be an object.');
        }

        if (!folder.name || typeof folder.name !== 'string' || folder.name.trim() === '') {
          throw new Error('Shared folder must have a non-empty name.');
        }

        if (folderNames.has(folder.name)) {
          throw new Error(`Duplicate shared folder name "${folder.name}".`);
        }
        folderNames.add(folder.name);

        if (!folder.files || !Array.isArray(folder.files)) {
          throw new Error(`Shared folder "${folder.name}" must have a files array.`);
        }

        // Reuse FoldersValidator logic for file entries
        FoldersValidator.validate([folder]);
      } catch (err: any) {
        throw new Error(`Shared folder ${index + 1}: ${err.message}`);
      }
    });
  }
}

/**
 * Validator for LLM configuration
 */
export class LLMConfigValidator {
  static validate(config: any): void {
    if (!config || typeof config !== 'object') {
      throw new Error(
        'LLM config is required and must be an object.\n' +
        'Example:\n' +
        'llm_config:\n' +
        '  model: "google_ai/gemini-2.5-pro"\n' +
        '  context_window: 32000'
      );
    }
    
    // Model is required
    if (!config.model) {
      throw new Error('LLM config must include a model field.');
    }
    
    if (typeof config.model !== 'string' || config.model.trim() === '') {
      throw new Error('LLM config model must be a non-empty string.');
    }
    
    // Context window is required
    if (!config.context_window) {
      throw new Error('LLM config must include context_window field.');
    }
    
    if (!Number.isInteger(config.context_window) || config.context_window <= 0) {
      throw new Error('LLM config context_window must be a positive integer.');
    }
    
    // Validate reasonable context window bounds
    if (config.context_window < 1000) {
      throw new Error('LLM config context_window must be at least 1000.');
    }
    
    if (config.context_window > 200000) {
      throw new Error('LLM config context_window cannot exceed 200000.');
    }
  }
}
