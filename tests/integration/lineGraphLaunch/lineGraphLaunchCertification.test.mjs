// GRAPH THE LINE AT CLASS SCALE: whole classes playing it, against the real
// server and real Firestore listeners. Run through
// `npm run test:line-graph-launch:emulator`, an emulator to itself, as the
// launch certification has (../liveChallengeLaunch): its waits are measured
// for one class at a time.
//
// ONE GAME PER FORMAT:
//   Sprint, 30 students   each with their own five lines: right first time, a
//                         slip fixed, out of tries, skipping. One device is
//                         offline at the start, one reloads its page while
//                         offline, one opens after the start. The round closes
//                         the moment the class has finished.
//   Classic, 35 students  the same line for everyone, three rounds; nine draw
//                         the same wrong line first. Each round closes when the
//                         class has finished, and only then is its line
//                         published, with the class's counts and nobody's name.
//   Rush, 30 students     as many lines and built equations as 30 seconds
//                         allow, items fetched ahead; the round ends on the
//                         clock, never early.
//
// WHAT IS REAL. Every callable, each student under their own identity, each
// device's server its worker's own copy of functions/index.js (the teacher's,
// the deployed entry point's). Every listener:
// each device has its own Firebase app and Firestore connection. Every
// decision a device makes goes through the student screens' own modules: the
// room and its clock (../support/liveChallengeSimStudent.mjs) and the round
// (../support/liveChallengeSimLineRound.mjs: LineGraphRound.jsx's session,
// queue, storage and resume). The teacher is the console's standings pacer and
// round pacing (../support/liveChallengeSimHost.mjs with autoClose): rounds
// close when the console would close them, through the same callable, never
// forced. Rooms are created with the console's own request
// (lineCreateRequest).
//
// CHECKED IN EVERY GAME: every attempt a device made is recorded exactly once
// — each plan's own count, against the receipts, through a reload and an
// outage; what a device shows is what the server holds; no standings listener
// and no live snapshot while a round is open; the final standings on every
// screen are the match result's; the report counts what the class did;
// diagnostics stay small; every listener closes.
//
// WHAT IT DOES NOT PROVE. Real-network latency, a school's content filter, or
// Firestore's production fan-out: the emulator is one local process.
//
// Scale knobs: LINE_LAUNCH_SPRINT=30 LINE_LAUNCH_CLASSIC=35 LINE_LAUNCH_RUSH=30
// LAUNCH_CERT_WORKERS=4 LINE_LAUNCH_REPORT=/path/report.json

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:line-graph-launch:emulator.');

