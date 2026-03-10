import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { normalizeResponse } from '../../lib/shared/response-normalizer';
import { shouldUseFancyUx } from '../../lib/ux/box';
import { createSpinner } from '../../lib/ux/spinner';
import { formatElapsedTime } from '../messages/utils';
import { log, error } from '../../lib/shared/logger';

interface DuplicateOptions {
  archival?: boolean; // --no-archival sets this to false
}

export async function duplicateCommand(
  resource: string,
  source: string,
  targetName: string,
  options: DuplicateOptions,
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  switch (resource) {
    case 'agent':
      return duplicateAgent(source, targetName, options, verbose);
    case 'block':
      return duplicateBlock(source, targetName, verbose);
    case 'archive':
      return duplicateArchive(source, targetName, options, verbose);
    case 'folder':
      return duplicateFolder(source, targetName, verbose);
    default:
      error(`Unknown resource type: ${resource}`);
      error('Supported: agent, block, archive, folder');
      process.exit(1);
  }
}

async function duplicateAgent(
  sourceName: string,
  targetName: string,
  options: DuplicateOptions,
  verbose: boolean
) {
  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  const spinnerEnabled = shouldUseFancyUx();
  const skipArchival = options.archival === false;

  // 1. Resolve source agent
  const startTime = Date.now();
  let currentStep = `Duplicating ${sourceName} → ${targetName}...`;
  const spinner = createSpinner(currentStep, spinnerEnabled).start();

  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    spinner.text = `${currentStep} ${formatElapsedTime(elapsed)}`;
  }, 1000);

  const { agent: sourceAgent } = await resolver.findAgentByName(sourceName);
  const fullAgent = await client.getAgent(sourceAgent.id);

  // Check target doesn't already exist
  try {
    await resolver.findAgentByName(targetName);
    clearInterval(timerInterval);
    spinner.fail(`Agent "${targetName}" already exists`);
    process.exit(1);
  } catch {
    // Expected — target should not exist
  }

  // 2. Gather source agent config
  currentStep = 'Fetching agent configuration...';

  const sourceTools = normalizeResponse((fullAgent as any).tools || []);
  const sourceBlocks = normalizeResponse((fullAgent as any).blocks || []);
  const sourceFoldersResponse = await client.listAgentFolders(sourceAgent.id);
  const sourceFolders = normalizeResponse(sourceFoldersResponse);
  const sourceArchivesResponse = await client.listAgentArchives(sourceAgent.id);
  const sourceArchives = normalizeResponse(sourceArchivesResponse);

  if (verbose) {
    log(`  Source: ${sourceAgent.name} (${sourceAgent.id})`);
    log(`  Tools: ${sourceTools.length}, Blocks: ${sourceBlocks.length}`);
    log(`  Folders: ${sourceFolders.length}, Archives: ${sourceArchives.length}`);
  }

  // 3. Create new blocks (copies for isolation)
  currentStep = 'Creating memory blocks...';
  const blockIds: string[] = [];
  for (const block of sourceBlocks) {
    const newBlock = await client.createBlock({
      label: block.label,
      value: block.value || '',
      description: block.description || '',
      limit: block.limit || 2000,
    });
    blockIds.push(newBlock.id);
    if (verbose) log(`  Block "${block.label}" cloned → ${newBlock.id}`);
  }

  // 4. Resolve tool IDs (shared by reference)
  const toolIds: string[] = sourceTools.map((t: any) => t.id);

  // 5. Build agent creation payload
  currentStep = 'Creating agent...';
  const createPayload: any = {
    name: targetName,
    description: (fullAgent as any).description || '',
    system: (fullAgent as any).system || '',
    model: (fullAgent as any).llm_config?.handle || (fullAgent as any).model || 'google_ai/gemini-2.5-pro',
    block_ids: blockIds,
    tool_ids: toolIds,
    context_window_limit: (fullAgent as any).llm_config?.context_window || 16384,
    reasoning: (fullAgent as any).reasoning ?? false,
  };

  // Embedding
  const embeddingConfig = (fullAgent as any).embedding_config;
  if (embeddingConfig?.handle) {
    createPayload.embedding = embeddingConfig.handle;
  } else if ((fullAgent as any).embedding) {
    createPayload.embedding = (fullAgent as any).embedding;
  }

  // Max tokens
  if ((fullAgent as any).llm_config?.max_tokens) {
    createPayload.max_tokens = (fullAgent as any).llm_config.max_tokens;
  }

  // Tags (copy but strip canary tags)
  const sourceTags = ((fullAgent as any).tags || []).filter((t: string) => !t.startsWith('canary'));
  if (sourceTags.length > 0) {
    createPayload.tags = sourceTags;
  }

  const createdAgent = await client.createAgent(createPayload);
  if (verbose) log(`  Agent created: ${createdAgent.id}`);

  // 6. Attach folders (shared by reference)
  if (sourceFolders.length > 0) {
    currentStep = 'Attaching folders...';
    for (const folder of sourceFolders) {
      await client.attachFolderToAgent(createdAgent.id, folder.id);
      if (verbose) log(`  Folder "${folder.name}" attached`);
    }
    // Close files to prevent context bloat
    await client.closeAllAgentFiles(createdAgent.id);
  }

  // 7. Create new archives and optionally copy passages
  if (sourceArchives.length > 0) {
    currentStep = 'Cloning archives...';
    for (const archive of sourceArchives) {
      const archiveName = archive.name || archive.archive_name;

      // Create a new archive for isolation
      const newArchive = await client.createArchive({
        name: archiveName,
        description: archive.description || '',
        embedding_config: archive.embedding_config,
      });
      await client.attachArchiveToAgent(createdAgent.id, newArchive.id);
      if (verbose) log(`  Archive "${archiveName}" cloned → ${newArchive.id}`);

      // Copy passages unless --no-archival
      if (!skipArchival) {
        currentStep = `Copying passages from ${archiveName}...`;
        const passages = await client.listAllAgentPassages(sourceAgent.id);
        // Filter passages belonging to this archive
        const archivePassages = passages.filter((p: any) =>
          p.archive_id === archive.id || p.source_id === archive.id
        );

        if (archivePassages.length > 0) {
          await client.createArchivePassagesBatch(
            newArchive.id,
            archivePassages.map((p: any) => ({
              text: p.text || p.content,
              ...(p.metadata && { metadata: p.metadata }),
            }))
          );
          if (verbose) log(`  Copied ${archivePassages.length} passages`);
        }
      }
    }
  }

  // 8. Copy metadata
  const sourceMetadata = (fullAgent as any).metadata || {};
  const metadataToClone: Record<string, any> = {};
  for (const [key, value] of Object.entries(sourceMetadata)) {
    if (key.startsWith('lettactl.') && key !== 'lettactl.canary') {
      metadataToClone[key] = value;
    }
  }
  if (Object.keys(metadataToClone).length > 0) {
    await client.updateAgent(createdAgent.id, { metadata: metadataToClone });
  }

  // Summary
  clearInterval(timerInterval);
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const passageNote = skipArchival ? ' (archival skipped)' : '';
  spinner.succeed(
    `Duplicated ${sourceName} → ${targetName} in ${formatElapsedTime(elapsed)}` +
    ` (${blockIds.length} blocks, ${toolIds.length} tools, ${sourceFolders.length} folders, ${sourceArchives.length} archives${passageNote})`
  );
}

