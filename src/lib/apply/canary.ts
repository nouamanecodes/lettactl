import { LettaClientWrapper } from '../client/letta-client';
import { AgentResolver } from '../client/agent-resolver';
import { deleteAgentWithCleanup } from '../../commands/delete/agent';
import { createSpinner } from '../ux/spinner';
import { log, warn, output } from '../shared/logger';

export const DEFAULT_CANARY_PREFIX = 'CANARY-';

export function canaryName(agentName: string, prefix: string): string {
  return `${prefix}${agentName}`;
}

export function productionName(canaryAgentName: string, prefix: string): string {
  if (canaryAgentName.startsWith(prefix)) {
    return canaryAgentName.slice(prefix.length);
  }
  return canaryAgentName;
}

export function isCanaryName(agentName: string, prefix: string): boolean {
  return agentName.startsWith(prefix);
}

export function buildCanaryMetadata(originalName: string, prefix: string): Record<string, any> {
  return {
    'lettactl.canary': true,
    'lettactl.canary.productionName': originalName,
    'lettactl.canary.prefix': prefix,
    'lettactl.canary.createdAt': new Date().toISOString(),
  };
}

export function rewriteAgentNamesForCanary(
  agents: any[],
  prefix: string
): { rewrittenAgents: any[]; nameMap: Map<string, string> } {
  const nameMap = new Map<string, string>();
  const rewrittenAgents = agents.map(agent => {
    const cName = canaryName(agent.name, prefix);
    nameMap.set(agent.name, cName);
    return {
      ...agent,
      name: cName,
      _originalName: agent.name,
    };
  });
  return { rewrittenAgents, nameMap };
}

/**
 * Isolate folders for a canary deploy by prefixing every folder name.
 *
 * Folders are shared across agents (one source object referenced by name). A
 * canary that introduces a new folder file would otherwise either attach the
 * production folder as-is (missing the new file — a fidelity gap) or mutate the
 * shared production folder (leaking the change before promotion). Prefixing the
 * names makes `processFolders` create fresh `CANARY-<folder>` copies with the
 * desired file set; `cleanupCanaryAgents` deletes them on promote/cleanup.
 *
 * Must run AFTER the agent-name rewrite and BEFORE folder resolution (collect +
 * processFolders). Promote does not call this, so it operates on real folders.
 *
 * Note: `open_files` resolves files by basename within attached folders, so the
 * folder-name change is invisible to the agent's runtime.
 */
export function rewriteFolderNamesForCanary(config: any, prefix: string): void {
  if (Array.isArray(config.shared_folders)) {
    config.shared_folders = config.shared_folders.map((f: any) => ({ ...f, name: `${prefix}${f.name}` }));
  }
  for (const agent of config.agents || []) {
    if (Array.isArray(agent.folders)) {
      agent.folders = agent.folders.map((f: any) => ({ ...f, name: `${prefix}${f.name}` }));
    }
  }
}

export async function cleanupCanaryAgents(
  config: any,
  prefix: string,
  client: LettaClientWrapper,
  options: { agent?: string },
  spinnerEnabled: boolean,
  verbose: boolean
): Promise<{ deleted: string[]; failed: string[] }> {
  const spinner = createSpinner('Finding canary agents...', spinnerEnabled).start();

  const resolver = new AgentResolver(client);
  const allAgents = await resolver.getAllAgents();

  let canaryAgents = allAgents.filter((a: any) => isCanaryName(a.name, prefix));

  // If --agent filter is active, scope to matching canaries
  if (options.agent) {
    canaryAgents = canaryAgents.filter((a: any) => {
      const prodName = productionName(a.name, prefix);
      return prodName.includes(options.agent!);
    });
  }

  if (canaryAgents.length === 0) {
    spinner.succeed('No canary agents found');
    return { deleted: [], failed: [] };
  }

  spinner.succeed(`Found ${canaryAgents.length} canary agent${canaryAgents.length === 1 ? '' : 's'}`);

  const deleted: string[] = [];
  const failed: string[] = [];

  for (const agent of canaryAgents) {
    try {
      await deleteAgentWithCleanup(client, resolver, agent, allAgents, verbose);
      deleted.push(agent.name);
      output(`Deleted canary: ${agent.name}`);
    } catch (err: any) {
      failed.push(agent.name);
      warn(`Failed to delete canary ${agent.name}: ${err.message}`);
    }
  }

  // Delete the isolated CANARY-<folder> copies created by rewriteFolderNamesForCanary.
  // Skip when an --agent filter is active: canary folders are shared across the
  // canary run, so a targeted cleanup must not yank a folder a sibling canary uses.
  // A full cleanup (no --agent) sweeps them.
  if (!options.agent) {
    try {
      const allFolders = await client.listFolders();
      const canaryFolders = (allFolders || []).filter((f: any) => isCanaryName(f.name, prefix));
      for (const f of canaryFolders) {
        try {
          await client.deleteFolder(f.id);
          output(`Deleted canary folder: ${f.name}`);
        } catch (err: any) {
          warn(`Failed to delete canary folder ${f.name}: ${err.message}`);
        }
      }
    } catch (err: any) {
      warn(`Failed to list folders for canary cleanup: ${err.message}`);
    }
  }

  return { deleted, failed };
}
