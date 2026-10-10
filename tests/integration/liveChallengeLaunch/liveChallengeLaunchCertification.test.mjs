// LIVE CHALLENGE LAUNCH CERTIFICATION: whole classes launching, against the
// real server and real Firestore listeners. Run through
// `npm run test:live-challenge-launch:emulator` (the emulator, with the #422
// transaction retry loaded for every integration suite and every farm worker).
// It has that emulator to itself: its budgets and waits are measured against a
// class, so the other integration suites never share its emulator.
//
// THE INVARIANT. A student who is authorized and connected derives the game
// from the durable room — status, round, question, startsAt, endsAt — at their
// calibrated server time. Missing the countdown, or any other transient moment,
// cannot strand them: the countdown is animation, never the source of truth.
//
// THE STANDINGS. A screen listens to its own public row and to ONE standings
// snapshot (functions/shared/liveChallengeStandingsProjection.mjs), never to
// its classmates' rows. The snapshot is replaced at most once a second while
// the board moves — paced by the host console (../support/liveChallengeSimHost
// .mjs runs the console's own pacer) — and exactly at each round's close and at
// the finish. Certified at every size: a screen's standings deliveries per
// round are bounded whatever the class size, its listeners are a constant
// four, and the final standings and podium on every screen ARE the match
// result's, seat by seat. The endurance matches rotate the scoring strategies
// (total points, Grand Prix round placements, correct answers), and one game
// runs with its host console gone quiet mid-game.
//
// WHAT IS REAL. Every callable (functions/index.js, each student under their
// own identity). Every listener: each simulated device loads the production
// client service with its own Firebase app and Firestore connection to the
// emulator (../support/clientFirebase.mjs), so a device's snapshot stream, cache,
// offline switch and reconnect are the SDK's own. Every decision a device
// makes from what it hears goes through the pure modules the student screen
// uses. What is mirrored from LiveChallengeStudent.jsx (when it joins,
// calibrates, batches launch milestones, retries a locked answer) is listed in
// ../support/liveChallengeSimStudent.mjs. Devices run in worker threads
// (../support/deviceFarm.mjs), several per worker, as a class runs on many
// Chromebooks.
//
// WHAT IT DOES NOT PROVE. Real-network latency, a school's content filter, or
// Firestore's production fan-out: the emulator is one local process. This is
// the client/server CONTRACT under class-sized concurrency, recovery and
// repetition — the part a classroom cannot observe directly.
//
// Scale knobs (defaults are what CI runs):
//   LAUNCH_CERT_SIZES=5,15,25,35,45,64      class sizes, one full game each
//   LAUNCH_CERT_ENDURANCE_MATCHES=4         consecutive matches on the same open screens
//   LAUNCH_CERT_ENDURANCE_CLASS=20          players in the endurance class
//   LAUNCH_CERT_WORKERS=4                   worker threads hosting the devices
//   LAUNCH_CERT_REPORT=/path/report.json    write every measurement here

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:live-challenge-launch:emulator.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const challenge = await import(path.join(repo, 'functions/shared/liveChallenge.mjs'));
const { LAUNCH_EVENTS, MAX_LAUNCH_EVENTS } = await import(path.join(repo, 'functions/shared/liveChallengeLaunchDiagnostics.mjs'));
const { leaderboardOptionsFor, getScoringStrategy, SCORE_ACCUMULATION } = await import(path.join(repo, 'functions/shared/liveChallengeScoring.mjs'));
const { CHALLENGE_STAGE } = await import(path.join(repo, 'src/platform/liveChallenge/challengeShellModel.js'));
const { createDeviceFarm } = await import('../support/deviceFarm.mjs');
const { createSimHost } = await import('../support/liveChallengeSimHost.mjs');
const { STANDINGS_MIN_PUBLISH_INTERVAL_MS, STANDINGS_TOP_ROWS } = await import(path.join(repo, 'functions/shared/liveChallengeStandingsProjection.mjs'));
const { classStandingsRows } = await import(path.join(repo, 'functions/shared/liveChallengePrivacy.mjs'));
const db = admin.firestore();

const SIZES = (process.env.LAUNCH_CERT_SIZES || '5,15,25,35,45,64').split(',').map(Number).filter((size) => size >= 5);
const ENDURANCE_MATCHES = Math.max(2, Number(process.env.LAUNCH_CERT_ENDURANCE_MATCHES) || 4);
const ENDURANCE_CLASS = Math.max(5, Number(process.env.LAUNCH_CERT_ENDURANCE_CLASS) || 20);
const ENDURANCE_STRATEGIES = ['accuracyFirst', 'grandPrix', 'correctCount'];
const WORKERS = Number(process.env.LAUNCH_CERT_WORKERS) || undefined;
const RUSH_CLASS = 30;
const ROUNDS = 3;
const report = { sizes: {}, endurance: null, rush: null };

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, Math.max(0, ms)); });
const millis = (value) => value?.toMillis?.() ?? 0;
const random = (() => { let seed = 0x5eed1e; return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); })();
const waitUntil = async (label, predicate, timeoutMs = 30_000, pollMs = 150) => {
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

/* ------------------------- classes, roster, bank ------------------------- */

// The integration suites share one emulator and run in parallel; these rooms
// draw only questions carrying this suite's own standard.
const CERT_STANDARD = 'LAUNCHCERT1';
const bank = [];
for (const file of readdirSync(path.join(repo, 'functions/seeds/pathQuestionBank')).filter((name) => name.endsWith('.json'))) {
  const parsed = JSON.parse(readFileSync(path.join(repo, 'functions/seeds/pathQuestionBank', file), 'utf8'));
  for (const item of (Array.isArray(parsed) ? parsed : (parsed.documents || []))) {
    if (String(item.courseId || 'algebra1') !== 'algebra1') continue;
    // eslint-disable-next-line no-await-in-loop
    const instantiated = await mathPath.instantiateQuestion(item, `launch-cert|${item.id}`);
    if (!instantiated?.question || !challenge.liveChallengeEligible(instantiated.question)) continue;
    if (!mathPath.isChoiceOnlyPathQuestion(instantiated.question)) continue;
    if (!Array.isArray(item.alignmentKeys) || !item.alignmentKeys.length) continue;
    // eslint-disable-next-line no-await-in-loop
    if ((await mathPath.buildIssuePlan(instantiated.question)).issuable) bank.push(item);
    if (bank.length >= 6) break;
  }
  if (bank.length >= 6) break;
}
assert.ok(bank.length >= ROUNDS, 'the seed bank must hold enough gradable choice questions');
await Promise.all(bank.map((item) => db.collection('pathQuestionBank').doc(`${item.id}--launch-cert`).set({
  ...item, id: `${item.id}--launch-cert`, courseId: 'algebra1', active: true, alignmentKeys: [...item.alignmentKeys, `texas:${CERT_STANDARD}`],
})));

const classFor = (key, size) => ({
  key,
  classId: `launch-cert-${key}`,
  teacher: `launch-cert-${key}@example.com`,
  students: Array.from({ length: size }, (_, index) => `lc-${key}-s${String(index + 1).padStart(2, '0')}`),
});
const seedClass = async (entry) => {
  await db.collection('classes').doc(entry.classId).set({ teacherOfRecord: entry.teacher, status: 'active', course: 'algebra1', period: entry.key, name: `Launch ${entry.key}` });
  const batch = db.batch();
  entry.students.forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
    assignedTeacherEmail: entry.teacher, classId: entry.classId, classPeriod: entry.key, firstName: `Cert${index + 1}`, lastName: entry.key,
  }));
  await batch.commit();
  return entry;
};

