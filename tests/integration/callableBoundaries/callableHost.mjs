/*
 * CALLABLES, CALLED THE WAY A BROWSER CALLS THEM: REAL TOKENS, REAL PROTOCOL.
 *
 * HOW TO RUN: npm run test:callable-boundaries:emulator (Firestore and Auth
 * emulators; CI runs it in full-platform-suite.yml).
 *
 * The other integration suites run a callable's handler directly,
 * `fns.x.run({ auth: { token: { role: 'teacher', ... } } })`: the identity is
 * whatever the test typed. Here every caller is a real account in the Auth
 * emulator. A teacher or student is given their role by the real
 * `resolveSignedInRole` callable, exactly as the app does after every sign-in,
 * and every call goes through the Firebase client SDK's `httpsCallable` over
 * HTTP to the deployed function object. So the token is minted by Auth and
 * carries only the claims the server granted, firebase-functions verifies it
 * (`verifyIdToken`, against the Auth emulator), and a refusal arrives as the
 * code and message the browser receives.
 *
 * The functions are hosted in this process rather than in the Functions
 * emulator. The callable protocol is the same code either way: the
 * `onCall` wrapper checks the request, verifies the token and turns an
 * HttpsError into its HTTP status and JSON body; the emulator only adds the
 * HTTP server, which this file provides with Express as the emulator does. What
 * hosting them here keeps: Google Classroom is a recording stub (so a test can
 * show a refused caller never reaches Google, and an owner does), and no
 * Firestore trigger fires on its own (so "nothing was written" is a comparison
 * of the whole project, with no background writer to race).
 *
 * Never loaded outside the emulators: it refuses to start without both
 * emulator hosts and a `demo-` project id, for which the Firebase tools never
 * reach a real project.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

import { deleteApp, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repo = path.resolve(here, '../../..');
const requireFromFunctions = createRequire(path.join(repo, 'functions/package.json'));

export const PROJECT = String(process.env.GCLOUD_PROJECT || '');
const AUTH_EMULATOR = String(process.env.FIREBASE_AUTH_EMULATOR_HOST || '');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'FIRESTORE_EMULATOR_HOST must be set: this suite loads the real Cloud Functions.');
assert.ok(AUTH_EMULATOR, 'FIREBASE_AUTH_EMULATOR_HOST must be set: every caller is a real Auth emulator account.');
assert.match(PROJECT, /^demo-/, 'run under a demo- project id (firebase emulators:exec --project demo-...), which never reaches a real project');
export const REGION = 'us-central1';

/* --- Google Classroom: a recording stub ------------------------------------ */

const googleCalls = [];
// What the stub answers. Anything not listed records the call and fails, so a
// Google call nobody expected is loud rather than quietly answered.
const googleAnswers = {
  getClassroomClient: async (teacherUid) => ({ teacherUid }),
  getCourseWork: async (client, courseId, courseWorkId) => ({
    id: courseWorkId,
    description: `Lesson\n\n[MathMaster publication:${googleFixtures.publicationByCourseWork[courseWorkId] || 'unknown'}]`,
    state: 'PUBLISHED',
    assigneeMode: 'INDIVIDUAL_STUDENTS',
    individualStudentsOptions: { studentIds: ['google-one'] },
  }),
  modifyCourseWorkAssignees: async (client, { courseWorkId, assigneeMode }) => ({
    id: courseWorkId,
    state: 'PUBLISHED',
    assigneeMode,
  }),
  listStudents: async () => [{ userId: 'google-one' }, { userId: 'google-two' }],
};
export const googleFixtures = { publicationByCourseWork: {} };
const classroomStub = new Proxy({}, {
  get(target, name) {
    if (typeof name !== 'string' || name === 'then') return undefined;
    return async (...args) => {
      const [first, second, third] = args;
      googleCalls.push({
        call: name,
        teacherUid: name === 'getClassroomClient' ? first : first?.teacherUid ?? null,
        ...(typeof second === 'string' ? { courseId: second, courseWorkId: third ?? null } : {}),
        ...(second && typeof second === 'object' ? { courseId: second.courseId ?? null, courseWorkId: second.courseWorkId ?? null } : {}),
      });
      if (!googleAnswers[name]) throw new Error(`Google Classroom was called (${name}) where no test expects it.`);
      return googleAnswers[name](...args);
    };
  },
});
const classroomModulePath = requireFromFunctions.resolve('./lib/classroom.js');
// In place before the functions load, so every entry that requires
// ./lib/classroom gets the stub instead of the googleapis client.
requireFromFunctions.cache[classroomModulePath] = {
  id: classroomModulePath,
  filename: classroomModulePath,
  path: path.dirname(classroomModulePath),
  loaded: true,
  children: [],
  paths: [],
  exports: classroomStub,
};
export const googleCallsSince = (mark = 0) => googleCalls.slice(mark).map((entry) => ({ ...entry }));
export const googleMark = () => googleCalls.length;
/**
 * Let the stub answer `name` too. Each test file runs in its own process, so
 * an answer one file adds never quiets an unexpected call in another.
 */
