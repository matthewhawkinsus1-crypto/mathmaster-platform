/*
 * THE SIMULATED CLIENTS NEVER LOAD THE PRODUCTION CONFIG.
 *
 * The launch certification and the standings profile run the real client
 * service (src/platform/liveChallenge/liveChallengeService.js) for every
 * simulated device and for the simulated host console. That service imports
 * src/firebase.js — the production project's config. In those suites it must
 * resolve to the emulator-only clientFirebase.mjs instead, in every thread
 * that loads it; a thread that forgot the resolution hook once loaded the
 * production config for the simulated host. These hold the guard that makes
 * that mistake fail loudly (tests/integration/support/registerClientFirebase.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteApp, getApps, initializeApp } from 'firebase/app';

// clientFirebase.mjs refuses to start without an emulator address; nothing
// here opens a connection (no read, no listener), so any address will do.
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:1';

const {
  PRODUCTION_PROJECT_ID,
  assertEmulatorOnlyFirebase,
  importClientService,
} = await import('../integration/support/registerClientFirebase.mjs');

test('a simulated client loads the real service on its own emulator app, and no other app', async () => {
  const { service, firebase } = await importClientService('guard-device', 'guard test');
  assert.equal(typeof service.watchLiveChallengeStandings, 'function');
  const names = getApps().map((app) => app.name);
  assert.deepEqual(names, ['mm-launch-cert-guard-device']);
  assert.notEqual(getApps()[0].options.projectId, PRODUCTION_PROJECT_ID);
  await firebase.shutdown();
});

test('in a thread with the hook, every other route to src/firebase.js is refused', async () => {
  await importClientService('guard-route', 'guard test').then(({ firebase }) => firebase.shutdown());
  await assert.rejects(import('../../src/platform/liveChallenge/liveChallengeService.js'), /production Firebase config \(src\/firebase\.js\) must never load/);
  await assert.rejects(import('../../src/firebase.js'), /must never load in the emulator suites/);
  assert.equal(getApps().some((app) => app.options?.projectId === PRODUCTION_PROJECT_ID), false);
});

test('the check fails a thread that holds any app other than an emulator device', async () => {
  const stray = initializeApp({ projectId: 'demo-guard-stray', apiKey: 'emulator-only' }, 'not-a-device');
  assert.throws(() => assertEmulatorOnlyFirebase('guard test'), /guard test: a Firebase app that is not an emulator device is loaded: not-a-device/);
  // ...and loading a simulated client in such a thread fails before it is used.
  await assert.rejects(importClientService('guard-stray', 'guard loader'), /guard loader: a Firebase app that is not an emulator device/);
  await Promise.all(getApps().filter((app) => app.name === 'mm-launch-cert-guard-stray').map((app) => deleteApp(app)));
  await deleteApp(stray);
  // A device-named app on the production project is refused too. (A local
  // object only: no request is ever made with it.)
  const disguised = initializeApp({ projectId: PRODUCTION_PROJECT_ID, apiKey: 'emulator-only' }, 'mm-launch-cert-disguised');
  assert.throws(() => assertEmulatorOnlyFirebase('guard test'), /mm-launch-cert-disguised \(mathmaster-aleks\)/);
  await deleteApp(disguised);
  assert.doesNotThrow(() => assertEmulatorOnlyFirebase('guard test'));
});