/* -------------------------------- server -------------------------------- */

const teacherCall = (entry, name, data) => functionsIndex[name].run({
  auth: { uid: `${entry.teacher}-uid`, token: { role: 'teacher', email: entry.teacher, email_verified: true } }, data, rawRequest: { headers: {} },
});
const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const publicPlayers = async (roomId) => (await roomRef(roomId).collection('players').get()).docs.map((doc) => ({ id: doc.id, ...doc.data() }));
const privatePlayers = async (roomId) => (await privateRef(roomId).collection('players').get()).docs.map((doc) => ({ studentId: doc.id, ...doc.data() }));
const diagnostics = async (roomId) => (await roomRef(roomId).collection('diagnostics').get()).docs.map((doc) => ({ playerKey: doc.id, ...doc.data() }));
const standingsSnapshot = async (roomId) => (await roomRef(roomId).collection('standings').doc('current').get()).data() || null;
// The host console for a room: listens to every row and paces live snapshots.
const openHost = (entry, roomId, options = {}) => createSimHost({ roomId, call: (name, data) => teacherCall(entry, name, data), ...options });
const inviteOf = async (studentId) => (await db.collection('liveChallengeInvites').doc(studentId).get()).data() || null;

const createGame = async (entry, extra = {}) => (await teacherCall(entry, 'createLiveChallenge', {
  classId: entry.classId,
  courseId: 'algebra1',
  standardCode: CERT_STANDARD,
  questionStyle: 'noTools',
  roundCount: ROUNDS,
  // Long rounds: the host closes each one as soon as everyone has answered,
  // so this only gives a loaded CI machine room, and weakens no check.
  roundSeconds: 90,
  // ...and no closing countdown. At the default 70% threshold a class this
  // size compresses each round to its last 5 s within seconds of the start, so
  // a device that attaches after zero (the late listener, on a loaded machine)
  // raced that window instead of the durable room this certifies, and on CI
  // lost it: round 1 locked with it still joining. Compression is its own
  // rule, with its own tests; it is not part of the launch contract.
  roundClosingThreshold: 'off',
  ...extra,
})).roomId;

// What a few devices hold, for a timeout message: the ones being waited on
// first (`first`, student ids), then others for comparison.
const viewDump = (views, first = []) => {
  const all = [...views.values()];
  const waited = new Set(first);
  return JSON.stringify([...all.filter((view) => waited.has(view.studentId)), ...all.filter((view) => !waited.has(view.studentId))].slice(0, 5).map((view) => ({
    id: view.studentId, room: view.room, stage: view.stage, online: view.online, frozen: view.frozen, answering: view.answering,
    rounds: Object.keys(view.seen[view.roomId]?.rounds || {}), answers: view.seen[view.roomId]?.answers || null,
    errors: view.errors, roomLagMaxMs: view.stats.roomLagMaxMs,
  })));
};

// The host closes a round once the whole class has joined and answered: NOT
// forced, so the close itself proves that every student's answer reached the
// server. Every student in these scenarios plays every round, so one still
// joining (the late listener on a loaded machine) is waited for, never closed
// out. It also waits for every answer still on its way (a deliberate second
// answer included) to settle: closing first would race the student — the
// server would rightly refuse the late one — and test nothing about the server.
const answeredRound = (rows, studentId, roundIndex) => rows.some((row) => row.studentId === studentId && row.joined && Number(row.answeredRound) === roundIndex);
const closeWhenAllAnswered = async (entry, farm, roomId, roundIndex, timeoutMs = 25_000) => {
  await waitUntil(async () => {
    const rows = await privatePlayers(roomId);
    const room = await roomOf(roomId);
    const waiting = entry.students.filter((studentId) => !answeredRound(rows, studentId, roundIndex));
    return `round ${roundIndex + 1}: still waiting on ${waiting.join(', ')}; server room ${JSON.stringify({ round: room.currentRound, state: room.roundState, version: room.roundVersion, startsAt: millis(room.startsAt), endsAt: millis(room.endsAt), now: Date.now() })}; devices ${viewDump(await farm.views(), waiting)}`;
  }, async () => {
    const rows = await privatePlayers(roomId);
    return entry.students.every((studentId) => answeredRound(rows, studentId, roundIndex));
  }, timeoutMs, 250);
  await waitUntil(async () => `round ${roundIndex + 1}: answers still in flight on ${[...(await farm.views()).values()].filter((view) => view.answering).map((view) => view.studentId).join(', ')}`,
    async () => [...(await farm.views()).values()].every((view) => !view.answering), 15_000, 100);
  const room = await roomOf(roomId);
  await teacherCall(entry, 'closeLiveChallengeRound', { roomId, expectedRoundIndex: roundIndex, expectedRoundVersion: room.roundVersion });
};
const playRounds = async (entry, farm, roomId, { beforeRound = null } = {}) => {
  for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
    if (roundIndex > 0) {
      // eslint-disable-next-line no-await-in-loop
      const room = await roomOf(roomId);
      // eslint-disable-next-line no-await-in-loop
      await teacherCall(entry, 'advanceLiveChallenge', { roomId, expectedRoundIndex: roundIndex - 1, expectedRoundVersion: room.roundVersion });
    }
    // eslint-disable-next-line no-await-in-loop
    if (beforeRound) await beforeRound(roundIndex, await roomOf(roomId));
    // eslint-disable-next-line no-await-in-loop
    await closeWhenAllAnswered(entry, farm, roomId, roundIndex);
  }
};

