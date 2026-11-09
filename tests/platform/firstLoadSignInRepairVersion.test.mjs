// THE SIGN-IN PATH READS THE REPAIR'S VERSION, NOT THE REPAIR (PF01, the
// sign-in path).
//
// main.jsx publishes this build's info (window.__MATHMASTER_BUILD__) before the
// sign-in screen draws. buildInfo.js reports in it which assignment runtime
// repair version the build runs, and the Repair Center compares a live build's
// version against the one an issue needs. It took that one number from the
// repair (src/platform/assignments/assignmentRuntimeRepair.js, which re-exports
// functions/shared/runtime/assignmentRuntimeRepair.mjs), and so the whole
// repair and the relation routing it reads (4.5 KB gzip in three files) loaded
// before every sign-in screen. The repair is shared with server grading and
// stays where it is; the runtime keeps its own copy of the number
// (src/platform/runtime/assignmentRuntimeRepairVersion.js), and this test fails
// the moment the two differ.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chainTo, repo, signInGraph } from './helpers/firstLoadGraph.mjs';
import { ASSIGNMENT_RUNTIME_REPAIR_VERSION } from '../../functions/shared/runtime/assignmentRuntimeRepair.mjs';
import { ASSIGNMENT_RUNTIME_REPAIR_VERSION as RUNTIME_COPY } from '../../src/platform/runtime/assignmentRuntimeRepairVersion.js';
import { diagnoseRuntimeCompatibility, getMathMasterBuildInfo } from '../../src/platform/runtime/buildInfo.js';

const file = (name) => path.join(repo, name);
const signIn = signInGraph();
const REPAIR = ASSIGNMENT_RUNTIME_REPAIR_VERSION;

test('the walker reaches the build info and its copy of the version on the sign-in path', () => {
  for (const name of ['src/platform/runtime/buildInfo.js', 'src/platform/runtime/assignmentRuntimeRepairVersion.js']) {
    assert.ok(signIn.has(file(name)), `${name} is not on the sign-in path: the walk or the wiring changed, so the absences below prove nothing`);
  }
});

test('the repair and what it reads are not on the sign-in path', () => {
  for (const name of [
    'src/platform/assignments/assignmentRuntimeRepair.js',
    'functions/shared/runtime/assignmentRuntimeRepair.mjs',
    'functions/shared/runtime/stepAlgebraRelationRouting.mjs',
  ]) {
    const key = file(name);
    assert.ok(existsSync(key), `${name} no longer exists: point this test at the module that took its place`);
    assert.ok(!signIn.has(key), `${name} is on the sign-in path: ${signIn.has(key) ? chainTo(signIn, key) : ''}. The sign-in path reads the version from src/platform/runtime/assignmentRuntimeRepairVersion.js.`);
  }
});

// Not assert.equal: npm run test:platform reads a small number on one side of
// an equality as a fixture pinned to a moving constant and advises importing
// the constant, which here would put the repair back on the sign-in path.
test("the runtime's copy of the version is the repair's", () => {
  assert.ok(Number.isInteger(REPAIR) && REPAIR > 0, `the repair's version is ${REPAIR}`);
  assert.ok(RUNTIME_COPY === REPAIR, `The repair's version is ${REPAIR} and the runtime's copy is ${RUNTIME_COPY}. `
    + `Set ASSIGNMENT_RUNTIME_REPAIR_VERSION in src/platform/runtime/assignmentRuntimeRepairVersion.js to ${REPAIR}: `
    + 'a build would otherwise report, and the Repair Center require, a version the repair is not at.');
});

test('the build reports the repair\'s version, and a live build is compared against it as before', () => {
  // A build the Hosting script made carries the version it read from the
  // repair (scripts/build-firebase-hosting.mjs); any other build falls back to
  // the copy. The two read the same.
  const hosting = getMathMasterBuildInfo({ VITE_MATHMASTER_RUNTIME_REPAIR_VERSION: String(REPAIR) });
  const plain = getMathMasterBuildInfo({});
  assert.ok(hosting.assignmentRuntimeRepairVersion === REPAIR, `a Hosting build reports ${hosting.assignmentRuntimeRepairVersion}, the repair is at ${REPAIR}`);
  assert.ok(plain.assignmentRuntimeRepairVersion === REPAIR, `a build without the injected version reports ${plain.assignmentRuntimeRepairVersion}, the repair is at ${REPAIR}`);

  // What an issue requires when the caller names nothing is the repair's version.
  const byDefault = diagnoseRuntimeCompatibility({ liveBuildInfo: plain, storedRepairVersion: REPAIR });
  assert.ok(byDefault.requiredRuntimeVersion === REPAIR, `an issue requires ${byDefault.requiredRuntimeVersion} by default, the repair is at ${REPAIR}`);
  assert.equal(byDefault.status, 'current');
  // A live build behind the repair is a deployment mismatch; this build, with a
  // record stamped before it, is persistence pending; stamped at it and still
  // reproducing, a remaining regression.
  assert.equal(diagnoseRuntimeCompatibility({ liveBuildInfo: { assignmentRuntimeRepairVersion: REPAIR - 1 }, storedRepairVersion: REPAIR }).status, 'deploymentMismatch');
  assert.equal(diagnoseRuntimeCompatibility({ liveBuildInfo: plain, storedRepairVersion: REPAIR - 1 }).status, 'persistencePending');
  assert.equal(diagnoseRuntimeCompatibility({ liveBuildInfo: plain, storedRepairVersion: REPAIR, issueReproduces: true }).status, 'remainingRegression');
});
