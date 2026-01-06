import { FleetParser } from './lib/fleet-parser';
import { SupabaseStorageBackend } from './lib/storage-backend';
import { FleetConfig, AgentConfig } from './types/fleet-config';
import { FleetConfigValidator } from './lib/config-validators';
import { applyCommand } from './commands/apply';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface LettaCtlOptions {
  lettaBaseUrl?: string;
  lettaApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
}

export class LettaCtl {
  private supabaseBackend?: SupabaseStorageBackend;

  constructor(options: LettaCtlOptions = {}) {
    if (options.lettaBaseUrl) process.env.LETTA_BASE_URL = options.lettaBaseUrl;
    if (options.lettaApiKey) process.env.LETTA_API_KEY = options.lettaApiKey;
    if (options.supabaseUrl) process.env.SUPABASE_URL = options.supabaseUrl;
    if (options.supabaseAnonKey) process.env.SUPABASE_ANON_KEY = options.supabaseAnonKey;
    if (options.supabaseServiceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY = options.supabaseServiceRoleKey;

    const hasSupabaseCredentials = options.supabaseUrl &&
      (options.supabaseAnonKey || options.supabaseServiceRoleKey);
    if (hasSupabaseCredentials) {
      this.supabaseBackend = new SupabaseStorageBackend();
    }
  }

  async deployFleet(config: FleetConfig, options?: { dryRun?: boolean; agentPattern?: string; match?: string }): Promise<void> {
    FleetConfigValidator.validate(config);

    const tempDir = path.join(os.tmpdir(), `lettactl-${Date.now()}`);
    const tempFile = path.join(tempDir, 'fleet.yaml');

    try {
      fs.mkdirSync(tempDir, { recursive: true });
      const yamlContent = yaml.dump(config);
      fs.writeFileSync(tempFile, yamlContent);

      await applyCommand(
        {
          file: tempFile,
          agent: options?.agentPattern,
          match: options?.match,
          dryRun: options?.dryRun || false,
          root: process.cwd()
        },
        { 
          parent: {
            opts: () => ({ verbose: false })
          }
        }
      );
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    }
  }

  async deployFromYaml(yamlPath: string, options?: { dryRun?: boolean; agentPattern?: string; match?: string; rootPath?: string }): Promise<void> {
    await applyCommand(
      {
        file: yamlPath,
        agent: options?.agentPattern,
        match: options?.match,
        dryRun: options?.dryRun || false,
        root: options?.rootPath
      },
      { 
        parent: {
          opts: () => ({ verbose: false })
        }
      }
    );
  }

  async deployFromYamlString(yamlContent: string, options?: { dryRun?: boolean; agentPattern?: string; match?: string }): Promise<void> {
    const config = yaml.load(yamlContent) as FleetConfig;
    await this.deployFleet(config, options);
  }

  validateFleet(config: FleetConfig): boolean {
    try {
      FleetConfigValidator.validate(config);
      return true;
    } catch {
      return false;
    }
  }

  createFleetConfig(): FleetConfigBuilder {
    return new FleetConfigBuilder();
  }
}

export class FleetConfigBuilder {
  private config: FleetConfig = { agents: [] };

  addSharedBlock(block: { name: string; description: string; limit: number; value?: string; from_file?: string; from_bucket?: any }): this {
    if (!this.config.shared_blocks) {
      this.config.shared_blocks = [];
    }
    this.config.shared_blocks.push(block);
    return this;
  }

  addAgent(agent: AgentConfig): this {
    this.config.agents.push(agent);
    return this;
  }

  build(): FleetConfig {
    return this.config;
  }
}

export { FleetConfig, AgentConfig } from './types/fleet-config';