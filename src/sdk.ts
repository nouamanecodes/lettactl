import { FleetParser } from './lib/apply/fleet-parser';
import { SupabaseStorageBackend } from './lib/storage/storage-backend';
import { FleetConfig, AgentConfig } from './types/fleet-config';
import { FleetConfigValidator } from './lib/validation/config-validators';
import { applyCommand } from './commands/apply';
import { deleteAgentWithCleanup } from './commands/delete';
import { LettaClientWrapper } from './lib/client/letta-client';
import { AgentResolver } from './lib/client/agent-resolver';
import { isRunTerminal, getEffectiveRunStatus } from './lib/messaging/run-utils';
import { Run } from './types/run';
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
  root?: string;
}

export class LettaCtl {
  private supabaseBackend?: SupabaseStorageBackend;
  private root: string;

  constructor(options: LettaCtlOptions = {}) {
    if (options.lettaBaseUrl) process.env.LETTA_BASE_URL = options.lettaBaseUrl;
    if (options.lettaApiKey) process.env.LETTA_API_KEY = options.lettaApiKey;
    if (options.supabaseUrl) process.env.SUPABASE_URL = options.supabaseUrl;
    if (options.supabaseAnonKey) process.env.SUPABASE_ANON_KEY = options.supabaseAnonKey;
    if (options.supabaseServiceRoleKey) process.env.SUPABASE_SERVICE_ROLE_KEY = options.supabaseServiceRoleKey;

    this.root = options.root || process.cwd();

    const hasSupabaseCredentials = options.supabaseUrl &&
      (options.supabaseAnonKey || options.supabaseServiceRoleKey);
    if (hasSupabaseCredentials) {
      this.supabaseBackend = new SupabaseStorageBackend();
    }
  }

  private get fleetFilePath(): string {
    return path.join(this.root, '.lettactl', 'fleet.yaml');
  }

  private writeFleetFile(config: FleetConfig): void {
    const dir = path.dirname(this.fleetFilePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.fleetFilePath, yaml.dump(config, { lineWidth: -1, noRefs: true }));
  }

  private removeAgentFromFleetFile(agentName: string): void {
    if (!fs.existsSync(this.fleetFilePath)) return;
    const config = yaml.load(fs.readFileSync(this.fleetFilePath, 'utf8')) as FleetConfig;
    config.agents = config.agents.filter(a => a.name !== agentName);
    if (config.agents.length === 0) {
      fs.unlinkSync(this.fleetFilePath);
    } else {
      this.writeFleetFile(config);
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
          root: this.root
        },
        {
          parent: {
            opts: () => ({ verbose: false })
          }
        }
      );

      if (!options?.dryRun) {
        this.writeFleetFile(config);
      }
    } finally {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    }
  }

  async deleteAgent(agentName: string): Promise<void> {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);
    const { agent, allAgents } = await resolver.findAgentByName(agentName);
    await deleteAgentWithCleanup(client, resolver, agent, allAgents, false);
    this.removeAgentFromFleetFile(agentName);
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

  /**
   * Send a message to an agent (async - returns immediately with run ID)
   */
  async sendMessage(agentId: string, message: string, options?: {
    onComplete?: (run: Run) => void;
    onError?: (error: Error) => void;
    timeout?: number;
  }): Promise<Run> {
    const client = new LettaClientWrapper();
    const run = await client.createAsyncMessage(agentId, {
      messages: [{ role: 'user', content: message }]
    });

    if (options?.onComplete) {
      this.waitForRun(run.id, { timeout: options.timeout })
        .then(options.onComplete)
        .catch(options.onError || ((err) => console.error('Run failed:', err)));
    }

    return run as Run;
  }

  /**
   * Get current run status (use with isRunTerminal/getEffectiveRunStatus for polling)
   */
  async getRun(runId: string): Promise<Run> {
    const client = new LettaClientWrapper();
    return await client.getRun(runId) as Run;
  }

  /**
   * Wait for a run to complete (uses robust stop_reason detection)
   */
  async waitForRun(runId: string, options?: { timeout?: number }): Promise<Run> {
    const client = new LettaClientWrapper();
    const pollInterval = 3000;
    const startTime = Date.now();
    const timeoutMs = options?.timeout ? options.timeout * 1000 : 5 * 60 * 1000;

    while (true) {
      const run = await client.getRun(runId) as Run;

      if (isRunTerminal(run)) {
        return run;
      }

      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout waiting for run ${runId}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
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
export { Run } from './types/run';
export { isRunTerminal, getEffectiveRunStatus } from './lib/messaging/run-utils';