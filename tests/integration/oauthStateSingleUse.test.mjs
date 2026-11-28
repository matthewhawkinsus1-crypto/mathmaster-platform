// GOOGLE CLASSROOM CONNECT: THE OAUTH STATE IS SINGLE-USE AND THE CONNECTED
// ACCOUNT IS RECORDED, AGAINST REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-oauth-state \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/oauthStateSingleUse.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The real `getGoogleAuthUrl` and `oauthCallback`, with the real
// `saveTeacherTokens`; only the calls that would reach Google are replaced:
//   * two callbacks carrying one state at the same moment: one connects, the
//     other is refused, and the code is exchanged once;
//   * the state document is gone after its one use;
//   * the Google account the tokens belong to is stored on the teacher's
//     integration record, and a lookup that fails does not block connecting.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set: this suite loads the real Cloud Functions.');

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

// The real Classroom library, with only its two Google calls replaced.
const classroomModulePath = require.resolve(path.join(repo, 'functions/lib/classroom.js'));
const realClassroom = require(classroomModulePath);
const exchanges = [];
let accountEmail = async () => 'teacher.google@desotoisd.org';
require.cache[classroomModulePath].exports = {
  ...realClassroom,
  buildAuthUrl: (state) => `https://accounts.example.test/auth?state=${state}`,
  exchangeCodeForTokens: async (code) => {
    exchanges.push(code);
    return { access_token: `access-${code}`, refresh_token: `refresh-${code}`, scope: realClassroom.SCOPES.join(' ') };
  },
  fetchGoogleAccountEmail: async (tokens) => accountEmail(tokens),
};

const fns = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();

const teacherRequest = (uid) => ({
  auth: { uid, token: { role: 'teacher', email: `${uid}@desotoisd.org`, email_verified: true } },
  data: {},
  rawRequest: { headers: {} },
});

/** One browser arriving at the callback: what the response said. */
const callback = (query) => new Promise((resolve, reject) => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    send(body) { resolve({ status: this.statusCode, body: String(body) }); return this; },
    redirect(code, url) { resolve({ status: code, location: String(url) }); return this; },
    set() { return this; },
    setHeader() { return this; },
    getHeader() { return undefined; },
    end() { resolve({ status: this.statusCode }); return this; },
    on() { return this; },
  };
  Promise.resolve(fns.oauthCallback({ method: 'GET', query, headers: {}, url: '/oauthCallback', get: () => undefined }, res)).catch(reject);
});

const stateFrom = (url) => new URL(url).searchParams.get('state');

test('a state is used once, however many callbacks carry it at the same moment', async () => {
  const { url } = await fns.getGoogleAuthUrl.run(teacherRequest('oauth-race-teacher'));
  const state = stateFrom(url);
  exchanges.length = 0;
  const outcomes = await Promise.all(Array.from({ length: 4 }, (_, index) => callback({ code: `race-code-${index}`, state })));
  const connected = outcomes.filter((outcome) => outcome.status === 302 && /classroomConnected=1/.test(outcome.location || ''));
  assert.equal(connected.length, 1, 'exactly one callback connects');
  assert.equal(outcomes.filter((outcome) => outcome.status === 400).length, 3, 'the others are refused');
  assert.equal(exchanges.length, 1, 'the code is exchanged once');
  assert.equal((await db.doc(`oauthStates/${state}`).get()).exists, false, 'the state is gone');
});

test('the connected Google account is stored with the connection', async () => {
  accountEmail = async () => 'teacher.google@desotoisd.org';
  const { url } = await fns.getGoogleAuthUrl.run(teacherRequest('oauth-email-teacher'));
  const outcome = await callback({ code: 'email-code', state: stateFrom(url) });
  assert.match(outcome.location, /classroomConnected=1/);
  const stored = (await db.doc('teacherIntegrations/oauth-email-teacher').get()).data();
  assert.equal(stored.googleAccountEmail, 'teacher.google@desotoisd.org');
  assert.equal(stored.connectionState, 'connected');
});

test('a failed account lookup does not block connecting, and clears an older account', async () => {
  accountEmail = async () => { throw new Error('profile unavailable'); };
  const { url } = await fns.getGoogleAuthUrl.run(teacherRequest('oauth-email-teacher'));
  const outcome = await callback({ code: 'email-code-2', state: stateFrom(url) });
  assert.match(outcome.location, /classroomConnected=1/);
  const stored = (await db.doc('teacherIntegrations/oauth-email-teacher').get()).data();
  assert.equal(stored.googleAccountEmail, null);
});

test('a state that is not one document id is refused without a read', async () => {
  const outcome = await callback({ code: 'x', state: 'a/b/c' });
  assert.equal(outcome.status, 400);
});