// The deployed entry point: index.js and the Live Challenge experience callables.
const functionsIndex = require(path.join(repo, 'functions/platformEntry.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const { LAUNCH_EVENTS, MAX_LAUNCH_EVENTS } = await import(path.join(repo, 'functions/shared/liveChallengeLaunchDiagnostics.mjs'));
const { lineRoundState } = await import(path.join(repo, 'functions/shared/lineGraphAttempts.mjs'));
const { LINE_GRAPH_FORMAT } = await import(path.join(repo, 'functions/shared/lineGraphRules.mjs'));
const { normalizeStandingsDisplay } = await import(path.join(repo, 'functions/shared/liveChallengePrivacy.mjs'));
const { applyLinePreset, changeLineSetup, defaultLineSetup, lineCreateRequest, lineSetupProblem } = await import(path.join(repo, 'src/platform/liveChallenge/lineGraphSetupModel.js'));
const { createDeviceFarm } = await import('../support/deviceFarm.mjs');
const { createSimHost } = await import('../support/liveChallengeSimHost.mjs');
const { LINE_PLAN } = await import('../support/liveChallengeSimLineRound.mjs');
const db = admin.firestore();

const SPRINT_CLASS = Number(process.env.LINE_LAUNCH_SPRINT) || 30;
const CLASSIC_CLASS = Number(process.env.LINE_LAUNCH_CLASSIC) || 35;
const RUSH_CLASS = Number(process.env.LINE_LAUNCH_RUSH) || 30;
const WORKERS = Number(process.env.LAUNCH_CERT_WORKERS) || undefined;
const report = { sprint: null, classic: null, rush: null };

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)); });
const millis = (value) => value?.toMillis?.() ?? 0;
const random = (() => { let seed = 0x11e9; return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); })();
const waitUntil = async (label, predicate, timeoutMs = 30_000, pollMs = 200) => {
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
const at = (whenMs, fn) => sleep(whenMs - Date.now()).then(fn);
// Close what a scenario opened: the host console, every device's listeners (and
// prove they all closed), then the worker farm, WHATEVER failed before it. Its
// workers are threads, and a thread left running keeps the process alive, so
// when anything ahead of `farm.close()` threw (a close that failed, a listener
// left open) the whole certification used to hang instead of reporting it: seen
// in the launch certification (CI08, A2-138), whose pattern this copies.
const closeScenario = async ({ host = null, farm, label }) => {
  try {
    await host?.close();
    await farm.shutdown();
    assert.equal((await farm.listeners()).total, 0, `${label}: every listener a device opened was closed`);
  } finally {
    await farm.close();
  }
};
// The room reads closed as soon as a close commits; the host's own call
// returns a moment later (about 0.2 s once release 2's Live Challenge changes
// are in). A close is read once its call has returned, never while it is in
// flight: an entry still at ok === null is a call that has not answered yet.
const closeReturned = (host, label, roundIndex) => waitUntil(`${label}: the host's close returned`, async () => (
  host.closes.some((entryOfClose) => entryOfClose.roundIndex === roundIndex && entryOfClose.ok !== null) ? true : null
), 10_000);
const percentiles = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const pick = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? null;
  return { p50: pick(0.5), p95: pick(0.95), max: sorted.at(-1) ?? null };
};

/* ------------------------------ class, server ----------------------------- */

const classFor = (key, size) => ({
  key,
  classId: `line-launch-${key}`,
  teacher: `line-launch-${key}@example.com`,
  students: Array.from({ length: size }, (_, index) => `ll-${key}-s${String(index + 1).padStart(2, '0')}`),
});
const seedClass = async (entry) => {
  await db.collection('classes').doc(entry.classId).set({ teacherOfRecord: entry.teacher, status: 'active', course: 'algebra1', period: entry.key, name: `Line ${entry.key}` });
  const batch = db.batch();
  entry.students.forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
    assignedTeacherEmail: entry.teacher, classId: entry.classId, classPeriod: entry.key, firstName: `Line${index + 1}`, lastName: entry.key,
  }));
  await batch.commit();
  return entry;
};

const teacherCall = (entry, name, data) => functionsIndex[name].run({
  auth: { uid: `${entry.teacher}-uid`, token: { role: 'teacher', email: entry.teacher, email_verified: true } }, data, rawRequest: { headers: {} },
});
const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const privatePlayers = async (roomId) => (await db.collection('liveChallengePrivate').doc(roomId).collection('players').get()).docs.map((doc) => ({ studentId: doc.id, ...doc.data() }));
const inviteOf = async (studentId) => (await db.collection('liveChallengeInvites').doc(studentId).get()).data() || null;
const solutionOf = async (roomId, roundIndex) => (await roomRef(roomId).collection('solutions').doc(String(roundIndex)).get()).data() || null;

// A Graph the Line room exactly as the console creates one: its request from
// the teacher's setup, then the experience settings it sends after.
const createLineGame = async (entry, setup) => {
  assert.equal(lineSetupProblem(setup), null, 'the setup is a game');
  const { roomId } = await teacherCall(entry, 'createLiveChallenge', {
    classId: entry.classId,
    classPeriod: entry.key,
    courseId: 'algebra1',
    ...lineCreateRequest(setup),
    standingsDisplay: normalizeStandingsDisplay(null),
    title: `Line ${entry.key} Graph the Line`,
  });
  await teacherCall(entry, 'configureLiveChallengeExperience', { roomId, speedInfluencePercent: 0, playerDisplayMode: 'codeName' });
  return roomId;
};

