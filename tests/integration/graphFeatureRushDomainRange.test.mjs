// Graph Feature Rush's domains and ranges end to end: a ✓ Check through the
// real callables, written to a real Firestore. Run through
// `npm run test:challenge-finish`.
//
// WHY. Grading a drawn set is pure and unit tested
// (tests/platform/graphFeatureRushDomainRange.test.mjs). What only the
// database shows is that the receipt a check writes can be stored at all —
// Firestore refuses an array directly inside an array, and a drawing's dots
// were once [value, closed] pairs — and that a class's wrong checks reach the
// report as what they got wrong.

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
const sets = await import('../../functions/shared/numberLineSets.mjs');
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();

// Unique to this file: the integration files share one emulator in parallel.
const TEACHER = 'rush-dr-teacher@example.com';
const CLASS_ID = 'rush-dr-class';
const [A, B] = ['rush-dr-class-s01', 'rush-dr-class-s02'];

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

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: CLASS_ID, name: 'Domain and range pair' });
await Promise.all([A, B].map((studentId, index) => db.collection('grades').doc(studentId).set({
  assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: CLASS_ID, firstName: `Range${index + 1}`, lastName: 'Student',
})));

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
const checkOf = (question, set) => ({
  attemptId: randomUUID(), questionIndex: question.questionIndex, kind: 'check', drawing: sets.drawingToPlain(sets.drawingForSet(set)), clientElapsedMs: 4_000,
});
// A set no generated domain or range is: half-number ends come only from views
// too small to reach −9.5, and a wider view's ends are whole numbers.
const WRONG_DRAWING = Object.freeze({ points: [{ value: -9.5, closed: true }, { value: -8.5, closed: true }], left: false, right: false });
const wrongCheck = (question) => ({ attemptId: randomUUID(), questionIndex: question.questionIndex, kind: 'check', drawing: WRONG_DRAWING, clientElapsedMs: 4_000 });
const submit = async (roomId, studentId, attempts) => call('submitGraphFeatureRushAttempts', student(studentId, { ...(await identityOf(roomId)), attempts }));
const fetchItems = async (roomId, studentId, count = 4) => call('getGraphFeatureRushRound', student(studentId, { ...(await identityOf(roomId)), count }));

const created = await call('createLiveChallenge', teacher({
  classId: CLASS_ID, courseId: 'algebra1', challengeMode: 'graphFeatureRush', graphFeatureRush: { presetId: 'domainRange' }, roundCount: 1, roundSeconds: 60,
}));
const G = created.roomId;

test('a Domain & Range Rush round asks for sets on the axes', async () => {
  await call('joinLiveChallenge', student(A, { roomId: G }));
  await call('joinLiveChallenge', student(B, { roomId: G }));
  await call('startLiveChallenge', teacher({ roomId: G }));
  const room = await roomOf(G);
  await sleep(Math.max(0, (room.startsAt?.toMillis?.() || 0) - Date.now() + 30));
  const { questions } = await fetchItems(G, A);
  assert.ok(questions.length > 0);
  assert.ok(questions.every((question) => question.targets.length === 1 && question.targets[0].geometry === 'set'));
});

test('a check is stored: right completes the graph, wrong is a miss recorded with its drawing and what was off', async () => {
  const [question] = (await fetchItems(G, A, 1)).questions;
  await waitForPace(G, A, question.questionIndex);
  const answer = sets.setFromPlain(question.targets[0].set);
  const result = await submit(G, A, [wrongCheck(question), checkOf(question, answer)]);
  assert.deepEqual(result.verdicts.map((row) => row.verdict), ['miss', 'hit'], JSON.stringify(result.verdicts));
  assert.equal(result.verdicts[1].completesQuestion, true);
  const receipts = Object.values((await privatePlayer(G, A)).submissionReceipts);
  const miss = receipts.find((receipt) => receipt.isCorrect === false);
  assert.deepEqual(miss.drawing, WRONG_DRAWING, 'the drawing as it was checked');
  assert.equal(typeof miss.diagnosis, 'string');
  assert.equal(receipts.filter((receipt) => receipt.completesQuestion === true).length, 1);
});

test('the third wrong check skips the graph on the server', async () => {
  const [question] = (await fetchItems(G, B, 1)).questions;
  const verdicts = [];
  for (let miss = 0; miss < 3; miss += 1) {
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(G, B, question.questionIndex);
    // eslint-disable-next-line no-await-in-loop
    verdicts.push(...(await submit(G, B, [wrongCheck(question)])).verdicts);
  }
  assert.deepEqual(verdicts.map((row) => row.verdict), ['miss', 'miss', 'miss']);
  assert.equal(verdicts[2].autoSkipped, true);
  assert.equal((await fetchItems(G, B, 1)).state.cursor, question.questionIndex + 1);
});

test('the class\'s wrong checks reach the report, counted by what they got wrong', async () => {
  const identity = await identityOf(G);
  await call('closeLiveChallengeRound', teacher({ roomId: G, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion, force: true }));
  const closed = await identityOf(G);
  const finished = await call('advanceLiveChallenge', teacher({ roomId: G, expectedRoundIndex: closed.roundIndex, expectedRoundVersion: closed.roundVersion }));
  assert.equal(finished.status, 'finished');
  let report = null;
  for (let attempt = 0; attempt < 20 && !report; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    report = (await db.collection('liveChallengeReports').doc(G).get()).data() || null;
    // eslint-disable-next-line no-await-in-loop
    if (!report) await sleep(100);
  }
  assert.ok(report?.graphFeatureRush);
  assert.ok(report.graphFeatureRush.byFeature.length > 0 && report.graphFeatureRush.byFeature.every((row) => ['domain', 'range'].includes(row.key)));
  const result = (await db.collection('liveChallengeMatchResults').doc(G).get()).data();
  const mistakes = result.standings.reduce((sum, standing) => sum + Object.values(standing.questionSetSummary?.mistakes || {}).reduce((total, count) => total + count, 0), 0);
  assert.equal(mistakes, 4, 'one wrong check for one student, three for the other');
});
