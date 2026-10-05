/*
 * ONE WORKER OF THE LAUNCH CERTIFICATION'S DEVICE FARM (see deviceFarm.mjs).
 *
 * Hosts a share of the class's simulated devices, each with its own Firebase
 * app and Firestore connection, plus its own instance of the real callables
 * (functions/index.js) — as a classroom has many Chromebooks and the server
 * runs many Cloud Functions instances. One process hosting every device made
 * the TEST the bottleneck at 64 students: 64 full Firestore SDKs, each keeping
 * a 64-player standings view, in one event loop.
 */
import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import v8 from 'node:v8';
import vm from 'node:vm';

// Emulator-only client Firebase for this worker's devices (registerClientFirebase.mjs).
const { registerClientFirebaseHooks } = await import('./registerClientFirebase.mjs');
registerClientFirebaseHooks();
// The #422 retry, for this worker's copy of the server (idempotent if --import already loaded it).
await import('./emulatorTransactions.mjs');
// Server reads and writes, counted per callable (the standings profile reads them).
const { installFirestoreAccounting, runAsCallable, accountingSince, resetAccounting } = await import('./firestoreAccounting.mjs');
installFirestoreAccounting();

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const { createSimStudent, listenerTotal, openListeners } = await import('./liveChallengeSimStudent.mjs');
const db = admin.firestore();

// HOW BUSY THIS WORKER IS. Its devices and its copy of the server share one
// event loop, so a saturated loop delays both: that is the harness, not the
// classroom, and the profile reports it beside every latency.
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
let loopMark = performance.eventLoopUtilization();
const loadSample = () => {
  const now = performance.eventLoopUtilization();
  const window = performance.eventLoopUtilization(now, loopMark);
  loopMark = now;
  const sample = {
    utilization: Math.round(window.utilization * 1000) / 1000,
    delayP50Ms: Math.round(loopDelay.percentile(50) / 1e5) / 10,
    delayP99Ms: Math.round(loopDelay.percentile(99) / 1e5) / 10,
    delayMaxMs: Math.round(loopDelay.max / 1e5) / 10,
  };
  loopDelay.reset();
  return sample;
};

// Every submit this worker's server handled, by submission id.
const submitInvocations = {};
const call = (name, studentId, data) => {
  if (name === 'submitLiveChallengeResponse') (submitInvocations[data?.submissionId] ||= []).push({ studentId, at: Date.now() });
  return runAsCallable(name, () => functionsIndex[name].run({
    auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
    data,
    rawRequest: { headers: {} },
  }), { studentId, submissionId: name === 'submitLiveChallengeResponse' ? data?.submissionId || null : null });
};

// The server's own answer key for a round, regenerated exactly as submit does.
const answerKeys = new Map();
const responseFor = async (roomId, roundIndex, correct) => {
  const key = `${roomId}|${roundIndex}`;
  if (!answerKeys.has(key)) {
    answerKeys.set(key, (async () => {
      const state = (await db.collection('liveChallengePrivate').doc(roomId).get()).data();
      const questionId = state.questionIds[roundIndex];
      const authored = state.roundQuestions?.[roundIndex] || (await db.collection('pathQuestionBank').doc(questionId).get()).data();
      const instantiated = await mathPath.instantiateQuestion(authored, `challenge|${roomId}|${roundIndex}|${questionId}`);
      return (await mathPath.buildIssuePlan(instantiated.question)).privateGrading.fields;
    })());
  }
  const fields = await answerKeys.get(key);
  return { responses: Object.fromEntries(fields.map((field) => [field.id, correct ? field.expected : '__not-an-answer__'])) };
};

const devices = new Map();
const heapAfterGc = () => {
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  gc(); gc();
  return v8.getHeapStatistics().used_heap_size;
};

const operations = {
  create: ({ studentId, profile }) => { devices.set(studentId, createSimStudent({ studentId, call, responseFor, profile })); },
  invoke: async ({ studentId, method, args = [] }) => { await devices.get(studentId)[method](...args); },
  views: ({ studentIds = null }) => (studentIds || [...devices.keys()]).filter((id) => devices.has(id)).map((id) => devices.get(id).view()),
  listeners: () => ({ ...openListeners, total: listenerTotal() }),
  heap: () => heapAfterGc(),
  invocations: () => submitInvocations,
  load: () => loadSample(),
  traces: ({ studentIds = null }) => (studentIds || [...devices.keys()]).filter((id) => devices.has(id)).map((id) => devices.get(id).traceData()),
  accounting: ({ sinceMs = 0 }) => accountingSince(sinceMs),
  resetAccounting: () => { resetAccounting(); },
  shutdown: async ({ studentIds = null }) => {
    const ids = studentIds || [...devices.keys()];
    await Promise.all(ids.filter((id) => devices.has(id)).map((id) => devices.get(id).shutdown()));
    ids.forEach((id) => devices.delete(id));
  },
};

parentPort.on('message', async ({ id, op, ...payload }) => {
  try {
    const result = await operations[op](payload);
    parentPort.postMessage({ id, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error?.stack || String(error) });
  }
});
parentPort.postMessage({ ready: true });