// Plans dealt round-robin, so every worker hosts every kind of student.
const dealPlans = (size, counts) => {
  const left = { ...counts };
  const plans = [];
  while (plans.length < size) {
    const before = plans.length;
    Object.keys(left).forEach((plan) => { if (left[plan] > 0 && plans.length < size) { plans.push(plan); left[plan] -= 1; } });
    assert.ok(plans.length > before, 'the plan counts cover the class');
  }
  return plans;
};

/* ------------------------------ the class plays ---------------------------- */

const lineRecord = (view, roomId, roundIndex) => view.seen?.[roomId]?.rounds?.[roundIndex]?.line || null;

// The class in its lobby (all but `late`), then the game started; returns
// the room as it started.
const openLobby = async ({ entry, roomId, farm, plans, late = null }) => {
  await Promise.all(entry.students.map((studentId, index) => farm.add(studentId, {
    deliveryJitterMs: 300, rttMs: Math.round(random() * 40), linePlan: plans[index], lineThinkMs: 400,
  })));
  const lobby = entry.students.filter((studentId) => studentId !== late);
  await Promise.all(lobby.map(async (studentId) => farm.device(studentId).open(await inviteOf(studentId))));
  await waitUntil('lobby', async () => (await publicPlayers(roomId)).filter((row) => row.joined).length === lobby.length
    && [...(await farm.views()).values()].filter((view) => view.roomId).every((view) => view.clockReady), 30_000, 250);
  return lobby;
};

const waitForClose = (roomId, roundIndex, timeoutMs, farm) => waitUntil(async () => {
  const views = [...(await farm.views()).values()];
  const playing = views.filter((view) => !lineRecord(view, roomId, roundIndex)?.finished).map((view) => `${view.studentId} ${JSON.stringify(lineRecord(view, roomId, roundIndex)?.counts || null)} ${JSON.stringify(view.errors)}`);
  return `round ${roundIndex + 1} not closed; still playing: ${playing.slice(0, 6).join('; ')}`;
}, async () => {
  const room = await roomOf(roomId);
  return Number(room.currentRound) === roundIndex && room.roundState === 'closed' ? room : null;
}, timeoutMs, 250);

// Every device that played this round against the server's receipts: the
// device ended where the server says, and the plan's own count of attempts is
// exactly what was recorded — none lost, none twice.
const PLAN_COUNTS = Object.freeze({
  sprint: Object.freeze({
    [LINE_PLAN.RIGHT]: { completed: 5, ended: 0, attempts: 5, hits: 5 },
    [LINE_PLAN.FIX]: { completed: 5, ended: 0, attempts: 10, hits: 5 },
    [LINE_PLAN.STUCK]: { completed: 0, ended: 5, attempts: 15, hits: 0 },
    [LINE_PLAN.SKIP]: { completed: 3, ended: 2, attempts: 5, hits: 3 },
  }),
  classic: Object.freeze({
    [LINE_PLAN.RIGHT]: { completed: 1, ended: 0, attempts: 1, hits: 1 },
    [LINE_PLAN.COMMON]: { completed: 1, ended: 0, attempts: 2, hits: 1 },
    [LINE_PLAN.FIX]: { completed: 1, ended: 0, attempts: 2, hits: 1 },
    [LINE_PLAN.STUCK]: { completed: 0, ended: 1, attempts: 3, hits: 0 },
  }),
});
const countsOf = (state) => ({ completed: state.questionsCorrect, ended: state.ended, attempts: state.attempts, hits: state.hits });
const assertRoundRecorded = async ({ label, entry, roomId, roundIndex, poolSize, plans, expected = null, views }) => {
  const rows = await privatePlayers(roomId);
  const publicByKey = new Map((await publicPlayers(roomId)).map((row) => [row.id, row]));
  const states = new Map();
  entry.students.forEach((studentId, index) => {
    const row = rows.find((candidate) => candidate.studentId === studentId);
    assert.ok(row?.joined, `${label}: ${studentId} joined`);
    const state = lineRoundState({ receipts: row.submissionReceipts || {}, roundIndex, poolSize });
    states.set(studentId, state);
    const record = lineRecord(views.get(studentId), roomId, roundIndex);
    assert.ok(record, `${label}: ${studentId} never played round ${roundIndex + 1}`);
    assert.deepEqual(record.errors, [], `${label}: ${studentId}'s round went wrong on the device`);
    // What the device last heard from the server is what the server holds.
    assert.deepEqual(countsOf(record.serverState || {}), countsOf(state), `${label}: ${studentId}'s device and the server disagree`);
    if (expected) assert.deepEqual(countsOf(state), expected[plans[index]], `${label}: ${studentId} (${plans[index]}) — every attempt recorded once; on the device: ${JSON.stringify({ byItem: record.byItem, resyncs: record.resyncLog })}`);
    // The board's race fields are the same receipts.
    const pub = publicByKey.get(row.playerKey);
    assert.equal(Number(pub?.rushRound), roundIndex, `${label}: ${studentId}'s row is on this round`);
    assert.equal(Number(pub?.rushRoundCompleted), state.questionsCorrect, `${label}: ${studentId}'s row counts their lines`);
    if (poolSize < 50) assert.equal(pub?.rushRoundFinished, state.finished, `${label}: ${studentId}'s row says whether they finished`);
  });
  return states;
};

