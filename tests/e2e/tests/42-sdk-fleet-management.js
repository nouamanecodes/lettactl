#!/usr/bin/env node
/**
 * Test: SDK fleet file management and agent deletion (#158)
 *
 * Verifies:
 *   1. deployFleet() writes .lettactl/fleet.yaml
 *   2. deployFleet() with dryRun does NOT write fleet file
 *   3. deleteAgent() removes agent from Letta + updates fleet file
 *   4. deleteAgent() on last agent removes fleet file entirely
 *   5. deleteAgent() without fleet file still works
 *   6. root option controls .lettactl/ location
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { pass, fail, info, section, printSummary, preflightCheck } = require('../lib/common');

// Import SDK and internals from compiled dist
const distDir = path.join(__dirname, '..', '..', '..', 'dist');
const { LettaCtl } = require(path.join(distDir, 'sdk'));
const { LettaClientWrapper } = require(path.join(distDir, 'lib', 'letta-client'));
const { AgentResolver } = require(path.join(distDir, 'lib', 'agent-resolver'));

const AGENT_A = 'e2e-sdk-fleet-a';
const AGENT_B = 'e2e-sdk-fleet-b';

async function agentExistsOnServer(name) {
  try {
    const client = new LettaClientWrapper();
    const resolver = new AgentResolver(client);
    await resolver.findAgentByName(name);
    return true;
  } catch {
    return false;
  }
}

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lettactl-sdk-e2e-'));
}

function fleetFileExists(root) {
  return fs.existsSync(path.join(root, '.lettactl', 'fleet.yaml'));
}

function readFleetFile(root) {
  return fs.readFileSync(path.join(root, '.lettactl', 'fleet.yaml'), 'utf8');
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

// Helper: delete agents via a fresh SDK instance (no fleet file involvement)
async function deleteAgentSilent(name) {
  try {
    const ctl = new LettaCtl();
    await ctl.deleteAgent(name);
  } catch {}
}

async function run() {
  section('Test: SDK Fleet Management (#158)');
  preflightCheck();

  // Clean up any leftover agents from prior runs
  info('Cleaning up prior test agents...');
  await deleteAgentSilent(AGENT_A);
  await deleteAgentSilent(AGENT_B);

  // ── Test 1: deployFleet() creates agents and writes fleet file ──────────
  info('Test 1: deployFleet() creates agents and writes fleet file...');
  const root1 = makeTempRoot();
  try {
    const ctl = new LettaCtl({ root: root1 });
    await ctl.deployFleet(makeFleetConfig([AGENT_A, AGENT_B]));

    // Verify server state
    if (await agentExistsOnServer(AGENT_A)) {
      pass('Agent A exists on server');
    } else {
      fail('Agent A NOT found on server after deploy');
    }
    if (await agentExistsOnServer(AGENT_B)) {
      pass('Agent B exists on server');
    } else {
      fail('Agent B NOT found on server after deploy');
    }

    // Verify fleet file
    if (fleetFileExists(root1)) {
      pass('Fleet file created after deploy');
    } else {
      fail('Fleet file NOT created after deploy');
    }

    const content = readFleetFile(root1);
    if (content.includes(AGENT_A) && content.includes(AGENT_B)) {
      pass('Fleet file contains both agents');
    } else {
      fail('Fleet file missing agent names');
    }
  } finally {
    cleanup(root1);
  }

  // ── Test 2: dryRun does NOT write fleet file ───────────────────────────
  info('Test 2: dryRun does not write fleet file...');
  const root2 = makeTempRoot();
  try {
    const ctl = new LettaCtl({ root: root2 });
    await ctl.deployFleet(makeFleetConfig([AGENT_A, AGENT_B]), { dryRun: true });

    if (!fleetFileExists(root2)) {
      pass('Fleet file NOT created on dry run');
    } else {
      fail('Fleet file should not exist after dry run');
    }
  } finally {
    cleanup(root2);
  }

  // ── Test 3: deleteAgent() removes from server and updates fleet file ──
  info('Test 3: deleteAgent() removes agent from server and fleet file...');
  const root3 = makeTempRoot();
  try {
    const ctl = new LettaCtl({ root: root3 });

    // Deploy both agents first
    await ctl.deployFleet(makeFleetConfig([AGENT_A, AGENT_B]));

    // Delete one agent
    await ctl.deleteAgent(AGENT_A);

    // Verify server state
    if (!(await agentExistsOnServer(AGENT_A))) {
      pass('Deleted agent gone from server');
    } else {
      fail('Deleted agent still on server');
    }
    if (await agentExistsOnServer(AGENT_B)) {
      pass('Remaining agent still on server');
    } else {
      fail('Remaining agent missing from server');
    }

    // Verify fleet file
    if (fleetFileExists(root3)) {
      pass('Fleet file still exists after deleting one agent');
    } else {
      fail('Fleet file should still exist with remaining agent');
    }

    const content = readFleetFile(root3);
    if (!content.includes(AGENT_A)) {
      pass('Deleted agent removed from fleet file');
    } else {
      fail('Deleted agent still in fleet file');
    }

    if (content.includes(AGENT_B)) {
      pass('Remaining agent still in fleet file');
    } else {
      fail('Remaining agent missing from fleet file');
    }

    // ── Test 4: deleteAgent() on last agent removes fleet file ─────────
    info('Test 4: deleteAgent() on last agent removes fleet file...');
    await ctl.deleteAgent(AGENT_B);

    if (!(await agentExistsOnServer(AGENT_B))) {
      pass('Last agent gone from server');
    } else {
      fail('Last agent still on server');
    }

    if (!fleetFileExists(root3)) {
      pass('Fleet file removed after deleting last agent');
    } else {
      fail('Fleet file should be removed when no agents remain');
    }
  } finally {
    cleanup(root3);
  }

  // ── Test 5: deleteAgent() works without fleet file ─────────────────────
  info('Test 5: deleteAgent() works without fleet file...');
  const root5 = makeTempRoot();
  try {
    // Deploy agent via one SDK instance (writes fleet file to root5)
    const ctl1 = new LettaCtl({ root: root5 });
    await ctl1.deployFleet(makeFleetConfig([AGENT_A]));

    // Delete via different root (no fleet file there)
    const root5b = makeTempRoot();
    const ctl2 = new LettaCtl({ root: root5b });
    try {
      await ctl2.deleteAgent(AGENT_A);
      pass('deleteAgent() succeeds without fleet file');

      if (!(await agentExistsOnServer(AGENT_A))) {
        pass('Agent deleted from server despite no fleet file');
      } else {
        fail('Agent still on server after delete without fleet file');
      }
    } catch (err) {
      fail(`deleteAgent() threw without fleet file: ${err.message}`);
    } finally {
      cleanup(root5b);
    }
  } finally {
    cleanup(root5);
  }

  // ── Test 6: root option controls .lettactl/ location ───────────────────
  info('Test 6: root option controls fleet file location...');
  const root6 = makeTempRoot();
  try {
    const ctl = new LettaCtl({ root: root6 });
    await ctl.deployFleet(makeFleetConfig([AGENT_A]));

    const expectedPath = path.join(root6, '.lettactl', 'fleet.yaml');
    if (fs.existsSync(expectedPath)) {
      pass('Fleet file written to custom root');
    } else {
      fail('Fleet file not at custom root path');
    }

    // Cleanup agent
    await ctl.deleteAgent(AGENT_A);
  } finally {
    cleanup(root6);
  }

  // Final cleanup
  info('Final cleanup...');
  await deleteAgentSilent(AGENT_A);
  await deleteAgentSilent(AGENT_B);

  printSummary();
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
