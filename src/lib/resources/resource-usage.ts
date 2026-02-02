import { LettaClientWrapper } from '../client/letta-client';
import { AgentResolver } from '../client/agent-resolver';

/**
 * Normalizes API responses to arrays (handles both array and {items: []} formats)
 */
export function normalizeToArray(response: any): any[] {
  return Array.isArray(response) ? response : (response as any).items || [];
}

/**
 * Computes how many agents use each resource
 */
export async function computeAgentCounts(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  resourceType: 'blocks' | 'tools' | 'folders' | 'archives',
  resourceIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  resourceIds.forEach(id => counts.set(id, 0));

  const allAgents = await resolver.getAllAgents();

  for (const agent of allAgents) {
    const agentResources = await getAgentResources(client, agent.id, resourceType);
    for (const resource of agentResources) {
      if (counts.has(resource.id)) {
        counts.set(resource.id, (counts.get(resource.id) || 0) + 1);
      }
    }
  }

  return counts;
}

/**
 * Finds all agents that have a specific resource attached
 */
export async function findAttachedAgents(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  resourceType: 'blocks' | 'tools' | 'folders' | 'archives',
  resourceId: string
): Promise<any[]> {
  const allAgents = await resolver.getAllAgents();
  const attachedAgents: any[] = [];

  for (const agent of allAgents) {
    const agentResources = await getAgentResources(client, agent.id, resourceType);
    if (agentResources.some((r: any) => r.id === resourceId)) {
      attachedAgents.push(agent);
    }
  }

  return attachedAgents;
}

/**
 * Gets resources attached to an agent by type
 */
async function getAgentResources(
  client: LettaClientWrapper,
  agentId: string,
  resourceType: 'blocks' | 'tools' | 'folders' | 'archives'
): Promise<any[]> {
  let response: any;

  switch (resourceType) {
    case 'blocks':
      response = await client.listAgentBlocks(agentId);
      break;
    case 'tools':
      response = await client.listAgentTools(agentId);
      break;
    case 'folders':
      response = await client.listAgentFolders(agentId);
      break;
    case 'archives':
      response = await client.listAgentArchives(agentId);
      break;
  }

  return normalizeToArray(response);
}
