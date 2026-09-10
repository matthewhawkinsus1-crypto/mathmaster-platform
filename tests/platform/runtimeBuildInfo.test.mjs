import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getMathMasterBuildInfo,
  diagnoseRuntimeCompatibility,
} from '../../src/platform/runtime/buildInfo.js';
import { buildAssignmentRepairCenterModel } from '../../src/platform/preflight/assignmentRepairCenterModel.js';
import { ASSIGNMENT_RUNTIME_REPAIR_VERSION } from '../../src/platform/assignments/assignmentRuntimeRepair.js';

const repairKey = 'function-modeling-exact-ask-no-synthetic-graph-v1';
const assignment = (repairVersion = 0) => ({
  schemaVersion: 5,
  assignment: { title: 'Build diagnostic fixture', courseId: 'algebra1' },
  ...(repairVersion > 0 ? {
    runtimeCompatibility: {
      repairVersion,
      repairedAt: '2026-09-09T23:00:00.000Z',
      repairKeys: [repairKey],
    },
  } : {}),
  sections: [{
    id: 'cw', role: 'classwork', title: 'Classwork', questions: [{ questionId: 'q1', prompt: 'Analyze.' }],
  }],
});
const reviewContext = {
  flags: [],
  platformIssues: [{
    questionId: 'q1',
    status: 'open',
    suspectedComponent: 'functionModeling graph stage',
    reason: 'The graph should not be here.',
    repairKey,
  }],
};

test('build metadata exposes deployed sha, build time, and assignment runtime repair version', () => {
  const info = getMathMasterBuildInfo({
    VITE_MATHMASTER_GIT_SHA: 'abc1234',
    VITE_MATHMASTER_BUILT_AT: '2026-09-09T23:59:00.000Z',
    VITE_MATHMASTER_RUNTIME_REPAIR_VERSION: '1',
  });
  assert.deepEqual(info, {
    gitSha: 'abc1234',
    builtAt: '2026-09-09T23:59:00.000Z',
    assignmentRuntimeRepairVersion: 1,
  });
});

test('runtime diagnosis distinguishes stale deployment, pending persistence, and remaining regression', () => {
  assert.equal(diagnoseRuntimeCompatibility({
    requiredRuntimeVersion: 1,
    liveBuildInfo: { assignmentRuntimeRepairVersion: 0 },
    storedRepairVersion: 0,
    issueReproduces: true,
  }).status, 'deploymentMismatch');

  assert.equal(diagnoseRuntimeCompatibility({
    requiredRuntimeVersion: 1,
    liveBuildInfo: { assignmentRuntimeRepairVersion: 1 },
    storedRepairVersion: 0,
    issueReproduces: false,
  }).status, 'persistencePending');

  assert.equal(diagnoseRuntimeCompatibility({
    requiredRuntimeVersion: 1,
    liveBuildInfo: { assignmentRuntimeRepairVersion: 1 },
    storedRepairVersion: 1,
    issueReproduces: true,
  }).status, 'remainingRegression');
});

test('Repair Center explains deployment mismatch for an open known platform issue', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { __MATHMASTER_BUILD__: { gitSha: 'oldsha', builtAt: 'old', assignmentRuntimeRepairVersion: 0 } };
  try {
    const model = buildAssignmentRepairCenterModel({ assignmentV5: assignment(0), diagnostics: [], teacherReviewContext: reviewContext });
    assert.match(model.questions[0].automatedFindings[0].message, /deployment mismatch/i);
    assert.equal(model.questions[0].automatedFindings[0].runtimeDiagnosis.status, 'deploymentMismatch');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('Repair Center explains pending persistence and remaining regression when build is current', () => {
  const previousWindow = globalThis.window;
  // This test is named "when build is current", so the fixture has to MEAN
  // current. A literal stops meaning current the moment the version is bumped,
  // which is the one thing this constant exists to allow.
  globalThis.window = { __MATHMASTER_BUILD__: { gitSha: 'newsha', builtAt: 'now', assignmentRuntimeRepairVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION } };
  try {
    const pending = buildAssignmentRepairCenterModel({ assignmentV5: assignment(0), diagnostics: [], teacherReviewContext: reviewContext });
    assert.equal(pending.questions[0].automatedFindings[0].runtimeDiagnosis.status, 'persistencePending');
    assert.match(pending.questions[0].automatedFindings[0].message, /persistence pending/i);

    // Stamped at the CURRENT version and still reporting the problem — that is
    // what "remaining regression" means. The literal 1 said that only while 1
    // happened to be current; once the version advanced, this fixture became a
    // STALE stamp and the model correctly reported persistencePending instead,
    // so the test failed while asserting the opposite of its own name.
    const remaining = buildAssignmentRepairCenterModel({ assignmentV5: assignment(ASSIGNMENT_RUNTIME_REPAIR_VERSION), diagnostics: [], teacherReviewContext: reviewContext });
    assert.equal(remaining.questions[0].automatedFindings[0].runtimeDiagnosis.status, 'remainingRegression');
    assert.match(remaining.questions[0].automatedFindings[0].message, /remaining regression/i);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('Firebase hosting build injects one sha, timestamp, and runtime repair version', () => {
  const source = readFileSync(new URL('../../scripts/build-firebase-hosting.mjs', import.meta.url), 'utf8');
  assert.match(source, /VITE_MATHMASTER_GIT_SHA/);
  assert.match(source, /VITE_MATHMASTER_BUILT_AT/);
  assert.match(source, /VITE_MATHMASTER_RUNTIME_REPAIR_VERSION/);
});

test('main publishes build metadata for support diagnostics', () => {
  const source = readFileSync(new URL('../../src/main.jsx', import.meta.url), 'utf8');
  assert.match(source, /window\.__MATHMASTER_BUILD__/);
  assert.match(source, /getMathMasterBuildInfo/);
});
