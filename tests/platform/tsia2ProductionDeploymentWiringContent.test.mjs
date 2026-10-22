import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const tsia2Check = 'node scripts/build-tsia2-production-seed.mjs --check';
const unifiedWrite = 'node scripts/build-ccmr-v2-1-production-release.mjs --write';

test('Firebase Functions predeploy regenerates the coordinated SAT ACT TSIA2 V2.1 bundled seeds', () => {
  const firebase = JSON.parse(readFileSync(path.join(repoRoot, 'firebase.json'), 'utf8'));
  const functions = Array.isArray(firebase.functions) ? firebase.functions : [firebase.functions];
  const defaultFunctions = functions.find((entry) => entry?.source === 'functions');
  assert.ok(defaultFunctions, 'firebase.json must define the functions source');
  assert.ok(Array.isArray(defaultFunctions.predeploy), 'functions predeploy must be configured');
  assert.ok(defaultFunctions.predeploy.includes(unifiedWrite), `functions predeploy must run: ${unifiedWrite}`);
  assert.ok(!defaultFunctions.predeploy.some((value) => value.includes('build-tsia2-production-seed.mjs --write')),
    'Firebase predeploy must not regenerate TSIA2 independently of SAT and ACT');
});

// The check runs in full-platform-suite.yml, on every pull request and push to
// main. It lived in ccmr-v2-1-tsia2-content-audit.yml, which ran only on a
// branch idle since August.
test('TSIA2 content CI keeps its framework-specific production seed check read-only', () => {
  const workflow = readFileSync(path.join(repoRoot, '.github', 'workflows', 'full-platform-suite.yml'), 'utf8');
  assert.ok(workflow.includes(`run: ${tsia2Check}`), `workflow must run: ${tsia2Check}`);
  assert.ok(!workflow.includes('node scripts/build-tsia2-production-seed.mjs --write'),
    'TSIA2 content audit must not rewrite production seed files');
});
