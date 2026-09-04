// Stands in for src/firebase.js inside the full-game harness ONLY.
//
// The real module hardcodes the live project's config, so a harness that
// imported it would point a browser at production. This one connects to the
// Firestore emulator instead, under a throwaway project id, so nothing the
// harness does can reach a real student.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const host = new URLSearchParams(window.location.search).get('emulator') || 'localhost:8182';
const [hostname, port] = host.split(':');

const app = getApps().length ? getApp() : initializeApp({ projectId: 'mathmaster-game-harness' });
export const db = getFirestore(app);
connectFirestoreEmulator(db, hostname, Number(port) || 8182);

// The harness never authenticates and never calls a function. These exist so
// any incidental import resolves rather than crashing the page.
export const auth = null;
export const functions = null;
export { app };
