#!/usr/bin/env node

import { Command } from 'commander';
import { version } from '../package.json';
import { applyCommand } from './commands/apply';
import getCommand from './commands/get';
import deleteCommand, { deleteAllCommand } from './commands/delete';
import { cleanupCommand } from './commands/cleanup';
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
import { healthCommand } from './commands/health';
import { filesCommand } from './commands/files';
import { contextCommand } from './commands/context';
import { listRunsCommand, getRunCommand, deleteRunCommand } from './commands/runs';
import { completionCommand } from './commands/completion';

import { setQuietMode, output, error } from './lib/logger';
import { printFancyHelp } from './lib/ux/help-formatter';

// Global verbose flag for error handling
let verboseMode = false;
let noUxMode = false;

// Validate required environment variables
function validateEnvironment(thisCommand: any, actionCommand: any) {
  // Capture verbose flag for global error handler
  verboseMode = thisCommand.opts().verbose || false;

  // Set quiet mode globally
  setQuietMode(thisCommand.opts().quiet || false);

  // Skip validation for completion command (doesn't need API access)
  if (actionCommand.name() === 'completion') {
    return;
  }

  if (!process.env.LETTA_BASE_URL) {
    error('Error: LETTA_BASE_URL environment variable is required');
    error('');
    error('For self-hosting:');
    error('  export LETTA_BASE_URL=http://localhost:8283');
    error('');
    error('For Letta Cloud:');
    error('  export LETTA_BASE_URL=https://api.letta.com');
    error('  export LETTA_API_KEY=your_api_key');
    process.exit(1);
  }

  // API key required unless localhost (self-hosting)
  const isLocalhost = process.env.LETTA_BASE_URL.includes('localhost');

  if (!isLocalhost && !process.env.LETTA_API_KEY) {
    error(`Error: LETTA_API_KEY is required for Letta Cloud (${process.env.LETTA_BASE_URL})`);
    error('Set it with: export LETTA_API_KEY=your_api_key');
    process.exit(1);
  }
}

const program = new Command();

program
  .name('lettactl')
  .description('kubectl-style CLI for managing Letta AI agent fleets')
  .version(version)
  .option('-v, --verbose', 'enable verbose output')
  .option('-q, --quiet', 'suppress progress output (for CI)')
  .option('--no-spinner', 'disable loading spinners')
  .option('--no-ux', 'plain output without fancy formatting (for CI/CD)')
  .hook('preAction', validateEnvironment);

// Check if fancy UX should be used
function shouldUseFancyUx(): boolean {
  return !process.argv.includes('--no-ux') && process.stdout.isTTY === true;
}

// Intercept help for main command to show fancy version
const originalHelpInformation = program.helpInformation.bind(program);
program.helpInformation = function() {
  if (shouldUseFancyUx()) {
    printFancyHelp();
    return '';
  }
  return originalHelpInformation();
};

// Apply command - deploy fleet from YAML
program
  .command('apply')
  .description('Deploy agents from configuration')
  .option('-f, --file <path>', 'agent YAML configuration file', 'agents.yml')
  .option('--agent <pattern>', 'deploy only agents matching pattern')
  .option('--match <pattern>', 'apply template config to all existing agents matching glob pattern')
  .option('--dry-run', 'show what would be created without making changes')
  .option('--force', 'remove resources not in config (strict reconciliation)')
  .option('--root <path>', 'root directory for resolving file paths')
  .action(applyCommand);

// Get command - list resources
program
  .command('get')
  .description('Display resources (agents, blocks, tools, folders, files, mcp-servers)')
  .argument('<resource>', 'resource type (agents|blocks|tools|folders|files|mcp-servers)')
  .argument('[name]', 'specific resource name (optional)')
  .option('-o, --output <format>', 'output format (table|json|yaml)', 'table')
  .option('-a, --agent <name>', 'filter by agent name (for blocks, tools, folders)')
  .option('--shared', 'show only resources attached to 2+ agents')
  .option('--orphaned', 'show only resources attached to 0 agents')
  .option('--short', 'truncate block values to 300 characters (use with: get blocks <agent>)')
  .action(getCommand);

