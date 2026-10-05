// LIVE CHALLENGE STANDINGS PROFILE: what standings delivery costs a class, by
// class size, against the real server and real Firestore listeners.
//
//   npm run profile:live-challenge-standings
//   PROFILE_SIZES=5,15,25,35,45,64 PROFILE_HEADROOM=96 PROFILE_CLIENTS=legacy,off …
//
// It runs on its own Firestore emulator (firebase emulators:exec, as the launch
// certification does) and NEVER touches a real project: it refuses to start
// without FIRESTORE_EMULATOR_HOST.
//
// One full game per (class size × standings client): a lobby, three rounds in
// which every student answers once (spread over PROFILE_SPREAD_MS, as a class
// does), the finish. Every device is a real Firestore client
// (tests/integration/support/liveChallengeSimStudent.mjs) in the worker-thread
// device farm, every callable the real one. Standings clients:
//
//   legacy      every public player row, as the student screen did before the
//               bounded projection (#427's O(N²) observation)
//   projection  the bounded standings projection (this change)
//   off         no standings listener at all: the control that leaves only the
//               server, Firestore and the harness
//
// Measured per round and reported as p50 / p90 / p95 / max where it is a
// distribution:
//
//   Firestore   server reads and writes by kind (counted the way Firestore
//               bills them, inside callables only: firestoreAccounting.mjs);
//               standings documents delivered, callbacks and estimated browser
//               bytes per student and in total; listeners per student, and
//               after cleanup
//   answers     Lock In -> callable sent; callable start -> commit;
//               commit -> the student's accepted state (the reply); commit ->
//               the answer is in the standings a classmate's screen shows
//   devices     time spent ranking and cutting the board per delivery (the
//               screen's own work, in node)
//   harness     each worker's event-loop utilization and delay, the emulator's
//               CPU — so a latency the HARNESS caused is not blamed on the design
//
// Output: PROFILE_OUT (default: a JSON file in the system temp dir) and a
// markdown summary on stdout.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Run through npm run profile:live-challenge-standings (the Firestore emulator). This profile never runs against a real project.');
  process.exit(2);
}

const { registerClientFirebaseHooks } = await import('../tests/integration/support/registerClientFirebase.mjs');
registerClientFirebaseHooks();
const { installFirestoreAccounting, runAsCallable, accountingSince, summarizeAccounting } = await import('../tests/integration/support/firestoreAccounting.mjs');
installFirestoreAccounting();
const { createDeviceFarm } = await import('../tests/integration/support/deviceFarm.mjs');
const { createSimHost } = await import('../tests/integration/support/liveChallengeSimHost.mjs');
const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const { CHALLENGE_STAGE } = await import(path.join(repo, 'src/platform/liveChallenge/challengeShellModel.js'));
const db = admin.firestore();

const list = (value, fallback) => String(value || fallback).split(',').map((entry) => entry.trim()).filter(Boolean);
const SIZES = list(process.env.PROFILE_SIZES, '5,15,25,35,45,64').map(Number).filter((size) => size >= 2);
const HEADROOM = list(process.env.PROFILE_HEADROOM, '').map(Number).filter((size) => size >= 2);
const CLIENTS = list(process.env.PROFILE_CLIENTS, 'legacy,off');
const ROUNDS = Math.max(1, Number(process.env.PROFILE_ROUNDS) || 3);
const SPREAD_MS = Math.max(0, Number(process.env.PROFILE_SPREAD_MS ?? 6000));
const WORKERS = Number(process.env.PROFILE_WORKERS) || 4;
const SETTLE_MS = Math.max(500, Number(process.env.PROFILE_SETTLE_MS) || 2500);
const REPEAT = Math.max(0, Number(process.env.PROFILE_REPEAT) || 0);
const REPEAT_CLASS = Math.max(5, Number(process.env.PROFILE_REPEAT_CLASS) || 25);
const OUT = process.env.PROFILE_OUT || path.join(os.tmpdir(), `live-challenge-standings-profile-${Date.now()}.json`);
const LABEL = process.env.PROFILE_LABEL || 'run';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)); });
const millis = (value) => value?.toMillis?.() ?? 0;
const waitUntil = async (label, predicate, timeoutMs = 60_000, pollMs = 250) => {
  const until = Date.now() + timeoutMs;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const value = await predicate();
    if (value) return value;
    if (Date.now() > until) throw new Error(`timed out after ${timeoutMs} ms: ${typeof label === 'function' ? await label() : label}`);
    // eslint-disable-next-line no-await-in-loop
    await sleep(pollMs);
  }
};
const quantiles = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (!sorted.length) return { n: 0, p50: null, p90: null, p95: null, max: null };
  const pick = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
  return { n: sorted.length, p50: pick(0.5), p90: pick(0.9), p95: pick(0.95), max: sorted.at(-1) };
};
const round1 = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);
const mean = (values) => (values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0);

