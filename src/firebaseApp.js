/*
 * THE FIREBASE APP, AND THE TWO SERVICES SIGNING IN USES: AUTH AND FUNCTIONS.
 *
 * The sign-in screen takes Auth and Functions from here (AuthProvider.jsx,
 * authService.js, classroomApi.js): whether someone is signed in, the Google,
 * password and student-ID sign-ins, and the callables they make
 * (studentSignIn, resolveSignedInRole, linkGoogleAccount, and a Classroom
 * launch link's "You are opening …" preview).
 *
 * Firestore is not here. It starts in firebase.js, which App and the services
 * import, so it loads with App: the shell prefetches App while the sign-in
 * screen is up (app/shell/AppShell.jsx), and loads it the moment an account
 * is signed in. The Firestore SDK was more than half of what the sign-in
 * screen downloaded (scripts/check-first-load-budget.mjs), before anyone had
 * signed in to read anything.
 *
 * This module holds the production project's config, so every browser
 * harness that swaps firebase.js for the emulator swaps this one too
 * (tests/browser/emulator/firebaseEmulator.js stands in for both).
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyDRpBiB5X7OIzt5hy5nI_CHE3_BKJ6iRxc',
  authDomain: 'mathmaster-aleks.firebaseapp.com',
  projectId: 'mathmaster-aleks',
  storageBucket: 'mathmaster-aleks.firebasestorage.app',
  messagingSenderId: '769892730653',
  appId: '1:769892730653:web:1d5a8503cf504fcfe243f4',
  measurementId: 'G-3Y2XFPJB9Z',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Analytics is intentionally not initialized during application startup.
// It is optional, and unsupported preview/browser environments should never
// be allowed to prevent MathMaster from rendering.
export const auth = getAuth(app);
export const functions = getFunctions(app);
export { app };