// The final standings on every screen are the match result's, and the report
// counts what the receipts hold.
const assertFinished = async ({ label, entry, roomId, farm, totals }) => {
  const finished = await waitUntil(`${label}: finished on every screen, with its final standings`, async () => {
    const all = await farm.views();
    return [...all.values()].every((view) => view.room?.status === 'finished' && view.standings?.kind === 'final') ? all : null;
  }, 25_000);
  assert.equal((await publicPlayers(roomId)).length, entry.students.length, `${label}: one player per student`);
  const result = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data();
  const ranks = new Map(result.standings.filter((row) => row.rank !== null).map((row) => [row.playerKey, row.rank]));
  for (const view of finished.values()) assert.equal(view.standings.self?.rank, ranks.get(view.invite.playerKey), `${label}: ${view.studentId}'s final place is the match result's`);
  const lineReport = await waitUntil(`${label}: the report`, async () => (await db.collection('liveChallengeReports').doc(roomId).get()).data()?.lineGraph || null, 15_000);
  assert.equal(lineReport.players.length, entry.students.length, `${label}: the report has every student`);
  assert.equal(lineReport.itemsCompleted, totals.completed, `${label}: the report's lines right are the receipts'`);
  assert.equal(lineReport.attempts, totals.attempts, `${label}: the report's checks are the receipts'`);
  // Diagnostics: small summaries, never on the room or a public row.
  const diagnostics = (await roomRef(roomId).collection('diagnostics').get()).docs.map((doc) => doc.data());
  diagnostics.forEach((row) => {
    const events = Object.keys(row.launchMilestones || {});
    assert.ok(events.length <= MAX_LAUNCH_EVENTS && events.every((event) => LAUNCH_EVENTS.includes(event)), `${label}: a diagnostics row holds known milestones only`);
    assert.ok(JSON.stringify(row).length < 2_048, `${label}: a diagnostics row stays small`);
  });
  const publicText = JSON.stringify(await publicPlayers(roomId)) + JSON.stringify(await roomOf(roomId));
  assert.doesNotMatch(publicText, /launchMilestones|listener_attached|connectionStatus/, `${label}: no diagnostic is public`);
  return { result, lineReport };
};

// While a round is open: no standings listener on any device, and the host
// asks for no live snapshot.
//
// A device that has just joined, come back online or reloaded has the lobby's
// listeners (its own row and the room's standings) open until it hears that a
// round is running, so this waits for that moment, up to `settleMs`: a listener
// STILL open after it is the failure this exists to catch. (CI08, D-6: a sample
// taken 1.5 s after a late joiner opened and 1 s after a device came back
// online found them open on a loaded machine and failed the whole Sprint.)
const assertQuietDuringRound = async ({ label, farm, host, startsAtMs, settleMs = 4_000 }) => {
  const isQuiet = (counts) => counts.standings === 0 && counts.self === 0 && counts.players === 0;
  const settledBy = Date.now() + settleMs;
  let during = await farm.listeners();
  while (!isQuiet(during) && Date.now() < settledBy) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
    // eslint-disable-next-line no-await-in-loop
    during = await farm.listeners();
  }
  assert.deepEqual({ standings: during.standings, self: during.self, players: during.players }, { standings: 0, self: 0, players: 0 }, `${label}: a standings listener is open during the round: ${JSON.stringify(during)}`);
  const published = host.replies.filter((reply) => reply.published === true && reply.at >= startsAtMs).length;
  assert.equal(published, 0, `${label}: a live snapshot was written while the round was open`);
};

