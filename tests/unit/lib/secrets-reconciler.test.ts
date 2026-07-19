import {
  applySecretPlan,
  computeSecretPlan,
  normalizeSecretName,
  resolveAgentSecrets,
  validateSecretConfigMap,
} from '../../../src/lib/secrets-reconciler';
import { NO_PRUNE, parsePruneTargets } from '../../../src/lib/prune-targets';

describe('secrets-reconciler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, AGENT_TOKEN: 'agent-token' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('normalizes and validates secret names', () => {
    expect(normalizeSecretName('foo_bar')).toBe('FOO_BAR');
    expect(() => normalizeSecretName('bad-name')).toThrow('Invalid secret name');
  });

  it('resolves global and agent secrets with agent overrides', () => {
    const resolved = resolveAgentSecrets(
      {
        agents: [],
        'global-secrets': {
          API_BASE_URL: { value: 'https://api.example.com' },
          SHARED_VALUE: { value: 'global' },
        },
      },
      {
        name: 'agent',
        description: 'd',
        system_prompt: { value: 'p' },
        llm_config: { model: 'm', context_window: 1000 },
        secrets: {
          RUNTIME_AGENT_TOKEN: { from_env: 'AGENT_TOKEN' },
          SHARED_VALUE: { value: 'agent' },
        },
      },
    );

    expect(resolved).toEqual({
      API_BASE_URL: 'https://api.example.com',
      RUNTIME_AGENT_TOKEN: 'agent-token',
      SHARED_VALUE: 'agent',
    });
  });

  it('can preserve an existing secret when from_env is missing and explicitly allowed', () => {
    delete process.env.AGENT_TOKEN;

    const resolved = resolveAgentSecrets(
      {
        agents: [],
      },
      {
        name: 'agent',
        description: 'd',
        system_prompt: { value: 'p' },
        llm_config: { model: 'm', context_window: 1000 },
        secrets: {
          RUNTIME_AGENT_TOKEN: { from_env: 'AGENT_TOKEN', preserve_existing: true },
        },
      },
      { RUNTIME_AGENT_TOKEN: 'existing-token' },
    );

    expect(resolved).toEqual({
      RUNTIME_AGENT_TOKEN: 'existing-token',
    });
  });

  it('still rejects missing from_env when preserve_existing is absent', () => {
    delete process.env.AGENT_TOKEN;

    expect(() =>
      resolveAgentSecrets(
        { agents: [] },
        {
          name: 'agent',
          description: 'd',
          system_prompt: { value: 'p' },
          llm_config: { model: 'm', context_window: 1000 },
          secrets: {
            RUNTIME_AGENT_TOKEN: { from_env: 'AGENT_TOKEN' },
          },
        },
        { RUNTIME_AGENT_TOKEN: 'existing-token' },
      ),
    ).toThrow('missing or empty environment variable');
  });

  it('computes add/update secret drift without removing undeclared secrets', () => {
    const plan = computeSecretPlan(
      'agent-1',
      { A: 'new', B: 'same' },
      { A: 'old', B: 'same', UNMANAGED: 'keep' },
    );

    expect(plan.kind).toBe('sync');
    expect(plan.diff).toEqual({
      toAdd: [],
      toUpdate: ['A'],
      toRemove: [],
    });
  });

  it('returns no-op when managed secrets match', () => {
    const plan = computeSecretPlan('agent-1', { A: 'same' }, { A: 'same', OTHER: 'keep' });
    expect(plan.kind).toBe('no-op');
  });

  it('removes undeclared secrets when pruning', () => {
    const plan = computeSecretPlan('agent-1', { A: 'same' }, { A: 'same', ORPHAN: 'stale' }, true);

    expect(plan.kind).toBe('sync');
    expect(plan.diff.toRemove).toEqual(['ORPHAN']);
  });

  it('never prunes secrets listed in preserve_secrets', () => {
    const plan = computeSecretPlan(
      'agent-1',
      { A: 'same' },
      { A: 'same', RUNTIME_AGENT_TOKEN: 'runtime-injected', ORPHAN: 'stale' },
      true,
      ['RUNTIME_AGENT_TOKEN'],
    );

    expect(plan.diff.toRemove).toEqual(['ORPHAN']);
  });

  it('applies the merged set minus pruned keys', async () => {
    const updateAgentSecrets = jest.fn().mockResolvedValue(undefined);
    const plan = computeSecretPlan('agent-1', { A: 'new' }, { A: 'old', ORPHAN: 'stale' }, true);

    const result = await applySecretPlan({ updateAgentSecrets } as any, plan, false);

    expect(result.status).toBe('applied');
    // The API replaces the whole set, so the payload IS the post-prune state.
    expect(updateAgentSecrets).toHaveBeenCalledWith('agent-1', { A: 'new' });
  });

  it('preserves undeclared secrets when not pruning', async () => {
    const updateAgentSecrets = jest.fn().mockResolvedValue(undefined);
    const plan = computeSecretPlan('agent-1', { A: 'new' }, { A: 'old', UNMANAGED: 'keep' });

    await applySecretPlan({ updateAgentSecrets } as any, plan, false);

    expect(updateAgentSecrets).toHaveBeenCalledWith('agent-1', { A: 'new', UNMANAGED: 'keep' });
  });
});

describe('parsePruneTargets', () => {
  it('defaults to pruning nothing', () => {
    expect(parsePruneTargets(undefined)).toEqual(NO_PRUNE);
  });

  it('parses a comma-separated list', () => {
    expect(parsePruneTargets('secrets,tools')).toEqual({
      blocks: false, tools: true, secrets: true, agents: false,
    });
  });

  it('expands all', () => {
    expect(parsePruneTargets('all')).toEqual({
      blocks: true, tools: true, secrets: true, agents: true,
    });
  });

  it('rejects unknown and empty targets rather than silently pruning nothing', () => {
    expect(() => parsePruneTargets('sekrets')).toThrow('Unknown --prune target');
    expect(() => parsePruneTargets('')).toThrow('requires at least one target');
  });
});
