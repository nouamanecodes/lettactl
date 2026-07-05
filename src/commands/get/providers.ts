import { LettaClientWrapper } from '../../lib/client/letta-client';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { output } from '../../lib/shared/logger';
import { GetOptions } from './types';

function formatProviderTable(providers: any[]): string {
  const nameW = Math.max(...providers.map(p => String(p.name || '').length), 4) + 1;
  const typeW = Math.max(...providers.map(p => String(p.provider_type || '').length), 4) + 1;
  const categoryW = Math.max(...providers.map(p => String(p.provider_category || '').length), 8) + 1;
  const regionW = Math.max(...providers.map(p => String(p.region || '').length), 6) + 1;
  const idW = Math.max(...providers.map(p => String(p.id || '').length), 2) + 1;
  const header =
    'NAME'.padEnd(nameW) + '  ' +
    'TYPE'.padEnd(typeW) + '  ' +
    'CATEGORY'.padEnd(categoryW) + '  ' +
    'REGION'.padEnd(regionW) + '  ' +
    'ID'.padEnd(idW);
  const lines = [header, '-'.repeat(header.length)];

  for (const provider of providers) {
    lines.push(
      String(provider.name || '').padEnd(nameW) + '  ' +
      String(provider.provider_type || '').padEnd(typeW) + '  ' +
      String(provider.provider_category || '').padEnd(categoryW) + '  ' +
      String(provider.region || '').padEnd(regionW) + '  ' +
      String(provider.id || '').padEnd(idW),
    );
  }

  return lines.join('\n');
}

function sanitizeProviders(providers: any[]): any[] {
  return providers.map(provider => {
    const copy = { ...provider };
    delete copy.api_key_enc;
    delete copy.access_key_enc;
    if ('api_key' in copy) copy.api_key = copy.api_key ? '[redacted]' : null;
    if ('access_key' in copy) copy.access_key = copy.access_key ? '[redacted]' : null;
    return copy;
  });
}

export async function getProviders(
  client: LettaClientWrapper,
  options?: GetOptions,
  spinnerEnabled?: boolean,
) {
  const spinner = createSpinner('Loading providers...', spinnerEnabled).start();

  try {
    const providers = sanitizeProviders(await client.listProviders());
    spinner.stop();

    if (OutputFormatter.handleJsonOutput(providers, options?.output)) {
      return;
    }

    if (providers.length === 0) {
      output('No providers found');
      return;
    }

    output(formatProviderTable(providers));
  } catch (error) {
    spinner.fail('Failed to load providers');
    throw error;
  }
}
