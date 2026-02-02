import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { OutputFormatter } from '../../lib/ux/output-formatter';
import { createSpinner } from '../../lib/ux/spinner';
import { normalizeToArray } from '../../lib/resources/resource-usage';
import { displayAgentDetails, AgentDetailsData } from '../../lib/ux/display';
import { output } from '../../lib/shared/logger';
import { DescribeOptions } from './types';

export async function describeAgent(
  client: LettaClientWrapper,
  resolver: AgentResolver,
  name: string,
  options?: DescribeOptions,
  spinnerEnabled?: boolean,
  verbose?: boolean
) {
  const spinner = createSpinner(`Loading details for agent ${name}...`, spinnerEnabled).start();

  try {
    // Find agent by name
    const { agent } = await resolver.findAgentByName(name);

    // Get full agent details
    const agentDetails = await resolver.getAgentWithDetails(agent.id);

    // Get attached archives
    const archives = (agentDetails as any).archives || [];
    const archiveData = archives.map((archive: any) => ({
      name: archive.name || archive.id,
      id: archive.id,
      embedding: archive.embedding_config?.embedding_model || archive.embedding,
    }));

    // Get folders with file info
    const folders = (agentDetails as any).folders || [];
    const folderData: { name: string; id: string; fileCount: number; files: string[] }[] = [];

    for (const folder of folders) {
      try {
        const fileList = normalizeToArray(await client.listFolderFiles(folder.id));
        folderData.push({
          name: folder.name || folder.id,
          id: folder.id,
          fileCount: fileList.length,
          files: fileList.map((f: any) => f.file_name || f.original_file_name || f.name || f.id),
        });
      } catch {
        folderData.push({
          name: folder.name || folder.id,
          id: folder.id,
          fileCount: 0,
          files: [],
        });
      }
    }

    // Get recent messages
    let messages: { createdAt?: string; role?: string; preview?: string }[] = [];
    try {
      const messageList = normalizeToArray(await client.getAgentMessages(agentDetails.id, 5));
      messages = messageList.map((msg: any) => {
        // Get the text content from various possible fields
        const text = msg.content || msg.text || msg.reasoning || '';
        return {
          createdAt: msg.date || msg.created_at,
          role: msg.message_type || msg.role,
          preview: text ? text.substring(0, 100) : undefined,
        };
      });
    } catch {
      // Messages unavailable
    }

    // Get archival memory count
    let archivalCount = 0;
    try {
      spinner.text = 'Checking archival memory...';
      const archival = await client.listAgentArchival(agentDetails.id, 100);
      const archivalList = Array.isArray(archival) ? archival : [];
      archivalCount = archivalList.length;
    } catch {
      // Archival unavailable
    }

    spinner.stop();

    if (OutputFormatter.handleJsonOutput(agentDetails, options?.output)) {
      return;
    }

    // Build display data
    const displayData: AgentDetailsData = {
      id: agentDetails.id,
      name: agentDetails.name,
      description: agentDetails.description,
      model: agentDetails.llm_config?.model,
      contextWindow: agentDetails.llm_config?.context_window,
      embedding: agentDetails.embedding_config?.embedding_model,
      created: agentDetails.created_at,
      updated: agentDetails.updated_at,
      systemPrompt: agentDetails.system,
      blocks: agentDetails.blocks?.map((b: any) => ({
        label: b.label || b.id,
        description: b.description,
        limit: b.limit,
        valueLength: b.value?.length || 0,
      })),
      tools: agentDetails.tools?.map((t: any) => ({
        name: t.name || t,
        description: t.description,
      })),
      folders: folderData,
      archives: archiveData,
      messages,
      archivalCount,
    };

    output(displayAgentDetails(displayData, verbose));
  } catch (error) {
    spinner.fail(`Failed to load details for agent ${name}`);
    throw error;
  }
}
