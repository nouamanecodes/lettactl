import { FleetParser } from '../../lib/apply/fleet-parser';
import { LettaClientWrapper } from '../../lib/client/letta-client';
import { BlockManager } from '../../lib/managers/block-manager';
import { ArchiveManager } from '../../lib/managers/archive-manager';
import { FolderManager } from '../../lib/managers/folder-manager';
import { AgentManager } from '../../lib/managers/agent-manager';
import { DiffEngine } from '../../lib/apply/diff-engine';
import { FileContentTracker } from '../../lib/apply/file-content-tracker';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { SupabaseStorageBackend, hasSupabaseConfig } from '../../lib/storage/storage-backend';
import { applyTemplateMode } from './template';
import { collectDesiredResourceNames, processSharedBlocks, processFolders, updateExistingAgent, createNewAgent } from '../../lib/apply/apply-helpers';
import { GitClient } from '../../lib/memfs-reconciler/git-client';
import { MemfsReconciler, MemfsExecutionResult } from '../../lib/memfs-reconciler/executor';
import { computeMemfsAction } from '../../lib/memfs-reconciler/plan';
import { buildServerAgentState } from '../../lib/memfs-reconciler/server-state';
import { assertLettaCliAvailableForMemfs } from '../../lib/memfs-reconciler/letta-cli';
import {
  applySecretPlan,
  planAgentSecrets,
  type SecretApplyResult,
} from '../../lib/secrets-reconciler';
import { applyProviders } from '../../lib/providers/provider-reconciler';
import * as nodePath from 'path';
import { formatLettaError } from '../../lib/shared/error-handler';
import { computeDryRunDiffs, displayDryRunResults } from '../../lib/apply/dry-run';
import { log, warn, output, isQuietMode } from '../../lib/shared/logger';
import { resolveAgentToolNames, shouldIncludeBaseTools, shouldIncludeBaseToolRules, missingWebTools } from '../../lib/tools/builtin-tools';
import { displayApplySummary } from '../../lib/ux/display';
import { buildMcpServerRegistry, expandMcpToolsForAgents } from '../../lib/tools/mcp-tools';
import { buildAgentManifest, getDefaultManifestPath, writeAgentManifest } from '../../lib/apply/agent-manifest';
import { ApplyOptions, DeployResult } from './types';
import { batchProcess } from '../../lib/shared/batch';
import { DEFAULT_CANARY_PREFIX, rewriteAgentNamesForCanary, rewriteFolderNamesForCanary, cleanupCanaryAgents, buildCanaryMetadata } from '../../lib/apply/canary';
import { bulkSendMessage, promptConfirmation } from '../../lib/messaging/bulk-messenger';
import { parsePruneTargets, isPruning, selectedPruneTargets } from '../../lib/prune-targets';
import { waitForAgentIdle, defaultWaitLogger, RequiresApprovalError } from '../../lib/messaging/wait-for-idle';
import { retryOn409 } from '../../lib/shared/retry';
import { minimatch } from 'minimatch';
import * as path from 'path';

