import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { isBuiltinTool } from '../../lib/tools/builtin-tools';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { log, output, error } from '../../lib/shared/logger';

export async function duplicateCommand(
  source: string,
  targetName: string,
  options: { archival?: boolean },
  command: any
): Promise<void> {
  // Commander maps --no-archival to archival=false (default: true)
  const skipArchival = options.archival === false;
  const verbose = command.parent?.opts().verbose || false;
  const spinnerEnabled = getSpinnerEnabled(command);

  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Step 1: Resolve source agent
    const resolveSpinner = createSpinner(`Resolving source agent "${source}"...`, spinnerEnabled).start();
    const { agent: sourceAgent } = await resolver.findAgentByName(source);
    resolveSpinner.succeed(`Found source agent: ${sourceAgent.name} (${sourceAgent.id})`);

    // Step 2: Check target name doesn't already exist
    try {
      await resolver.findAgentByName(targetName);
      throw new Error(`Agent "${targetName}" already exists. Choose a different name.`);
    } catch (err: any) {
      if (err.message.includes('already exists')) throw err;
      // Agent not found — good, we can proceed
    }

    // Step 3: Fetch full agent config
    const fetchSpinner = createSpinner('Fetching agent configuration...', spinnerEnabled).start();

    const fullAgent = await client.getAgent(sourceAgent.id);
    const [blocks, tools, folders, archives] = await Promise.all([
      client.listAgentBlocks(sourceAgent.id).then(normalizeResponse),
      client.listAgentTools(sourceAgent.id).then(normalizeResponse),
      client.listAgentFolders(sourceAgent.id).then(normalizeResponse),
      client.listAgentArchives(sourceAgent.id).then(normalizeResponse),
    ]);

    fetchSpinner.succeed(`Fetched config: ${blocks.length} blocks, ${tools.length} tools, ${folders.length} folders, ${archives.length} archives`);

    // Step 4: Fetch archival passages (unless --no-archival)
    let passagesByArchive = new Map<string, any[]>();
    if (!skipArchival && archives.length > 0) {
      const passageSpinner = createSpinner('Fetching archival passages...', spinnerEnabled).start();
      try {
        const allPassages = await client.listAllAgentPassages(sourceAgent.id);
        for (const p of allPassages) {
          const archiveId = p.archive_id || p.source_id;
          if (archiveId) {
            if (!passagesByArchive.has(archiveId)) passagesByArchive.set(archiveId, []);
            passagesByArchive.get(archiveId)!.push(p);
          }
        }
        const totalPassages = allPassages.length;
        passageSpinner.succeed(`Fetched ${totalPassages} archival passage(s) across ${passagesByArchive.size} archive(s)`);
      } catch (err: any) {
        passageSpinner.fail(`Could not fetch passages: ${err.message}`);
        passagesByArchive = new Map();
      }
    }

    // Step 5: Create the new agent
    const createSpinnerInstance = createSpinner(`Creating agent "${targetName}"...`, spinnerEnabled).start();

    // Create new agent-owned blocks (clone values), collect shared block IDs to reuse
    const newBlockIds: string[] = [];
    for (const block of blocks) {
      // Determine if this is a shared block (attached to multiple agents)
      // by checking if it has label matching typical shared block patterns.
      // For safety, always create new blocks for the clone to ensure isolation.
      const newBlock = await client.createBlock({
        label: block.label,
        value: block.value || '',
        description: block.description || '',
        limit: block.limit || 5000,
      });
      newBlockIds.push(newBlock.id);
    }

    // Resolve tool IDs — reuse existing tools (tools are shared resources)
    const toolIds = tools
      .filter((t: any) => !isBuiltinTool(t.name))
      .map((t: any) => t.id);

    const createPayload: any = {
      name: targetName,
      description: fullAgent.description || '',
      model: fullAgent.model || '',
      system: fullAgent.system || '',
      block_ids: newBlockIds,
      tool_ids: toolIds,
      context_window_limit: (fullAgent as any).llm_config?.context_window || (fullAgent as any).context_window_limit || 16000,
      reasoning: (fullAgent as any).llm_config?.enable_reasoner ?? true,
    };

    if ((fullAgent as any).llm_config?.max_tokens !== undefined) {
      createPayload.max_tokens = (fullAgent as any).llm_config.max_tokens;
    }
    if ((fullAgent as any).tags && (fullAgent as any).tags.length > 0) {
      createPayload.tags = (fullAgent as any).tags;
    }
    if (fullAgent.embedding) {
      createPayload.embedding = fullAgent.embedding;
    }
    if ((fullAgent as any).embedding_config) {
      createPayload.embedding_config = (fullAgent as any).embedding_config;
    }

    const createdAgent = await client.createAgent(createPayload);

    createSpinnerInstance.succeed(`Agent "${targetName}" created (${createdAgent.id})`);

    // Step 6: Attach folders (reuse same folders)
    if (folders.length > 0) {
      const folderSpinner = createSpinner(`Attaching ${folders.length} folder(s)...`, spinnerEnabled).start();
      for (const folder of folders) {
        await client.attachFolderToAgent(createdAgent.id, folder.id);
      }
      await client.closeAllAgentFiles(createdAgent.id);
      folderSpinner.succeed(`Attached ${folders.length} folder(s)`);
    }

    // Step 7: Create new archives (for data isolation), attach, and insert passages
    if (archives.length > 0) {
      const archiveSpinner = createSpinner(`Cloning ${archives.length} archive(s)...`, spinnerEnabled).start();
      let totalInserted = 0;

      for (const archive of archives) {
        // Create a new archive for the clone
        const newArchive = await client.createArchive({
          name: archive.name,
          description: archive.description,
          ...(archive.embedding && { embedding: archive.embedding }),
          ...(archive.embedding_config && { embedding_config: archive.embedding_config }),
        });

        await client.attachArchiveToAgent(createdAgent.id, newArchive.id);

        // Insert passages if available
        if (!skipArchival) {
          const passages = passagesByArchive.get(archive.id) || [];
          if (passages.length > 0) {
            await client.createArchivePassages(
              newArchive.id,
              passages.map((p: any) => ({
                text: p.text,
                ...(p.metadata && Object.keys(p.metadata).length > 0 && { metadata: p.metadata })
              }))
            );
            totalInserted += passages.length;
          }
        }
      }

      archiveSpinner.succeed(`Cloned ${archives.length} archive(s)${totalInserted > 0 ? ` with ${totalInserted} passage(s)` : ''}`);
    }

    // Step 8: Copy metadata
    const sourceMetadata = (fullAgent as any).metadata;
    if (sourceMetadata && Object.keys(sourceMetadata).length > 0) {
      await client.updateAgent(createdAgent.id, { metadata: sourceMetadata });
    }

    output(`\nAgent "${source}" duplicated as "${targetName}"`);

  } catch (err: any) {
    error(`Duplicate failed: ${err.message}`);
    throw err;
  }
}
