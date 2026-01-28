import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { validateResourceType, validateRequired } from '../../lib/validators';
import { withErrorHandling } from '../../lib/error-handler';
import { getSpinnerEnabled } from '../../lib/ux/spinner';

import { SUPPORTED_RESOURCES, DescribeOptions } from './types';
import { describeAgent } from './agent';
import { describeBlock } from './block';
import { describeTool } from './tool';
import { describeFolder } from './folder';
import { describeFile } from './file';
import { describeMcpServer } from './mcp-server';

async function describeCommandImpl(resource: string, name: string, options?: DescribeOptions, command?: any) {
  const verbose = command?.parent?.opts().verbose || false;
  validateResourceType(resource, SUPPORTED_RESOURCES);

  // Normalize resource to singular form (but preserve mcp-servers as-is)
  const normalizedResource = resource === 'mcp-servers' ? 'mcp-servers' : resource.replace(/s$/, '');
  validateRequired(name, `${normalizedResource.charAt(0).toUpperCase() + normalizedResource.slice(1)} name`, `lettactl describe ${normalizedResource} <name>`);

  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  const spinnerEnabled = getSpinnerEnabled(command);

  switch (normalizedResource) {
    case 'agent':
      await describeAgent(client, resolver, name, options, spinnerEnabled, verbose);
      break;
    case 'block':
      await describeBlock(client, resolver, name, options, spinnerEnabled);
      break;
    case 'tool':
      await describeTool(client, resolver, name, options, spinnerEnabled);
      break;
    case 'folder':
      await describeFolder(client, resolver, name, options, spinnerEnabled);
      break;
    case 'file':
      await describeFile(client, resolver, name, options, spinnerEnabled);
      break;
    case 'mcp-servers':
      await describeMcpServer(client, name, options, spinnerEnabled);
      break;
  }
}

export default withErrorHandling('Describe command', describeCommandImpl);