/* ---------------------------- what is checked ---------------------------- */

const seenOf = (view, roomId) => view.seen[roomId] || null;

// Every device had each round on screen (stage roundActive, with a question
// and a ready clock), derived from the room it held.
const assertEveryDevicePlayed = (views, roomId, label) => {
  for (const view of views.values()) {
    for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
      const onScreen = seenOf(view, roomId)?.rounds?.[roundIndex] || view.seenBeforeRefresh?.[roomId]?.rounds?.[roundIndex];
      assert.ok(onScreen, `${label}: ${view.studentId} never had round ${roundIndex + 1} on screen (stages: ${(seenOf(view, roomId)?.stages || []).join(',')})`);
    }
  }
};

const answersOf = (view, roomId) => {
  const merged = {};
  for (const source of [view.seenBeforeRefresh?.[roomId], view.seen[roomId]]) {
    for (const [round, record] of Object.entries(source?.answers || {})) {
      const into = (merged[round] ||= { attempts: 0, accepted: [], refused: [] });
      into.attempts += record.attempts;
      into.accepted.push(...record.accepted);
      into.refused.push(...record.refused);
    }
  }
  return merged;
};

// One player per student, one scored answer per round, every point counted
// once, and one leaderboard that every screen and the match result agree on.
// `privateRows` is read after the last round closes: finishing deletes it.
const assertMatchIntegrity = async (farm, roomId, entry, views, label, privateRows) => {
  const [publicRows, result, invocations] = await Promise.all([
    publicPlayers(roomId), db.collection('liveChallengeMatchResults').doc(roomId).get().then((doc) => doc.data()), farm.invocations(),
  ]);
  assert.equal(privateRows.length, entry.students.length, `${label}: one private player per rostered student`);
  assert.equal(new Set(privateRows.map((row) => row.playerKey)).size, entry.students.length, `${label}: player keys are unique`);
  assert.equal(publicRows.length, views.size, `${label}: one public player per student who played, no duplicates (${publicRows.length})`);
  const publicByKey = new Map(publicRows.map((row) => [row.id, row]));
  const totals = { scored: 0, duplicateReplies: 0, secondAnswersRefused: 0, droppedThenRetried: 0, answerMs: [] };
  // How the room's strategy turns answers into a score: per response (the
  // points each answer earned, summed) or per round (a placement each round,
  // the championship points summed).
  const perRound = getScoringStrategy((await roomOf(roomId)).scoringStrategyId || null).accumulation === SCORE_ACCUMULATION.PER_ROUND;
  for (const view of views.values()) {
    const priv = privateRows.find((row) => row.studentId === view.studentId);
    assert.ok(priv?.joined, `${label}: ${view.studentId} joined`);
    const pub = publicByKey.get(priv.playerKey);
    assert.ok(pub, `${label}: ${view.studentId}'s public row is under their one key`);
    assert.equal(view.invite.playerKey, priv.playerKey, `${label}: the device played under the key the room minted`);
    const answers = answersOf(view, roomId);
    let points = 0;
    let correct = 0;
    for (let roundIndex = 0; roundIndex < ROUNDS; roundIndex += 1) {
      const record = answers[roundIndex];
      assert.ok(record, `${label}: ${view.studentId} sent nothing for round ${roundIndex + 1}`);
      // Every accepted reply for the round names ONE submission. A reply may
      // say `duplicate` (a resend of an answer the server already holds): it
      // is that same answer, never a second one.
      const scored = new Set(record.accepted.map((reply) => reply.submissionId));
      assert.equal(scored.size, 1, `${label}: ${view.studentId} round ${roundIndex + 1}: exactly one answer was scored (${JSON.stringify(record)}; server handled ${JSON.stringify([...scored].map((id) => [id, invocations[id]]))})`);
      totals.duplicateReplies += record.accepted.filter((reply) => reply.duplicate).length;
      assert.ok(record.accepted.every((entry) => entry.kind !== 'second'), `${label}: ${view.studentId} round ${roundIndex + 1}: a second answer was scored`);
      record.refused.forEach((refusal) => {
        // A second answer is refused however it arrives: the round is
        // answered (already-exists), or over by the time it lands.
        if (refusal.kind === 'second') totals.secondAnswersRefused += 1;
        else if (/unavailable/.test(refusal.code)) totals.droppedThenRetried += 1;
        else assert.fail(`${label}: ${view.studentId} round ${roundIndex + 1}: an answer sent while the round was open was refused: ${JSON.stringify(refusal)} (round record ${JSON.stringify(record)}; server handled ${JSON.stringify(record.accepted.concat(record.refused).map((entry) => [entry.submissionId, invocations[entry.submissionId]]))})`);
      });
      const reply = record.accepted[0];
      totals.answerMs.push(...record.accepted.map((entry) => entry.ms));
      points += reply.pointsAwarded;
      correct += reply.isCorrect ? 1 : 0;
      totals.scored += 1;
    }
    const receipts = Object.keys(priv.submissionReceipts || {}).filter((key) => !key.startsWith('milestone:'));
    assert.equal(receipts.length, ROUNDS, `${label}: ${view.studentId}: one answer receipt per round (${receipts.length})`);
    assert.equal(Number(priv.roundsAnswered), ROUNDS, `${label}: ${view.studentId} rounds answered`);
    assert.equal(Number(priv.correctCount), correct, `${label}: ${view.studentId} correct count`);
    if (perRound) {
      // A placement strategy: one placement per round, each counted once, and
      // the score IS their sum (the championship total).
      const placements = Object.values(priv.roundPlacements || {});
      assert.equal(placements.length, ROUNDS, `${label}: ${view.studentId}: one placement per round (${JSON.stringify(priv.roundPlacements)})`);
      const championship = placements.reduce((sum, entry) => sum + Math.max(0, Math.round(Number(entry?.matchPoints) || 0)), 0);
      assert.equal(Number(pub.score), championship, `${label}: ${view.studentId}: the board's score is the championship points their placements earned`);
      assert.equal(Number(priv.score), championship, `${label}: ${view.studentId}: private and public scores agree`);
    } else {
      assert.equal(Number(pub.score), points, `${label}: ${view.studentId}: the board's score is the sum of the points their answers earned`);
      assert.equal(Number(priv.score), points, `${label}: ${view.studentId}: private and public scores agree`);
    }
  }
  // The host's board (every public row) ranks exactly as the match result.
  const options = leaderboardOptionsFor((await roomOf(roomId)).scoringStrategyId || null);
  const board = challenge.publicLeaderboard(publicRows.map((row) => ({ playerKey: row.id, ...row })), { activeRound: null, ...options });
  const finalRank = new Map((result?.standings || []).filter((row) => row.rank !== null).map((row) => [row.playerKey, row.rank]));
  assert.equal(board.length, views.size, `${label}: everyone is on the board once`);
  board.forEach((row) => assert.equal(finalRank.get(row.playerKey), row.rank, `${label}: ${row.alias} is ranked the same on the board and in the match result`));
  for (let index = 1; index < board.length; index += 1) assert.ok(board[index - 1].rank <= board[index].rank, `${label}: the board is in rank order`);
  // THE FINAL STANDINGS AND PODIUM every screen shows ARE the match result's:
  // one final snapshot, written from it in the finishing commit, holding only
  // the public rule's rows (nobody else's place is in a document a classmate
  // can read) — and every screen holding exactly that snapshot, plus its own
  // final place from its own summary, written in the same commit.
  const ranked = (result?.standings || []).filter((row) => row.rank !== null);
  const expectedPublic = classStandingsRows(ranked.map((row) => ({ ...row })), { totalCount: ranked.length });
  const expectedTop = expectedPublic.rows.slice(0, STANDINGS_TOP_ROWS).map((row) => [row.playerKey, row.rank, row.tied, row.score]);
  const final = await standingsSnapshot(roomId);
  assert.equal(final?.kind, 'final', `${label}: the room's standings snapshot is the final one`);
  assert.equal(final.exact, true);
  assert.equal(final.count, ranked.length, `${label}: the final snapshot counts everyone who played`);
  for (const field of ['ranks', 'scores', 'slotKeys']) assert.equal(field in final, false, `${label}: the final snapshot lists no every-seat ${field}`);
  assert.deepEqual(final.top.map((row) => [row.playerKey, row.rank, row.tied, row.score]), expectedTop, `${label}: the podium is the match result's public rows`);
  assert.equal(final.lastRank, expectedPublic.lastRank, `${label}: where the class's last group starts`);
  for (const view of views.values()) {
    assert.equal(view.standings?.kind, 'final', `${label}: ${view.studentId}'s screen holds the final standings (${JSON.stringify(view.standings && { kind: view.standings.kind, phase: view.standings.phase })})`);
    assert.equal(view.standings.count, ranked.length, `${label}: ${view.studentId} counts everyone who played`);
    assert.deepEqual(view.standings.top, expectedTop, `${label}: ${view.studentId}'s screen shows the podium`);
    const own = ranked.find((row) => row.playerKey === view.invite.playerKey);
    assert.deepEqual([view.standings.self?.rank, view.standings.self?.tied, view.standings.self?.score], [own.rank, own.tied, own.score], `${label}: ${view.studentId}'s own final place (their own summary)`);
  }
  return totals;
};