async function duplicateBlock(
  sourceName: string,
  targetName: string,
  verbose: boolean
) {
  const client = new LettaClientWrapper();
  const spinnerEnabled = shouldUseFancyUx();
  const spinner = createSpinner(`Duplicating block ${sourceName} → ${targetName}...`, spinnerEnabled).start();

  const allBlocks = await client.listBlocks();
  const sourceBlock = normalizeResponse(allBlocks).find(
    (b: any) => b.label === sourceName || b.name === sourceName || b.id === sourceName
  );
  if (!sourceBlock) {
    spinner.fail(`Block "${sourceName}" not found`);
    process.exit(1);
  }

  const newBlock = await client.createBlock({
    label: targetName,
    value: sourceBlock.value || '',
    description: sourceBlock.description || '',
    limit: sourceBlock.limit || 2000,
  });

  if (verbose) log(`  Block cloned: ${sourceBlock.id} → ${newBlock.id}`);
  spinner.succeed(`Duplicated block ${sourceName} → ${targetName} (${newBlock.id})`);
}

async function duplicateArchive(
  sourceName: string,
  targetName: string,
  options: DuplicateOptions,
  verbose: boolean
) {
  const client = new LettaClientWrapper();
  const spinnerEnabled = shouldUseFancyUx();
  const skipArchival = options.archival === false;
  const startTime = Date.now();
  let currentStep = `Duplicating archive ${sourceName} → ${targetName}...`;
  const spinner = createSpinner(currentStep, spinnerEnabled).start();

  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    spinner.text = `${currentStep} ${formatElapsedTime(elapsed)}`;
  }, 1000);

  const allArchives = await client.listArchives();
  const sourceArchive = normalizeResponse(allArchives).find(
    (a: any) => a.name === sourceName || a.id === sourceName
  );
  if (!sourceArchive) {
    clearInterval(timerInterval);
    spinner.fail(`Archive "${sourceName}" not found`);
    process.exit(1);
  }

  const newArchive = await client.createArchive({
    name: targetName,
    description: sourceArchive.description || '',
    embedding_config: sourceArchive.embedding_config,
  });
  if (verbose) log(`  Archive created: ${newArchive.id}`);

  let passageCount = 0;
  if (!skipArchival) {
    currentStep = 'Copying passages...';
    const passages = await client.listArchivePassages(sourceArchive.id);
    if (passages.length > 0) {
      await client.createArchivePassagesBatch(
        newArchive.id,
        passages.map((p: any) => ({
          text: p.text || p.content,
          ...(p.metadata && { metadata: p.metadata }),
        }))
      );
      passageCount = passages.length;
    }
  }

  clearInterval(timerInterval);
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const passageNote = skipArchival ? ', archival skipped' : `, ${passageCount} passages`;
  spinner.succeed(`Duplicated archive ${sourceName} → ${targetName} in ${formatElapsedTime(elapsed)} (${newArchive.id}${passageNote})`);
}

