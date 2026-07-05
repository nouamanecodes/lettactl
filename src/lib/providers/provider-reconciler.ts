import type { FleetConfig, ProviderConfig, SecretConfig } from '../../types/fleet-config';
import type { LettaClientWrapper } from '../client/letta-client';

export interface ProviderApplyResult {
  name: string;
  id?: string;
  status: 'created' | 'updated' | 'deleted' | 'unchanged' | 'dry-run' | 'failed';
  refreshStatus?: 'refreshed' | 'skipped' | 'dry-run' | 'failed';
  error?: string;
}

export function resolveProviderPayload(provider: ProviderConfig): Record<string, any> {
  const payload: Record<string, any> = {
    name: provider.name,
    provider_type: provider.provider_type,
    api_key: resolveSecretField(`${provider.name}.api_key`, provider.api_key),
  };

  if (provider.access_key) {
    payload.access_key = resolveSecretField(`${provider.name}.access_key`, provider.access_key);
  }
  if (provider.region) {
    payload.region = provider.region;
  }
  if (provider.profile) {
    payload.profile = provider.profile;
  }

  return payload;
}

export async function applyProviders(
  client: LettaClientWrapper,
  config: FleetConfig,
  dryRun: boolean,
): Promise<ProviderApplyResult[]> {
  const desiredProviders = config.providers || [];
  if (desiredProviders.length === 0 && !config.prune_missing_providers) return [];

  const existingProviders = await client.listProviders();
  const byName = new Map<string, any>(existingProviders.map((provider: any) => [provider.name, provider]));
  const desiredNames = new Set(desiredProviders.map(provider => provider.name));
  const results: ProviderApplyResult[] = [];

  for (const provider of desiredProviders) {
    const existing = byName.get(provider.name);
    const changed = !existing ||
      existing.provider_type !== provider.provider_type ||
      (provider.region !== undefined && existing.region !== provider.region) ||
      (provider.profile !== undefined && existing.profile !== provider.profile);

    if (dryRun) {
      results.push({
        name: provider.name,
        id: existing?.id,
        status: changed ? 'dry-run' : 'unchanged',
        refreshStatus: provider.refresh === false ? 'skipped' : 'dry-run',
      });
      continue;
    }

    try {
      const payload = resolveProviderPayload(provider);
      const saved: any = existing
        ? await client.updateProvider(existing.id, payload)
        : await client.createProvider(payload);

      const result: ProviderApplyResult = {
        name: provider.name,
        id: saved?.id || existing?.id,
        status: existing ? 'updated' : 'created',
        refreshStatus: 'skipped',
      };

      if (provider.refresh !== false && result.id) {
        try {
          await client.refreshProvider(result.id);
          result.refreshStatus = 'refreshed';
        } catch (err) {
          result.refreshStatus = 'failed';
          result.error = `refresh failed: ${(err as Error).message}`;
        }
      }

      results.push(result);
    } catch (err) {
      results.push({
        name: provider.name,
        id: existing?.id,
        status: 'failed',
        error: (err as Error).message,
      });
    }
  }

  if (config.prune_missing_providers) {
    for (const existing of existingProviders) {
      if (!existing?.name || desiredNames.has(existing.name)) continue;

      if (dryRun) {
        results.push({
          name: existing.name,
          id: existing.id,
          status: 'dry-run',
          refreshStatus: 'skipped',
        });
        continue;
      }

      try {
        await client.deleteProvider(existing.id);
        results.push({
          name: existing.name,
          id: existing.id,
          status: 'deleted',
          refreshStatus: 'skipped',
        });
      } catch (err) {
        results.push({
          name: existing.name,
          id: existing.id,
          status: 'failed',
          error: (err as Error).message,
        });
      }
    }
  }

  return results;
}

function resolveSecretField(label: string, config: SecretConfig): string {
  if ('value' in config && config.value !== undefined) {
    return config.value;
  }

  const value = process.env[config.from_env];
  if (value === undefined || value === '') {
    throw new Error(`Provider field ${label} references missing or empty environment variable ${config.from_env}.`);
  }
  return value;
}