// When the server recorded the round's last answer (its arrival), across the class.
const lastAnswerAtMs = async (roomId, roundIndex) => Math.max(...(await privatePlayers(roomId)).flatMap((row) => Object.values(row.submissionReceipts || {})
  .filter((receipt) => Number(receipt?.roundIndex) === roundIndex && Number(receipt?.arrivedAtMs) > 0)
  .map((receipt) => Number(receipt.arrivedAtMs))));

const sumStates = (statesByRound) => statesByRound.flatMap((states) => [...states.values()]).reduce((total, state) => ({
  completed: total.completed + state.questionsCorrect,
  attempts: total.attempts + state.attempts,
}), { completed: 0, attempts: 0 });

/* ================================ SPRINT ================================= */

test(`Graph the Line Sprint, ${SPRINT_CLASS} students: their own lines, every one recorded once, the round closed the moment the class finished`, { timeout: 240_000 }, async () => {
  const entry = await seedClass(classFor('sprint', SPRINT_CLASS));
  const setup = changeLineSetup(defaultLineSetup('algebra1', LINE_GRAPH_FORMAT.SPRINT), { sprintLength: 5, roundCount: 1 });
  const roomId = await createLineGame(entry, setup);
  const plans = dealPlans(SPRINT_CLASS, { [LINE_PLAN.RIGHT]: 12, [LINE_PLAN.FIX]: 8, [LINE_PLAN.STUCK]: 4, [LINE_PLAN.SKIP]: 6 });
  const late = entry.students.at(-1);
  // Two devices with the right plan, so their counts are exact: one offline
  // at the start, one that reloads its page while offline, mid-round.
  const [offlineAtZero, reloads] = entry.students.filter((studentId, index) => plans[index] === LINE_PLAN.RIGHT && studentId !== late);
  const farm = await createDeviceFarm({ workers: WORKERS });
  const host = await createSimHost({ roomId, call: (name, data) => teacherCall(entry, name, data), autoClose: true });
  try {
    await openLobby({ entry, roomId, farm, plans, late });
    await teacherCall(entry, 'startLiveChallenge', { roomId });
    const started = await roomOf(roomId);
    const startsAtMs = millis(started.startsAt);
    const endsAtMs = millis(started.endsAt || started.roundEndsAt);
    await Promise.all([
      at(startsAtMs - 400, () => farm.device(offlineAtZero).goOffline()),
      at(startsAtMs + 2_000, () => farm.device(offlineAtZero).goOnline()),
      at(startsAtMs + 1_500, async () => farm.device(late).open(await inviteOf(late))),
      // Offline mid-round: lines are drawn and checked on the device, and
      // queued; the page reloads before they are sent, then the network returns.
      at(startsAtMs + 2_500, () => farm.device(reloads).goOffline()),
      at(startsAtMs + 4_000, () => farm.device(reloads).refresh()),
      at(startsAtMs + 5_500, () => farm.device(reloads).goOnline()),
      at(startsAtMs + 3_000, () => assertQuietDuringRound({ label: 'sprint', farm, host, startsAtMs })),
    ]);
    const closed = await waitForClose(roomId, 0, 90_000, farm);
    const views = await farm.views();
    // Each device had its own lines (the class shares no order).
    const firstLines = new Set([...views.values()].map((view) => lineRecord(view, roomId, 0)?.firstLine));
    assert.ok(firstLines.size >= Math.min(8, SPRINT_CLASS / 3), `every student their own lines: ${firstLines.size} distinct first lines`);
    const states = await assertRoundRecorded({ label: 'sprint', entry, roomId, roundIndex: 0, poolSize: 5, plans, expected: PLAN_COUNTS.sprint, views });
    // The reload lost nothing: what it drew offline was sent from storage.
    assert.ok(lineRecord(views.get(reloads), roomId, 0).resentFromStorage >= 1, `the reloaded page resent what it stored: ${JSON.stringify(lineRecord(views.get(reloads), roomId, 0))}`);
    // Closed by the console's rule, once everyone had finished, long before the clock.
    await closeReturned(host, 'sprint', 0);
    const close = host.closes.find((entryOfClose) => entryOfClose.roundIndex === 0 && entryOfClose.ok);
    assert.equal(close?.reason, 'allFinished', `the round closed because everyone finished: ${JSON.stringify(host.closes)}`);
    const lastAnswerAt = await lastAnswerAtMs(roomId, 0);
    assert.ok(close.at > lastAnswerAt && close.at - lastAnswerAt < 10_000, `the close followed the last recorded answer (${close.at - lastAnswerAt} ms)`);
    assert.ok(close.at < endsAtMs - 20_000, 'the round did not wait for its clock');
    report.sprint = {
      students: SPRINT_CLASS,
      roomBytesAtLaunch: JSON.stringify(started).length,
      firstBatchBytesMax: Math.max(...[...views.values()].map((view) => lineRecord(view, roomId, 0).firstBatchBytes)),
      requests: { getLineGraphRound: [...views.values()].reduce((total, view) => total + (view.stats.requests.getLineGraphRound || 0), 0), submitLineGraphAttempts: [...views.values()].reduce((total, view) => total + (view.stats.requests.submitLineGraphAttempts || 0), 0) },
      attemptsRecorded: [...states.values()].reduce((total, state) => total + state.attempts, 0),
      closeAfterLastAnswerMs: close.at - lastAnswerAt,
      roundMs: millis(closed.roundClosedAt || closed.updatedAt) - startsAtMs,
    };
    await teacherCall(entry, 'finishLiveChallenge', { roomId });
    await assertFinished({ label: 'sprint', entry, roomId, farm, totals: sumStates([states]) });
  } finally {
    await closeScenario({ host, farm, label: 'sprint' });
  }
});

