#!/usr/bin/env node
/**
 * Test: SDK returns agent IDs from deploy methods (#181)
 *
 * Verifies:
 *   1. deployFleet() returns DeployResult with agents map
 *   2. DeployResult.agents contains name → letta_agent_id mapping
 *   3. DeployResult.created contains newly created agent names
 *   4. DeployResult.updated contains updated agent names
 *   5. DeployResult.unchanged contains unchanged agent names
 *   6. deployFromYamlString() also returns DeployResult
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pass, fail, info, section, printSummary, preflightCheck } = require('../lib/common');

const distDir = path.join(__dirname, '..', '..', '..', 'dist');
const { LettaCtl } = require(path.join(distDir, 'sdk'));

const AGENT_A = 'e2e-sdk-result-a';
const AGENT_B = 'e2e-sdk-result-b';

function makeFleetConfig(agentNames) {
  return {
    agents: agentNames.map(name => ({
      name,
      description: `SDK E2E test agent ${name}`,
      system_prompt: { value: 'You are a test assistant.' },
      llm_config: { model: 'google_ai/gemini-2.0-flash-lite', context_window: 32000 },
      embedding: 'openai/text-embedding-3-small',
    })),
  };
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lettactl-sdk-result-'));
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

async function deleteAgentSilent(name) {
  try {
    const ctl = new LettaCtl();
    await ctl.deleteAgent(name);
  } catch {}
}

async function run() {
  section('Test: SDK Deploy Result (#181)');
  preflightCheck();

  // Clean up any leftover agents
  info('Cleaning up prior test agents...');
  await deleteAgentSilent(AGENT_A);
  await deleteAgentSilent(AGENT_B);

  const root = makeTempRoot();
  try {
    const ctl = new LettaCtl({ root });

    // ── Test 1: deployFleet() returns DeployResult ────────────────────────
    info('Test 1: deployFleet() returns DeployResult with agent IDs...');
    const result1 = await ctl.deployFleet(makeFleetConfig([AGENT_A, AGENT_B]));

    if (result1 && typeof result1 === 'object') {
      pass('deployFleet() returns an object');
    } else {
      fail('deployFleet() did not return an object');
    }

    // ── Test 2: result.agents contains name → ID mapping ──────────────────
    info('Test 2: result.agents contains name → ID mapping...');
    if (result1.agents && typeof result1.agents === 'object') {
      pass('result.agents is an object');
    } else {
      fail('result.agents is not an object');
    }

    const agentIdA = result1.agents[AGENT_A];
    const agentIdB = result1.agents[AGENT_B];

    if (agentIdA && typeof agentIdA === 'string' && agentIdA.length > 10) {
      pass(`Agent A ID returned: ${agentIdA.slice(0, 8)}...`);
    } else {
      fail('Agent A ID not in result.agents');
    }

    if (agentIdB && typeof agentIdB === 'string' && agentIdB.length > 10) {
      pass(`Agent B ID returned: ${agentIdB.slice(0, 8)}...`);
    } else {
      fail('Agent B ID not in result.agents');
    }

    // ── Test 3: result.created contains newly created agent names ─────────
    info('Test 3: result.created contains newly created agent names...');
    if (Array.isArray(result1.created)) {
      pass('result.created is an array');
    } else {
      fail('result.created is not an array');
    }

    if (result1.created.includes(AGENT_A) && result1.created.includes(AGENT_B)) {
      pass('result.created contains both new agents');
    } else {
      fail(`result.created missing agents: ${JSON.stringify(result1.created)}`);
    }

    // ── Test 4: result.unchanged is empty for new agents ──────────────────
    info('Test 4: result.unchanged is empty for new agents...');
    if (Array.isArray(result1.unchanged) && result1.unchanged.length === 0) {
      pass('result.unchanged is empty for new deploy');
    } else {
      fail(`result.unchanged should be empty: ${JSON.stringify(result1.unchanged)}`);
    }

    // ── Test 5: Re-deploy returns consistent agent IDs ─────────────────────
    info('Test 5: Re-deploy returns consistent agent IDs...');
    const result2 = await ctl.deployFleet(makeFleetConfig([AGENT_A, AGENT_B]));

    // Agents should be in updated OR unchanged (not created)
    const inUpdatedOrUnchanged = (name) =>
      result2.updated.includes(name) || result2.unchanged.includes(name);

    if (inUpdatedOrUnchanged(AGENT_A) && inUpdatedOrUnchanged(AGENT_B)) {
      pass('Agents in updated or unchanged on re-deploy');
    } else {
      fail(`Re-deploy should show updated/unchanged: ${JSON.stringify(result2)}`);
    }

    if (result2.created.length === 0) {
      pass('result.created is empty on re-deploy');
    } else {
      fail(`result.created should be empty: ${JSON.stringify(result2.created)}`);
    }

    // Verify IDs are still present on re-deploy
    if (result2.agents[AGENT_A] === agentIdA && result2.agents[AGENT_B] === agentIdB) {
      pass('Agent IDs consistent across deploys');
    } else {
      fail('Agent IDs changed on re-deploy');
    }

    // ── Test 6: deployFromYamlString() also returns DeployResult ──────────
    info('Test 6: deployFromYamlString() returns DeployResult...');

    // Delete agents first to test creation via YAML string
    await ctl.deleteAgent(AGENT_A);
    await ctl.deleteAgent(AGENT_B);

    const yamlContent = `
agents:
  - name: ${AGENT_A}
    description: YAML string test agent
    system_prompt:
      value: You are a test assistant.
    llm_config:
      model: google_ai/gemini-2.0-flash-lite
      context_window: 32000
    embedding: openai/text-embedding-3-small
`;

    const result3 = await ctl.deployFromYamlString(yamlContent);

    if (result3 && result3.agents && result3.agents[AGENT_A]) {
      pass(`deployFromYamlString() returns agent ID: ${result3.agents[AGENT_A].slice(0, 8)}...`);
    } else {
      fail('deployFromYamlString() did not return agent ID');
    }

    if (result3.created.includes(AGENT_A)) {
      pass('deployFromYamlString() marks agent as created');
    } else {
      fail('deployFromYamlString() should mark agent as created');
    }

  } finally {
    // Cleanup
    info('Final cleanup...');
    await deleteAgentSilent(AGENT_A);
    await deleteAgentSilent(AGENT_B);
    cleanup(root);
  }

  printSummary();
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