export async function applyCommand(options: ApplyOptions, command: any): Promise<DeployResult> {
  // Quiet mode overrides verbose
  const verbose = isQuietMode() ? false : (command.parent?.opts().verbose || false);
  const spinnerEnabled = getSpinnerEnabled(command);

  const pruneTargets = parsePruneTargets(options.prune);

  try {
    // Gate before any network call — confirming after resources are already
    // touched would be theatre. Dry-run never deletes, so it never prompts.
    if (isPruning(pruneTargets) && !options.confirm && !options.dryRun) {
      output('');
      output(`--prune will DELETE ${selectedPruneTargets(pruneTargets).join(', ')} not present in ${options.file}.`);
      if (!(await promptConfirmation('Proceed? (y/N) '))) {
        throw new Error('Aborted at prune confirmation');
      }
    }

    const parseSpinner = createSpinner(`Parsing ${options.file}...`, spinnerEnabled).start();

    if (options.dryRun) {
      log('Dry-run mode enabled');
    }

    if (options.agent) {
      if (verbose) log(`Filtering agents by pattern: ${options.agent}`);
    }

    // Initialize Supabase backend if environment variables are available
    let supabaseBackend: SupabaseStorageBackend | undefined;

    try {
      if (hasSupabaseConfig()) {
        supabaseBackend = new SupabaseStorageBackend();
        log('Supabase backend configured for cloud storage access');
      }
    } catch (err: any) {
      throw new Error(`Supabase configuration err: ${err.message}`);
    }

    const parser = new FleetParser(options.file, {
      supabaseBackend,
      rootPath: options.root
    });
    const config = await parser.parseFleetConfig(options.file);
    parseSpinner.succeed(`Parsed ${options.file} (${config.agents.length} agents)`);

    await assertLettaCliAvailableForMemfs(config);

    // Validate embedding configuration for self-hosted environments
    let isSelfHosted = true;
    if (process.env.LETTA_BASE_URL) {
      try {
        const host = new URL(process.env.LETTA_BASE_URL).hostname;
        // Must be exactly letta.com or a subdomain like api.letta.com
        isSelfHosted = host !== 'letta.com' && !host.endsWith('.letta.com');
      } catch {
        // Invalid URL, treat as self-hosted
      }
    }
    if (isSelfHosted) {
      const agentsWithoutEmbedding = config.agents.filter((agent: any) => !agent.embedding && !agent.embedding_config);
      if (agentsWithoutEmbedding.length > 0) {
        const names = agentsWithoutEmbedding.map((a: any) => a.name).join(', ');
        throw new Error(
          `Self-hosted Letta requires explicit embedding configuration.\n` +
          `Agents missing embedding: ${names}\n\n` +
          `Add an embedding or embedding_config field to each agent:\n` +
          `  embedding: "openai/text-embedding-3-small"\n` +
          `  # OR\n` +
          `  embedding_config:\n` +
          `    embedding_model: "nomic-embed-text:latest"\n\n` +
          `Common embedding providers:\n` +
          `  - openai/text-embedding-3-small\n` +
          `  - openai/text-embedding-3-large\n` +
          `  - openai/text-embedding-ada-002`
        );
      }
    }

    if (verbose) log(`Found ${config.agents.length} agents in configuration`);

    // Canary flag validation
    if (options.promote && !options.canary) {
      throw new Error('--promote requires --canary flag');
    }
    if (options.cleanup && !options.canary) {
      throw new Error('--cleanup requires --canary flag');
    }
    if (options.canary && options.match) {
      throw new Error('--canary cannot be combined with --match (template mode)');
    }
    if (options.scope && options.match) {
      throw new Error('--scope cannot be combined with --match (template mode)');
    }
    if (options.scope && options.canary) {
      throw new Error('--scope cannot be combined with --canary');
    }

    // --scope <tags>: filter the agent set to those whose tags include ALL
    // listed tags (AND semantics). Lets callers do incremental scoped deploys
    // without redeploying the full fleet — primary use case is per-tenant
    // adds (`--scope tenant:<id>`) so only the new tenant's agents touch
    // Letta. Shared blocks / folders / tools still get processed because
    // they're fleet-level and the filtered agents may reference them.
    // See nouamanecodes/lettactl#380.
    if (options.scope) {
      const requiredTags = options.scope.split(',').map(t => t.trim()).filter(Boolean);
      if (requiredTags.length === 0) {
        throw new Error('--scope requires at least one tag');
      }
      const before = config.agents.length;
      config.agents = config.agents.filter(a => {
        const tags = (a.tags || []) as string[];
        return requiredTags.every(req => tags.includes(req));
      });
      log(`--scope filter: ${config.agents.length}/${before} agents match [${requiredTags.join(', ')}]`);
      if (config.agents.length === 0) {
        log('No agents matched scope filter — nothing to apply');
        return { agents: {}, created: [], updated: [], unchanged: [] };
      }
    }

    // Canary mode: rewrite agent names or handle cleanup
    const canaryPrefix = options.canaryPrefix || DEFAULT_CANARY_PREFIX;
    let canaryMode = false;

    if (options.canary && options.cleanup && !options.promote) {
      // Cleanup-only: delete canary agents and return
      const client = new LettaClientWrapper();
      await cleanupCanaryAgents(config, canaryPrefix, client, options, spinnerEnabled, verbose);
      return { agents: {}, created: [], updated: [], unchanged: [] };
    }

    if (options.canary && !options.promote) {
      // Canary deploy: prefix all agent names, and isolate folders so the canary
      // gets fresh CANARY-<folder> copies with the desired files (fidelity) without
      // mutating the shared production folders (isolation). Must run before folder
      // resolution below.
      const { rewrittenAgents } = rewriteAgentNamesForCanary(config.agents, canaryPrefix);
      config.agents = rewrittenAgents;
      rewriteFolderNamesForCanary(config, canaryPrefix);
      canaryMode = true;
      log(`Canary mode: deploying with prefix "${canaryPrefix}"`);
    }

    // Canary deploy skips first_message by default (testing, not calibration)
    // Promote does NOT force-skip — user may want calibration on production
    if (options.canary && !options.promote) {
      options.skipFirstMessage = true;
    }

    // Template mode: apply config to existing agents matching pattern
    if (options.match) {
      await applyTemplateMode({ ...options, match: options.match }, config, parser, command);
      return { agents: {}, created: [], updated: [], unchanged: [] };
    }

    const client = new LettaClientWrapper();
    const blockManager = new BlockManager(client);
    const agentManager = new AgentManager(client);
    const archiveManager = new ArchiveManager(client);
    const folderManager = new FolderManager(client);
    const diffEngine = new DiffEngine(client, blockManager, archiveManager, parser.basePath);
    const fileTracker = new FileContentTracker(parser.basePath, parser.storageBackend);

    if ((config.providers && config.providers.length > 0) || config.prune_missing_providers) {
      const providerSpinner = createSpinner('Reconciling providers...', spinnerEnabled).start();
      const providerResults = await applyProviders(client, config, options.dryRun || false);
      const failedProviders = providerResults.filter(result => result.status === 'failed' || result.refreshStatus === 'failed');
      if (failedProviders.length > 0) {
        providerSpinner.fail(`Provider reconciliation failed (${failedProviders.map(p => p.name).join(', ')})`);
        throw new Error(failedProviders.map(p => `${p.name}: ${p.error || 'unknown error'}`).join('\n'));
      }
      const created = providerResults.filter(result => result.status === 'created').length;
      const updated = providerResults.filter(result => result.status === 'updated').length;
      const deleted = providerResults.filter(result => result.status === 'deleted').length;
      const dryRun = providerResults.filter(result => result.status === 'dry-run').length;
      const unchanged = providerResults.filter(result => result.status === 'unchanged').length;
      providerSpinner.succeed(`Providers ready (${created} created, ${updated} updated, ${deleted} deleted, ${dryRun} dry-run, ${unchanged} unchanged)`);
      for (const result of providerResults) {
        if (result.status !== 'unchanged') {
          log(`Provider ${result.name}: ${result.status}${result.refreshStatus ? `, refresh=${result.refreshStatus}` : ''}`);
        }
      }
    }

    // Load existing resources — scoped to current fleet to prevent cross-tenant contamination
    const { blockNames, folderNames, archiveNames } = collectDesiredResourceNames(config);
    const loadSpinner = createSpinner('Loading existing resources...', spinnerEnabled).start();
    if (verbose) log('Loading existing blocks...');
    await blockManager.loadExistingBlocks(blockNames);

    if (verbose) log('Loading existing archives...');
    await archiveManager.loadExistingArchives(archiveNames);

    if (verbose) log('Loading existing folders...');
    await folderManager.loadExistingFolders(folderNames);

    if (verbose) log('Loading existing agents...');
    await agentManager.loadExistingAgents();
    loadSpinner.succeed('Loaded existing resources');

    // Dry-run mode: compute and display diffs without applying
    if (options.dryRun) {
      const results = await computeDryRunDiffs(config, {
        client,
        blockManager,
        archiveManager,
        folderManager,
        agentManager,
        diffEngine,
        fileTracker,
        parser,
        agentFilter: options.agent,
        verbose,
        pruneSecrets: pruneTargets.secrets
      });
      displayDryRunResults(results, verbose, options.skipFirstMessage);
      return { agents: {}, created: [], updated: [], unchanged: [] };
    }

    // Process shared blocks
    const blockSpinner = createSpinner('Processing shared blocks...', spinnerEnabled).start();
    const { sharedBlockIds, syncedBlocks } = await processSharedBlocks(config, blockManager, verbose);
    blockSpinner.succeed(`Processed ${sharedBlockIds.size} shared blocks${syncedBlocks.size > 0 ? ` (${syncedBlocks.size} synced)` : ''}`);

    // Register MCP servers
    let mcpServerNameToId = new Map<string, string>();
    if (config.mcp_servers && config.mcp_servers.length > 0) {
      const mcpSpinner = createSpinner('Registering MCP servers...', spinnerEnabled).start();
      if (verbose) log('Registering MCP servers...');
      const mcpResult = await parser.registerMcpServers(config, client, verbose);
      mcpSpinner.succeed(`Registered ${config.mcp_servers.length} MCP servers`);

      // Display MCP server operation summary
      if (mcpResult.created.length > 0) {
        log(`MCP servers created: ${mcpResult.created.join(', ')}`);
      }
      if (mcpResult.updated.length > 0) {
        log(`MCP servers updated: ${mcpResult.updated.join(', ')}`);
      }
      if (mcpResult.unchanged.length > 0 && verbose) {
        log(`MCP servers unchanged: ${mcpResult.unchanged.join(', ')}`);
      }
      if (mcpResult.failed.length > 0) {
        warn(`MCP servers failed: ${mcpResult.failed.join(', ')}`);
      }
    }
    mcpServerNameToId = await buildMcpServerRegistry(client);
    await expandMcpToolsForAgents(config, client, mcpServerNameToId, verbose);

    // Generate tool source hashes and register tools
    const allToolNames = new Set<string>();
    for (const agent of config.agents) {
      for (const toolName of resolveAgentToolNames(agent)) {
        allToolNames.add(toolName);
      }
    }
    const globalToolSourceHashes = fileTracker.generateToolSourceHashes(Array.from(allToolNames), parser.toolConfigs);

    const toolSpinner = createSpinner('Registering tools...', spinnerEnabled).start();
    if (verbose) log('Registering tools...');
    const { toolNameToId, updatedTools, builtinTools } = await parser.registerRequiredTools(config, client, verbose, globalToolSourceHashes);
    const builtinCount = builtinTools.size;
    const customCount = toolNameToId.size - builtinCount;
    toolSpinner.succeed(`Registered ${customCount} custom, ${builtinCount} builtin tools`);

    // Process folders
    const folderSpinner = createSpinner('Processing folders...', spinnerEnabled).start();
    const createdFolders = await processFolders(config, folderManager, client, parser, options, verbose);
    folderSpinner.succeed(`Processed ${createdFolders.size} folders`);

    // Process agents
    if (verbose) log('Processing agents...');

    // Track results for summary (kubectl-style: continue on failure)
    const succeeded: string[] = [];
    const created: string[] = [];
    const updated: string[] = [];
    const failed: { name: string; err: string }[] = [];
    const skipped: string[] = [];
    const appliedAgents = new Map<string, { id: string; resolvedName: string }>();

    // memFS reconciler — instantiated once per apply run, shared across agents.
    // Only agents whose YAML has `memory:` will go through the reconcile flow.
    const lettactlVersion = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('../../../package.json').version as string;
      } catch {
        return '0.0.0';
      }
    })();
    const gitClient = new GitClient({
      baseUrl: process.env.LETTA_BASE_URL || 'http://localhost:8283',
      authToken: process.env.LETTA_API_KEY || null,
    });
    const backupDir = nodePath.resolve(config.root_path || process.cwd(), 'backups', 'memfs-migrations');
    const memfsReconciler = new MemfsReconciler(client, gitClient, {
      dryRun: options.dryRun || false,
      backupDir,
      lettactlVersion,
    });
    const memfsResults: MemfsExecutionResult[] = [];
    const secretResults: SecretApplyResult[] = [];

    for (const agent of config.agents) {
      const filterName = (agent as any)._originalName || agent.name;
      if (options.agent && !filterName.includes(options.agent)) continue;
      if (verbose) {
        log(`  Description: ${agent.description}`);
        log(`  Tools: ${agent.tools?.join(', ') || 'none'}`);
        log(`  Memory blocks: ${agent.memory_blocks?.length || 0}`);
        log(`  Archives: ${agent.archives?.length || 0}`);
        log(`  Folders: ${agent.folders?.length || 0}`);
      }

      try {
        // Generate hashes for change detection
        const folderContentHashes = await fileTracker.generateFolderFileHashes(agent.folders || []);
        const toolSourceHashes = fileTracker.generateToolSourceHashes(agent.tools || [], parser.toolConfigs);
        const memoryBlockFileHashes = await fileTracker.generateMemoryBlockFileHashes(agent.memory_blocks || []);

        // Build agent config - resolve base tools and file search tools by mode.
        const tools = resolveAgentToolNames(agent);

        const missingWeb = missingWebTools(tools);
        if (missingWeb.length) {
          warn(`  ${agent.name}: web-research tools not attached (${missingWeb.join(', ')}). An explicit tools list omits them — confirm that's intended.`);
        }

        const agentConfig = {
          systemPrompt: agent.system_prompt.value || '',
          description: agent.description || '',
          tools,
          includeBaseTools: shouldIncludeBaseTools(agent),
          includeBaseToolRules: shouldIncludeBaseToolRules(agent),
          toolSourceHashes,
          model: agent.llm_config?.model,
          embedding: agent.embedding,
          embeddingConfig: agent.embedding_config,
          contextWindow: agent.llm_config?.context_window,
          maxTokens: agent.llm_config?.max_tokens,
          reasoning: agent.reasoning,
          memoryBlocks: (agent.memory_blocks || []).map((block: any) => ({
            name: block.name,
            description: block.description,
            limit: block.limit,
            value: block.value || '',
            agent_owned: block.agent_owned
          })),
          archives: (agent.archives || []).map((archive: any) => {
            const resolved: any = {
              name: archive.name,
              description: archive.description,
              embedding_config: archive.embedding_config
            };
            if (archive.embedding) {
              resolved.embedding = archive.embedding;
            } else if (!archive.embedding_config && agent.embedding) {
              resolved.embedding = agent.embedding;
            }
            return resolved;
          }),
          memoryBlockFileHashes,
          folders: (agent.folders || []).map((folder: any) => ({
            name: folder.name,
            files: folder.files,
            fileContentHashes: folderContentHashes.get(folder.name) || {}
          })),
          sharedBlocks: agent.shared_blocks || [],
          sharedBlockConfigs: (agent.shared_blocks || []).map((name: string) =>
            (config.shared_blocks || []).find((b: any) => b.name === name)
          ).filter(Boolean),
          tags: agent.tags || [],
          lettabotConfig: agent.lettabot || null,
          firstMessage: agent.first_message || null,
          compactionSettings: agent.compaction_settings || null,
          conversations: agent.memory?.mode === 'memfs' ? undefined : agent.conversations || undefined
        };

        // Check if agent exists
        const { agentName, shouldCreate, existingAgent } = await agentManager.getOrCreateAgentName(
          agent.name,
          agentConfig,
          verbose
        );

        if (!shouldCreate && existingAgent) {
          // Check if changes needed
          const changes = agentManager.getConfigChanges(existingAgent, agentConfig);
          if (!changes.hasChanges) {
            appliedAgents.set(agent.name, {
              id: existingAgent.id,
              resolvedName: existingAgent.name
            });
            if (verbose) log(`Agent ${agent.name} already up to date`);

            let sidecarChanged = false;
            let currentMemfsResult: MemfsExecutionResult | undefined;
            if (agent.memory) {
              const result = await reconcileMemfsForAgent(
                agent,
                existingAgent.id,
                client,
                gitClient,
                memfsReconciler,
                config.root_path || process.cwd(),
              );
              memfsResults.push(result);
              currentMemfsResult = result;
              logMemfsResult(result, agent.name);
              sidecarChanged = sidecarChanged || result.status === 'applied';
            }
            const secretResult = await reconcileSecretsForAgent(config, agent, existingAgent.id, client, false, pruneTargets.secrets);
            if (secretResult) {
              secretResults.push(secretResult);
              logSecretResult(secretResult, agent.name);
              sidecarChanged = sidecarChanged || secretResult.status === 'applied';
            }
            const createdConversationCount = await ensureDeclaredConversationsForAgent(agent, existingAgent.id, client, verbose);
            sidecarChanged = sidecarChanged || createdConversationCount > 0;
            if (memfsResultRequiresRecompile(currentMemfsResult) && !options.skipRecompile) {
              await recompileConversationsForAgent(existingAgent.id, existingAgent.name, client, options.waitForIdle !== false);
            }
            await maybeReprojectSkills(existingAgent.id, existingAgent.name, agent.memory?.mode, memfsReconciler, client, options);

            if (sidecarChanged) {
              succeeded.push(agent.name);
              updated.push(agent.name);
            } else {
              skipped.push(agent.name);
            }
            continue;
          }

          // Read previous folder file hashes from agent metadata
          const fullAgent = await client.getAgent(existingAgent.id);
          const previousFolderFileHashes = (fullAgent as any).metadata?.['lettactl.folderFileHashes'] || {};

          // Update existing agent
          const updateResult = await updateExistingAgent(agent, existingAgent, agentConfig, {
            client,
            diffEngine,
            agentManager,
            toolNameToId,
            updatedTools,
            builtinTools,
            createdFolders,
            sharedBlockIds,
            archiveManager,
            spinnerEnabled,
            verbose,
            force: options.force || false,
            prune: pruneTargets.blocks || pruneTargets.tools,
            previousFolderFileHashes
          });

          // Auto-recompile conversations when blocks changed (diff engine or shared block sync)
          const agentSharedBlocks: string[] = agent.shared_blocks || [];
          const hadSharedBlockSync = agentSharedBlocks.some((name: string) => syncedBlocks.has(name));
          if ((updateResult.hasBlockChanges || hadSharedBlockSync) && !options.skipRecompile) {
            try {
              const convList = await client.listConversations(existingAgent.id);
              const conversations = Array.isArray(convList) ? convList : [];
              if (conversations.length > 0) {
                if (options.waitForIdle !== false) {
                  await waitForAgentIdle(client, existingAgent.id, {
                    ...defaultWaitLogger(() => existingAgent.name),
                  });
                }
                const { succeeded } = await batchProcess(
                  conversations,
                  (conv: any) => retryOn409(() => client.recompileConversation(conv.id))
                );
                log(`  Recompiled ${succeeded}/${conversations.length} conversation(s)`);
              }
            } catch (recompileErr: any) {
              if (recompileErr instanceof RequiresApprovalError) {
                throw recompileErr;
              }
              // Recompile unavailable — skip silently
            }
          }

          succeeded.push(agent.name);
          updated.push(agent.name);
          appliedAgents.set(agent.name, {
            id: existingAgent.id,
            resolvedName: existingAgent.name
          });

          // memFS reconciliation — only if YAML declares `memory:` section
          if (agent.memory) {
            const result = await reconcileMemfsForAgent(
              agent,
              existingAgent.id,
              client,
              gitClient,
              memfsReconciler,
              config.root_path || process.cwd(),
            );
            memfsResults.push(result);
            logMemfsResult(result, agent.name);
            if (memfsResultRequiresRecompile(result) && !options.skipRecompile) {
              await recompileConversationsForAgent(existingAgent.id, existingAgent.name, client, options.waitForIdle !== false);
            }
            await maybeReprojectSkills(existingAgent.id, existingAgent.name, agent.memory?.mode, memfsReconciler, client, options);
          }
          const secretResult = await reconcileSecretsForAgent(config, agent, existingAgent.id, client, false, pruneTargets.secrets);
          if (secretResult) {
            secretResults.push(secretResult);
            logSecretResult(secretResult, agent.name);
          }
          await ensureDeclaredConversationsForAgent(agent, existingAgent.id, client, verbose);
        } else {
          // Create new agent
          const createdAgent = await createNewAgent(agent, agentName, {
            client,
            blockManager,
            archiveManager,
            agentManager,
            toolNameToId,
            builtinTools,
            createdFolders,
            sharedBlockIds,
            spinnerEnabled,
            verbose,
            folderContentHashes,
            skipFirstMessage: options.skipFirstMessage
          });

          // Store canary metadata on newly created canary agents
          if (canaryMode && (agent as any)._originalName) {
            const canaryMeta = buildCanaryMetadata((agent as any)._originalName, canaryPrefix);
            await client.updateAgent(createdAgent.id, { metadata: canaryMeta });
          }

          succeeded.push(agent.name);
          created.push(agent.name);
          appliedAgents.set(agent.name, {
            id: createdAgent.id,
            resolvedName: createdAgent.name
          });

          // memFS reconciliation for freshly-created agents
          if (agent.memory) {
            const result = await reconcileMemfsForAgent(
              agent,
              createdAgent.id,
              client,
              gitClient,
              memfsReconciler,
              config.root_path || process.cwd(),
            );
            memfsResults.push(result);
            logMemfsResult(result, agent.name);
            if (memfsResultRequiresRecompile(result) && !options.skipRecompile) {
              await recompileConversationsForAgent(createdAgent.id, createdAgent.name, client, options.waitForIdle !== false);
            }
          }
          const secretResult = await reconcileSecretsForAgent(config, agent, createdAgent.id, client, false, pruneTargets.secrets);
          if (secretResult) {
            secretResults.push(secretResult);
            logSecretResult(secretResult, agent.name);
          }
          await ensureDeclaredConversationsForAgent(agent, createdAgent.id, client, verbose);
        }
      } catch (err: any) {
        const errorMsg = formatLettaError(err.message);
        failed.push({ name: agent.name, err: errorMsg });
        warn(`Failed: ${agent.name}: ${errorMsg}`);
        // Continue processing remaining agents (kubectl-style)
      }
    }

    // Display summary
    const summaryData = { succeeded, failed, unchanged: skipped };
    if (failed.length > 0) {
      output('');
      output(displayApplySummary(summaryData));
      throw new Error(`${failed.length} agent(s) failed to apply`);
    } else {
      log(displayApplySummary(summaryData));
    }

    // Post-promote cleanup: delete canary agents after promoting to production
    if (options.canary && options.promote && options.cleanup) {
      await cleanupCanaryAgents(config, canaryPrefix, client, options, spinnerEnabled, verbose);
    }

    // Post-apply fresh context: reset message buffer so agent reads blocks fresh
    let freshContextAgentIds = new Set<string>();
    if (options.freshContext && updated.length > 0) {
      let freshAgents = updated
        .filter(name => appliedAgents.has(name))
        .map(name => ({ id: appliedAgents.get(name)!.id, name: appliedAgents.get(name)!.resolvedName }));

      if (options.freshContextTags) {
        const tagFilter = options.freshContextTags.split(',').map(t => t.trim()).filter(Boolean);
        const taggedAgents = await client.listAgents({ tags: tagFilter });
        const taggedIds = new Set(
          (Array.isArray(taggedAgents) ? taggedAgents : (taggedAgents as any).items || [])
            .map((a: any) => a.id)
        );
        freshAgents = freshAgents.filter(a => taggedIds.has(a.id));
      }

      if (options.freshContextMatch) {
        freshAgents = freshAgents.filter(a => minimatch(a.name, options.freshContextMatch!));
      }

      if (freshAgents.length > 0) {
        log(`\nRecompiling context for ${freshAgents.length} updated agent(s)...`);
        if (options.waitForIdle !== false) {
          const nameById = new Map(freshAgents.map(a => [a.id, a.name]));
          await waitForAgentIdle(client, freshAgents.map(a => a.id), {
            ...defaultWaitLogger(id => nameById.get(id) || id),
          });
        }
        for (const agent of freshAgents) {
          try {
            const convList = await client.listConversations(agent.id);
            const conversations = Array.isArray(convList) ? convList : [];
            if (conversations.length === 0) {
              // No conversations — fall back to agent-level reset
              await client.resetMessages(agent.id, true);
              log(`  OK ${agent.name} (reset, no conversations)`);
            } else {
              const { succeeded } = await batchProcess(
                conversations,
                (conv: any) => retryOn409(() => client.recompileConversation(conv.id))
              );
              log(`  OK ${agent.name} (${succeeded}/${conversations.length} conversations recompiled)`);
            }
            freshContextAgentIds.add(agent.id);
          } catch (err: any) {
            warn(`  FAIL ${agent.name}: ${err.message}`);
          }
        }
      } else {
        if (verbose) log('No agents matched fresh-context filters');
      }
    }

    // Post-apply compaction: compact conversation history to clear stale context
    // Skip agents that already had fresh-context (no point compacting an empty buffer)
    if (options.compact && updated.length > 0) {
      let compactAgents = updated
        .filter(name => appliedAgents.has(name))
        .map(name => ({ id: appliedAgents.get(name)!.id, name: appliedAgents.get(name)!.resolvedName }))
        .filter(a => !freshContextAgentIds.has(a.id));

      if (options.compactTags) {
        const tagFilter = options.compactTags.split(',').map(t => t.trim()).filter(Boolean);
        const taggedAgents = await client.listAgents({ tags: tagFilter });
        const taggedIds = new Set(
          (Array.isArray(taggedAgents) ? taggedAgents : (taggedAgents as any).items || [])
            .map((a: any) => a.id)
        );
        compactAgents = compactAgents.filter(a => taggedIds.has(a.id));
      }

      if (options.compactMatch) {
        compactAgents = compactAgents.filter(a => minimatch(a.name, options.compactMatch!));
      }

      if (compactAgents.length > 0) {
        log(`\nCompacting ${compactAgents.length} updated agent(s)...`);
        if (options.waitForIdle !== false) {
          const nameById = new Map(compactAgents.map(a => [a.id, a.name]));
          await waitForAgentIdle(client, compactAgents.map(a => a.id), {
            ...defaultWaitLogger(id => nameById.get(id) || id),
          });
        }
        for (const agent of compactAgents) {
          try {
            const startTime = Date.now();
            const result = await client.compactMessages(agent.id);
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            const before = (result as any).num_messages_before ?? '?';
            const after = (result as any).num_messages_after ?? '?';
            log(`  OK ${agent.name} (${duration}s, ${before} → ${after} messages)`);
          } catch (err: any) {
            warn(`  FAIL ${agent.name}: ${err.message}`);
          }
        }
      } else {
        if (verbose) log('No agents matched compaction filters');
      }
    }

    // Post-apply recalibration: send calibration message to updated agents
    if (options.recalibrate && updated.length > 0) {
      // Collect agents that had changes applied
      let recalibrateAgents = updated
        .filter(name => appliedAgents.has(name))
        .map(name => ({ id: appliedAgents.get(name)!.id, name: appliedAgents.get(name)!.resolvedName }));

      // Filter by tags if specified
      if (options.recalibrateTags) {
        const tagFilter = options.recalibrateTags.split(',').map(t => t.trim()).filter(Boolean);
        const taggedAgents = await client.listAgents({ tags: tagFilter });
        const taggedIds = new Set(
          (Array.isArray(taggedAgents) ? taggedAgents : (taggedAgents as any).items || [])
            .map((a: any) => a.id)
        );
        recalibrateAgents = recalibrateAgents.filter(a => taggedIds.has(a.id));
      }

      // Filter by glob pattern if specified
      if (options.recalibrateMatch) {
        recalibrateAgents = recalibrateAgents.filter(a => minimatch(a.name, options.recalibrateMatch!));
      }

      if (recalibrateAgents.length > 0) {
        const calibrationMessage = options.recalibrateMessage ||
          'Your tools and instructions have been updated. Review your system prompt for any changes.';

        log(`\nRecalibrating ${recalibrateAgents.length} updated agent(s)...`);

        if (options.waitForIdle !== false) {
          const nameById = new Map(recalibrateAgents.map(a => [a.id, a.name]));
          await waitForAgentIdle(client, recalibrateAgents.map(a => a.id), {
            ...defaultWaitLogger(id => nameById.get(id) || id),
          });
        }

        if (options.wait === false) {
          // Fire-and-forget: send async messages without polling
          for (const agent of recalibrateAgents) {
            try {
              await client.createAsyncMessage(agent.id, {
                messages: [{ role: 'user', content: calibrationMessage }]
              });
              log(`  Sent recalibration to ${agent.name}`);
            } catch (err: any) {
              warn(`  Failed to send recalibration to ${agent.name}: ${err.message}`);
            }
          }
          log('Recalibration messages sent (not waiting for responses)');
        } else {
          const results = await bulkSendMessage(calibrationMessage, {
            agents: recalibrateAgents,
            confirm: true,  // skip confirmation — user already opted in via --recalibrate
            verbose,
            collectResponse: true,
            waitForIdle: false,  // pre-waited above
          }, (msg) => log(msg));

          // Display agent responses
          const responded = results.filter(r => r.responseText);
          if (responded.length > 0) {
            log('');
            for (const r of responded) {
              log(`${r.agentName}:`);
              log(`  ${r.responseText!.replace(/\n/g, '\n  ')}`);
            }
          }
        }
      } else {
        if (verbose) log('No agents matched recalibration filters');
      }
    }

    // Only generate manifest if explicitly requested via --manifest flag
    if (options.manifest !== undefined) {
      // --manifest without path gives true, --manifest <path> gives the path string
      const manifestPath = typeof options.manifest === 'string'
        ? path.resolve(options.manifest)
        : getDefaultManifestPath(options.file);
      const manifest = buildAgentManifest({
        config,
        configPath: options.file,
        basePath: parser.basePath,
        appliedAgents,
        agentManager,
        blockManager,
        archiveManager,
        sharedBlockIds,
        toolNameToId,
        folderNameToId: createdFolders,
        mcpServerNameToId
      });
      writeAgentManifest(manifest, manifestPath);
      log(`Agent manifest written to ${manifestPath}`);
    }

    // Build result with agent name → ID mapping
    const resultAgents: Record<string, string> = {};
    for (const [name, info] of appliedAgents) {
      resultAgents[name] = info.id;
    }

    return { agents: resultAgents, created, updated, unchanged: skipped };

  } catch (err: any) {
    throw new Error(`Apply failed: ${formatLettaError(err.message || err)}`);
  }
}

