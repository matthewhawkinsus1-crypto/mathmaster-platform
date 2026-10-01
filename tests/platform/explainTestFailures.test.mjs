// `npm run test:platform` MUST NOT CALL A MISSING INSTALL A BEHAVIOURAL FAILURE.
//
// A checkout that ran the root `npm ci` but not `npm --prefix functions ci`
// cannot load the suites that import Cloud Functions code: firebase-admin,
// firebase-functions and googleapis live only in functions/package.json. Those
// suites fail before a single assertion runs, and the explainer used to label
// them BEHAVIOURAL — "more likely than the others to be a genuine defect". They
// are ENVIRONMENT: named, given the one command that fixes them, and left out
// of the count of failures worth reading (CR-8).
//
// The TAP below is what node printed for that checkout (paths shortened to
// /repo): two files that could not load — their own block says only "test
// failed", the ERR_MODULE_NOT_FOUND is in the `# ` lines above them — and one
// test that threw MODULE_NOT_FOUND inside its body.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FUNCTIONS_DEPENDENCIES_NOTE,
  classify,
  missingFunctionsDependency,
  missingPackages,
  packageName,
  parseFailures,
} from '../../scripts/lib/testFailureClassifier.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CONTEXT = {
  repo: '/repo',
  functions: new Set(['firebase-admin', 'firebase-functions', 'googleapis']),
  root: new Set(['firebase', 'mathjs', 'mathlive', 'react', 'vite']),
};

const TAP = `
# Subtest: legacy period-only students are not duplicated when two classes share a period
ok 1739 - legacy period-only students are not duplicated when two classes share a period
  ---
  duration_ms: 0.157379
  type: 'test'
  ...
# node:internal/modules/cjs/loader:1383
#   const err = new Error(message);
#               ^
# Error: Cannot find module 'googleapis'
# Require stack:
# - /repo/functions/lib/classroom.js
# - /repo/tests/platform/classroomScheduledPublication.test.mjs
#     at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)
#     at Object.<anonymous> (/repo/functions/lib/classroom.js:1:20) {
#   code: 'MODULE_NOT_FOUND',
#   requireStack: [
#     '/repo/functions/lib/classroom.js',
#     '/repo/tests/platform/classroomScheduledPublication.test.mjs'
#   ]
# }
# Node.js v22.22.0
# Subtest: tests/platform/classroomScheduledPublication.test.mjs
not ok 236 - tests/platform/classroomScheduledPublication.test.mjs
  ---
  duration_ms: 73.203967
  type: 'test'
  location: '/repo/tests/platform/classroomScheduledPublication.test.mjs:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  signal: ~
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: App consumes canonical section grade and Classroom launch helpers
ok 1741 - App consumes canonical section grade and Classroom launch helpers
  ---
  duration_ms: 0.868995
  type: 'test'
  ...
# node:internal/modules/package_json_reader:314
#   throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);
#         ^
# Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'firebase-admin' imported from /repo/functions/shared/liveChallengeClassPoints.mjs
#     at Object.getPackageJSONURL (node:internal/modules/package_json_reader:314:9)
#     at ModuleJob._link (node:internal/modules/esm/module_job:182:49) {
#   code: 'ERR_MODULE_NOT_FOUND'
# }
# Node.js v22.22.0
# Subtest: tests/platform/liveChallengeRewards.test.mjs
not ok 412 - tests/platform/liveChallengeRewards.test.mjs
  ---
  duration_ms: 123.950873
  type: 'test'
  location: '/repo/tests/platform/liveChallengeRewards.test.mjs:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  signal: ~
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
# Subtest: the inventory is the real entry point, including the functions index.js does not define
not ok 4774 - the inventory is the real entry point, including the functions index.js does not define
  ---
  duration_ms: 31.510513
  type: 'test'
  location: '/repo/tests/platform/releasePlan.test.mjs:131:1'
  failureType: 'testCodeFailure'
  error: |-
    Cannot find module 'firebase-admin/app'
    Require stack:
    - /repo/functions/index.js
    - /repo/functions/entry.js
  code: 'MODULE_NOT_FOUND'
  stack: |-
    Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)
  ...
# Subtest: the Repair Center reads its scope from the selection
not ok 4775 - the Repair Center reads its scope from the selection
  ---
  duration_ms: 2.464026
  type: 'test'
  location: '/repo/tests/platform/repairCenterReviewScopeUi.test.mjs:12:1'
  failureType: 'testCodeFailure'
  error: 'The input did not match the regular expression /scopeTarget/. Input:'
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
  actual: |-
    import React from 'react';
    export default function RepairCenter() {
  operator: 'match'
  stack: |-
    TestContext.<anonymous> (/repo/tests/platform/repairCenterReviewScopeUi.test.mjs:14:10)
  ...
# /repo/tests/platform/broken.test.mjs:3
# const = 1;
#       ^
# SyntaxError: Unexpected token '='
# Node.js v22.22.0
# Subtest: tests/platform/broken.test.mjs
not ok 4776 - tests/platform/broken.test.mjs
  ---
  duration_ms: 40.1
  type: 'test'
  location: '/repo/tests/platform/broken.test.mjs:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  signal: ~
  error: 'test failed'
  code: 'ERR_TEST_FAILURE'
  ...
`;