/*
 * BOUNDED STANDINGS PER SCREEN. A screen's standings deliveries depend on
 * time and on the match's moments — at most one live snapshot a second, one
 * per round close, the final — never on how many classmates answered. The
 * bound is computed from the game's own length, so it holds at every size.
 */
// What the host's publish requests came back with, for a failure message.
const hostReplies = (host) => JSON.stringify(host.replies.slice(-12).map((reply) => [reply.published === true ? 'published' : (reply.reason || reply.error || 'no'), reply.retryAfterMs || undefined]));
const assertBoundedStandings = (views, { label, gameMs, host, size }) => {
  const live = Math.ceil(gameMs / STANDINGS_MIN_PUBLISH_INTERVAL_MS) + 1;
  // Live snapshots, the round closes and the finish, plus a listener's first
  // delivery each time it (re)attaches (a refresh, a rush round's pause).
  const budget = live + ROUNDS + 1 + 3;
  const deliveries = [...views.values()].map((view) => view.stats.standings.standingsCallbacks || 0);
  deliveries.forEach((count, index) => assert.ok(count <= budget, `${label}: ${[...views.values()][index].studentId} received ${count} standings snapshots over ${Math.round(gameMs / 1000)} s (bound ${budget}, whatever the class size)`));
  const own = [...views.values()].map((view) => view.stats.standings.selfCallbacks || 0);
  // Its own row: the join, one answer a round, and a re-attach or two.
  own.forEach((count, index) => assert.ok(count <= 2 + ROUNDS * 2 + 4, `${label}: ${[...views.values()][index].studentId} received its own row ${count} times`));
  // Its own summary (its own place): written only at each round's close and
  // at the finish — never by a classmate's answer — plus a re-attach or two.
  const summaries = [...views.values()].map((view) => view.stats.standings.summaryCallbacks || 0);
  summaries.forEach((count, index) => assert.ok(count <= 1 + ROUNDS + 1 + 3, `${label}: ${[...views.values()][index].studentId} received its own summary ${count} times`));
  const publishes = host.replies.filter((reply) => reply.published === true).length;
  assert.ok(publishes <= live, `${label}: ${publishes} live snapshots in ${Math.round(gameMs / 1000)} s`);
  // The pacer reached the screens: a live snapshot arrived on ordinary screens while a round was open.
  const sawLive = [...views.values()].filter((view) => (view.stats.standings.liveInRound || 0) > 0).length;
  assert.ok(sawLive >= Math.ceil(size / 2), `${label}: only ${sawLive} of ${size} screens saw a live snapshot during a round (the host's replies: ${hostReplies(host)})`);
  return {
    perScreen: { max: Math.max(...deliveries), mean: Math.round((deliveries.reduce((a, b) => a + b, 0) / deliveries.length) * 10) / 10, budget },
    ownRow: { max: Math.max(...own) },
    livePublishes: publishes,
    hostRequests: host.requests.length,
    screensThatSawLiveInRound: sawLive,
  };
};

// Launch diagnostics: bounded, summary-only, never on a student-readable row.
const assertDiagnosticsBounded = async (roomId, label) => {
  const rows = await diagnostics(roomId);
  let maxBytes = 0;
  for (const row of rows) {
    const events = Object.keys(row.launchMilestones || {});
    assert.ok(events.length <= MAX_LAUNCH_EVENTS, `${label}: ${row.playerKey} holds ${events.length} milestones`);
    events.forEach((event) => assert.ok(LAUNCH_EVENTS.includes(event), `${label}: unknown milestone ${event}`));
    maxBytes = Math.max(maxBytes, JSON.stringify(row).length);
  }
  assert.ok(maxBytes < 2_048, `${label}: a diagnostics row stays a small summary (${maxBytes} bytes)`);
  const publicText = JSON.stringify(await publicPlayers(roomId)) + JSON.stringify(await roomOf(roomId));
  assert.doesNotMatch(publicText, /launchMilestones|listener_attached|connectionStatus/, `${label}: no diagnostic is on the room or the public player rows`);
  return { rows, maxBytes };
};
const milestonesFor = (rows, playerKey) => rows.find((row) => row.playerKey === playerKey)?.launchMilestones || {};
const percentiles = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const pick = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? null;
  return { p50: pick(0.5), p95: pick(0.95), max: sorted.at(-1) ?? null };
};
const sum = (views, pick) => [...views.values()].reduce((total, view) => total + (pick(view) || 0), 0);