export const answerGoogle = (name, answer) => { googleAnswers[name] = answer; };

/* --- the deployed functions ------------------------------------------------ */

// functions/package.json `main`: the entry point the deploy loads, so each
// callable here is the very object Cloud Functions serves.
export const fns = requireFromFunctions(path.join(repo, 'functions'));
assert.equal(requireFromFunctions('./lib/classroom.js'), classroomStub, 'the Classroom stub must be the module the functions see');
const admin = requireFromFunctions('firebase-admin');
export const db = admin.firestore();
export const adminAuth = requireFromFunctions('firebase-admin/auth').getAuth();
export const { FieldPath } = requireFromFunctions('firebase-admin/firestore');

const isCallable = (fn) => Boolean(fn?.__endpoint?.callableTrigger);

/*
 * The HTTP layer the Functions emulator puts in front of a function, and the
 * URL it serves it at: POST /{project}/{region}/{name}, a JSON body. Only
 * callables are served. Port 0 (any free port) unless
 * CALLABLE_BOUNDARIES_FUNCTIONS_PORT names one.
 */
const express = requireFromFunctions('express');
const hostApp = express();
hostApp.use(express.json({ limit: '10mb', verify: (req, res, buffer) => { req.rawBody = buffer; } }));
hostApp.post('/:project/:region/:name', (req, res) => {
  const { project, region, name } = req.params;
  const fn = Object.hasOwn(fns, name) ? fns[name] : null;
  if (project !== PROJECT || region !== REGION || !isCallable(fn)) {
    res.status(404).json({ error: { status: 'NOT_FOUND', message: `No callable ${name} here.` } });
    return;
  }
  fn(req, res);
});
const server = http.createServer(hostApp);
await new Promise((resolve) => {
  server.listen(Number(process.env.CALLABLE_BOUNDARIES_FUNCTIONS_PORT) || 0, '127.0.0.1', resolve);
});
export const functionsHost = { host: '127.0.0.1', port: server.address().port };
export const callableUrl = (name) => `http://${functionsHost.host}:${functionsHost.port}/${PROJECT}/${REGION}/${name}`;

/* --- browsers and accounts ------------------------------------------------- */

const PASSWORD = 'emulator-only-password';
const browsers = [];
let browserCount = 0;