const byName = (failures) => Object.fromEntries(failures.map((failure) => [failure.name, failure]));

test('a file that could not load carries the error node printed above it', () => {
  const failures = byName(parseFailures(TAP));
  assert.equal(Object.keys(failures).length, 5);
  const cjs = failures['tests/platform/classroomScheduledPublication.test.mjs'];
  assert.equal(cjs.exitCode, 1);
  assert.equal(cjs.error, 'test failed', 'its own block says nothing about why');
  assert.match(cjs.diagnostics, /Cannot find module 'googleapis'\nRequire stack:\n- \/repo\/functions\/lib\/classroom\.js/);
  assert.match(failures['tests/platform/liveChallengeRewards.test.mjs'].diagnostics, /Cannot find package 'firebase-admin' imported from \/repo\/functions\/shared/);
  // Diagnostics belong to the file directly below them, never to a later test.
  assert.equal(failures['the Repair Center reads its scope from the selection'].diagnostics, '');
  assert.equal(failures['the inventory is the real entry point, including the functions index.js does not define'].exitCode, null);
});

test('a missing functions/ install is ENVIRONMENT, whichever loader reported it', () => {
  const failures = byName(parseFailures(TAP));
  for (const name of [
    'tests/platform/classroomScheduledPublication.test.mjs',
    'tests/platform/liveChallengeRewards.test.mjs',
    'the inventory is the real entry point, including the functions index.js does not define',
  ]) {
    assert.equal(classify(failures[name], CONTEXT), 'functionsDependencies', name);
  }
  assert.equal(missingFunctionsDependency(failures['tests/platform/classroomScheduledPublication.test.mjs'], CONTEXT), 'googleapis');
  assert.equal(missingFunctionsDependency(failures['the inventory is the real entry point, including the functions index.js does not define'], CONTEXT), 'firebase-admin');
  // The other kinds are untouched.
  assert.equal(classify(failures['the Repair Center reads its scope from the selection'], CONTEXT), 'sourceText');
  assert.equal(classify(failures['tests/platform/broken.test.mjs'], CONTEXT), 'behavioural', 'a file that fails to load for any other reason is not an install problem');
});

test('only a package functions/ declares, asked for from functions/, is an environment problem', () => {
  const threw = (error) => ({ name: 't', error, operator: '', actual: '', exitCode: null, diagnostics: '' });
  // A root dependency missing is not fixed by installing functions/.
  assert.equal(missingFunctionsDependency(threw("Cannot find package 'mathjs' imported from /repo/src/mathEngine.js"), CONTEXT), null);
  // Neither is firebase-admin imported from tests/: that resolves from the root.
  assert.equal(missingFunctionsDependency(threw("Cannot find package 'firebase-admin' imported from /repo/tests/platform/x.test.mjs"), CONTEXT), null);
  // A missing FILE is a real defect (a deleted or renamed module), not an install.
  assert.equal(missingFunctionsDependency(threw("Cannot find module '/repo/functions/lib/gone.js' imported from /repo/functions/index.js"), CONTEXT), null);
  // node did not say who asked: a functions-only package counts, a shared one does not.
  assert.equal(missingFunctionsDependency(threw("Cannot find module 'firebase-functions/v2'"), CONTEXT), 'firebase-functions');
  const shared = { ...CONTEXT, root: new Set(['firebase-admin']) };
  assert.equal(missingFunctionsDependency(threw("Cannot find module 'firebase-admin'"), shared), null);
  // For a package both manifests declare, the require stack decides whose install is missing.
  assert.equal(missingFunctionsDependency(threw("Cannot find module 'firebase-admin'\nRequire stack:\n- /repo/functions/index.js"), shared), 'firebase-admin');
  assert.equal(missingFunctionsDependency(threw("Cannot find module 'firebase-admin'\nRequire stack:\n- /repo/scripts/seed.cjs"), shared), null);
  // An assertion that MENTIONS a missing package is still an assertion.
  assert.equal(missingFunctionsDependency({ ...threw("Cannot find package 'googleapis' imported from /repo/functions/lib/classroom.js"), operator: 'match' }, CONTEXT), null);
  // Stderr above a test that did not crash its file is not that test's error.
  assert.equal(missingFunctionsDependency({ ...threw('expected 3, got 4'), diagnostics: "Cannot find package 'googleapis' imported from /repo/functions/lib/classroom.js" }, CONTEXT), null);
});

