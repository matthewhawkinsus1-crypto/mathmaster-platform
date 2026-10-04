/*
 * ONE STUDENT DEVICE'S FIREBASE, FOR THE LAUNCH CERTIFICATION.
 *
 * Stands in for src/firebase.js when the real client service
 * (src/platform/liveChallenge/liveChallengeService.js) is loaded for one
 * simulated device: clientFirebaseHooks.mjs resolves that service's
 * `../../firebase.js` to this module with the device's `?mmClient=<id>`, so
 * every device gets its own Firebase app and its own Firestore connection to
 * the emulator — its own listen stream, its own cache, its own network switch
 * (disableNetwork) — exactly as separate Chromebooks would.
 *
 * Never loaded outside the emulator suites: it refuses to start without
 * FIRESTORE_EMULATOR_HOST, and nothing in src/ imports it.
 */
import { deleteApp, initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, terminate } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const clientId = new URL(import.meta.url).searchParams.get('mmClient');
if (!clientId) throw new Error('clientFirebase.mjs is loaded per device, with ?mmClient=<id>.');
const emulator = String(process.env.FIRESTORE_EMULATOR_HOST || '');
if (!emulator) throw new Error('clientFirebase.mjs connects to the Firestore emulator only (FIRESTORE_EMULATOR_HOST).');
const [hostname, port] = emulator.split(':');

export const app = initializeApp({
  projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-launch-cert',
  apiKey: 'emulator-only',
}, `mm-launch-cert-${clientId}`);
export const db = getFirestore(app);
connectFirestoreEmulator(db, hostname, Number(port));
// The certification calls the real callables directly, under each student's
// identity; nothing here is ever invoked. It exists so the service resolves.
export const functions = getFunctions(app);
export const auth = null;

/** Close this device: its listen stream, its cache, its app. */
export const shutdown = async () => {
  await terminate(db).catch(() => {});
  await deleteApp(app).catch(() => {});
};
