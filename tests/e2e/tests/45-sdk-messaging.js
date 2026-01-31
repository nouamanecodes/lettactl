#!/usr/bin/env node
/**
 * Test: SDK messaging with sendMessage() and waitForRun() (#170)
 *
 * Verifies:
 *   1. sendMessage() returns a Run with an ID immediately
 *   2. waitForRun() polls until completion using robust stop_reason detection
 *   3. Completed run has terminal status or stop_reason
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pass, fail, info, section, printSummary, preflightCheck } = require('../lib/common');

const distDir = path.join(__dirname, '..', '..', '..', 'dist');
const { LettaCtl } = require(path.join(distDir, 'sdk'));
const { LettaClientWrapper } = require(path.join(distDir, 'lib', 'letta-client'));
const { AgentResolver } = require(path.join(distDir, 'lib', 'agent-resolver'));

const AGENT = 'e2e-sdk-messaging';

async function deleteAgentSilent(name) {
  try {
    const ctl = new LettaCtl();
    await ctl.deleteAgent(name);
  } catch {}
}

function makeFleetConfig(name) {
  return {
    agents: [{
      name,
      description: 'SDK messaging test agent',
      system_prompt: { value: 'You are a helpful assistant. Keep responses brief.' },
      llm_config: { model: 'google_ai/gemini-2.0-flash-lite', context_window: 32000 },
      embedding: 'openai/text-embedding-3-small',
    }],
  };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lettactl-sdk-msg-'));
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

async function getAgentId(name) {
  const client = new LettaClientWrapper();
  const resolver = new AgentResolver(client);
  const { agent } = await resolver.findAgentByName(name);
  return agent.id;
}

async function run() {
  section('Test: SDK Messaging (#170)');
  preflightCheck();

  info('Cleaning up prior test agent...');
  await deleteAgentSilent(AGENT);

  const root = makeTempRoot();
  try {
    // Deploy test agent
    info('Deploying test agent...');
    const ctl = new LettaCtl({ root });
    await ctl.deployFleet(makeFleetConfig(AGENT));
    pass('Test agent deployed');

    const agentId = await getAgentId(AGENT);
    info(`Agent ID: ${agentId}`);

    // Test 1: sendMessage() returns Run immediately
    info('Test 1: sendMessage() returns Run with ID...');
    const startTime = Date.now();
    const run = await ctl.sendMessage(agentId, 'Say "hello" and nothing else.');
    const sendDuration = Date.now() - startTime;

    if (run && run.id) {
      pass(`sendMessage() returned Run with ID: ${run.id}`);
    } else {
      fail('sendMessage() did not return a Run with ID');
      throw new Error('Cannot continue without run ID');
    }

    // Verify it returned quickly (async behavior)
    if (sendDuration < 5000) {
      pass(`sendMessage() returned quickly (${sendDuration}ms) - async confirmed`);
    } else {
      info(`sendMessage() took ${sendDuration}ms - may have blocked`);
    }

    // Test 2: waitForRun() polls until completion
    info('Test 2: waitForRun() waits for completion...');
    const waitStart = Date.now();
    const completedRun = await ctl.waitForRun(run.id, { timeout: 60 });
    const waitDuration = Date.now() - waitStart;

    if (completedRun) {
      pass(`waitForRun() returned after ${waitDuration}ms`);
    } else {
      fail('waitForRun() returned null/undefined');
    }

    // Test 3: Verify terminal state
    info('Test 3: Verify run reached terminal state...');
    const terminalStatuses = ['completed', 'failed', 'cancelled'];
    const terminalStopReasons = [
      'end_turn', 'error', 'llm_api_error', 'invalid_llm_response',
      'invalid_tool_call', 'max_steps', 'max_tokens_exceeded',
      'no_tool_call', 'tool_rule', 'cancelled', 'context_window_overflow_in_system_prompt'
    ];

    const hasTerminalStatus = terminalStatuses.includes(completedRun.status);
    const hasTerminalStopReason = completedRun.stop_reason &&
      terminalStopReasons.includes(completedRun.stop_reason);

    if (hasTerminalStatus || hasTerminalStopReason) {
      pass(`Run terminated: status=${completedRun.status}, stop_reason=${completedRun.stop_reason}`);
    } else {
      fail(`Run not in terminal state: status=${completedRun.status}, stop_reason=${completedRun.stop_reason}`);
    }

    // Specifically check for successful completion
    if (completedRun.status === 'completed' || completedRun.stop_reason === 'end_turn') {
      pass('Run completed successfully');
    } else {
      info(`Run ended with: status=${completedRun.status}, stop_reason=${completedRun.stop_reason}`);
    }

  } finally {
    cleanup(root);
    info('Cleaning up test agent...');
    await deleteAgentSilent(AGENT);
  }

  printSummary();
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
