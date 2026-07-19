import type { AgentConfig, FleetConfig, SecretConfig } from '../types/fleet-config';
import type { LettaClientWrapper } from './client/letta-client';

export type SecretActionKind = 'no-op' | 'sync';

export interface SecretDiff {
  toAdd: string[];
  toUpdate: string[];
  toRemove: string[];
}

export interface SecretPlan {
  kind: SecretActionKind;
  agentId: string;
  desired: Record<string, string>;
  current: Record<string, string>;
  diff: SecretDiff;
}

export interface SecretApplyResult {
  kind: SecretActionKind;
  agentId: string;
  status: 'noop' | 'dry-run' | 'applied' | 'failed';
  diff: SecretDiff;
  error?: string;
}

const SECRET_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

export function normalizeSecretName(raw: string): string {
  const name = raw.toUpperCase();
  if (!SECRET_NAME_RE.test(name)) {
    throw new Error(`Invalid secret name: ${raw}. Use ALL_CAPS_WITH_UNDERSCORES.`);
  }
  return name;
}

export function resolveAgentSecrets(
  config: FleetConfig,
  agent: AgentConfig,
  current: Record<string, string> = {},
): Record<string, string> {
  const globalSecrets = config['global-secrets'] || {};
  const agentSecrets = agent.secrets || {};
  const merged = { ...globalSecrets, ...agentSecrets };
  const out: Record<string, string> = {};

  for (const [rawName, secretConfig] of Object.entries(merged)) {
    const name = normalizeSecretName(rawName);
    out[name] = resolveSecretValue(name, secretConfig, current);
  }

  return out;
}

export function validateSecretConfigMap(
  label: string,
  secrets: any,
  opts: { global?: boolean } = {},
): void {
  if (secrets === undefined) return;
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) {
    throw new Error(`${label} must be an object mapping SECRET_NAME to { from_env } or { value }.`);
  }
  for (const [rawName, config] of Object.entries(secrets)) {
    normalizeSecretName(rawName);
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`${label}.${rawName} must be an object.`);
    }
    const hasFromEnv = typeof (config as any).from_env === 'string';
    const hasValue = typeof (config as any).value === 'string';
    if (hasFromEnv === hasValue) {
      throw new Error(`${label}.${rawName} must set exactly one of from_env or value.`);
    }
    if (hasFromEnv && (config as any).from_env.trim() === '') {
      throw new Error(`${label}.${rawName}.from_env must be a non-empty string.`);
    }
    if ((config as any).preserve_existing !== undefined && typeof (config as any).preserve_existing !== 'boolean') {
      throw new Error(`${label}.${rawName}.preserve_existing must be a boolean if set.`);
    }
    if (hasValue && (config as any).preserve_existing !== undefined) {
      throw new Error(`${label}.${rawName}.preserve_existing is only valid with from_env.`);
    }
    if (hasValue && (config as any).value.length === 0) {
      throw new Error(`${label}.${rawName}.value must be a non-empty string.`);
    }
  }
}

export function computeSecretPlan(
  agentId: string,
  desired: Record<string, string>,
  current: Record<string, string>,
  prune: boolean = false,
  preserve: string[] = [],
): SecretPlan {
  const preserved = new Set(preserve.map((n) => n.toUpperCase()));
  const toAdd: string[] = [];
  const toUpdate: string[] = [];
  const toRemove: string[] = [];

  for (const [name, value] of Object.entries(desired)) {
    if (!(name in current)) toAdd.push(name);
    else if (current[name] !== value) toUpdate.push(name);
  }

  // Without --prune, lettactl only manages declared secrets and preserves undeclared ones.
  // With it, undeclared secrets are removed — except those listed in preserve_secrets,
  // which a runtime injects rather than config declaring, so pruning would wipe them.
  if (prune) {
    for (const name of Object.keys(current)) {
      if (!(name in desired) && !preserved.has(name)) toRemove.push(name);
    }
  }

  const diff = {
    toAdd: toAdd.sort(),
    toUpdate: toUpdate.sort(),
    toRemove: toRemove.sort(),
  };
  const changed = diff.toAdd.length + diff.toUpdate.length + diff.toRemove.length;
  return {
    kind: changed > 0 ? 'sync' : 'no-op',
    agentId,
    desired,
    current,
    diff,
  };
}

export async function planAgentSecrets(
  client: LettaClientWrapper,
  config: FleetConfig,
  agent: AgentConfig,
  agentId: string,
  prune: boolean = false,
): Promise<SecretPlan | null> {
  if (!config['global-secrets'] && !agent.secrets) return null;
  const current = await client.getAgentSecrets(agentId);
  const desired = resolveAgentSecrets(config, agent, current);
  return computeSecretPlan(agentId, desired, current, prune, config.preserve_secrets || []);
}

export async function applySecretPlan(
  client: LettaClientWrapper,
  plan: SecretPlan,
  dryRun: boolean,
): Promise<SecretApplyResult> {
  if (plan.kind === 'no-op') {
    return { kind: 'no-op', agentId: plan.agentId, status: 'noop', diff: plan.diff };
  }
  if (dryRun) {
    return { kind: 'sync', agentId: plan.agentId, status: 'dry-run', diff: plan.diff };
  }
  try {
    // The API replaces the whole secret set, so the merge is what preserves undeclared
    // secrets. Dropping the toRemove keys from it is what makes --prune delete them.
    const next = { ...plan.current, ...plan.desired };
    for (const name of plan.diff.toRemove) delete next[name];
    await client.updateAgentSecrets(plan.agentId, next);
    return { kind: 'sync', agentId: plan.agentId, status: 'applied', diff: plan.diff };
  } catch (err) {
    return {
      kind: 'sync',
      agentId: plan.agentId,
      status: 'failed',
      diff: plan.diff,
      error: (err as Error).message,
    };
  }
}

function resolveSecretValue(
  name: string,
  config: SecretConfig,
  current: Record<string, string>,
): string {
  if ('value' in config && config.value !== undefined) {
    return config.value;
  }
  const envName = config.from_env;
  const value = process.env[envName];
  if (value === undefined || value === '') {
    if (config.preserve_existing && current[name]) {
      return current[name];
    }
    throw new Error(`Secret ${name} references missing or empty environment variable ${envName}.`);
  }
  return value;
}
