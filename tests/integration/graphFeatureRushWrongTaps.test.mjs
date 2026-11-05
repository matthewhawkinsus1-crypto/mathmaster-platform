// Where wrong rush taps land, end to end (N42): a wrong tap on another feature
// of the graph, through the real callables, written to a real Firestore. Run
// through `npm run test:challenge-finish`.
//
// WHY. The rule is pure and unit tested
// (tests/platform/graphFeatureRushWrongTaps.test.mjs). What only the database
// shows is that the server's regenerated question names the feature, that the
// receipt it writes keeps it and the reply to the student's device does not,
// and that the class's wrong taps reach the teacher's report, grouped.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const rush = await import('../../functions/shared/graphFeatureRush.mjs');
const generator = await import('../../functions/shared/graphFeatureGenerator.mjs');
const hitTest = await import('../../functions/shared/graphFeatureHitTest.mjs');
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();

// Unique to this file: the integration files share one emulator in parallel.
const TEACHER = 'rush-taps-teacher@example.com';
const CLASS_ID = 'rush-taps-class';
const A = 'rush-taps-class-s01';

const teacher = (data) => ({
  auth: { uid: `${TEACHER}-uid`, token: { role: 'teacher', email: TEACHER, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const student = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId, email: `${studentId}@example.com`, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const call = (name, request) => functionsIndex[name].run(request);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const privatePlayer = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data() || null;

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: CLASS_ID, name: 'Wrong taps' });
await db.collection('grades').doc(A).set({ assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: CLASS_ID, firstName: 'Taps', lastName: 'Student' });

const identityOf = async (roomId) => {
  const room = await roomOf(roomId);
  return { roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken };
};
const waitForPace = async (roomId, studentId, questionIndex) => {
  const [room, player] = await Promise.all([roomOf(roomId), privatePlayer(roomId, studentId)]);
  const required = rush.rushNextAttemptRequiredMs({ receipts: player?.submissionReceipts || {}, roundIndex: Number(room.currentRound), questionIndex });
  const delay = (room.startsAt?.toMillis?.() || 0) + required + 50 - Date.now();
  if (delay > 0) await sleep(delay);
};
const submit = async (roomId, studentId, attempts) => call('submitGraphFeatureRushAttempts', student(studentId, { ...(await identityOf(roomId)), attempts }));

const created = await call('createLiveChallenge', teacher({
  classId: CLASS_ID, courseId: 'algebra1', challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'algebra1Quick' }, roundCount: 1, roundSeconds: 120,
}));
const G = created.roomId;
let tapped = null;

test('a wrong tap on another feature of the graph is a miss to the student and, on its receipt, the feature it landed on', async () => {
  await call('joinLiveChallenge', student(A, { roomId: G }));
  await call('startLiveChallenge', teacher({ roomId: G }));
  const room = await roomOf(G);
  await sleep(Math.max(0, (room.startsAt?.toMillis?.() || 0) - Date.now() + 30));
  // The server's own copy of the student's graphs, from the room's private seed.
  const { seed, config } = (await privateRef(G).get()).data().graphFeatureRush;
  for (let questionIndex = 0; questionIndex < 8 && !tapped; questionIndex += 1) {
    const server = generator.generateRushQuestion({ seed, studentKey: A, roundIndex: room.currentRound, questionIndex, config });
    const tolerance = hitTest.clampTolerance({ x: 0.3, y: 0.3 }, server.view);
    // Another feature, in view, out of reach of every target: a tap there is a miss.
    const candidate = Object.entries(server.graphFeatures || {})
      .filter(([featureId]) => featureId !== server.feature)
      .flatMap(([featureId, points]) => points.map((point) => ({ featureId, point })))
      .find(({ point }) => point.geometry !== 'line'
        && point.x >= server.view.xMin && point.x <= server.view.xMax && point.y >= server.view.yMin && point.y <= server.view.yMax
        && server.targets.every((target) => (hitTest.targetDistance(target, point, tolerance) ?? 99) > 1));
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(G, A, questionIndex);
    if (!candidate) {
      // eslint-disable-next-line no-await-in-loop
      await submit(G, A, [{ attemptId: randomUUID(), questionIndex, kind: 'skip', clientElapsedMs: 4_000 }]);
      continue;
    }
    const expected = rush.rushTapDiagnosis({ question: server, tap: candidate.point, tolerance });
    assert.ok(expected, 'the rule names a feature there');
    const attemptId = randomUUID();
    // eslint-disable-next-line no-await-in-loop
    const reply = await submit(G, A, [{ attemptId, questionIndex, kind: 'tap', x: candidate.point.x, y: candidate.point.y, tolerance, pointer: 'touch', clientElapsedMs: 4_000 }]);
    assert.deepEqual(reply.verdicts.map((row) => row.verdict), ['miss']);
    assert.doesNotMatch(JSON.stringify(reply), /diagnosis|graphFeatures/, 'the device is told it missed, never where the tap landed');
    // eslint-disable-next-line no-await-in-loop
    const receipt = (await privatePlayer(G, A)).submissionReceipts[attemptId];
    assert.equal(receipt.isCorrect, false);
    assert.equal(receipt.diagnosis, expected, 'the feature it landed on');
    assert.equal(receipt.feature, server.feature, 'beside what was asked');
    tapped = { asked: server.feature, feature: expected };
  }
  assert.ok(tapped, 'one of the first graphs had another feature to tap');
  // The student's public row carries counts, never the diagnosis.
  const player = (await roomRef(G).collection('players').get()).docs.map((doc) => doc.data());
  assert.doesNotMatch(JSON.stringify(player), /diagnosis/);
});

test('the class\'s wrong taps reach the teacher\'s report, grouped by what was asked and what was tapped', async () => {
  const identity = await identityOf(G);
  await call('closeLiveChallengeRound', teacher({ roomId: G, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion, force: true }));
  const closed = await identityOf(G);
  const finished = await call('advanceLiveChallenge', teacher({ roomId: G, expectedRoundIndex: closed.roundIndex, expectedRoundVersion: closed.roundVersion }));
  assert.equal(finished.status, 'finished');
  let report = null;
  for (let attempt = 0; attempt < 30 && !report; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    report = (await db.collection('liveChallengeReports').doc(G).get()).data() || null;
    // eslint-disable-next-line no-await-in-loop
    if (!report) await sleep(100);
  }
  const result = (await db.collection('liveChallengeMatchResults').doc(G).get()).data();
  const standing = result.standings.find((row) => row.studentId === A);
  assert.deepEqual(standing.questionSetSummary.wrongTaps, { [tapped.asked]: { [tapped.feature]: 1 } });
  assert.deepEqual(report.graphFeatureRush.wrongTaps, [{
    key: `${tapped.asked}:${tapped.feature}`,
    asked: tapped.asked,
    tapped: tapped.feature,
    count: 1,
    label: rush.wrongTapLabel(tapped.asked, tapped.feature),
  }]);
  assert.match(report.graphFeatureRush.wrongTaps[0].label, /^Tapped .+ when asked for .+$/);
});
