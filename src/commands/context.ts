import { AgentResolver } from '../lib/agent-resolver';
import { LettaClientWrapper } from '../lib/letta-client';
import { OutputFormatter } from '../lib/ux/output-formatter';

interface ContextWindow {
  context_window_size_max: number;
  context_window_size_current: number;
  num_messages: number;
  num_archival_memory: number;
  num_recall_memory: number;
  num_tokens_external_memory_summary: number;
  num_tokens_system: number;
  num_tokens_core_memory: number;
  num_tokens_summary_memory: number;
  num_tokens_functions_definitions: number;
  num_tokens_messages: number;
}

export async function contextCommand(agentName: string, options: { output?: string }, command: any) {
  const verbose = command.parent?.opts().verbose || false;
  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);

  // Resolve agent name to ID
  const { agent } = await resolver.findAgentByName(agentName);
  if (!agent) {
    console.error(`Agent "${agentName}" not found`);
    process.exit(1);
  }

  // Fetch context
  const baseUrl = process.env.LETTA_BASE_URL;
  const response = await fetch(`${baseUrl}/v1/agents/${agent.id}/context`);

  if (!response.ok) {
    console.error(`Failed to fetch context: ${response.status}`);
    process.exit(1);
  }

  const ctx = await response.json() as ContextWindow;

  if (OutputFormatter.handleJsonOutput(ctx, options.output)) {
    return;
  }

  console.log(`Context Window: ${agentName}`);
  console.log('='.repeat(40));

  // Usage bar
  const pct = Math.round((ctx.context_window_size_current / ctx.context_window_size_max) * 100);
  const barWidth = 30;
  const filled = Math.round((pct / 100) * barWidth);
  const bar = '[' + '#'.repeat(filled) + '-'.repeat(barWidth - filled) + ']';
  console.log(`\nUsage: ${bar} ${pct}%`);
  console.log(`       ${ctx.context_window_size_current.toLocaleString()} / ${ctx.context_window_size_max.toLocaleString()} tokens\n`);

  // Token breakdown
  console.log('Token Breakdown:');
  console.log(`  System prompt:     ${ctx.num_tokens_system.toLocaleString().padStart(8)}`);
  console.log(`  Core memory:       ${ctx.num_tokens_core_memory.toLocaleString().padStart(8)}`);
  console.log(`  Tool definitions:  ${ctx.num_tokens_functions_definitions.toLocaleString().padStart(8)}`);
  console.log(`  Messages:          ${ctx.num_tokens_messages.toLocaleString().padStart(8)}`);
  console.log(`  Memory summary:    ${ctx.num_tokens_external_memory_summary.toLocaleString().padStart(8)}`);
  if (ctx.num_tokens_summary_memory > 0) {
    console.log(`  Summary memory:    ${ctx.num_tokens_summary_memory.toLocaleString().padStart(8)}`);
  }

  // Memory counts
  console.log('\nMemory:');
  console.log(`  Messages in context:  ${ctx.num_messages}`);
  console.log(`  Recall memory:        ${ctx.num_recall_memory}`);
  console.log(`  Archival memory:      ${ctx.num_archival_memory}`);

  if (verbose) {
    // Show warnings if context is high
    console.log('\nStatus:');
    if (pct >= 90) {
      console.log('  [WARN] Context nearly full - consider compacting messages');
    } else if (pct >= 75) {
      console.log('  [INFO] Context usage high');
    } else {
      console.log('  [OK] Context usage healthy');
    }
  }
}