/* ================================ CLASSIC ================================ */

test(`Graph the Line Classic, ${CLASSIC_CLASS} students: one line for the class, its reveal only after each round, with the class's own mistake`, { timeout: 240_000 }, async () => {
  const entry = await seedClass(classFor('classic', CLASSIC_CLASS));
  const setup = changeLineSetup(defaultLineSetup('algebra1', LINE_GRAPH_FORMAT.CLASSIC), { roundCount: 3 });
  assert.equal(setup.sameEquations, true, 'Classic gives the class the same lines by default');
  const roomId = await createLineGame(entry, setup);
  const counts = { [LINE_PLAN.RIGHT]: 18, [LINE_PLAN.COMMON]: 9, [LINE_PLAN.FIX]: 5, [LINE_PLAN.STUCK]: 3 };
  const plans = dealPlans(CLASSIC_CLASS, counts);
  const farm = await createDeviceFarm({ workers: WORKERS });
  const host = await createSimHost({ roomId, call: (name, data) => teacherCall(entry, name, data), autoClose: true });
  const statesByRound = [];
  const reveals = [];
  try {
    await openLobby({ entry, roomId, farm, plans });
    await teacherCall(entry, 'startLiveChallenge', { roomId });
    for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
      const label = `classic round ${roundIndex + 1}`;
      if (roundIndex > 0) {
        // eslint-disable-next-line no-await-in-loop
        const room = await roomOf(roomId);
        // eslint-disable-next-line no-await-in-loop
        await teacherCall(entry, 'advanceLiveChallenge', { roomId, expectedRoundIndex: roundIndex - 1, expectedRoundVersion: room.roundVersion });
      }
      // eslint-disable-next-line no-await-in-loop
      const opened = await waitUntil(`${label} opened`, async () => {
        const room = await roomOf(roomId);
        return Number(room.currentRound) === roundIndex && room.roundState !== 'closed' && room.status === 'running' ? room : null;
      });
      const startsAtMs = millis(opened.startsAt);
      // While the round can be answered: quiet boards, and its line nowhere public.
      // eslint-disable-next-line no-await-in-loop
      await at(startsAtMs + 1_200, async () => {
        await assertQuietDuringRound({ label, farm, host, startsAtMs });
        const room = await roomOf(roomId);
        if (room.roundState !== 'closed') assert.equal(await solutionOf(roomId, roundIndex), null, `${label}: the line is public while the round is open`);
      });
      // eslint-disable-next-line no-await-in-loop
      await waitForClose(roomId, roundIndex, 60_000, farm);
      // eslint-disable-next-line no-await-in-loop
      const views = await farm.views();
      // eslint-disable-next-line no-await-in-loop
      const states = await assertRoundRecorded({ label, entry, roomId, roundIndex, poolSize: 1, plans, expected: PLAN_COUNTS.classic, views });
      statesByRound.push(states);
      const records = entry.students.map((studentId) => lineRecord(views.get(studentId), roomId, roundIndex));
      assert.equal(new Set(records.map((record) => record.firstLine)).size, 1, `${label}: everyone had the same line`);
      // Everyone on the common plan drew the same wrong line; it is the class's mistake.
      const commonLines = new Set(records.filter((_, index) => plans[index] === LINE_PLAN.COMMON).map((record) => record.byItem[0]?.wrongLines?.[0]));
      assert.equal(commonLines.size, 1, `${label}: the common mistake is one line`);
      const [commonLine] = commonLines;
      // eslint-disable-next-line no-await-in-loop
      await closeReturned(host, label, roundIndex);
      const close = host.closes.find((entryOfClose) => entryOfClose.roundIndex === roundIndex && entryOfClose.ok);
      assert.equal(close?.reason, 'allFinished', `${label}: closed because everyone finished: ${JSON.stringify(host.closes)}`);
      // eslint-disable-next-line no-await-in-loop
      const lastAnswerAt = await lastAnswerAtMs(roomId, roundIndex);
      assert.ok(close.at > lastAnswerAt && close.at - lastAnswerAt < 10_000, `${label}: the close followed the last recorded answer (${close.at - lastAnswerAt} ms)`);
      // The line, published at the close: the class's counts, and nobody's name.
      // eslint-disable-next-line no-await-in-loop
      const solution = await waitUntil(`${label}: the published line`, () => solutionOf(roomId, roundIndex), 10_000);
      const facts = solution.lineGraph?.class;
      assert.deepEqual(
        { answered: facts?.answered, correct: facts?.correct, firstTry: facts?.firstTry, mistakeStudents: facts?.mistake?.students },
        { answered: CLASSIC_CLASS, correct: CLASSIC_CLASS - counts[LINE_PLAN.STUCK], firstTry: counts[LINE_PLAN.RIGHT], mistakeStudents: counts[LINE_PLAN.COMMON] },
        `${label}: the class's facts`,
      );
      const { a, b, c } = facts.mistake.line;
      assert.equal(`${a}|${b}|${c}`, commonLine, `${label}: the published mistake is the line nine students drew`);
      const published = JSON.stringify(solution);
      // eslint-disable-next-line no-await-in-loop
      const keys = (await privatePlayers(roomId)).map((row) => row.playerKey);
      entry.students.forEach((studentId) => assert.ok(!published.includes(studentId), `${label}: the solution names ${studentId}`));
      keys.forEach((key) => assert.ok(!published.includes(String(key)), `${label}: the solution carries a player key`));
      // eslint-disable-next-line no-await-in-loop
      assert.ok(((await roomOf(roomId)).revealedSolutionRounds || []).includes(roundIndex), `${label}: the room lists the round as revealed`);
      reveals.push({ round: roundIndex + 1, ...facts, mistake: { students: facts.mistake.students, label: facts.mistake.label }, closeAfterLastAnswerMs: close.at - lastAnswerAt });
    }
    report.classic = { students: CLASSIC_CLASS, rounds: reveals };
    await teacherCall(entry, 'finishLiveChallenge', { roomId });
    await assertFinished({ label: 'classic', entry, roomId, farm, totals: sumStates(statesByRound) });
  } finally {
    await closeScenario({ host, farm, label: 'classic' });
  }
});