/* ===================== ONE FULL GAME PER CLASS SIZE ===================== */

for (const size of SIZES) {
  test(`${size} students: every authorized, connected device reaches the game from the durable room`, { timeout: 240_000 }, async () => {
    const entry = await seedClass(classFor(`c${size}`, size));
    const label = `${size} students`;
    const roomId = await createGame(entry);

    // Who does what. Everyone not named plays from the lobby on a normal
    // device, with a little jitter on every snapshot and request.
    const lateJoinCount = Math.max(1, Math.round(size * 0.1));
    const lobby = entry.students.slice(0, size - lateJoinCount - 1);
    const joinsDuringCountdown = entry.students.slice(size - lateJoinCount - 1, size - 1);
    const lateListener = entry.students[size - 1];
    const offlineAtZero = lobby[0];
    const backgrounded = lobby[1];
    const refreshesAfterRunning = lobby[2];
    const doubleSender = lobby[Math.min(3, lobby.length - 1)];
    const delayed = new Set(lobby.filter((_, index) => index % 10 === 4));
    if (!delayed.size) delayed.add(refreshesAfterRunning);
    const profileOf = (studentId, index) => ({
      deliveryJitterMs: delayed.has(studentId) ? 1_500 : 150,
      rttMs: Math.round(random() * 40),
      answer: index % 4 === 3 ? 'wrong' : 'correct',
      answerJitterMs: 1_200,
      // A backgrounded, slower Chromebook: renders once a second, slow link,
      // every snapshot late.
      ...(studentId === backgrounded ? { tickMs: 1_000, rttMs: 150, deliveryFixedMs: 700, deliveryJitterMs: 0 } : {}),
      ...(studentId === doubleSender ? { lostReply: true, secondAnswer: true } : {}),
    });
    const farm = await createDeviceFarm({ workers: WORKERS });
    // The teacher's console: every row, and the pacer for the students' live standings.
    const host = await openHost(entry, roomId);
    const gameStartedAt = Date.now();
    try {
      await Promise.all(entry.students.map((studentId, index) => farm.add(studentId, profileOf(studentId, index))));
      const device = (studentId) => farm.device(studentId);

      // THE LOBBY: everyone already waiting, joined and calibrated.
      await Promise.all(lobby.map(async (studentId) => device(studentId).open(await inviteOf(studentId))));
      await waitUntil(`${label}: the lobby did not fill`, async () => (await publicPlayers(roomId)).filter((row) => row.joined).length === lobby.length, 30_000, 250);
      await waitUntil(`${label}: lobby clocks`, async () => [...(await farm.views()).values()].filter((view) => lobby.includes(view.studentId)).every((view) => view.clockReady), 30_000);

      // START: one authoritative room write; nothing else tells a device to go.
      await teacherCall(entry, 'startLiveChallenge', { roomId });
      const started = await roomOf(roomId);
      const startsAtMs = millis(started.startsAt);
      const countdownJoinersOpenedAt = Date.now();
      await Promise.all([
        // Several students open the game during the countdown.
        ...joinsDuringCountdown.map(async (studentId) => device(studentId).open(await inviteOf(studentId))),
        // One drops off the network just before zero and comes back after it.
        at(startsAtMs - 400, () => device(offlineAtZero).goOffline()),
        at(startsAtMs + 2_500, () => device(offlineAtZero).goOnline()),
        // A backgrounded Chromebook is frozen through zero, then woken.
        at(startsAtMs - 1_500, () => device(backgrounded).freeze()),
        at(startsAtMs + 2_000, () => device(backgrounded).thaw()),
        // A listener that only attaches once the round is already running.
        at(startsAtMs + 1_500, async () => device(lateListener).open(await inviteOf(lateListener))),
        // A refresh mid-round: a new page, the same tab's storage.
        at(startsAtMs + 1_000, () => device(refreshesAfterRunning).refresh()),
      ]);
      assert.ok(countdownJoinersOpenedAt < startsAtMs, `${label}: the countdown joiners opened during the countdown`);

      await playRounds(entry, farm, roomId);
      const privateAtLastClose = await privatePlayers(roomId);
      await teacherCall(entry, 'finishLiveChallenge', { roomId });
      const views = await waitUntil(`${label}: not every screen reached the finished game`, async () => {
        const all = await farm.views();
        return [...all.values()].every((view) => view.room?.status === 'finished' && view.stage === CHALLENGE_STAGE.COMPLETED && view.standings?.kind === 'final' && view.playerCount === size) ? all : null;
      }, 30_000, 250);
      const gameMs = Date.now() - gameStartedAt;

      assertEveryDevicePlayed(views, roomId, label);
      const totals = await assertMatchIntegrity(farm, roomId, entry, views, label, privateAtLastClose);
      const standings = assertBoundedStandings(views, { label, gameMs, host, size });
      // A constant listener set per screen — room, standings snapshot, own row,
      // own summary (no invite listener here) — and never a classmate's row.
      const census = await farm.listeners();
      assert.deepEqual({ room: census.room, standings: census.standings, self: census.self, summary: census.summary, players: census.players }, { room: size, standings: size, self: size, summary: size, players: 0 }, `${label}: one room, one standings, one own-row and one own-summary listener per screen, and no player-row listener: ${JSON.stringify(census)}`);
      assert.ok(totals.secondAnswersRefused >= 1, `${label}: a second answer for a round is refused, never scored`);
      assert.ok(totals.duplicateReplies >= 1, `${label}: an answer resent after a lost reply is recognised as the same answer`);

      // RECOVERY CASES, by what each device saw.
      const seen = (studentId) => seenOf(views.get(studentId), roomId);
      assert.equal(seen(lateListener).countdownSeen.includes(0), false, `${label}: the late listener never saw round 1's countdown`);
      assert.ok(seen(lateListener).rounds[0], `${label}: ...and played round 1 anyway, from the running room`);
      assert.ok(seen(offlineAtZero).rounds[0], `${label}: the student offline at zero played round 1`);
      assert.ok(seen(backgrounded).rounds[0], `${label}: the backgrounded Chromebook played round 1`);
      assert.ok(seen(refreshesAfterRunning).rounds[0], `${label}: the refreshed page came back to round 1`);
      joinsDuringCountdown.concat(lateListener).forEach((studentId) => {
        assert.equal(privateAtLastClose.find((row) => row.studentId === studentId)?.joinedAtRound, 0, `${label}: ${studentId} joined round 1 (during its countdown, or while it ran)`);
      });

      // DIAGNOSTICS: what support would read for each device, and its cost.
      const { rows, maxBytes } = await assertDiagnosticsBounded(roomId, label);
      const keyOf = (studentId) => views.get(studentId).invite.playerKey;
      for (const view of views.values()) {
        const milestones = milestonesFor(rows, view.invite.playerKey);
        ['listener_attached', 'running_received', 'game_mounted'].forEach((event) => assert.ok(milestones[event], `${label}: ${view.studentId} reported ${event}`));
      }
      // The first countdown the late listener saw was a LATER round's: its
      // evidence shows round 1 ran without it ever seeing that countdown.
      assert.notEqual(milestonesFor(rows, keyOf(lateListener)).countdown_received?.roundIndex, 0, `${label}: the late listener's evidence says it never saw round 1's countdown`);
      assert.equal(milestonesFor(rows, keyOf(lateListener)).running_received?.roundIndex, 0, `${label}: ...and that it first heard the room running in round 1`);
      assert.ok(milestonesFor(rows, keyOf(offlineAtZero)).connection_lost && milestonesFor(rows, keyOf(offlineAtZero)).connection_restored, `${label}: the offline student's evidence shows the loss and the return`);
      const disrupted = new Set([offlineAtZero, backgrounded, refreshesAfterRunning, lateListener]);
      // A device that heard round 1 only once it was already running (a slow
      // link under a class's load, as the late listener does on purpose) first
      // hears a countdown in a later round. That milestone is new, so it rides
      // one more small batch, unless a heartbeat carried it first. Its own
      // evidence says so: the countdown it reported is not round 1's.
      const firstCountdownRound = (view) => milestonesFor(rows, keyOf(view.studentId)).countdown_received?.roundIndex;
      const heardALaterCountdown = new Set([...views.values()]
        .filter((view) => !disrupted.has(view.studentId) && Number.isInteger(firstCountdownRound(view)) && firstCountdownRound(view) > 0)
        .map((view) => view.studentId));
      for (const view of views.values()) {
        const budget = disrupted.has(view.studentId) ? 3 : heardALaterCountdown.has(view.studentId) ? 2 : 1;
        assert.ok(view.stats.launchOnlyRequests <= budget, `${label}: ${view.studentId} sent ${view.stats.launchOnlyRequests} launch-only diagnostic requests across ${ROUNDS} rounds (budget ${budget}; first countdown it reported: ${firstCountdownRound(view) ?? 'none'})`);
      }
      const launchOnly = sum(views, (view) => view.stats.launchOnlyRequests);
      assert.ok(launchOnly <= size + 2 * disrupted.size + heardALaterCountdown.size, `${label}: ${launchOnly} launch-only requests for ${size} students`);
      const ordinary = [...views.values()].filter((view) => !disrupted.has(view.studentId) && !joinsDuringCountdown.includes(view.studentId));

      report.sizes[size] = {
        devices: views.size,
        rounds: ROUNDS,
        workers: farm.workers,
        launchOnlyDiagnosticRequests: launchOnly,
        devicesThatFirstHeardALaterCountdown: heardALaterCountdown.size,
        presenceHeartbeats: sum(views, (view) => view.stats.heartbeatRequests),
        diagnosticWritesTotal: sum(views, (view) => view.stats.diagnosticWrites),
        maxDiagnosticRowBytes: maxBytes,
        roomSnapshotsDelivered: sum(views, (view) => view.stats.snapshots),
        worstRoomSnapshotLagMs: Math.max(...[...views.values()].map((view) => view.stats.roomLagMaxMs || 0)),
        submitCalls: sum(views, (view) => view.stats.requests.submitLiveChallengeResponse),
        answersScored: totals.scored,
        // Standings: snapshots per screen over the whole game (its bound), live
        // snapshots the host's pacer got written, listeners per screen.
        standings: { ...standings, gameMs, listenersPerScreen: Math.round((census.total / size) * 10) / 10 },
        duplicateRepliesAbsorbed: totals.duplicateReplies,
        secondAnswersRefused: totals.secondAnswersRefused,
        droppedAnswersRetried: totals.droppedThenRetried,
        answerRoundTripMs: percentiles(totals.answerMs),
        roomBytesAtLaunch: JSON.stringify(started).length,
        lobbyRoundOneOnScreenAfterZeroMsMax: Math.max(...ordinary.map((view) => seenOf(view, roomId).rounds[0].at - startsAtMs)),
        recovery: {
          offlineAtZeroOnScreenAfterZeroMs: seen(offlineAtZero).rounds[0].at - startsAtMs,
          backgroundedOnScreenAfterZeroMs: seen(backgrounded).rounds[0].at - startsAtMs,
          lateListenerOnScreenAfterZeroMs: seen(lateListener).rounds[0].at - startsAtMs,
          refreshedOnScreenAfterZeroMs: seen(refreshesAfterRunning).rounds[0].at - startsAtMs,
        },
      };
    } finally {
      await host.close();
      await farm.shutdown();
      assert.equal((await farm.listeners()).total, 0, `${label}: every listener a device opened was closed`);
      await farm.close();
    }
  });
}

