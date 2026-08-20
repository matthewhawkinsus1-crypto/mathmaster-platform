import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EXECUTION_MODES,
  resolveExecutionMode,
} from '../../src/config/executionModeResolution.js';

const serviceSource = readFileSync(new URL('../../src/services/pathSessionService.js', import.meta.url), 'utf8');

test('a production build with no execution mode configured refuses rather than serving the sandbox', () => {
  const resolved = resolveExecutionMode({ configuredMode: '', isProductionBuild: true });
  assert.equal(resolved.mode, EXECUTION_MODES.MISCONFIGURED);
  assert.equal(resolved.mockAllowed, false);
  assert.match(resolved.message, /VITE_MATHMASTER_EXECUTION_MODE/);
});

test('a production build with an unrecognised execution mode also refuses', () => {
  const resolved = resolveExecutionMode({ configuredMode: 'localish', isProductionBuild: true });
  assert.equal(resolved.mode, EXECUTION_MODES.MISCONFIGURED);
  assert.equal(resolved.reason, 'unrecognised_mode_in_production_build');
});

test('a production build that explicitly names the mock still refuses without a deliberate opt-in', () => {
  const resolved = resolveExecutionMode({ configuredMode: 'mockLocal', isProductionBuild: true });
  assert.equal(resolved.mode, EXECUTION_MODES.MISCONFIGURED);
  assert.equal(resolved.reason, 'mock_requested_in_production_build');
});

test('a demo build may opt into the mock deliberately', () => {
  const resolved = resolveExecutionMode({
    configuredMode: 'mockLocal',
    isProductionBuild: true,
    allowMockInProduction: 'true',
  });
  assert.equal(resolved.mode, EXECUTION_MODES.MOCK_LOCAL);
  assert.equal(resolved.mockAllowed, true);
});

test('explicit development mock still works', () => {
  const resolved = resolveExecutionMode({ configuredMode: 'mockLocal', isProductionBuild: false });
  assert.equal(resolved.mode, EXECUTION_MODES.MOCK_LOCAL);
  assert.equal(resolved.mockAllowed, true);
});

test('a local dev server with no configuration still gets the sandbox', () => {
  const resolved = resolveExecutionMode({ configuredMode: '', isProductionBuild: false });
  assert.equal(resolved.mode, EXECUTION_MODES.MOCK_LOCAL);
  assert.equal(resolved.reason, 'development_default');
});

test('a configured production build uses the secure server and never the mock', () => {
  const resolved = resolveExecutionMode({ configuredMode: 'firebaseProduction', isProductionBuild: true });
  assert.equal(resolved.mode, EXECUTION_MODES.FIREBASE_PRODUCTION);
  assert.equal(resolved.mockAllowed, false);
});

test('every Path session entry point checks the runtime before doing anything', () => {
  ['startOrResumePathSession', 'fetchNextSanitizedQuestion', 'submitStudentResponse'].forEach((name) => {
    const body = serviceSource.split(`export const ${name}`)[1] || '';
    const guardIndex = body.indexOf('assertRuntimeAvailable()');
    const mockIndex = body.indexOf('usingMockRuntime()');
    assert.ok(guardIndex > -1, `${name} must assert the runtime is available`);
    assert.ok(mockIndex === -1 || guardIndex < mockIndex, `${name} must refuse a misconfigured build before reaching the mock`);
  });
});

test('the mock runtime is reachable only through the explicit allowance', () => {
  assert.ok(serviceSource.includes('isMockPathAllowed()'), 'the service must consult the mock allowance');
  // The old code branched straight off the mode, which is what let a missing
  // variable turn into fake questions.
  assert.ok(
    !/getExecutionMode\(\) === EXECUTION_MODES\.MOCK_LOCAL\s*\)\s*\{/.test(serviceSource.replace(/isMockPathAllowed\(\) && /g, '')),
    'the mock branch must not be selected by mode alone',
  );
});

test('the sandbox never impersonates authored Path content', () => {
  assert.ok(!/Phase 5 local sandbox/.test(serviceSource), 'the old sandbox prompt must be gone');
  assert.ok(serviceSource.includes('isDevelopmentSandbox: true'), 'sandbox payloads must mark themselves');
});
