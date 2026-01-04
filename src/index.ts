#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../package.json';
import { applyCommand } from './commands/apply';
import getCommand from './commands/get';
import deleteCommand, { deleteAllCommand } from './commands/delete';
import describeCommand from './commands/describe';
import updateCommand from './commands/update';
import exportCommand from './commands/export';
import importCommand from './commands/import';
import createCommand from './commands/create';
import { 
  listMessagesCommand, 
  sendMessageCommand, 
  resetMessagesCommand, 
  compactMessagesCommand, 
  cancelMessagesCommand 
} from './commands/messages';
import { validateCommand } from './commands/validate';

// Global verbose flag for error handling
let verboseMode = false;

// Validate required environment variables
function validateEnvironment(thisCommand: any, actionCommand: any) {
  // Capture verbose flag for global error handler
  verboseMode = thisCommand.opts().verbose || false;

  if (!process.env.LETTA_BASE_URL) {
    console.error('Error: LETTA_BASE_URL environment variable is required');
    console.error('');
    console.error('For self-hosting:');
    console.error('  export LETTA_BASE_URL=http://localhost:8283');
    console.error('');
    console.error('For Letta Cloud:');
    console.error('  export LETTA_BASE_URL=https://api.letta.com');
    console.error('  export LETTA_API_KEY=your_api_key');
    process.exit(1);
  }

  // API key required unless localhost (self-hosting)
  const isLocalhost = process.env.LETTA_BASE_URL.includes('localhost');

  if (!isLocalhost && !process.env.LETTA_API_KEY) {
    console.error(`Error: LETTA_API_KEY is required for Letta Cloud (${process.env.LETTA_BASE_URL})`);
    console.error('Set it with: export LETTA_API_KEY=your_api_key');
    process.exit(1);
  }
}

const program = new Command();

program
  .name('lettactl')
  .description('kubectl-style CLI for managing Letta AI agent fleets')
  .version(version)
  .option('-v, --verbose', 'enable verbose output')
  .option('--no-spinner', 'disable loading spinners')
  .hook('preAction', validateEnvironment);

// Apply command - deploy fleet from YAML
program
  .command('apply')
  .description('Deploy agents from configuration')
  .option('-f, --file <path>', 'agent YAML configuration file', 'agents.yml')
  .option('--agent <pattern>', 'deploy only agents matching pattern')
  .option('--match <pattern>', 'apply template config to all existing agents matching glob pattern')
  .option('--dry-run', 'show what would be created without making changes')
  .option('--root <path>', 'root directory for resolving file paths')
  .action(applyCommand);

// Get command - list resources
program
  .command('get')
  .description('Display resources (agents, blocks, tools, folders, mcp-servers)')
  .argument('<resource>', 'resource type (agents|blocks|tools|folders|mcp-servers)')
  .argument('[name]', 'specific resource name (optional)')
  .option('-o, --output <format>', 'output format (table|json|yaml)', 'table')
  .option('-a, --agent <name>', 'filter by agent name (for blocks, tools, folders)')
  .option('--shared', 'show only resources attached to 2+ agents')
  .option('--orphaned', 'show only resources attached to 0 agents')
  .action(getCommand);

// Describe command - detailed agent info
program
  .command('describe')
  .description('Show detailed information about a resource')
  .argument('<resource>', 'resource type (agent|block|tool|folder|mcp-servers)')
  .argument('<name>', 'resource name')
  .option('-o, --output <format>', 'output format (table, json)', 'table')
  .action(describeCommand);

// Delete command - remove resources
program
  .command('delete')
  .description('Delete a resource')
  .argument('<resource>', 'resource type (agent|mcp-servers)')
  .argument('<name>', 'resource name')
  .option('--force', 'force deletion without confirmation')
  .action(deleteCommand);

// Delete all command - bulk delete agents
program
  .command('delete-all')
  .description('Delete multiple agents (with optional pattern matching)')
  .argument('<resource>', 'resource type (agent|agents)')
  .option('--pattern <pattern>', 'regex pattern to match agent names/IDs')
  .option('--force', 'force deletion without confirmation')
  .action(deleteAllCommand);