function memfsResultRequiresRecompile(result: MemfsExecutionResult | undefined): boolean {
  return Boolean(result && result.status === 'applied' && (
    result.kind === 'migrate-forward' ||
    result.kind === 'sync-files-only' ||
    result.kind === 'rollback'
  ));
}

async function recompileConversationsForAgent(
  agentId: string,
  agentName: string,
  client: LettaClientWrapper,
  waitForIdle: boolean,
): Promise<void> {
  const conversations = await client.listConversations(agentId);
  const list = Array.isArray(conversations) ? conversations : [];
  if (list.length === 0) return;

  if (waitForIdle) {
    await waitForAgentIdle(client, agentId, {
      ...defaultWaitLogger(() => agentName),
    });
  }

  const { succeeded } = await batchProcess(
    list,
    (conversation: any) => retryOn409(() => client.recompileConversation(conversation.id)),
  );
  log(`  Recompiled ${succeeded}/${list.length} conversation(s) after MemFS sync`);
}

/**
 * `--reproject-skills`: force Letta to re-render skill blocks on a running
 * git-memory agent. Letta Cloud re-renders `system/*` on recompile but never
 * re-projects a `skills/*​/SKILL.md` content update on a running agent — only
 * recreation or a detach+re-attach does. This runs regardless of the memfs diff
 * (so it also fixes an already-stale agent whose repo is already current), then
 * agent-level recompiles. Content- and conversation-preserving.
 */