// Describe command - detailed agent info
program
  .command('describe')
  .description('Show detailed information about a resource')
  .argument('<resource>', 'resource type (agent|block|tool|folder|file|mcp-servers)')
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

// Delete all command - bulk delete resources
program
  .command('delete-all')
  .description('Delete multiple resources (with optional pattern matching)')
  .argument('<resource>', 'resource type (agents|folders|blocks|tools|mcp-servers)')
  .option('--pattern <pattern>', 'regex pattern to match resource names/IDs')
  .option('--force', 'force deletion without confirmation')
  .action(deleteAllCommand);

// Cleanup command - remove orphaned resources
program
  .command('cleanup')
  .description('Delete orphaned resources (blocks, folders not attached to any agent)')
  .argument('<resource>', 'resource type (blocks|folders|all)')
  .option('--force', 'actually delete (default is dry-run)')
  .option('--dry-run', 'show what would be deleted without deleting')
  .action(cleanupCommand);

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
  .option('-l, --limit <number>', 'number of messages to show (default: 10)', parseInt)
  .option('-a, --all', 'show all messages (no limit)')
  .option('--system', 'include system messages')
  .option('--order <order>', 'sort order (asc|desc)', 'desc')
  .option('--before <id>', 'show messages before this message ID')
  .option('--after <id>', 'show messages after this message ID')
  .option('-o, --output <format>', 'output format (table|json)', 'table')
  .action(listMessagesCommand);

// Send message to agent
program
  .command('send')
  .description('Send a message to an agent (or multiple agents with --all)')
  .argument('[agent]', 'agent name (not required when using --all)')
  .argument('[message]', 'message to send')
  .option('--stream', 'stream the response in real-time')
  .option('--sync', 'use synchronous mode (blocks until response, may timeout)')
  .option('--no-wait', 'send async and return immediately (prints run ID)')
  .option('--max-steps <number>', 'maximum processing steps', parseInt)
  .option('--enable-thinking', 'enable agent reasoning')
  .option('--all <pattern>', 'send to all agents matching glob pattern')
  .option('-f, --file <path>', 'target agents from fleet config file')
  .option('--confirm', 'skip confirmation prompt for bulk operations')
  .option('--timeout <seconds>', 'timeout per agent in seconds for bulk operations', parseInt)
  .option('-o, --output <format>', 'output format (table|json)', 'table')
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
    output('Config view command');
    // TODO: Implement config view logic
  });

// Health check
program
  .command('health')
  .description('Check Letta server connectivity and status')
  .option('-o, --output <format>', 'output format (table|json)', 'table')
  .action(healthCommand);

// Files - show agent file state
program
  .command('files')
  .description('Show attached files and their open/closed state')
  .argument('<agent>', 'agent name')
  .option('-o, --output <format>', 'output format (table|json)', 'table')
  .action(filesCommand);

// Context - show context window usage
program
  .command('context')
  .description('Show context window token usage breakdown')
  .argument('<agent>', 'agent name')
  .option('-o, --output <format>', 'output format (table|json)', 'table')
  .action(contextCommand);

// Runs - manage async job runs
program
  .command('runs')
  .description('List async job runs')
  .option('--active', 'show only active runs')
  .option('-a, --agent <name>', 'filter by agent name')
  .option('-l, --limit <number>', 'limit number of results', parseInt)
  .option('-o, --output <format>', 'output format (table|json)', 'table')
  .action(listRunsCommand);

program
  .command('run')
  .description('Get run details')
  .argument('<run-id>', 'run ID')
  .option('--wait', 'wait for run to complete')
  .option('--stream', 'stream run output')
  .option('--messages', 'show run messages')
  .option('-o, --output <format>', 'output format (table|json)', 'table')
  .action(getRunCommand);

program
  .command('run-delete')
  .description('Delete/cancel a run')
  .argument('<run-id>', 'run ID')
  .action(deleteRunCommand);

// Completion command - generate shell completions
program
  .command('completion')
  .description('Generate shell completion script')
  .argument('<shell>', 'shell type (bash|zsh|fish)')
  .action(completionCommand);

// Global error handler to prevent stack traces from leaking
process.on('unhandledRejection', (err: any) => {
  if (verboseMode) {
    error(err);
  } else {
    error(err?.message || err);
  }
  process.exit(1);
});

program.parse();