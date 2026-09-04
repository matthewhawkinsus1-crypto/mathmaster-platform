import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const functionsPkg = JSON.parse(read('../../functions/package.json'));
const workflow = read('../../.github/workflows/full-platform-suite.yml');

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
  // worth nothing.
  const match = workflow.match(/node-version:\s*'?(\d+)'?/);
  assert.ok(match, 'the full-platform workflow must pin a node-version');
  assert.equal(
    Number(match[1]),
    declaredRuntime,
    'the workflow node-version and the functions runtime must be the same major',
  );
});

test('the runtime is pinned to a major, not left open', () => {
  // A range would let the deployed runtime drift without anyone choosing it.
  assert.match(String(functionsPkg.engines?.node), /^\d+$/);
});