/* ===== THE HOST STOPS PUBLISHING: the live board goes stale, nothing else ===== */

test('the host console stops publishing mid-game (asleep, offline, closed): every answer counts once and the standings at each close and the finish are exact', { timeout: 120_000 }, async () => {
  const size = 15;
  const entry = await seedClass(classFor('quiethost', size));
  const label = 'a quiet host';
  const roomId = await createGame(entry);
  const farm = await createDeviceFarm({ workers: WORKERS });
  const host = await openHost(entry, roomId);
  try {
    await Promise.all(entry.students.map((studentId, index) => farm.add(studentId, { deliveryJitterMs: 150, rttMs: Math.round(random() * 40), answer: index % 3 === 2 ? 'wrong' : 'correct', answerJitterMs: 1_200 })));
    await Promise.all(entry.students.map(async (studentId) => farm.device(studentId).open(await inviteOf(studentId))));
    await waitUntil(`${label}: lobby`, async () => (await publicPlayers(roomId)).filter((row) => row.joined).length === size
      && [...(await farm.views()).values()].every((view) => view.clockReady), 30_000, 250);
    await teacherCall(entry, 'startLiveChallenge', { roomId });
    // Round 1 with a live board; rounds 2 and 3 with the console gone quiet.
    let pausedAt = null;
    await playRounds(entry, farm, roomId, {
      beforeRound: async (roundIndex) => {
        if (roundIndex === 1) { host.pause(); pausedAt = Date.now(); }
      },
    });
    const privateAtLastClose = await privatePlayers(roomId);
    await teacherCall(entry, 'finishLiveChallenge', { roomId });
    const views = await waitUntil(`${label}: finished on every screen`, async () => {
      const all = await farm.views();
      return [...all.values()].every((view) => view.room?.status === 'finished' && view.standings?.kind === 'final') ? all : null;
    }, 30_000, 250);
    assertEveryDevicePlayed(views, roomId, label);
    await assertMatchIntegrity(farm, roomId, entry, views, label, privateAtLastClose);
    // The scenario did what it says: the console published in round 1 and
    // asked for nothing once it went quiet; only the closes and the finish
    // wrote standings after that, and every screen still ends exact (above).
    assert.ok(host.replies.some((reply) => reply.published === true && reply.sentAt < pausedAt), `${label}: the console published while it was awake (its replies: ${hostReplies(host)})`);
    assert.equal(host.requests.filter((at) => at > pausedAt).length, 0, `${label}: a quiet console still asked for live standings`);
  } finally {
    await host.close();
    await farm.shutdown();
    assert.equal((await farm.listeners()).total, 0, `${label}: every listener a device opened was closed`);
    await farm.close();
  }
});