/** One browser: its own Firebase app, Auth on the Auth emulator, Functions on this host. */
export function browser(label = 'browser') {
  browserCount += 1;
  const app = initializeApp({ projectId: PROJECT, apiKey: 'emulator-only' }, `boundary-${label}-${browserCount}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  const functions = getFunctions(app, REGION);
  connectFunctionsEmulator(functions, functionsHost.host, functionsHost.port);
  browsers.push(app);
  return {
    app,
    auth,
    label,
    call: async (name, data) => (await httpsCallable(functions, name)(data)).data,
  };
}

/**
 * A signed-in account. `claims: null` (the default) is the production path:
 * the account signs in and asks `resolveSignedInRole` for its role, as the app
 * does after every sign-in, then refreshes its token. A test that needs a
 * token production would never issue (a teacher role on an unverified email)
 * passes `claims` explicitly instead.
 */
export async function signedIn({ label, email, emailVerified = true, claims = null }) {
  const user = await adminAuth.createUser({ email, password: PASSWORD, emailVerified });
  if (claims) await adminAuth.setCustomUserClaims(user.uid, claims);
  const client = browser(label);
  const credential = await signInWithEmailAndPassword(client.auth, email, PASSWORD);
  let role = null;
  if (!claims) {
    role = await client.call('resolveSignedInRole', {});
    await credential.user.getIdToken(true);
  }
  const { claims: tokenClaims } = await credential.user.getIdTokenResult();
  return { ...client, uid: user.uid, email, role, claims: tokenClaims };
}

/** The refusal a call ended in, as the browser sees it, or null when it succeeded. */
export async function refusalOf(promise) {
  try {
    await promise;
    return null;
  } catch (error) {
    return { code: String(error?.code || ''), message: String(error?.message || error) };
  }
}

/** A raw callable-protocol request, for what the client SDK will not send. */
export async function rawCall(name, data, { authorization = null } = {}) {
  const response = await fetch(callableUrl(name), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}

/* --- what is in the project ------------------------------------------------ */

/** Write `entries` ([path, data] pairs) in batches, as a fixture of thousands of documents needs. */
export async function writeDocuments(entries) {
  for (let start = 0; start < entries.length; start += 400) {
    const batch = db.batch();
    entries.slice(start, start + 400).forEach(([docPath, data]) => batch.set(db.doc(docPath), data));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

/**
 * Delete the documents at `paths` in batches. A file that seeds thousands
 * removes them when it ends: the files after it in the same emulator walk the
 * whole project for every "nothing was written" check (projectSnapshot).
 */
export async function deleteDocuments(paths) {
  for (let start = 0; start < paths.length; start += 400) {
    const batch = db.batch();
    paths.slice(start, start + 400).forEach((docPath) => batch.delete(db.doc(docPath)));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
}

/*
 * Every document in the project, at every depth, with its update time. A
 * refused call must leave this exactly as it was: no grade field, override,
 * audit, support event, queue entry or receipt written anywhere.
 */
export async function projectSnapshot() {
  const documents = new Map();
  const visit = async (collections) => {
    for (const collection of collections) {
      // eslint-disable-next-line no-await-in-loop
      const refs = await collection.listDocuments();
      // eslint-disable-next-line no-await-in-loop
      const snapshots = refs.length ? await db.getAll(...refs) : [];
      for (const snapshot of snapshots) {
        if (snapshot.exists) {
          documents.set(snapshot.ref.path, {
            updateTime: `${snapshot.updateTime.seconds}.${String(snapshot.updateTime.nanoseconds).padStart(9, '0')}`,
            data: snapshot.data(),
          });
        }
      }
      // Each document's own collections (a missing document's too), 50
      // documents at a time: one at a time, a fixture of thousands took
      // seconds a walk.
      for (let start = 0; start < snapshots.length; start += 50) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(snapshots.slice(start, start + 50).map(async (snapshot) => visit(await snapshot.ref.listCollections())));
      }
    }
  };
  await visit(await db.listCollections());
  return documents;
}

export function changesBetween(before, after) {
  const added = [...after.keys()].filter((key) => !before.has(key)).sort();
  const removed = [...before.keys()].filter((key) => !after.has(key)).sort();
  const changed = [...after.keys()].filter((key) => before.has(key) && (
    before.get(key).updateTime !== after.get(key).updateTime
    || !isDeepStrictEqual(before.get(key).data, after.get(key).data)
  )).sort();
  return { added, removed, changed };
}

export const NOTHING_CHANGED = Object.freeze({ added: [], removed: [], changed: [] });

/** Close every browser, the host and the Admin SDK, so the test file can exit. */
export async function shutdown() {
  await Promise.all(browsers.map((app) => deleteApp(app).catch(() => {})));
  await new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
  await db.terminate().catch(() => {});
}