/* ================================= RUSH ================================== */

test(`Graph the Line Rush, ${RUSH_CLASS} students: as many as the clock allows, items fetched ahead, the round ended by its clock`, { timeout: 240_000 }, async () => {
  const entry = await seedClass(classFor('rush', RUSH_CLASS));
  const setup = changeLineSetup(applyLinePreset(defaultLineSetup('algebra1', LINE_GRAPH_FORMAT.RUSH), 'graphAndName'), { nameStyle: 'build', roundCount: 1, roundSeconds: 30 });
  const roomId = await createLineGame(entry, setup);
  const plans = dealPlans(RUSH_CLASS, { [LINE_PLAN.RIGHT]: 15, [LINE_PLAN.FIX]: 10, [LINE_PLAN.SKIP]: 5 });
  const farm = await createDeviceFarm({ workers: WORKERS });
  const host = await createSimHost({ roomId, call: (name, data) => teacherCall(entry, name, data), autoClose: true });
  try {
    await openLobby({ entry, roomId, farm, plans });
    await teacherCall(entry, 'startLiveChallenge', { roomId });
    const started = await roomOf(roomId);
    const startsAtMs = millis(started.startsAt);
    const endsAtMs = millis(started.endsAt || started.roundEndsAt);
    await at(startsAtMs + 10_000, () => assertQuietDuringRound({ label: 'rush', farm, host, startsAtMs }));
    await waitForClose(roomId, 0, 90_000, farm);
    // Nobody finishes a Rush: it ended on its clock, not before.
    assert.ok(host.closes.every((entryOfClose) => entryOfClose.reason === 'deadline'), `a Rush closes only on its clock: ${JSON.stringify(host.closes)}`);
    await closeReturned(host, 'rush', 0);
    assert.ok(host.closes.find((entryOfClose) => entryOfClose.ok)?.at >= endsAtMs, 'the close came after the deadline');
    const views = await farm.views();
    const states = await assertRoundRecorded({ label: 'rush', entry, roomId, roundIndex: 0, poolSize: 150, plans, views });
    entry.students.forEach((studentId, index) => {
      const state = states.get(studentId);
      const plan = plans[index];
      assert.ok(state.questionsCorrect >= 5, `rush: ${studentId} completed only ${state.questionsCorrect} lines in 30 s`);
      if (plan === LINE_PLAN.RIGHT) assert.equal(state.attempts, state.questionsCorrect, `rush: ${studentId} (right) — one check per line`);
      if (plan === LINE_PLAN.SKIP) assert.ok(state.ended >= 1, `rush: ${studentId} (skip) skipped none`);
    });
    // Items came in batches, fetched ahead of the student.
    const fetches = [...views.values()].map((view) => lineRecord(view, roomId, 0).fetches);
    assert.ok(fetches.filter((count) => count >= 2).length >= RUSH_CLASS * 0.8, `items were fetched ahead: ${JSON.stringify(percentiles(fetches))}`);
    report.rush = {
      students: RUSH_CLASS,
      seconds: 30,
      linesPerStudent: percentiles([...states.values()].map((state) => state.questionsCorrect)),
      checksPerStudent: percentiles([...states.values()].map((state) => state.attempts)),
      fetchesPerStudent: percentiles(fetches),
      submitsPerStudent: percentiles([...views.values()].map((view) => view.stats.requests.submitLineGraphAttempts || 0)),
      firstBatchBytesMax: Math.max(...[...views.values()].map((view) => lineRecord(view, roomId, 0).firstBatchBytes)),
      lateBatchesDropped: [...views.values()].filter((view) => lineRecord(view, roomId, 0).finalRefusal).length,
    };
    await teacherCall(entry, 'finishLiveChallenge', { roomId });
    await assertFinished({ label: 'rush', entry, roomId, farm, totals: sumStates([states]) });
  } finally {
    await closeScenario({ host, farm, label: 'rush' });
  }
});

test('certification report', () => {
  if (process.env.LINE_LAUNCH_REPORT) writeFileSync(process.env.LINE_LAUNCH_REPORT, JSON.stringify(report, null, 2));
  console.log(`[line-launch] ${JSON.stringify(report)}`);
  assert.ok(report.sprint && report.classic && report.rush, 'every format was certified');
});