/* ========== A GRAPH-RICH LAUNCH: Graph Feature Rush, graphs per player ========== */

test(`Graph Feature Rush, ${RUSH_CLASS} students: every device gets its own graphs at launch, offline-at-zero and late listener included`, { timeout: 120_000 }, async () => {
  const entry = await seedClass(classFor('rush', RUSH_CLASS));
  const roomId = await createGame(entry, { challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'algebra1Quick' }, standardCode: undefined, questionStyle: undefined });
  const lobby = entry.students.slice(0, -1);
  const lateListener = entry.students.at(-1);
  const farm = await createDeviceFarm({ workers: WORKERS });
  const host = await openHost(entry, roomId);
  try {
    await Promise.all(entry.students.map((studentId) => farm.add(studentId, { deliveryJitterMs: 300, rttMs: Math.round(random() * 40) })));
    await Promise.all(lobby.map(async (studentId) => farm.device(studentId).open(await inviteOf(studentId))));
    await waitUntil('rush lobby', async () => (await publicPlayers(roomId)).filter((row) => row.joined).length === lobby.length
      && [...(await farm.views()).values()].filter((view) => view.roomId).every((view) => view.clockReady), 30_000, 250);
    await teacherCall(entry, 'startLiveChallenge', { roomId });
    const started = await roomOf(roomId);
    const startsAtMs = millis(started.startsAt);
    await Promise.all([
      at(startsAtMs - 400, () => farm.device(lobby[0]).goOffline()),
      at(startsAtMs + 2_000, () => farm.device(lobby[0]).goOnline()),
      at(startsAtMs + 1_500, async () => farm.device(lateListener).open(await inviteOf(lateListener))),
    ]);
    const views = await waitUntil(async () => `rush graphs missing for ${[...(await farm.views()).values()].filter((view) => !seenOf(view, roomId)?.rounds?.[0]?.rushGraphs).map((view) => view.studentId).join(', ')}`,
      async () => {
        const all = await farm.views();
        return [...all.values()].every((view) => seenOf(view, roomId)?.rounds?.[0]?.rushGraphs > 0) ? all : null;
      }, 25_000, 250);
    // Both standings listeners are paused for the whole open rush round, on
    // every device, and the host publishes nothing while it is open.
    const during = await farm.listeners();
    assert.deepEqual({ standings: during.standings, self: during.self, players: during.players }, { standings: 0, self: 0, players: 0 }, `no standings listener is open during a rush round: ${JSON.stringify(during)}`);
    const publishedDuringRound = host.replies.filter((reply) => reply.published === true && reply.at >= startsAtMs).length;
    assert.equal(publishedDuringRound, 0, 'no live snapshot is written while a rush round is open');
    const payloads = [...views.values()].map((view) => seenOf(view, roomId).rounds[0].rushPayloadBytes);
    report.rush = {
      students: RUSH_CLASS,
      roomBytesAtLaunch: JSON.stringify(started).length,
      graphBatchBytesMax: Math.max(...payloads),
      graphBatchBytesTotal: payloads.reduce((total, bytes) => total + bytes, 0),
      roundFetches: sum(views, (view) => view.stats.requests.getGraphFeatureRushRound),
    };
    await teacherCall(entry, 'finishLiveChallenge', { roomId });
    const finished = await waitUntil('rush finished on every screen, with its final standings', async () => {
      const all = await farm.views();
      return [...all.values()].every((view) => view.room?.status === 'finished' && view.standings?.kind === 'final') ? all : null;
    }, 20_000);
    assert.equal((await publicPlayers(roomId)).length, RUSH_CLASS, 'one player per student');
    // The rush's final standings are its match result's, on every screen.
    const result = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data();
    const ranks = new Map(result.standings.filter((row) => row.rank !== null).map((row) => [row.playerKey, row.rank]));
    for (const view of finished.values()) assert.equal(view.standings.self?.rank, ranks.get(view.invite.playerKey), `rush: ${view.studentId}'s final place is the match result's`);
    await assertDiagnosticsBounded(roomId, 'rush');
  } finally {
    await host.close();
    await farm.shutdown();
    assert.equal((await farm.listeners()).total, 0, 'every rush listener was closed');
    await farm.close();
  }
});

/* ===== ENDURANCE: match after match on the same open screens, with jitter ===== */