/* ------------------------------ the host side ------------------------------ */

// The main thread's copy of the server: the teacher's callables, counted.
const mainLoop = monitorEventLoopDelay({ resolution: 10 });
mainLoop.enable();
let mainMark = performance.eventLoopUtilization();
const mainLoad = () => {
  const now = performance.eventLoopUtilization();
  const window = performance.eventLoopUtilization(now, mainMark);
  mainMark = now;
  const sample = { utilization: Math.round(window.utilization * 1000) / 1000, delayP99Ms: Math.round(mainLoop.percentile(99) / 1e5) / 10, delayMaxMs: Math.round(mainLoop.max / 1e5) / 10 };
  mainLoop.reset();
  return sample;
};

// The emulator's CPU: its own process, read from /proc.
const CLOCK_TICKS = (() => { try { return Number(execFileSync('getconf', ['CLK_TCK']).toString().trim()) || 100; } catch { return 100; } })();
const emulatorPid = (() => {
  try {
    return execFileSync('pgrep', ['-f', 'cloud-firestore-emulator']).toString().trim().split('\n').map(Number).find(Boolean) || null;
  } catch { return null; }
})();
const emulatorCpuSeconds = () => {
  if (!emulatorPid) return null;
  try {
    const fields = readFileSync(`/proc/${emulatorPid}/stat`, 'utf8').split(') ')[1].split(' ');
    return (Number(fields[11]) + Number(fields[12])) / CLOCK_TICKS;
  } catch { return null; }
};
const machineCpu = () => {
  const line = readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number);
  const idle = line[3] + (line[4] || 0);
  return { idle, total: line.reduce((sum, value) => sum + value, 0) };
};

/* ----------------------------- class and bank ----------------------------- */