test('package names: subpaths and scopes fold to the package, files and builtins are not packages', () => {
  assert.equal(packageName('firebase-admin/app'), 'firebase-admin');
  assert.equal(packageName('@google-cloud/firestore/build/src'), '@google-cloud/firestore');
  assert.equal(packageName('./local.js'), null);
  assert.equal(packageName('/abs/file.mjs'), null);
  assert.equal(packageName('node:fs'), null);
  assert.deepEqual(missingPackages("Cannot find package 'googleapis' imported from /repo/functions/lib/classroom.js").map((entry) => entry.name), ['googleapis']);
});

test('by default the classifier reads THIS checkout: its root and both package.json files', () => {
  const threw = (error) => ({ name: 't', error, operator: '', actual: '', exitCode: null, diagnostics: '' });
  assert.equal(classify(threw(`Cannot find package 'firebase-functions' imported from ${path.join(repo, 'functions/index.js')}`)), 'functionsDependencies');
  assert.equal(classify(threw(`Cannot find package 'mathjs' imported from ${path.join(repo, 'src/x.js')}`)), 'behavioural');
});

/* ------------------------------------------------- the command, end to end */

// This file itself runs under `node --test`, which marks its environment as a
// test child (NODE_TEST_CONTEXT). Inherited, it would make the explainer's own
// `node --test` report to a parent that is not listening instead of printing
// TAP — so the command is run the way a person runs it.
const runExplainer = (files) => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [path.join(repo, 'scripts/explain-test-failures.mjs'), ...files], {
    cwd: repo, env, encoding: 'utf8', timeout: 120_000,
  });
};

const missingInstall = `const error = new Error(${JSON.stringify(`Cannot find package 'firebase-admin' imported from ${path.join(repo, 'functions/shared/liveChallengeClassPoints.mjs')}`)});
error.code = 'ERR_MODULE_NOT_FOUND';
throw error;
`;
const pinnedToText = `import test from 'node:test';
import assert from 'node:assert/strict';
test('a screen is pinned to its wording', () => {
  assert.match("import React from 'react';\\nexport default function Screen() {}", /renamedThing/);
});
`;

test('the command lists a missing install apart, and counts only the failures worth reading', { timeout: 120_000 }, () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mm-explain-'));
  try {
    writeFileSync(path.join(scratch, 'needsFunctions.test.mjs'), missingInstall);
    writeFileSync(path.join(scratch, 'pinned.test.mjs'), pinnedToText);
    const result = runExplainer([path.join(scratch, 'needsFunctions.test.mjs'), path.join(scratch, 'pinned.test.mjs')]);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0, 'the suite did not pass, and the exit code must say so');
    assert.match(output, /ENVIRONMENT, NOT A REGRESSION: 1 FAILURE\b/);
    assert.ok(output.includes(FUNCTIONS_DEPENDENCIES_NOTE), output);
    assert.match(output, /needsFunctions\.test\.mjs {2}\(missing firebase-admin\)/);
    assert.match(output, /HOW TO READ THESE 1 FAILURE\b/, 'the missing install is not counted with the rest');
    assert.match(output, /LIKELY: PINNED TO SOURCE TEXT/);
    assert.doesNotMatch(output, /LIKELY: BEHAVIOURAL/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('when a missing install is the only failure, there is nothing else to read', { timeout: 120_000 }, () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'mm-explain-'));
  try {
    writeFileSync(path.join(scratch, 'needsFunctions.test.mjs'), missingInstall);
    const result = runExplainer([path.join(scratch, 'needsFunctions.test.mjs')]);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.notEqual(result.status, 0);
    assert.match(output, /ENVIRONMENT, NOT A REGRESSION: 1 FAILURE\b/);
    assert.doesNotMatch(output, /HOW TO READ THESE/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