test(`endurance: ${ENDURANCE_MATCHES} matches in a row for ${ENDURANCE_CLASS} students on unrefreshed screens, with jitter and disconnects`, { timeout: 60_000 + ENDURANCE_MATCHES * 90_000 }, async () => {
  const entry = await seedClass(classFor('endurance', ENDURANCE_CLASS));
  const farm = await createDeviceFarm({ workers: WORKERS });
  const heap = [];
  const listenerSamples = [];
  const answerMs = [];
  try {
    await Promise.all(entry.students.map((studentId, index) => farm.add(studentId, {
      deliveryJitterMs: 400, rttMs: Math.round(random() * 60), answer: index % 3 === 2 ? 'wrong' : 'correct', answerJitterMs: 1_500,
    })));
    // Every screen follows its student's invite pointer from match to match,
    // never refreshed, as a class does when the teacher plays again.
    await Promise.all(entry.students.map((studentId) => farm.device(studentId).followInvites()));
    for (let match = 0; match < ENDURANCE_MATCHES; match += 1) {
      // Each match ranks a different way — total points, round placements
      // (Grand Prix, its comeback curve included), correct answers — so every
      // strategy's live boards, closes and podium meet the same class.
      const scoringStrategyId = ENDURANCE_STRATEGIES[match % ENDURANCE_STRATEGIES.length];
      const label = `endurance match ${match + 1} (${scoringStrategyId})`;
      // eslint-disable-next-line no-await-in-loop
      const roomId = await createGame(entry, { scoringStrategyId });
      // eslint-disable-next-line no-await-in-loop
      const host = await openHost(entry, roomId);
      // eslint-disable-next-line no-await-in-loop
      await waitUntil(`${label}: not every screen followed its invite into the new lobby`, async () => [...(await farm.views()).values()].every((view) => view.roomId === roomId), 20_000);
      // eslint-disable-next-line no-await-in-loop
      await waitUntil(`${label}: lobby`, async () => (await publicPlayers(roomId)).filter((row) => row.joined).length === ENDURANCE_CLASS
        && [...(await farm.views()).values()].every((view) => view.clockReady), 30_000, 250);
      // eslint-disable-next-line no-await-in-loop
      await teacherCall(entry, 'startLiveChallenge', { roomId });
      // eslint-disable-next-line no-await-in-loop
      await playRounds(entry, farm, roomId, {
        // Two devices drop off around the start of every round, and come back.
        beforeRound: async (roundIndex, room) => {
          const startsAtMs = millis(room.startsAt);
          const dropped = [entry.students[(match * 7 + roundIndex * 3) % ENDURANCE_CLASS], entry.students[(match * 5 + roundIndex * 11 + 1) % ENDURANCE_CLASS]];
          await Promise.all([...new Set(dropped)].map((studentId, index) => at(startsAtMs - 300 + index * 900, () => farm.device(studentId).goOffline())
            .then(() => sleep(1_200 + Math.round(random() * 1_000)))
            .then(() => farm.device(studentId).goOnline())));
        },
      });
      // eslint-disable-next-line no-await-in-loop
      const privateAtLastClose = await privatePlayers(roomId);
      // eslint-disable-next-line no-await-in-loop
      await teacherCall(entry, 'finishLiveChallenge', { roomId });
      // eslint-disable-next-line no-await-in-loop
      const views = await waitUntil(`${label}: finished on every screen`, async () => {
        const all = await farm.views();
        return [...all.values()].every((view) => view.roomId === roomId && view.room?.status === 'finished' && view.standings?.kind === 'final' && view.playerCount === ENDURANCE_CLASS) ? all : null;
      }, 20_000, 250);
      // eslint-disable-next-line no-await-in-loop
      await host.close();
      assertEveryDevicePlayed(views, roomId, label);
      // eslint-disable-next-line no-await-in-loop
      const totals = await assertMatchIntegrity(farm, roomId, entry, views, label, privateAtLastClose);
      answerMs.push(...totals.answerMs);
      // eslint-disable-next-line no-await-in-loop
      await assertDiagnosticsBounded(roomId, label);
      // Nothing of an earlier match is on any screen.
      for (const view of views.values()) assert.equal(view.room.roomId, roomId, `${label}: ${view.studentId} shows a stale game`);
      // Per device: one room, one standings snapshot, one own-row and one
      // invite listener — never more, never a classmate's row.
      // eslint-disable-next-line no-await-in-loop
      const listeners = await farm.listeners();
      listenerSamples.push(listeners);
      assert.deepEqual(listeners, { room: ENDURANCE_CLASS, standings: ENDURANCE_CLASS, self: ENDURANCE_CLASS, summary: ENDURANCE_CLASS, players: 0, invite: ENDURANCE_CLASS, total: 5 * ENDURANCE_CLASS }, `${label}: one listener of each kind per device`);
      // eslint-disable-next-line no-await-in-loop
      heap.push(await farm.heapMb());
    }
    // A listener that attaches late to the last, finished match still reads it.
    const reader = entry.students[0];
    await farm.shutdown([reader]);
    await farm.add(reader, {});
    await farm.device(reader).open(await inviteOf(reader));
    await waitUntil('a late listener on the finished match, with its final standings', async () => {
      const view = (await farm.views()).get(reader);
      return view.room?.status === 'finished' && view.stage === CHALLENGE_STAGE.COMPLETED && view.standings?.kind === 'final' && view.standings.self?.rank >= 1;
    }, 10_000);
    // Memory: after a forced GC, the heap does not keep growing match after match.
    const growth = heap.at(-1) - heap[Math.min(1, heap.length - 1)];
    report.endurance = { matches: ENDURANCE_MATCHES, students: ENDURANCE_CLASS, workers: farm.workers, heapMbAfterEachMatch: heap, heapGrowthMbAfterWarmup: Math.round(growth * 10) / 10, listenersAfterEachMatch: listenerSamples, answerRoundTripMs: percentiles(answerMs) };
    assert.ok(growth < 48, `heap grew ${growth} MB from match 2 to match ${ENDURANCE_MATCHES}: ${heap.join(' → ')}`);
  } finally {
    await farm.shutdown();
    assert.equal((await farm.listeners()).total, 0, 'every endurance listener was closed');
    await farm.close();
    const active = (await db.collection('liveChallengeTeacherActive').doc(entry.teacher).get()).data()?.roomId;
    if (active) await teacherCall(entry, 'cancelLiveChallenge', { roomId: active }).catch(() => {});
  }
});

test('certification report', () => {
  if (process.env.LAUNCH_CERT_REPORT) writeFileSync(process.env.LAUNCH_CERT_REPORT, JSON.stringify(report, null, 2));
  console.log(`[launch-cert] ${JSON.stringify(report)}`);
  assert.equal(Object.keys(report.sizes).length, SIZES.length, 'every class size was certified');
  assert.ok(report.rush && report.endurance, 'the graph-rich launch and the endurance run were certified');
});
