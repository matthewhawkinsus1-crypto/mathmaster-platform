import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getMathMasterBuildInfo,
  diagnoseRuntimeCompatibility,
} from '../../src/platform/runtime/buildInfo.js';

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
