// THE SIGN-IN SCREEN DOES NOT DOWNLOAD FIRESTORE (PF01, the sign-in path).
//
// scripts/check-first-load-budget.mjs measured the Firestore SDK (its
// WebChannel transport and the RE2 regular-expression engine with it, 148 KB
// gzip) as more than half of what the sign-in screen downloads: 294.4 KB in 28
// files. Nothing before an account exists reads Firestore. It was there
// because src/firebase.js made the Firebase app, Auth, Functions and Firestore
// in one module, and the sign-in path imports it for Auth and Functions.
//
// src/firebaseApp.js now makes the app, Auth and Functions; src/firebase.js
// builds Firestore on that app and re-exports the rest under the same names,
// so App and every service import exactly what they did. The sign-in path
// (AuthProvider.jsx, authService.js, classroomApi.js) imports firebaseApp.js.
// Firestore loads with App, which AppShell prefetches while the sign-in screen
// is up and loads the moment an account is signed in.
//
// The same static walk as initialBundleBoundary.test.mjs, per package entry
// point (tests/platform/helpers/firstLoadGraph.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { appGraph, chainTo, repo, signInGraph } from './helpers/firstLoadGraph.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const file = (name) => path.join(repo, name);
const read = (name) => readFileSync(file(name), 'utf8');
const signIn = signInGraph();

test('the walker reaches the sign-in screen, Firebase Auth and Functions', () => {
  // What stays on the sign-in path, on purpose: without these the absences
  // below would prove nothing.
  for (const name of ['src/LoginScreen.jsx', 'src/auth/AuthProvider.jsx', 'src/auth/authService.js', 'src/classroomApi.js', 'src/firebaseApp.js']) {
    assert.ok(signIn.has(file(name)), `${name} is no longer on the sign-in path: the walk or the wiring changed`);
  }
  for (const entry of ['pkg:firebase/app', 'pkg:firebase/auth', 'pkg:firebase/functions']) {
    assert.ok(signIn.has(entry), `${entry} is not on the sign-in path: signing in needs it`);
  }
});

test('the Firestore SDK is not on the sign-in path: nothing before sign-in imports firebase.js', () => {
  assert.ok(existsSync(file('src/firebase.js')), 'src/firebase.js no longer exists: point this test at the module that starts Firestore');
  assert.ok(!signIn.has('pkg:firebase/firestore'), `firebase/firestore is on the sign-in path: ${signIn.has('pkg:firebase/firestore') ? chainTo(signIn, 'pkg:firebase/firestore') : ''}`);
  const key = file('src/firebase.js');
  assert.ok(!signIn.has(key), `src/firebase.js is on the sign-in path (it starts Firestore): ${signIn.has(key) ? chainTo(signIn, key) : ''}. Import auth or functions from firebaseApp.js there.`);
});

test('Firestore comes with App: App reaches firebase.js statically, so loading or prefetching App brings it', () => {
  const app = appGraph();
  assert.ok(app.has(file('src/firebase.js')), 'App.jsx no longer reaches src/firebase.js statically: Firestore would arrive after Home asks for it');
  assert.ok(app.has('pkg:firebase/firestore'));
  // The shell's prefetch while the sign-in screen is up, and its load once an
  // account is signed in, are this one import (appShellSplit.test.mjs).
  assert.match(executableSource(read('src/app/shell/AppShell.jsx')), /export const loadApp = \(\) => import\('\.\.\/\.\.\/App\.jsx'\);/);
});

// With Firestore off the shell, its first idle moment can come while Auth is
// still reading the device's session, before the sign-in screen has drawn:
// prefetching App then held that screen up (on a production build at a 4x
// slowed CPU, it drew later than before the move whenever the prefetch ran
// first). The prefetch waits until the account has been read once. That is
// latched: pressing Sign in ('loading' again) keeps a prefetch already
// scheduled, and an account already signed in loads App at once.
test('the shell prefetches App once the account has been read, never while it is still being read', () => {
  const shell = executableSource(read('src/app/shell/AppShell.jsx'));
  assert.match(shell, /const \[accountRead, setAccountRead\] = useState\(\(\) => auth\.status !== 'loading'\);/);
  const statusEffect = region(shell, 'if (accountPresent(auth.status)) setAppWanted(true);', '}, [auth.status]);', 'the account status effect');
  assert.match(statusEffect, /if \(auth\.status !== 'loading'\) setAccountRead\(true\);/);
  assert.doesNotMatch(shell, /setAccountRead\((?!true\))/, 'once read, the account stays read');
  const prefetch = region(shell, 'if (appWanted || !accountRead) return undefined;', '}, [appWanted, accountRead]);', 'the prefetch effect');
  assert.match(prefetch, /const prefetch = \(\) => \{ loadApp\(\)\.catch\(/);
  assert.match(prefetch, /window\.requestIdleCallback\(prefetch, \{ timeout: 2000 \}\)/);
});

test('firebase.js starts Firestore once, on firebaseApp.js\'s app, with the persistent multi-tab cache, and passes the rest through', () => {
  const firebase = executableSource(read('src/firebase.js'));
  assert.match(firebase, /^import \{ app, auth, functions \} from '\.\/firebaseApp\.js';$/m);
  assert.match(firebase, /^export const db = initializeFirestore\(app, \{\s*localCache: persistentLocalCache\(\{ tabManager: persistentMultipleTabManager\(\) \}\),\s*\}\);$/m);
  assert.equal((firebase.match(/initializeFirestore\(/g) || []).length, 1, 'one Firestore instance');
  assert.match(firebase, /^export \{ app, auth, functions \};$/m);
  // The app is made in one place only, from the production config.
  assert.doesNotMatch(firebase, /initializeApp|getAuth|getFunctions|apiKey/);
  const core = executableSource(read('src/firebaseApp.js'));
  assert.match(core, /^const app = getApps\(\)\.length \? getApp\(\) : initializeApp\(firebaseConfig\);$/m);
  assert.match(core, /^export const auth = getAuth\(app\);$/m);
  assert.match(core, /^export const functions = getFunctions\(app\);$/m);
  assert.doesNotMatch(core, /firestore/i);
  // Nothing else makes a Firebase service of its own: a getFirestore() that ran
  // before firebase.js would start Firestore without its cache.
  for (const [name, source] of [...signIn.keys(), ...appGraph().keys()]
    .filter((key) => !key.startsWith('pkg:') && /\.(m?jsx?)$/.test(key))
    .map((key) => [path.relative(repo, key), readFileSync(key, 'utf8')])) {
    if (name === 'src/firebase.js' || name === 'src/firebaseApp.js') continue;
    assert.doesNotMatch(executableSource(source), /\b(?:getFirestore|initializeFirestore|getAuth|getFunctions|initializeApp)\(/, `${name} makes a Firebase service itself`);
  }
});

test('the sign-in path takes Auth and Functions from firebaseApp.js', () => {
  for (const [name, specifier, names] of [
    ['src/auth/AuthProvider.jsx', '../firebaseApp.js', 'auth'],
    ['src/auth/authService.js', '../firebaseApp.js', 'auth, functions'],
    ['src/classroomApi.js', './firebaseApp.js', 'functions'],
  ]) {
    const source = executableSource(read(name));
    assert.match(source, new RegExp(`^import \\{ ${names} \\} from ["']${specifier.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}["'];$`, 'm'), `${name} imports ${names} from ${specifier}`);
  }
});