async function maybeReprojectSkills(
  agentId: string,
  agentName: string,
  memoryMode: string | undefined,
  memfsReconciler: MemfsReconciler,
  client: LettaClientWrapper,
  options: any,
): Promise<void> {
  if (!options.reprojectSkills || options.dryRun) return;
  if (memoryMode !== 'memfs') return;
  const prefix = `  [memfs:${agentName}]`;
  if (options.waitForIdle !== false) {
    await waitForAgentIdle(client, agentId, { ...defaultWaitLogger(() => agentName) });
  }
  try {
    const skills = await memfsReconciler.reprojectSkills(agentId);
    if (skills.length === 0) {
      log(`${prefix} reproject: no skills found`);
      return;
    }
    await client.recompileAgent(agentId);
    log(`${prefix} ✓ reprojected ${skills.length} skill(s): ${skills.join(', ')}`);
  } catch (e: any) {
    warn(`${prefix} reproject FAILED: ${e?.message ?? e}`);
  }
}

async function ensureDeclaredConversationsForAgent(
  agent: any,
  agentId: string,
  client: LettaClientWrapper,
  verbose: boolean,
): Promise<number> {
  if (!agent.conversations?.length) return 0;

  const existingConversations = await client.listConversations(agentId);
  const existingSummaries = new Set(
    (Array.isArray(existingConversations) ? existingConversations : [])
      .map((conversation: any) => conversation.summary || ''),
  );
  let created = 0;

  for (const conversation of agent.conversations) {
    if (existingSummaries.has(conversation.summary)) continue;
    if (verbose) log(`  Creating conversation after sidecar sync: ${conversation.summary}`);
    await client.createConversation(agentId, {
      summary: conversation.summary,
      isolated_block_labels: conversation.isolated_blocks,
    });
    existingSummaries.add(conversation.summary);
    created += 1;
  }

  if (created > 0) {
    log(`  Created ${created} conversation(s) after sidecar sync`);
  }

  return created;
}

