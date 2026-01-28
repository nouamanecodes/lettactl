/**
 * Shared test helpers for SDK E2E tests.
 * Mirrors the bash common.sh pattern but for Node.js SDK tests.
 */

let PASSED = 0;
let FAILED = 0;

function pass(msg) {
  console.log(`[PASS] ${msg}`);
  PASSED++;
}

function fail(msg) {
  console.log(`[FAIL] ${msg}`);
  FAILED++;
}

function info(msg) {
  console.log(`[INFO] ${msg}`);
}

function warn(msg) {
  console.log(`[WARN] ${msg}`);
}

function section(title) {
  console.log('');
  console.log('================================================================');
  console.log(` ${title}`);
  console.log('================================================================');
}

function printSummary() {
  section('Summary');
  console.log('');
  console.log(`  Passed: ${PASSED}`);
  console.log(`  Failed: ${FAILED}`);
  console.log(`  Total:  ${PASSED + FAILED}`);
  console.log('');

  if (FAILED === 0) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
  } else {
    console.log('TESTS FAILED');
    process.exit(1);
  }
}

function preflightCheck() {
  if (!process.env.LETTA_BASE_URL) {
    console.error('ERROR: LETTA_BASE_URL not set');
    console.error('');
    console.error('SDK E2E tests require a running Letta server.');
    console.error('');
    console.error('  1. Start server:  letta server');
    console.error('  2. Set URL:       export LETTA_BASE_URL=http://localhost:8283');
    console.error('  3. Run tests:     ./tests/e2e/sdk/run.sh');
    console.error('');
    process.exit(1);
  }

  info(`LETTA_BASE_URL: ${process.env.LETTA_BASE_URL}`);
}

module.exports = { pass, fail, info, warn, section, printSummary, preflightCheck };
