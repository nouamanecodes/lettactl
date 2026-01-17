import { LettaClientWrapper } from '../lib/letta-client';
import { createSpinner, getSpinnerEnabled } from '../lib/ux/spinner';

export default async function createCommand(
  resource: string,
  name: string,
  options: { 
    description?: string;
    model?: string;
    system?: string;
    contextWindow?: number;
    embedding?: string;
    timezone?: string;
    tags?: string;
    agentType?: string;
    tools?: string;
    memoryBlocks?: string;
  }, 
  command: any
) {
  const verbose = command.parent?.opts().verbose || false;
  
  try {
    if (resource !== 'agent') {
      throw new Error('Only "agent" resource is currently supported for creation');
    }

    const client = new LettaClientWrapper();

    if (verbose) {
      console.log(`Creating agent: ${name}`);
    }

    // Build create payload
    const createPayload: any = {
      name: name
    };

    if (options.description) createPayload.description = options.description;
    if (options.model) createPayload.model = options.model;
    if (options.system) createPayload.system = options.system;
    if (options.contextWindow) createPayload.context_window_limit = options.contextWindow;
    if (options.embedding) createPayload.embedding = options.embedding;
    if (options.timezone) createPayload.timezone = options.timezone;
    if (options.agentType) createPayload.agent_type = options.agentType;
    
    if (options.tags) {
      createPayload.tags = options.tags.split(',').map(tag => tag.trim());
    }
    
    if (options.tools) {
      // Assume tools are provided as comma-separated tool IDs
      createPayload.tool_ids = options.tools.split(',').map(tool => tool.trim());
    }
    
    if (options.memoryBlocks) {
      // Assume memory blocks are provided as comma-separated block IDs
      createPayload.block_ids = options.memoryBlocks.split(',').map(block => block.trim());
    }

    // Set defaults if not provided
    if (!createPayload.model) createPayload.model = "google_ai/gemini-2.5-pro";
    if (!createPayload.embedding) createPayload.embedding = "letta/letta-free";
    if (!createPayload.system) createPayload.system = "You are a helpful AI assistant.";

    if (verbose) {
      console.log('Create payload:', JSON.stringify(createPayload, null, 2));
    }

    // Create the agent
    const spinner = createSpinner(`Creating agent ${name}...`, getSpinnerEnabled(command)).start();
    
    try {
      const createdAgent = await client.createAgent(createPayload);
      
      spinner.succeed(`Agent ${name} created successfully`);
      console.log(`Agent ID: ${createdAgent.id}`);
      
      if (verbose) {
        console.log(`Model: ${createdAgent.model || createPayload.model}`);
        console.log(`Embedding: ${createdAgent.embedding || createPayload.embedding}`);
        if (createPayload.description) console.log(`Description: ${createPayload.description}`);
        if (createPayload.tags) console.log(`Tags: ${createPayload.tags.join(', ')}`);
      }
    } catch (error: any) {
      spinner.fail(`Failed to create agent ${name}`);
      throw error;
    }

  } catch (error: any) {
    console.error(`Failed to create agent ${name}:`, error.message);
    throw error;
  }
}