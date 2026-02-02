import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { ResourceClassifier } from '../../lib/resources/resource-classifier';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { output, warn } from '../../lib/shared/logger';

export async function deleteAgentWithCleanup(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  agent: any,
  allAgents: any[],
  verbose: boolean = false
) {
  const classifier = new ResourceClassifier(client);

  // Get agent details to find attached folders and blocks
  const agentDetails = await resolver.getAgentWithDetails(agent.id);

  // Delete agent-attached memory blocks first (custom blocks attached to this specific agent)
  const agentAttachedBlocks = (agentDetails as any).blocks || [];
  if (agentAttachedBlocks.length > 0) {
    if (verbose) output(`Checking attached memory blocks...`);
    for (const block of agentAttachedBlocks) {
      // Check if this is a shared block
      const isShared = classifier.isSharedBlock(block);
      if (isShared) {
        if (verbose) output(`  Keeping shared block: ${block.label || block.id}`);
        continue;
      }

      // Check if this block is used by other agents
      const blockInUse = await classifier.isBlockUsedByOtherAgents(block.id, agent.id, allAgents);

      if (!blockInUse) {
        if (verbose) output(`  Deleting agent-specific block: ${block.label || block.id}`);
        try {
          await client.deleteBlock(block.id);
          if (verbose) output(`  Block deleted`);
        } catch (err: any) {
          warn(`  Could not delete block: ${err.message}`);
        }
      } else {
        if (verbose) output(`  Keeping block used by other agents: ${block.label || block.id}`);
      }
    }
  }

  // Delete attached folders if they're not shared
  const folders = (agentDetails as any).folders;
  if (folders) {
    if (verbose) output(`Checking attached folders...`);
    for (const folder of folders) {
      // Check if folder is shared or used by other agents
      const isShared = classifier.isSharedFolder(folder);
      const usedByOthers = await classifier.isFolderUsedByOtherAgents(folder.id, agent.id, allAgents);

      if (isShared) {
        if (verbose) output(`  Keeping shared folder: ${folder.name || folder.id}`);
      } else if (!usedByOthers) {
        if (verbose) output(`  Deleting agent-specific folder: ${folder.name || folder.id}`);
        try {
          await client.deleteFolder(folder.id);
          if (verbose) output(`  Folder deleted`);
        } catch (err: any) {
          warn(`  Could not delete folder: ${err.message}`);
        }
      } else {
        if (verbose) output(`  Keeping folder used by other agents: ${folder.name || folder.id}`);
      }
    }
  }

  // Delete the agent
  await client.deleteAgent(agent.id);

  // Clean up any remaining orphaned memory blocks by name pattern (fallback)
  if (verbose) output(`Cleaning up orphaned memory blocks...`);
  try {
    const blocks = await client.listBlocks();
    const blockList = normalizeResponse(blocks);
    const agentSpecificBlocks = classifier.getAgentSpecificBlocks(blockList, agent.name);

    for (const block of agentSpecificBlocks) {
      // Check if this block is still attached to any remaining agents
      const blockInUse = await classifier.isBlockUsedByOtherAgents(block.id, agent.id, allAgents);

      if (!blockInUse) {
        if (verbose) output(`  Deleting orphaned block: ${block.label}`);
        try {
          await client.deleteBlock(block.id);
          if (verbose) output(`  Block deleted`);
        } catch (err: any) {
          warn(`  Could not delete block: ${err.message}`);
        }
      }
    }
  } catch (err: any) {
    warn(`  Could not clean up blocks: ${err.message}`);
  }
}