// Create command - create new agents
program
  .command('create')
  .description('Create a new agent')
  .argument('<resource>', 'resource type (agent)')
  .argument('<name>', 'agent name')
  .option('-d, --description <text>', 'agent description')
  .option('-m, --model <model>', 'LLM model (e.g., google_ai/gemini-2.5-pro)')
  .option('-s, --system <text>', 'system prompt')
  .option('-c, --context-window <number>', 'context window size', parseInt)
  .option('-e, --embedding <embedding>', 'embedding model')
  .option('-t, --timezone <timezone>', 'agent timezone')
  .option('--tags <tags>', 'comma-separated tags')
  .option('--agent-type <type>', 'agent type')
  .option('--tools <tools>', 'comma-separated tool IDs')
  .option('--memory-blocks <blocks>', 'comma-separated memory block IDs')
  .action(createCommand);

// Update command - modify existing agents
program
  .command('update')
  .description('Update an existing agent')
  .argument('<resource>', 'resource type (agent)')
  .argument('<name>', 'agent name')
  .option('-n, --name <name>', 'new agent name')
  .option('-d, --description <text>', 'new description')
  .option('-m, --model <model>', 'new LLM model')
  .option('-s, --system <text>', 'new system prompt')
  .option('-c, --context-window <number>', 'new context window size', parseInt)
  .option('-e, --embedding <embedding>', 'new embedding model')
  .option('-t, --timezone <timezone>', 'new timezone')
  .option('--tags <tags>', 'comma-separated tags')
  .option('--add-tool <tools>', 'comma-separated tool names/IDs to add')
  .option('--remove-tool <tools>', 'comma-separated tool names/IDs to remove')
  .action(updateCommand);

// Export command - export agents to files
program
  .command('export')
  .description('Export an agent to a file')
  .argument('<resource>', 'resource type (agent)')
  .argument('<name>', 'agent name')
  .option('-o, --output <file>', 'output filename')
  .option('--max-steps <number>', 'maximum steps to export', parseInt)
  .option('--legacy-format', 'use legacy v1 format')
  .action(exportCommand);

// Import command - import agents from files
program
  .command('import')
  .description('Import an agent from a file')
  .argument('<file>', 'path to agent export file')
  .option('-n, --name <name>', 'override agent name')
  .option('--append-copy', 'append "_copy" suffix to agent name')
  .option('-e, --embedding <embedding>', 'override embedding model')
  .option('--override-tools', 'allow overwriting existing tool source code')
  .option('--strip-messages', 'remove agent messages during import')
  .option('--secrets <json>', 'secrets JSON string')
  .option('--env-vars <json>', 'environment variables JSON string')
  .action(importCommand);

// Validate command - check YAML config
program
  .command('validate')
  .description('Validate agent configuration')
  .option('-f, --file <path>', 'agent YAML configuration file', 'agents.yml')
  .action(validateCommand);

// Message commands
// List messages (replaces old logs command)
program
  .command('messages')
  .description('List agent conversation messages')
  .argument('<agent>', 'agent name')
  .option('-l, --limit <number>', 'number of messages to show', parseInt)
  .option('--order <order>', 'sort order (asc|desc)', 'desc')
  .option('--before <id>', 'show messages before this message ID')
  .option('--after <id>', 'show messages after this message ID')
  .option('-o, --output <format>', 'output format (table|json)', 'table')
  .action(listMessagesCommand);

// Send message to agent
program
  .command('send')
  .description('Send a message to an agent')
  .argument('<agent>', 'agent name')
  .argument('<message>', 'message to send')
  .option('--stream', 'stream the response')
  .option('--async', 'send message asynchronously')
  .option('--max-steps <number>', 'maximum processing steps', parseInt)
  .option('--enable-thinking', 'enable agent reasoning')
  .action(sendMessageCommand);

// Reset agent messages
program
  .command('reset-messages')
  .description('Reset an agent\'s conversation history')
  .argument('<agent>', 'agent name')
  .option('--add-default', 'add default initial messages after reset')
  .action(resetMessagesCommand);

// Compact agent messages
program
  .command('compact-messages')
  .description('Compact an agent\'s conversation history')
  .argument('<agent>', 'agent name')
  .action(compactMessagesCommand);

// Cancel running messages
program
  .command('cancel-messages')
  .description('Cancel running message processes for an agent')
  .argument('<agent>', 'agent name')
  .option('--run-ids <ids>', 'comma-separated run IDs to cancel')
  .action(cancelMessagesCommand);

// Config command - show current Letta config
program
  .command('config')
  .description('Manage Letta configuration')
  .command('view')
  .description('Show current Letta configuration')
  .action(async () => {
    console.log('Config view command');
    // TODO: Implement config view logic
  });

// Global error handler to prevent stack traces from leaking
process.on('unhandledRejection', (error: any) => {
  if (verboseMode) {
    console.error(error);
  } else {
    console.error(error?.message || error);
  }
  process.exit(1);
});

program.parse();