const PROFILE_STANDARD = 'STANDPROF1';
const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(item, `standings-profile|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    // eslint-disable-next-line no-await-in-loop
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
await Promise.all(bank.map((item) => db.collection('pathQuestionBank').doc(`${item.id}--standings-profile`).set({
  ...item, id: `${item.id}--standings-profile`, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, `texas:${PROFILE_STANDARD}`],
})));

let classSeq = 0;
const seedClass = async (size) => {
  classSeq += 1;
  const key = `sp${classSeq}n${size}`;
  const entry = {
    key,
    classId: `standings-profile-${key}`,
    teacher: `standings-profile-${key}@example.com`,
    students: Array.from({ length: size }, (_, index) => `sp-${key}-s${String(index + 1).padStart(3, '0')}`),
  };
  await db.collection('classes').doc(entry.classId).set({ teacherOfRecord: entry.teacher, status: 'active', course: 'algebra1', period: key, name: `Profile ${key}` });
  for (let start = 0; start < entry.students.length; start += 400) {
    const batch = db.batch();
    entry.students.slice(start, start + 400).forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
      assignedTeacherEmail: entry.teacher, classId: entry.classId, classPeriod: key, firstName: `Prof${start + index + 1}`, lastName: key,
    }));
    // eslint-disable-next-line no-await-in-loop
    await batch.commit();
  }
  return entry;
};

const teacherCall = (entry, name, data) => runAsCallable(name, () => functionsIndex[name].run({
  auth: { uid: `${entry.teacher}-uid`, token: { role: 'teacher', email: entry.teacher, email_verified: true } }, data, rawRequest: { headers: {} },
}));
const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const privatePlayers = async (roomId) => (await db.collection('liveChallengePrivate').doc(roomId).collection('players').get()).docs.map((doc) => ({ studentId: doc.id, ...doc.data() }));
const inviteOf = async (studentId) => (await db.collection('liveChallengeInvites').doc(studentId).get()).data() || null;

/* ---------------------------------- a game ---------------------------------- */

const profileOf = (client, index) => ({
  standingsClient: client,
  trace: true,
  deliveryJitterMs: 50,
  rttMs: 15,
  answer: index % 4 === 3 ? 'wrong' : 'correct',
  answerJitterMs: SPREAD_MS,
});

// Long rounds closed by the host once everyone has answered, and no closing
// countdown: the same game the launch certification plays, so a round's
// length is the class's answering, never a timer.
const createRoom = async (entry) => (await teacherCall(entry, 'createLiveChallenge', {
  classId: entry.classId,
  courseId: 'algebra1',
  standardCode: PROFILE_STANDARD,
  questionStyle: 'noTools',
  roundCount: ROUNDS,
  roundSeconds: 120,
  roundClosingThreshold: 'off',
})).roomId;

/*
 * THE HOST CONSOLE. The teacher's console keeps every public row (who has
 * answered, who is racing): one listener, on one device, in every design —
 * counted, so the class's total is complete. With the projection it is also
 * what paces the students' live standings (liveChallengeSimHost.mjs, the
 * console's own pacer and board); for the other clients it never publishes.
 */
async function openHost(entry, roomId, client) {
  return createSimHost({ roomId, call: (name, data) => teacherCall(entry, name, data), paused: client !== 'projection' });
}

async function runOne({ size, client, label }) {
  const entry = await seedClass(size);
  const farm = await createDeviceFarm({ workers: WORKERS });
  const result = { size, client, label, workers: farm.workers, rounds: [], errors: [] };
  let host = null;
  try {
    await Promise.all(entry.students.map((studentId, index) => farm.add(studentId, profileOf(client, index))));
    const heapBefore = await farm.heapMb();
    const createdAt = Date.now();
    const roomId = await createRoom(entry);
    host = await openHost(entry, roomId, client);
    const windows = { lobby: { from: createdAt, to: null }, rounds: [], finish: null };
    await Promise.all(entry.students.map(async (studentId) => farm.device(studentId).open(await inviteOf(studentId))));
    await waitUntil(`${label}: lobby`, async () => (await privatePlayers(roomId)).filter((row) => row.joined).length === size
      && [...(await farm.views()).values()].every((view) => view.clockReady), 90_000, 300);
    // Let the last joins' deliveries land before the lobby window closes.
    await sleep(1_000);
    windows.lobby.to = Date.now();
    await farm.load();
    mainLoad();
    for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
      const window = { roundIndex, from: Date.now(), to: null, emulatorCpu: null, machineCpu: null, load: null, mainLoad: null, listeners: null };
      const cpuStart = emulatorCpuSeconds();
      const machineStart = machineCpu();
      if (roundIndex === 0) {
        // eslint-disable-next-line no-await-in-loop
        await teacherCall(entry, 'startLiveChallenge', { roomId });
      } else {
        // eslint-disable-next-line no-await-in-loop
        const room = await roomOf(roomId);
        // eslint-disable-next-line no-await-in-loop
        await teacherCall(entry, 'advanceLiveChallenge', { roomId, expectedRoundIndex: roundIndex - 1, expectedRoundVersion: room.roundVersion });
      }
      // eslint-disable-next-line no-await-in-loop
      const opened = await roomOf(roomId);
      window.startsAtMs = millis(opened.startsAt);
      // eslint-disable-next-line no-await-in-loop
      await waitUntil(async () => `${label} round ${roundIndex + 1}: waiting on ${(await privatePlayers(roomId)).filter((row) => Number(row.answeredRound) !== roundIndex).map((row) => row.studentId).slice(0, 5).join(', ')}`,
        async () => (await privatePlayers(roomId)).every((row) => Number(row.answeredRound) === roundIndex), 120_000, 300);
      // eslint-disable-next-line no-await-in-loop
      await waitUntil(`${label}: answers in flight`, async () => [...(await farm.views()).values()].every((view) => !view.answering), 30_000, 150);
      // Mid-round listener census, while every screen is in the round.
      // eslint-disable-next-line no-await-in-loop
      window.listeners = await farm.listeners();
      // Let the last answer reach every screen's standings before the round closes.
      // eslint-disable-next-line no-await-in-loop
      await sleep(SETTLE_MS);
      window.to = Date.now();
      // eslint-disable-next-line no-await-in-loop
      window.load = await farm.load();
      window.mainLoad = mainLoad();
      const cpuEnd = emulatorCpuSeconds();
      const machineEnd = machineCpu();
      const seconds = (window.to - window.from) / 1000;
      window.emulatorCpu = cpuStart !== null && cpuEnd !== null ? round1(((cpuEnd - cpuStart) / seconds) * 100) : null;
      window.machineCpu = round1((1 - (machineEnd.idle - machineStart.idle) / Math.max(1, machineEnd.total - machineStart.total)) * 100);
      // eslint-disable-next-line no-await-in-loop
      const room = await roomOf(roomId);
      // eslint-disable-next-line no-await-in-loop
      await teacherCall(entry, 'closeLiveChallengeRound', { roomId, expectedRoundIndex: roundIndex, expectedRoundVersion: room.roundVersion });
      windows.rounds.push(window);
    }
    const finishFrom = Date.now();
    await teacherCall(entry, 'finishLiveChallenge', { roomId });
    await waitUntil(`${label}: finished on every screen`, async () => [...(await farm.views()).values()].every((view) => view.room?.status === 'finished' && view.stage === CHALLENGE_STAGE.COMPLETED), 60_000, 300);
    await sleep(SETTLE_MS);
    windows.finish = { from: finishFrom, to: Date.now() };
    const heapAfter = await farm.heapMb();

    const [traces, workerAccounting, views] = await Promise.all([farm.traces(), farm.accounting(createdAt - 60_000), farm.views()]);
    const mainAccounting = accountingSince(createdAt - 60_000);
    const accounting = {
      events: [...workerAccounting.events, ...mainAccounting.events],
      calls: [...workerAccounting.calls, ...mainAccounting.calls],
      commits: [...workerAccounting.commits, ...mainAccounting.commits],
    };
    Object.assign(result, analyze({ size, traces, accounting, windows, views }));
    // The host console's deliveries per round, beside the class's, and what
    // its pacer asked for (projection only).
    result.rounds.forEach((roundResult, index) => {
      const window = windows.rounds[index];
      const entries = host.log.filter(([t]) => t >= window.from && t <= window.to);
      const replies = host.replies.filter((reply) => reply.sentAt >= window.from && reply.sentAt <= window.to);
      roundResult.host = {
        callbacks: entries.length,
        docs: entries.reduce((sum, [, docs]) => sum + docs, 0),
        publishRequests: host.requests.filter((t) => t >= window.from && t <= window.to).length,
        published: replies.filter((reply) => reply.published === true).length,
        notPublished: replies.filter((reply) => reply.published === false).reduce((tally, reply) => ({ ...tally, [reply.reason]: (tally[reply.reason] || 0) + 1 }), {}),
        failed: replies.filter((reply) => reply.error).length,
      };
    });
    if (process.env.PROFILE_RAW) result.raw = { traces, calls: accounting.calls.filter((call) => call.name === 'submitLiveChallengeResponse'), commits: accounting.commits, windows };
    result.heapMb = { before: heapBefore, after: heapAfter, perDeviceBeforeKb: Math.round((heapBefore * 1024) / size), perDeviceAfterKb: Math.round((heapAfter * 1024) / size) };
    result.roomId = roomId;
  } catch (error) {
    result.errors.push(error?.stack || String(error));
    console.error(`[profile] ${label} failed: ${error?.message}`);
  } finally {
    await host?.close().catch(() => {});
    await farm.shutdown().catch(() => {});
    result.listenersAfterCleanup = await farm.listeners().catch(() => null);
    await farm.close().catch(() => {});
  }
  return result;
}

/* -------------------------------- the analysis -------------------------------- */

function analyze({ size, traces, accounting, windows, views }) {
  const spans = new Map(accounting.calls.filter((call) => call.name === 'submitLiveChallengeResponse' && call.submissionId).map((call) => [call.submissionId, call]));
  const inWindow = (t, window) => t >= window.from && t <= window.to;
  const byStudent = new Map(traces.map((entry) => [entry.studentId, entry]));
  const rounds = windows.rounds.map((window) => {
    // ANSWERS: the first send of each answer (not a resend, not a forged second).
    const answers = traces.flatMap((entry) => entry.trace.answers
      .filter((answer) => answer.roundIndex === window.roundIndex && answer.kind === 'first' && answer.ok)
      .map((answer) => ({ ...answer, studentId: entry.studentId, playerKey: entry.playerKey, span: spans.get(answer.submissionId) || null })));
    const commitOf = (answer) => answer.span?.commits?.[0] ?? null;
    const latency = {
      lockToSent: quantiles(answers.map((answer) => answer.sentAt - answer.lockedAt)),
      sentToReply: quantiles(answers.map((answer) => answer.replyAt - answer.sentAt)),
      callableStartToCommit: quantiles(answers.map((answer) => (commitOf(answer) !== null && answer.span ? commitOf(answer) - answer.span.startedAt : NaN))),
      commitToAccepted: quantiles(answers.map((answer) => (commitOf(answer) !== null ? answer.replyAt - commitOf(answer) : NaN))),
      serverSpan: quantiles(answers.map((answer) => (answer.span ? answer.span.endedAt - answer.span.startedAt : NaN))),
    };

    // COMMIT -> DISPLAYED: for every answer and every OTHER screen, the first
    // standings delivery after the commit that reflects it.
    const displayLatencies = [];
    let undisplayed = 0;
    answers.forEach((answer) => {
      const commitMs = commitOf(answer);
      if (commitMs === null) return;
      traces.forEach((entry) => {
        if (entry.studentId === answer.studentId) return;
        const shown = shownAt(entry, answer, commitMs);
        if (shown === null) undisplayed += 1;
        else displayLatencies.push(shown - commitMs);
      });
    });

    // DELIVERIES during the round, per student.
    const perStudent = traces.map((entry) => {
      const callbacks = (entry.trace.callbacks || []).filter(([t]) => inWindow(t, window));
      // Which listener delivered: the class's rows (legacy), or the snapshot
      // and the student's own row (projection).
      const byListener = {};
      callbacks.forEach(([, docs, , , kind = 'players']) => { byListener[kind] = (byListener[kind] || 0) + docs; });
      return {
        callbacks: callbacks.length,
        docs: callbacks.reduce((sum, [, docs]) => sum + docs, 0),
        bytes: callbacks.reduce((sum, [, , bytes]) => sum + bytes, 0),
        cpuMs: callbacks.reduce((sum, [, , , ms]) => sum + ms, 0),
        byListener,
      };
    });
    const listenerKinds = [...new Set(perStudent.flatMap((row) => Object.keys(row.byListener)))];
    const roomSnapshots = traces.map((entry) => (entry.trace.roomSnapshots || []).filter((t) => inWindow(t, window)).length);
    const server = summarizeAccounting(accounting.events, { fromMs: window.from, toMs: window.to + 1_500 });
    const listeners = window.listeners || null;
    return {
      roundIndex: window.roundIndex,
      durationMs: window.to - window.from,
      answers: answers.length,
      latency,
      commitToStandingsDisplayed: { ...quantiles(displayLatencies), undisplayed, pairs: displayLatencies.length + undisplayed },
      standings: {
        callbacksPerStudent: { mean: round1(mean(perStudent.map((row) => row.callbacks))), max: Math.max(0, ...perStudent.map((row) => row.callbacks)) },
        docsPerStudent: { mean: round1(mean(perStudent.map((row) => row.docs))), max: Math.max(0, ...perStudent.map((row) => row.docs)) },
        bytesPerStudent: { mean: Math.round(mean(perStudent.map((row) => row.bytes))), max: Math.max(0, ...perStudent.map((row) => row.bytes)) },
        cpuMsPerStudent: { mean: round1(mean(perStudent.map((row) => row.cpuMs))), max: round1(Math.max(0, ...perStudent.map((row) => row.cpuMs))) },
        callbacksTotal: perStudent.reduce((sum, row) => sum + row.callbacks, 0),
        docsTotal: perStudent.reduce((sum, row) => sum + row.docs, 0),
        bytesTotal: perStudent.reduce((sum, row) => sum + row.bytes, 0),
        docsPerStudentByListener: Object.fromEntries(listenerKinds.map((kind) => [kind, {
          mean: round1(mean(perStudent.map((row) => row.byListener[kind] || 0))),
          max: Math.max(0, ...perStudent.map((row) => row.byListener[kind] || 0)),
        }])),
      },
      // Room-listener deliveries: billed reads too, and the same in every design.
      roomSnapshotsPerStudent: round1(mean(roomSnapshots)),
      server: { readsTotal: server.readsTotal, writesTotal: server.writesTotal, reads: server.reads, writes: server.writes, byCallable: server.byCallable },
      listeners: listeners ? { ...listeners, perStudent: round1(listeners.total / size) } : null,
      harness: {
        workerUtilizationMax: Math.max(...(window.load || []).map((sample) => sample.utilization)),
        workerUtilization: (window.load || []).map((sample) => sample.utilization),
        workerDelayP99MaxMs: Math.max(...(window.load || []).map((sample) => sample.delayP99Ms)),
        mainUtilization: window.mainLoad?.utilization ?? null,
        emulatorCpuPercent: window.emulatorCpu,
        machineCpuPercent: window.machineCpu,
      },
    };
  });
  const lobby = summarizeAccounting(accounting.events, { fromMs: windows.lobby.from, toMs: windows.lobby.to });
  const lobbyDeliveries = traces.map((entry) => (entry.trace.callbacks || []).filter(([t]) => t >= windows.lobby.from && t <= windows.lobby.to));
  const finishDeliveries = traces.map((entry) => (entry.trace.callbacks || []).filter(([t]) => t >= windows.finish.from && t <= windows.finish.to));
  const finalBoards = [...views.values()].map((view) => view.board?.length || view.standings?.top?.length || 0);
  return {
    rounds,
    lobby: {
      server: { readsTotal: lobby.readsTotal, writesTotal: lobby.writesTotal, reads: lobby.reads, writes: lobby.writes },
      docsPerStudent: round1(mean(lobbyDeliveries.map((rows) => rows.reduce((sum, [, docs]) => sum + docs, 0)))),
      callbacksPerStudent: round1(mean(lobbyDeliveries.map((rows) => rows.length))),
    },
    finish: {
      docsPerStudent: round1(mean(finishDeliveries.map((rows) => rows.reduce((sum, [, docs]) => sum + docs, 0)))),
      callbacksPerStudent: round1(mean(finishDeliveries.map((rows) => rows.length))),
    },
    finalBoardRowsPerScreen: { min: Math.min(...finalBoards), max: Math.max(...finalBoards) },
    byStudentCount: byStudent.size,
  };
}

/**
 * When this screen first showed `answer` in its standings: legacy — the first
 * delivery after the commit carrying that player's row with the round
 * answered; projection — the first projection delivered whose source read
 * includes the commit.
 */
function shownAt(entry, answer, commitMs) {
  const rows = entry.trace.rows || [];
  // The first version of that player's row with this round answered IS the
  // answer (the emulator stamps the row's server time a few ms before it
  // reports the commit, so the row's own time is not compared).
  for (const [receivedAt, playerKey, answeredRound] of rows) {
    if (playerKey === answer.playerKey && answeredRound === answer.roundIndex) return receivedAt;
  }
  const projections = entry.trace.projections || [];
  for (const [receivedAt, sourceMs] of projections) {
    if (sourceMs >= commitMs) return receivedAt;
  }
  return null;
}

/* ---------------------------------- runs ---------------------------------- */

const report = {
  label: LABEL,
  startedAt: new Date().toISOString(),
  machine: { cpus: os.availableParallelism?.() || os.cpus().length, memoryGb: Math.round(os.totalmem() / 1e9), node: process.version },
  settings: { sizes: SIZES, headroom: HEADROOM, clients: CLIENTS, rounds: ROUNDS, spreadMs: SPREAD_MS, workers: WORKERS, settleMs: SETTLE_MS },
  emulatorPid,
  runs: [],
  repeat: null,
};

for (const size of [...SIZES, ...HEADROOM]) {
  for (const client of CLIENTS) {
    const label = `${size} students · ${client}`;
    console.log(`[profile] ${label}…`);
    // eslint-disable-next-line no-await-in-loop
    const run = await runOne({ size, client, label });
    report.runs.push(run);
    const first = run.rounds?.[0];
    if (first) console.log(`[profile] ${label}: docs/student/round ${first.standings.docsPerStudent.mean} · answer p50 ${first.latency.sentToReply.p50} ms · displayed p50 ${first.commitToStandingsDisplayed.p50} ms · worker ELU ${first.harness.workerUtilizationMax}`);
    // eslint-disable-next-line no-await-in-loop
    await sleep(1_500);
  }
}

// HEAP OVER REPEATED MATCHES: the same open screens, match after match.
if (REPEAT > 1) {
  report.repeat = {};
  for (const client of CLIENTS.filter((entry) => entry !== 'off')) {
    const entry = await seedClass(REPEAT_CLASS);
    const farm = await createDeviceFarm({ workers: WORKERS });
    const heap = [];
    const listeners = [];
    try {
      await Promise.all(entry.students.map((studentId, index) => farm.add(studentId, { ...profileOf(client, index), trace: false })));
      await Promise.all(entry.students.map((studentId) => farm.device(studentId).followInvites()));
      heap.push(await farm.heapMb());
      for (let match = 0; match < REPEAT; match += 1) {
        // eslint-disable-next-line no-await-in-loop
        const roomId = await createRoom(entry);
        // eslint-disable-next-line no-await-in-loop
        // The console of this match (it paces live standings for the projection).
        // eslint-disable-next-line no-await-in-loop
        const host = await openHost(entry, roomId, client);
        // eslint-disable-next-line no-await-in-loop
        await waitUntil('repeat lobby', async () => (await privatePlayers(roomId)).filter((row) => row.joined).length === REPEAT_CLASS
          && [...(await farm.views()).values()].every((view) => view.roomId === roomId && view.clockReady), 60_000);
        for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
          // eslint-disable-next-line no-await-in-loop
          const room = await roomOf(roomId);
          // eslint-disable-next-line no-await-in-loop
          if (roundIndex === 0) await teacherCall(entry, 'startLiveChallenge', { roomId });
          // eslint-disable-next-line no-await-in-loop
          else await teacherCall(entry, 'advanceLiveChallenge', { roomId, expectedRoundIndex: roundIndex - 1, expectedRoundVersion: room.roundVersion });
          // eslint-disable-next-line no-await-in-loop
          await waitUntil('repeat answers', async () => (await privatePlayers(roomId)).every((row) => Number(row.answeredRound) === roundIndex), 120_000, 300);
          // eslint-disable-next-line no-await-in-loop
          await waitUntil('repeat in flight', async () => [...(await farm.views()).values()].every((view) => !view.answering), 30_000, 150);
          // eslint-disable-next-line no-await-in-loop
          const latest = await roomOf(roomId);
          // eslint-disable-next-line no-await-in-loop
          await teacherCall(entry, 'closeLiveChallengeRound', { roomId, expectedRoundIndex: roundIndex, expectedRoundVersion: latest.roundVersion });
        }
        // eslint-disable-next-line no-await-in-loop
        await teacherCall(entry, 'finishLiveChallenge', { roomId });
        // eslint-disable-next-line no-await-in-loop
        await waitUntil('repeat finished', async () => [...(await farm.views()).values()].every((view) => view.room?.status === 'finished'), 60_000);
        // eslint-disable-next-line no-await-in-loop
        await host.close();
        // eslint-disable-next-line no-await-in-loop
        listeners.push(await farm.listeners());
        // eslint-disable-next-line no-await-in-loop
        heap.push(await farm.heapMb());
      }
    } finally {
      await farm.shutdown().catch(() => {});
      const after = await farm.listeners().catch(() => null);
      await farm.close().catch(() => {});
      report.repeat[client] = { students: REPEAT_CLASS, matches: REPEAT, heapMbAfterEachMatch: heap, heapGrowthMbAfterWarmup: round1(heap.at(-1) - heap[Math.min(2, heap.length - 1)]), listenersAfterEachMatch: listeners, listenersAfterCleanup: after };
    }
  }
}

writeFileSync(OUT, JSON.stringify(report, null, 2));

/* ------------------------------ the summary ------------------------------ */

const cell = (value) => (value === null || value === undefined ? '—' : String(value));
const lines = [];
lines.push(`# Live Challenge standings profile (${LABEL})`, '', `Machine: ${report.machine.cpus} CPUs, ${report.machine.memoryGb} GB, ${report.machine.node}. Rounds ${ROUNDS}, answers spread over ${SPREAD_MS} ms, ${WORKERS} workers.`, '');
lines.push('| students | client | standings docs / student / round | callbacks / student / round | KB / student / round | standings docs / round (class) | server reads / round | server writes / round | answer round trip p50 / p95 ms | commit→accepted p50 / p95 | commit→standings shown p50 / p95 / max | worker ELU max | emulator CPU % |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const run of report.runs) {
  if (!run.rounds?.length) { lines.push(`| ${run.size} | ${run.client} | failed: ${cell(run.errors?.[0]?.split('\n')[0])} |`); continue; }
  const avg = (pick) => round1(mean(run.rounds.map(pick)));
  const worst = (pick) => Math.max(...run.rounds.map(pick));
  lines.push(`| ${run.size} | ${run.client} | ${avg((r) => r.standings.docsPerStudent.mean)} | ${avg((r) => r.standings.callbacksPerStudent.mean)} | ${round1(avg((r) => r.standings.bytesPerStudent.mean) / 1024)} | ${avg((r) => r.standings.docsTotal)} | ${avg((r) => r.server.readsTotal)} | ${avg((r) => r.server.writesTotal)} | ${avg((r) => r.latency.sentToReply.p50)} / ${avg((r) => r.latency.sentToReply.p95)} | ${avg((r) => r.latency.commitToAccepted.p50)} / ${avg((r) => r.latency.commitToAccepted.p95)} | ${avg((r) => r.commitToStandingsDisplayed.p50 ?? NaN)} / ${avg((r) => r.commitToStandingsDisplayed.p95 ?? NaN)} / ${worst((r) => r.commitToStandingsDisplayed.max ?? 0)} | ${worst((r) => r.harness.workerUtilizationMax)} | ${avg((r) => r.harness.emulatorCpuPercent ?? NaN)} |`);
}
const projectionRuns = report.runs.filter((run) => run.client === 'projection' && run.rounds?.length);
if (projectionRuns.length) {
  lines.push('', '| students | snapshot docs / student / round | own-row docs / student / round | live snapshots written / round | host requests / round | host players docs / round |', '|---|---|---|---|---|---|');
  for (const run of projectionRuns) {
    const avg = (pick) => round1(mean(run.rounds.map(pick)));
    lines.push(`| ${run.size} | ${avg((r) => r.standings.docsPerStudentByListener?.standings?.mean ?? 0)} | ${avg((r) => r.standings.docsPerStudentByListener?.self?.mean ?? 0)} | ${avg((r) => r.host?.published ?? 0)} | ${avg((r) => r.host?.publishRequests ?? 0)} | ${avg((r) => r.host?.docs ?? 0)} |`);
  }
}
if (report.repeat) {
  lines.push('', '| repeated matches | heap MB after each match | growth after warm-up | listeners after cleanup |', '|---|---|---|---|');
  for (const [client, entry] of Object.entries(report.repeat)) lines.push(`| ${client} × ${entry.matches} (${entry.students} students) | ${entry.heapMbAfterEachMatch.join(' → ')} | ${entry.heapGrowthMbAfterWarmup} | ${JSON.stringify(entry.listenersAfterCleanup)} |`);
}
console.log(lines.join('\n'));
console.log(`[profile] full report: ${OUT}`);
const failed = report.runs.filter((run) => run.errors.length);
process.exit(failed.length ? 1 : 0);