async function reconcileSecretsForAgent(
  config: any,
  agent: any,
  agentId: string,
  client: LettaClientWrapper,
  dryRun: boolean,
  prune: boolean = false,
): Promise<SecretApplyResult | null> {
  try {
    const plan = await planAgentSecrets(client, config, agent, agentId, prune);
    if (!plan) return null;
    return await applySecretPlan(client, plan, dryRun);
  } catch (err) {
    return {
      kind: 'sync',
      agentId,
      status: 'failed',
      diff: { toAdd: [], toUpdate: [], toRemove: [] },
      error: `secret reconcile failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Run the memFS reconciler for a single agent. Pulls server state, computes
 * the diff, executes (or dry-runs). Returns the result (for logging) on success.
 *
 * THROWS on any materialization failure (thrown error OR in-band status:'failed')
 * so the per-agent catch in the apply loop records it in failed[] and the apply
 * fails — never a silent shell agent. Still kubectl-style: other agents continue,
 * the summary throws at the end.
 */
async function reconcileMemfsForAgent(
  agent: any,
  agentId: string,
  client: LettaClientWrapper,
  gitClient: GitClient,
  memfsReconciler: MemfsReconciler,
  rootPath: string,
): Promise<MemfsExecutionResult> {
  let result: MemfsExecutionResult;
  try {
    const serverState = await buildServerAgentState(client, gitClient, agentId);
    const action = computeMemfsAction(agent.name, agent, serverState, rootPath);
    result = await memfsReconciler.execute(action);
  } catch (err) {
    // Fail loud: a thrown reconcile error must abort THIS agent's apply so the
    // per-agent catch records it in failed[] — never silently return a failed
    // result that the caller treats as a successful (shell) deploy.
    throw new Error(`memFS reconcile failed for ${agent.name}: ${(err as Error).message}`);
  }
  // In-band failures (executor remote-verify / post-flip verify) return a
  // status:'failed' result rather than throwing — surface those the same way.
  // (status:'applied' with an error stays a soft warning — do not throw on it.)
  if (result.status === 'failed') {
    throw new Error(`memFS materialization failed for ${agent.name}: ${result.error ?? '(no detail)'}`);
  }
  return result;
}

function logSecretResult(result: SecretApplyResult, agentName: string): void {
  const prefix = `  [secrets:${agentName}]`;
  switch (result.status) {
    case 'noop':
      log(`${prefix} no-op`);
      break;
    case 'dry-run':
      log(`${prefix} DRY-RUN sync: ${formatSecretDiff(result.diff)}`);
      break;
    case 'applied':
      log(`${prefix} ✓ synced ${formatSecretDiff(result.diff)}`);
      break;
    case 'failed':
      warn(`${prefix} FAILED: ${result.error ?? '(no detail)'}`);
      break;
  }
}

function formatSecretDiff(diff: { toAdd: string[]; toUpdate: string[]; toRemove: string[] }): string {
  const parts: string[] = [];
  if (diff.toAdd.length) parts.push(`add ${diff.toAdd.join(', ')}`);
  if (diff.toUpdate.length) parts.push(`update ${diff.toUpdate.join(', ')}`);
  if (diff.toRemove.length) parts.push(`remove ${diff.toRemove.join(', ')}`);
  return parts.length ? parts.join('; ') : '0 changes';
}

function logMemfsResult(result: MemfsExecutionResult, agentName: string): void {
  const prefix = `  [memfs:${agentName}]`;
  switch (result.status) {
    case 'noop':
      log(`${prefix} no-op`);
      break;
    case 'dry-run':
      if (result.kind === 'migrate-forward') {
        const del = result.filesDeleted?.length ? `, ${result.filesDeleted.length} deleted` : '';
        log(`${prefix} DRY-RUN migrate-forward: ${result.filesChanged?.length ?? 0} files${del} → bare repo, then add git-memory-enabled tag (backup: ${result.backupPath})`);
        for (const p of result.filesDeleted ?? []) log(`${prefix}   delete: ${p}`);
      } else if (result.kind === 'rollback') {
        log(`${prefix} DRY-RUN rollback: remove git-memory-enabled tag`);
      } else if (result.kind === 'sync-files-only') {
        const del = result.filesDeleted?.length ? `, ${result.filesDeleted.length} deleted` : '';
        log(`${prefix} DRY-RUN sync-files-only: ${result.filesChanged?.length ?? 0} changed${del}`);
        for (const p of result.filesDeleted ?? []) log(`${prefix}   delete: ${p}`);
      }
      break;
    case 'applied':
      if (result.kind === 'migrate-forward') {
        const del = result.filesDeleted?.length ? `, ${result.filesDeleted.length} deleted` : '';
        log(`${prefix} ✓ migrated to memfs (${result.filesChanged?.length} files${del}, commit ${result.commitSha?.slice(0, 7)}, backup ${result.backupPath})`);
        for (const p of result.filesDeleted ?? []) log(`${prefix}   deleted: ${p}`);
        if (result.error) warn(`${prefix} ${result.error}`);
      } else if (result.kind === 'rollback') {
        log(`${prefix} ✓ rolled back to block-mode (tag removed)`);
      } else if (result.kind === 'sync-files-only') {
        const del = result.filesDeleted?.length ? `, ${result.filesDeleted.length} deleted` : '';
        log(`${prefix} ✓ synced ${result.filesChanged?.length ?? 0} changed${del} (commit ${result.commitSha?.slice(0, 7)})`);
        for (const p of result.filesDeleted ?? []) log(`${prefix}   deleted: ${p}`);
      }
      break;
    case 'failed':
      warn(`${prefix} FAILED: ${result.error ?? '(no detail)'}`);
      break;
  }

  // A bare-repo push does NOT refresh a RUNNING agent's MemFS working tree. The
  // runtime clones state.git and only re-pulls on cold-start / manual reload, so
  // a warm self-managed runtime keeps serving the old files until something runs
  // `git fetch && git reset --hard` in its container on session start. Surface
  // this so a green apply isn't mistaken for "running agents are updated".
  const pushedFiles =
    (result.kind === 'sync-files-only' || result.kind === 'migrate-forward') &&
    ((result.filesChanged?.length ?? 0) + (result.filesDeleted?.length ?? 0)) > 0;
  if (pushedFiles && (result.status === 'applied' || result.status === 'dry-run')) {
    warn(
      `${prefix} note: pushed to the bare repo — running agents do NOT auto-pull this. ` +
      `They refresh on cold-start; warm self-managed runtimes must git fetch+reset on session start ` +
      `(a push alone won't update a live agent).`,
    );
  }
}
