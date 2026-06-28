import {
  computeSecretPlan,
  normalizeSecretName,
  resolveAgentSecrets,
  validateSecretConfigMap,
} from '../../../src/lib/secrets-reconciler';

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

  it('rejects globally scoped agent identity secrets', () => {
    expect(() =>
      validateSecretConfigMap(
        'global-secrets',
        { ADSPECTRE_AGENT_TOKEN: { from_env: 'AGENT_TOKEN' } },
        { global: true },
      ),
    ).toThrow('ADSPECTRE_AGENT_TOKEN must be configured per-agent');
  });

  it('resolves global and agent secrets with agent overrides', () => {
    const resolved = resolveAgentSecrets(
      {
        agents: [],
        'global-secrets': {
          ADSPECTRE_API_BASE: { value: 'https://app.adspectre.ai' },
          SHARED_VALUE: { value: 'global' },
        },
      },
      {
        name: 'agent',
        description: 'd',
        system_prompt: { value: 'p' },
        llm_config: { model: 'm', context_window: 1000 },
        secrets: {
          ADSPECTRE_AGENT_TOKEN: { from_env: 'AGENT_TOKEN' },
          SHARED_VALUE: { value: 'agent' },
        },
      },
    );

    expect(resolved).toEqual({
      ADSPECTRE_API_BASE: 'https://app.adspectre.ai',
      ADSPECTRE_AGENT_TOKEN: 'agent-token',
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
          ADSPECTRE_AGENT_TOKEN: { from_env: 'AGENT_TOKEN', preserve_existing: true },
        },
      },
      { ADSPECTRE_AGENT_TOKEN: 'existing-token' },
    );

    expect(resolved).toEqual({
      ADSPECTRE_AGENT_TOKEN: 'existing-token',
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
            ADSPECTRE_AGENT_TOKEN: { from_env: 'AGENT_TOKEN' },
          },
        },
        { ADSPECTRE_AGENT_TOKEN: 'existing-token' },
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
});
