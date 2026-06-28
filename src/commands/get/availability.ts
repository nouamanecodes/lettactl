import { LettaClientWrapper } from '../../lib/client/letta-client';

export async function shouldPrintNotAvailableForAgent(
  client: LettaClientWrapper,
  agentId: string,
  resourceList: any[],
  outputFormat?: string
): Promise<boolean> {
  if (resourceList.length > 0 || outputFormat === 'json') return false;

  return await isAgentResourceSurfaceUnavailable(client, agentId);
}

export async function isAgentResourceSurfaceUnavailable(
  client: LettaClientWrapper,
  agentId: string
): Promise<boolean> {
  const agent: any = await client.getAgent(agentId);
  const metadata = agent?.metadata || {};
  const tags = Array.isArray(agent?.tags) ? agent.tags : [];
  const blocks = normalizeList(agent?.blocks || agent?.memory?.blocks);
  const tools = normalizeList(agent?.tools);

  const memfsEnabled = metadata['lettactl.memfs.enabled'] === true || tags.includes('git-memory-enabled');
  const isV1Agent = agent?.agent_type === 'letta_v1_agent' || agent?.agentType === 'letta_v1_agent';
  const hasOldPrimitives = blocks.length > 0 || tools.length > 0;

  return memfsEnabled || !isV1Agent || !hasOldPrimitives;
}

function normalizeList(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}
