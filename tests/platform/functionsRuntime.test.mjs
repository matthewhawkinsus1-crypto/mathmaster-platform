import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { jobsOf, readWorkflow, workflowFiles } from './helpers/ciWorkflows.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const functionsPkg = JSON.parse(read('../../functions/package.json'));
const setupAction = read('../../.github/actions/setup/action.yml');

const declaredRuntime = Number(String(functionsPkg.engines?.node || '').replace(/[^0-9].*$/, ''));

// Google decommissions Cloud Functions runtimes on a schedule, and a
// decommissioned one does not merely warn — it blocks every deploy, including
// the emergency one. Node 20 was deprecated 2026-04-30 and decommissioned
// 2026-10-30, and this repo sat on it until eight weeks before that date.
const OLDEST_SUPPORTED_RUNTIME = 22;

test('the deployed runtime is one Google still accepts', () => {
  assert.ok(
    Number.isFinite(declaredRuntime),
    `functions/package.json must pin a Node major, got ${JSON.stringify(functionsPkg.engines)}`,
  );
  assert.ok(
    declaredRuntime >= OLDEST_SUPPORTED_RUNTIME,
    `Node ${declaredRuntime} is past or near decommission; deploys will start failing outright. `
    + `Raise the runtime and this floor together.`,
  );
});

test('CI runs the tests on the version that actually deploys', () => {
  // Testing on one major and deploying on another means the suite is not
  // evidence about the thing in production. They move together or the guard is
  // worth nothing. Every job sets Node up through .github/actions/setup.
  const match = setupAction.match(/^ {2}node-version:\n(?: {4}.*\n)*? {4}default: "(\d+)"$/m);
  assert.ok(match, 'the shared setup must pin a default node-version');
  assert.equal(
    Number(match[1]),
    declaredRuntime,
    'the setup node-version and the functions runtime must be the same major',
  );
  let testJobs = 0;
  for (const name of workflowFiles()) {
    for (const [job, text] of Object.entries(jobsOf(readWorkflow(name)))) {
      assert.doesNotMatch(text, /uses: actions\/setup-node@/, `${name} ${job} sets Node up itself`);
      for (const [, version] of text.matchAll(/node-version:\s*['"]?(\d+)/g)) {
        assert.equal(Number(version), declaredRuntime, `${name} ${job} runs on Node ${version}`);
      }
      if (/node --test|npm run test:/.test(text)) {
        testJobs += 1;
        assert.match(text, /uses: \.\/\.github\/actions\/setup\b/, `${name} ${job} runs tests without the shared setup`);
      }
    }
  }
  assert.ok(testJobs >= 5, `found ${testJobs} jobs that run tests`);
});

test('the runtime is pinned to a major, not left open', () => {
  // A range would let the deployed runtime drift without anyone choosing it.
  assert.match(String(functionsPkg.engines?.node), /^\d+$/);
});
