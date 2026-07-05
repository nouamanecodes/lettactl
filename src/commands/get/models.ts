import { LettaClientWrapper } from '../../lib/client/letta-client';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { GetOptions } from './types';

function formatModelTable(models: any[]): string {
  const handleW = Math.min(Math.max(...models.map(m => String(m.handle || '').length), 6), 72) + 1;
  const providerW = Math.max(...models.map(m => String(m.provider_type || '').length), 8) + 1;
  const tierW = Math.max(...models.map(m => String(m.tier || '').length), 4) + 1;
  const contextW = Math.max(...models.map(m => String(m.context_window || '').length), 7) + 1;
  const header =
    'HANDLE'.padEnd(handleW) + '  ' +
    'PROVIDER'.padEnd(providerW) + '  ' +
    'TIER'.padEnd(tierW) + '  ' +
    'CONTEXT'.padEnd(contextW);
  const lines = [header, '-'.repeat(header.length)];

  for (const model of models) {
    const handle = String(model.handle || '');
    lines.push(
      (handle.length > handleW ? handle.slice(0, handleW - 2) + '…' : handle).padEnd(handleW) + '  ' +
      String(model.provider_type || '').padEnd(providerW) + '  ' +
      String(model.tier || '').padEnd(tierW) + '  ' +
      String(model.context_window || '').padEnd(contextW),
    );
  }

  return lines.join('\n');
}

export async function getModels(
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean,
) {
  const spinner = createSpinner('Loading models...', spinnerEnabled).start();

  try {
    const query = options?.query?.toLowerCase().trim();
    let models = await client.listModels();
    if (query) {
      models = models.filter((model: any) => JSON.stringify({
        handle: model.handle,
        name: model.name,
        display_name: model.display_name,
        provider_type: model.provider_type,
        provider_name: model.provider_name,
        provider_category: model.provider_category,
      }).toLowerCase().includes(query));
    }
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(models, options?.output)) {
      return;
    }

    if (models.length === 0) {
      output(query ? `No models found matching "${query}"` : 'No models found');
      return;
    }

    output(formatModelTable(models));
  } catch (error) {
    spinner.fail('Failed to load models');
    throw error;
  }
}
