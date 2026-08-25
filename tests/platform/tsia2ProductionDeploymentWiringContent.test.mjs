import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const commandCheck = 'node scripts/build-tsia2-production-seed.mjs --check';
const commandWrite = 'node scripts/build-tsia2-production-seed.mjs --write';

test('Firebase Functions predeploy regenerates the verified TSIA2 V2.1 bundled seed', () => {
  const firebase = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
  const functions = Array.isArray(firebase.functions) ? firebase.functions : [firebase.functions];
  const defaultFunctions = functions.find((entry) => entry?.source === 'functions');
  assert.ok(defaultFunctions, 'firebase.json must define the functions source');
  assert.ok(Array.isArray(defaultFunctions.predeploy), 'functions predeploy must be configured');
  assert.ok(defaultFunctions.predeploy.includes(commandWrite), `functions predeploy must run: ${commandWrite}`);
});

test('TSIA2 content CI runs the production seed writer in read-only check mode', () => {
  const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'ccmr-v2-1-tsia2-content-audit.yml'), 'utf8');
  assert.match(workflow, /Check TSIA2 production seed package/);
  assert.ok(workflow.includes(commandCheck), `workflow must run: ${commandCheck}`);
  assert.ok(!workflow.includes(`${commandWrite}\n`), 'CI content audit must not rewrite production seed files');
});
