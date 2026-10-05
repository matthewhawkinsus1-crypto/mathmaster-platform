/*
 * EMULATOR-ONLY CLIENT FIREBASE, FOR EVERY THREAD THAT LOADS THE REAL CLIENT
 * SERVICE (a simulated student device, the simulated host console, the
 * standings profile's observers).
 *
 * registerClientFirebaseHooks() installs clientFirebaseHooks.mjs once per
 * thread, before the service is imported: its `../../firebase.js` then
 * resolves to clientFirebase.mjs (the emulator) and src/firebase.js — the
 * production project's config — cannot load. assertEmulatorOnlyFirebase()
 * checks the result after an import: every Firebase app in the thread must be
 * a per-device emulator app. A thread that skipped the hook fails here, before
 * any listener is attached, instead of reaching the production project.
 */
import { register } from 'node:module';
import { getApps } from 'firebase/app';

export const PRODUCTION_PROJECT_ID = 'mathmaster-aleks';
const EMULATOR_APP_PREFIX = 'mm-launch-cert-';
const REGISTERED = Symbol.for('mathmaster.clientFirebaseHooks');

/** Install the resolution hook in this thread (idempotent). */
export function registerClientFirebaseHooks() {
  if (globalThis[REGISTERED]) return;
  register('./clientFirebaseHooks.mjs', import.meta.url);
  globalThis[REGISTERED] = true;
}

/** Throw unless every Firebase app loaded in this thread is a per-device emulator app. */
export function assertEmulatorOnlyFirebase(where = 'client service') {
  const offending = getApps().filter((app) => !String(app.name).startsWith(EMULATOR_APP_PREFIX)
    || app.options?.projectId === PRODUCTION_PROJECT_ID);
  if (offending.length) {
    const names = offending.map((app) => `${app.name} (${app.options?.projectId || 'no project'})`).join(', ');
    throw new Error(`${where}: a Firebase app that is not an emulator device is loaded: ${names}. The production config must never load in the emulator suites.`);
  }
}

/** Import the real client service for one simulated client, emulator-bound and checked. */
export async function importClientService(clientId, where = clientId) {
  registerClientFirebaseHooks();
  const service = await import(`../../../src/platform/liveChallenge/liveChallengeService.js?mmClient=${clientId}`);
  const firebase = await import(`./clientFirebase.mjs?mmClient=${clientId}`);
  assertEmulatorOnlyFirebase(where);
  return { service, firebase };
}
