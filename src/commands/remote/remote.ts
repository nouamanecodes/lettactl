import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import { output, error } from '../../lib/shared/logger';
import { shouldUseFancyUx } from '../../lib/ux/box';
import { LETTA_PURPLE, STATUS } from '../../lib/ux/constants';

const purple = chalk.hex(LETTA_PURPLE);

export interface RemoteConfig {
  name: string;
  base_url: string;
  api_key?: string;
}

interface RemoteStore {
  remotes: RemoteConfig[];
  active?: string;
}

function getConfigDir(): string {
  return path.join(os.homedir(), '.lettactl');
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'remotes.json');
}

function loadStore(): RemoteStore {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { remotes: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { remotes: [] };
  }
}

function saveStore(store: RemoteStore): void {
  const dir = getConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(getConfigPath(), JSON.stringify(store, null, 2) + '\n');
}

export async function remoteAddCommand(
  name: string,
  url: string,
  options: { apiKey?: string },
  _command: any
): Promise<void> {
  const store = loadStore();

  if (store.remotes.some(r => r.name === name)) {
    error(`Remote "${name}" already exists. Use "lettactl remote remove ${name}" first.`);
    process.exit(1);
  }

  // Normalize URL — strip trailing slash
  const baseUrl = url.replace(/\/+$/, '');

  const remote: RemoteConfig = { name, base_url: baseUrl };
  if (options.apiKey) {
    remote.api_key = options.apiKey;
  }

  store.remotes.push(remote);

  // Auto-activate if first remote
  if (store.remotes.length === 1) {
    store.active = name;
  }

  saveStore(store);

  const fancy = shouldUseFancyUx();
  output(fancy
    ? `${STATUS.ok} Remote ${chalk.white(name)} added (${chalk.dim(baseUrl)})`
    : `[OK] Remote ${name} added (${baseUrl})`
  );

  if (store.active === name) {
    output(fancy
      ? `${STATUS.info} Auto-activated (first remote)`
      : `Auto-activated (first remote)`
    );
  }
}

export async function remoteRemoveCommand(name: string): Promise<void> {
  const store = loadStore();
  const idx = store.remotes.findIndex(r => r.name === name);

  if (idx === -1) {
    error(`Remote "${name}" not found.`);
    process.exit(1);
  }

  store.remotes.splice(idx, 1);
  if (store.active === name) {
    store.active = store.remotes[0]?.name;
  }

  saveStore(store);

  const fancy = shouldUseFancyUx();
  output(fancy
    ? `${STATUS.ok} Remote ${chalk.white(name)} removed`
    : `[OK] Remote ${name} removed`
  );
}

export async function remoteUseCommand(name: string): Promise<void> {
  const store = loadStore();
  const remote = store.remotes.find(r => r.name === name);

  if (!remote) {
    error(`Remote "${name}" not found. Run "lettactl remote list" to see available remotes.`);
    process.exit(1);
  }

  store.active = name;
  saveStore(store);

  const fancy = shouldUseFancyUx();
  output(fancy
    ? `${STATUS.ok} Now using remote ${chalk.white(name)} (${chalk.dim(remote.base_url)})`
    : `[OK] Now using remote ${name} (${remote.base_url})`
  );

  // Show shell hint for current session
  output('');
  output(fancy
    ? chalk.dim('To apply in current shell:')
    : 'To apply in current shell:'
  );
  output(`  eval $(lettactl remote env)`);
}

export async function remoteListCommand(): Promise<void> {
  const store = loadStore();
  const fancy = shouldUseFancyUx();

  if (store.remotes.length === 0) {
    output(fancy
      ? chalk.dim('No remotes configured. Add one with:')
      : 'No remotes configured. Add one with:'
    );
    output('  lettactl remote add <name> <url>');
    return;
  }

  if (fancy) {
    output(purple('Letta Remotes'));
    output(purple('─'.repeat(14)) + '\n');
  }

  for (const remote of store.remotes) {
    const isActive = remote.name === store.active;
    const marker = isActive ? '*' : ' ';
    const hasKey = remote.api_key ? 'key: ✓' : 'key: -';

    if (fancy) {
      const nameStr = isActive
        ? chalk.green(`* ${remote.name}`)
        : `  ${remote.name}`;
      output(`${nameStr}  ${chalk.dim(remote.base_url)}  ${chalk.dim(`(${hasKey})`)}`);
    } else {
      output(`${marker} ${remote.name}\t${remote.base_url}\t(${hasKey})`);
    }
  }
}

export async function remoteEnvCommand(): Promise<void> {
  const store = loadStore();

  if (!store.active) {
    // Write to stderr so eval doesn't capture it
    process.stderr.write('No active remote. Run "lettactl remote use <name>" first.\n');
    process.exit(1);
  }

  const remote = store.remotes.find(r => r.name === store.active);
  if (!remote) {
    process.stderr.write(`Active remote "${store.active}" not found in config.\n`);
    process.exit(1);
  }

  // Output shell-eval-safe export statements to stdout
  console.log(`export LETTA_BASE_URL="${remote.base_url}"`);
  if (remote.api_key) {
    console.log(`export LETTA_API_KEY="${remote.api_key}"`);
  } else {
    console.log('unset LETTA_API_KEY');
  }
}

export async function remoteShowCommand(name: string): Promise<void> {
  const store = loadStore();
  const remote = store.remotes.find(r => r.name === name);

  if (!remote) {
    error(`Remote "${name}" not found.`);
    process.exit(1);
  }

  const fancy = shouldUseFancyUx();
  const isActive = remote.name === store.active;

  if (fancy) {
    output(purple(`Remote: ${remote.name}`) + (isActive ? chalk.green(' (active)') : ''));
    output(purple('─'.repeat(20)));
    output(`${chalk.dim('URL:')}     ${remote.base_url}`);
    output(`${chalk.dim('API Key:')} ${remote.api_key ? chalk.dim(remote.api_key.substring(0, 8) + '...') : chalk.dim('-')}`);
  } else {
    output(`Remote: ${remote.name}${isActive ? ' (active)' : ''}`);
    output(`URL:     ${remote.base_url}`);
    output(`API Key: ${remote.api_key ? remote.api_key.substring(0, 8) + '...' : '-'}`);
  }
}

/**
 * Load active remote into environment variables (called during CLI init).
 * Only sets env vars if they aren't already set — explicit env vars always win.
 */
export function loadActiveRemote(): void {
  if (process.env.LETTA_BASE_URL) return; // Explicit env var takes precedence

  const store = loadStore();
  if (!store.active) return;

  const remote = store.remotes.find(r => r.name === store.active);
  if (!remote) return;

  process.env.LETTA_BASE_URL = remote.base_url;
  if (remote.api_key && !process.env.LETTA_API_KEY) {
    process.env.LETTA_API_KEY = remote.api_key;
  }
}
