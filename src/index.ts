#!/usr/bin/env node

import { Command } from 'commander';
import { applyCommand } from './commands/apply';
import { getCommand } from './commands/get';
import { deleteCommand } from './commands/delete';
import { describeCommand } from './commands/describe';

// Validate required environment variables
function validateEnvironment() {
  if (!process.env.LETTA_API_URL) {
    console.error('Error: LETTA_API_URL environment variable is required');
    console.error('Set it with: export LETTA_API_URL=http://localhost:8283');
    process.exit(1);
  }
  
  // API key required unless localhost (self-hosting)
  const isLocalhost = process.env.LETTA_API_URL.includes('localhost');
  
  if (!isLocalhost && !process.env.LETTA_API_KEY) {
    console.error(`Error: LETTA_API_KEY is required for Letta Cloud (${process.env.LETTA_API_URL})`);
    console.error('Set it with: export LETTA_API_KEY=your_api_key');
    process.exit(1);
  }
}

const program = new Command();

program
  .name('lettactl')
  .description('kubectl-style CLI for managing Letta AI agent fleets')
  .version('0.1.0')
  .option('-v, --verbose', 'enable verbose output')
  .hook('preAction', validateEnvironment);

// Apply command - deploy fleet from YAML
program
  .command('apply')
  .description('Deploy agents from configuration')
  .option('-f, --file <path>', 'agent YAML configuration file', 'agents.yml')
  .option('--agent <pattern>', 'deploy only agents matching pattern')
  .option('--dry-run', 'show what would be created without making changes')
  .action(applyCommand);

// Get command - list/show agents
program
  .command('get')
  .description('Display agents')
  .argument('<resource>', 'resource type (agents)')
  .argument('[name]', 'specific agent name (optional)')
  .option('-o, --output <format>', 'output format (table|json|yaml)', 'table')
  .action(getCommand);

// Describe command - detailed agent info
program
  .command('describe')
  .description('Show detailed information about an agent')
  .argument('<resource>', 'resource type (agent)')
  .argument('<name>', 'agent name')
  .option('-o, --output <format>', 'output format (table, json)', 'table')
  .action(describeCommand);

// Delete command - remove agents
program
  .command('delete')
  .description('Delete an agent')
  .argument('<resource>', 'resource type (agent)')
  .argument('<name>', 'agent name')
  .option('--force', 'force deletion without confirmation')
  .action(deleteCommand);

// Validate command - check YAML config
program
  .command('validate')
  .description('Validate agent configuration')
  .option('-f, --file <path>', 'agent YAML configuration file', 'agents.yml')
  .action(async (options) => {
    console.log('Validate command:', options);
    // TODO: Implement validate logic
  });

// Logs command - show agent conversation logs
program
  .command('logs')
  .description('Show agent conversation logs')
  .argument('<resource>', 'resource type (agent)')
  .argument('<name>', 'agent name')
  .option('--tail <lines>', 'number of recent messages to show')
  .action(async (resource, name, options) => {
    console.log('Logs command:', resource, name, options);
    // TODO: Implement logs logic
  });

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

program.parse();