import { LettaClientWrapper } from '../../lib/letta-client';
import { AgentResolver } from '../../lib/agent-resolver';
import { output, error, warn } from '../../lib/logger';

export default async function updateCommand(
  resource: string,
  name: string,
  options: {
    name?: string;
    description?: string;
    model?: string;
    system?: string;
    contextWindow?: number;
    embedding?: string;
    timezone?: string;
    tags?: string;
    addTool?: string;
    removeTool?: string;
  },
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;

  try {
    if (resource !== 'agent') {
      throw new Error('Only "agent" resource is currently supported for updates');
    }

    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);

    // Find the agent
    const { agent } = await resolver.findAgentByName(name);

    if (verbose) {
      output(`Updating agent: ${agent.name} (${agent.id})`);
    }

    // Build update payload
    const updatePayload: any = {};

    if (options.name) updatePayload.name = options.name;
    if (options.description) updatePayload.description = options.description;
    if (options.model) updatePayload.model = options.model;
    if (options.system) updatePayload.system = options.system;
    if (options.contextWindow) updatePayload.context_window_limit = options.contextWindow;
    if (options.embedding) updatePayload.embedding = options.embedding;
    if (options.timezone) updatePayload.timezone = options.timezone;
    if (options.tags) {
      updatePayload.tags = options.tags.split(',').map(tag => tag.trim());
    }

    // Handle tool additions/removals
    let toolChanges = false;

    if (options.addTool) {
      const toolsToAdd = options.addTool.split(',').map(t => t.trim());
      for (const toolName of toolsToAdd) {
        try {
          // Try to find tool by name (handles core tools)
          let tool = await client.getToolByName(toolName);

          if (!tool) {
            // Try finding by ID if it looks like one
            const allTools = await client.listTools();
            const toolList = Array.isArray(allTools) ? allTools : (allTools as any).items || [];
            tool = toolList.find((t: any) => t.id === toolName || t.name === toolName);
          }

          if (tool) {
            if (verbose) output(`Attaching tool ${tool.name} (${tool.id})...`);
            await client.attachToolToAgent(String(agent.id), String(tool.id));
            output(`Tool attached: ${tool.name}`);
            toolChanges = true;
          } else {
            warn(`Warning: Tool '${toolName}' not found.`);
          }
        } catch (err: any) {
          error(`Failed to attach tool ${toolName}:`, err.message);
        }
      }
    }

    if (options.removeTool) {
      const toolsToRemove = options.removeTool.split(',').map(t => t.trim());
      for (const toolName of toolsToRemove) {
        try {
          // Need to find the tool first to get ID
          let toolId = toolName;
          let toolNameDisplay = toolName;

          // If it doesn't look like an ID, resolve it
          if (!toolName.startsWith('tool-')) {
            let tool = await client.getToolByName(toolName);

            if (!tool) {
              // Fallback search
              const allTools = await client.listTools();
              const toolList = Array.isArray(allTools) ? allTools : (allTools as any).items || [];
              tool = toolList.find((t: any) => t.name === toolName);
            }

            if (tool) {
              toolId = String(tool.id);
              toolNameDisplay = String(tool.name);
            }
          }

          if (verbose) output(`Detaching tool ${toolNameDisplay} (${toolId})...`);
          await client.detachToolFromAgent(String(agent.id), String(toolId));
          output(`Tool detached: ${toolNameDisplay}`);
          toolChanges = true;
        } catch (err: any) {
          warn(`Failed to detach tool ${toolName}:`, err.message);
        }
      }
    }

    if (Object.keys(updatePayload).length === 0 && !toolChanges) {
      output('No updates specified. Use --help to see available options.');
      return;
    }

    if (verbose) {
      output('Update payload:', JSON.stringify(updatePayload, null, 2));
    }

    // Update the agent
    if (Object.keys(updatePayload).length > 0) {
      const updatedAgent = await client.updateAgent(agent.id, updatePayload);

      output(`Agent ${agent.name} updated successfully`);

      if (verbose) {
        output(`Updated agent ID: ${updatedAgent.id}`);
        if (updatePayload.name) output(`Name changed to: ${updatePayload.name}`);
        if (updatePayload.model) output(`Model changed to: ${updatePayload.model}`);
        if (updatePayload.embedding) output(`Embedding changed to: ${updatePayload.embedding}`);
      }
    } else if (toolChanges) {
      output(`Agent ${agent.name} updated successfully`);
    }

  } catch (err: any) {
    error(`Failed to update agent ${name}:`, err.message);
    throw err;
  }
}