async function duplicateFolder(
  sourceName: string,
  targetName: string,
  verbose: boolean
) {
  const client = new LettaClientWrapper();
  const spinnerEnabled = shouldUseFancyUx();
  const startTime = Date.now();
  let currentStep = `Duplicating folder ${sourceName} → ${targetName}...`;
  const spinner = createSpinner(currentStep, spinnerEnabled).start();

  const timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    spinner.text = `${currentStep} ${formatElapsedTime(elapsed)}`;
  }, 1000);

  const allFolders = await client.listFolders();
  const sourceFolder = normalizeResponse(allFolders).find(
    (f: any) => f.name === sourceName || f.id === sourceName
  );
  if (!sourceFolder) {
    clearInterval(timerInterval);
    spinner.fail(`Folder "${sourceName}" not found`);
    process.exit(1);
  }

  // Create new folder
  const newFolder = await client.createFolder({ name: targetName });
  if (verbose) log(`  Folder created: ${newFolder.id}`);

  // Copy files
  currentStep = 'Copying files...';
  const files = await client.listFolderFiles(sourceFolder.id);
  const fileList = normalizeResponse(files);

  for (const file of fileList) {
    // Download file content from source and upload to new folder
    const baseUrl = process.env.LETTA_BASE_URL;
    const headers = (client as any).getAuthHeaders();
    const response = await fetch(`${baseUrl}/v1/files/${file.id}/content`, { headers });
    if (!response.ok) {
      if (verbose) log(`  Skipped file "${file.file_name}" (could not download)`);
      continue;
    }
    const content = Buffer.from(await response.arrayBuffer());
    await client.uploadFileToFolder(content as any, newFolder.id, file.file_name);
    if (verbose) log(`  File "${file.file_name}" copied`);
  }

  clearInterval(timerInterval);
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  spinner.succeed(`Duplicated folder ${sourceName} → ${targetName} in ${formatElapsedTime(elapsed)} (${fileList.length} files)`);
}

