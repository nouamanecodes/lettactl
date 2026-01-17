import chalk from 'chalk';
import { LettaClientWrapper } from '../lib/letta-client';
import { OutputFormatter } from '../lib/ux/output-formatter';
import { shouldUseFancyUx } from '../lib/ux/box';
import { LETTA_PURPLE, STATUS } from '../lib/ux/constants';

const purple = chalk.hex(LETTA_PURPLE);

export async function healthCommand(options: { output?: string }, command: any) {
  const verbose = command.parent?.opts().verbose || false;
  const baseUrl = process.env.LETTA_BASE_URL;
  const fancy = shouldUseFancyUx();

  // For JSON output, return structured data
  if (options.output === 'json') {
    const result: any = {
      server_url: baseUrl || null,
      status: 'unknown',
      version: null,
      error: null
    };

    if (!baseUrl) {
      result.status = 'error';
      result.error = 'LETTA_BASE_URL not set';
      OutputFormatter.handleJsonOutput(result, 'json');
      process.exit(1);
    }

    try {
      const response = await fetch(`${baseUrl}/v1/health/`);
      if (!response.ok) {
        result.status = 'error';
        result.error = `Server returned ${response.status}`;
        OutputFormatter.handleJsonOutput(result, 'json');
        process.exit(1);
      }
      const health = await response.json() as { status: string; version: string };
      result.status = health.status;
      result.version = health.version;
      OutputFormatter.handleJsonOutput(result, 'json');
      return;
    } catch (error: any) {
      result.status = 'error';
      result.error = error.cause?.code || error.code || error.message;
      OutputFormatter.handleJsonOutput(result, 'json');
      process.exit(1);
    }
  }

  // Header
  if (fancy) {
    console.log(purple('Letta Server Health Check'));
    console.log(purple('─'.repeat(26)) + '\n');
  } else {
    console.log('Letta Server Health Check');
    console.log('==========================\n');
  }

  // Check environment
  if (!baseUrl) {
    console.log(fancy ? `${STATUS.fail} LETTA_BASE_URL not set` : '[FAIL] LETTA_BASE_URL not set');
    process.exit(1);
  }
  console.log(fancy ? `${chalk.dim('Server URL:')} ${baseUrl}` : `Server URL: ${baseUrl}`);

  // Check connectivity
  try {
    const response = await fetch(`${baseUrl}/v1/health/`);

    if (!response.ok) {
      console.log(fancy ? `${STATUS.fail} Server returned ${response.status}` : `[FAIL] Server returned ${response.status}`);
      process.exit(1);
    }

    const health = await response.json() as { status: string; version: string };

    if (fancy) {
      const statusIcon = health.status === 'ok' ? STATUS.ok : STATUS.fail;
      console.log(`${chalk.dim('Status:')}     ${statusIcon} ${health.status}`);
      console.log(`${chalk.dim('Version:')}    ${chalk.cyan(health.version)}`);
    } else {
      console.log(`Status:     ${health.status === 'ok' ? '[OK]' : '[FAIL] ' + health.status}`);
      console.log(`Version:    ${health.version}`);
    }

    if (verbose) {
      // Additional checks in verbose mode
      console.log(fancy ? '\n' + chalk.dim('Detailed Checks:') : '\nDetailed Checks:');

      // Check agents endpoint
      try {
        const client = new LettaClientWrapper();
        const agents = await client.listAgents();
        const agentCount = Array.isArray(agents) ? agents.length : 0;
        console.log(fancy
          ? `  ${STATUS.ok} Agents: ${chalk.green(agentCount.toString())} found`
          : `  Agents:   [OK] ${agentCount} found`);
      } catch (e: any) {
        console.log(fancy
          ? `  ${STATUS.fail} Agents: ${chalk.red(e.message)}`
          : `  Agents:   [FAIL] ${e.message}`);
      }

      // Check tools endpoint
      try {
        const client = new LettaClientWrapper();
        const tools = await client.listTools();
        const toolCount = Array.isArray(tools) ? tools.length : 0;
        console.log(fancy
          ? `  ${STATUS.ok} Tools: ${chalk.green(toolCount.toString())} found`
          : `  Tools:    [OK] ${toolCount} found`);
      } catch (e: any) {
        console.log(fancy
          ? `  ${STATUS.fail} Tools: ${chalk.red(e.message)}`
          : `  Tools:    [FAIL] ${e.message}`);
      }

      // Check API key status
      if (process.env.LETTA_API_KEY) {
        console.log(fancy
          ? `  ${STATUS.ok} API Key: ${chalk.green('configured')}`
          : `  API Key:  [OK] configured`);
      } else {
        console.log(fancy
          ? `  ${STATUS.info} API Key: ${chalk.dim('not set (ok for self-hosted)')}`
          : `  API Key:  [--] not set (ok for self-hosted)`);
      }
    }

    console.log(fancy
      ? '\n' + STATUS.ok + chalk.green(' Letta server is healthy')
      : '\nLetta server is healthy');

  } catch (error: any) {
    const msg = error.cause?.code || error.code || error.message;
    if (msg === 'ECONNREFUSED') {
      console.log(fancy
        ? `${STATUS.fail} Connection refused - is Letta server running at ${baseUrl}?`
        : `[FAIL] Connection refused - is Letta server running at ${baseUrl}?`);
    } else if (msg === 'ENOTFOUND') {
      console.log(fancy
        ? `${STATUS.fail} Host not found - check LETTA_BASE_URL`
        : `[FAIL] Host not found - check LETTA_BASE_URL`);
    } else {
      console.log(fancy
        ? `${STATUS.fail} Cannot connect to ${baseUrl}`
        : `[FAIL] Cannot connect to ${baseUrl}`);
    }
    process.exit(1);
  }
}
