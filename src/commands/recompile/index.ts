import { LettaClientWrapper } from '../../lib/client/letta-client';
import { AgentResolver } from '../../lib/client/agent-resolver';
import { createSpinner, getSpinnerEnabled } from '../../lib/ux/spinner';
import { log, output, warn } from '../../lib/shared/logger';

export async function recompileCommand(
  agentName: string,
  options: { conversationId?: string; all?: boolean },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  const spinnerEnabled = getSpinnerEnabled(command);

  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  const { agent } = await resolver.findAgentByName(agentName);

  if (options.conversationId) {
    const spinner = createSpinner(`Recompiling conversation...`, spinnerEnabled).start();
    try {
      await client.recompileConversation(options.conversationId);
      spinner.succeed(`Recompiled conversation ${options.conversationId}`);
    } catch (err: any) {
      spinner.fail(`Failed to recompile: ${err.message}`);
      throw err;
    }
    return;
  }

  // Recompile all conversations for the agent
  const spinner = createSpinner(`Loading conversations for ${agent.name}...`, spinnerEnabled).start();
  const convList = await client.listConversations(agent.id);
  const conversations = Array.isArray(convList) ? convList : [];

  if (conversations.length === 0) {
    spinner.succeed(`No conversations to recompile for ${agent.name}`);
    return;
  }

  spinner.text = `Recompiling ${conversations.length} conversation(s)...`;
  let succeeded = 0;
  for (const conv of conversations) {
    try {
      await client.recompileConversation(conv.id);
      succeeded++;
      if (verbose) log(`  OK ${conv.id}`);
    } catch (err: any) {
      warn(`  FAIL ${conv.id}: ${err.message}`);
    }
  }

  spinner.succeed(`Recompiled ${succeeded}/${conversations.length} conversation(s) for ${agent.name}`);
}
