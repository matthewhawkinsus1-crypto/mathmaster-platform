// Inequality Graphing Rush end to end, through the real callables, against a
// real Firestore. Run through `npm run test:challenge-finish`.
//
// WHY. The game's mathematics and its attempts are pure and unit tested
// (tests/platform/inequalityRush.test.mjs). What only a database shows is that
// an inequality room plays on the rush's callables and lifecycle: each student
// gets their own inequalities from the room's private seed, a check is graded
// by the set it draws, "No solution" answers an item nothing satisfies, a slip
// is recorded as what it was, a round publishes its guide at its close, and the
// report carries the game's own breakdown.

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
const inequality = await import('../../functions/shared/inequalityRush.mjs');
const sets = await import('../../functions/shared/numberLineSets.mjs');
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();

// Unique to this file: the integration files share one emulator in parallel.
const TEACHER = 'ineq-teacher@example.com';
const CLASS_ID = 'ineq-class-pair';
const [A, B] = ['ineq-class-pair-s01', 'ineq-class-pair-s02'];

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
const failureOf = (promise) => promise.then(() => null, (error) => error);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const roomRef = (roomId) => db.collection('liveChallengeRooms').doc(roomId);
const privateRef = (roomId) => db.collection('liveChallengePrivate').doc(roomId);
const roomOf = async (roomId) => (await roomRef(roomId).get()).data() || {};
const privatePlayer = async (roomId, studentId) => (await privateRef(roomId).collection('players').doc(studentId).get()).data() || null;

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra2', period: CLASS_ID, name: 'Inequality pair' });
await Promise.all([A, B].map((studentId, index) => db.collection('grades').doc(studentId).set({
  assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: CLASS_ID, firstName: `Ineq${index + 1}`, lastName: 'Student',
})));

// Solving with a negative (the sign flip), and the kinds that have "no solution" at Standard.
const SETTINGS = { itemTypes: ['oneStep', 'compoundAnd', 'absolute'], difficulty: 'standard' };
const createGame = (extra = {}) => call('createLiveChallenge', teacher({
  classId: CLASS_ID,
  courseId: 'algebra2',
  challengeMode: 'inequalityRush',
  inequalityRush: SETTINGS,
  roundCount: 2,
  roundSeconds: 60,
  ...extra,
}));

const identityOf = async (roomId) => {
  const room = await roomOf(roomId);
  return { roomId, roundIndex: room.currentRound, roundVersion: room.roundVersion, roundToken: room.roundToken };
};
const waitForRoundStart = async (roomId) => {
  const room = await roomOf(roomId);
  const delay = Math.max(0, (room.startsAt?.toMillis?.() || 0) - Date.now() + 30);
  if (delay) await sleep(delay);
};
// As a real device paces its answers (SI08; graphFeatureRush.mjs rushRoundPace).
const waitForPace = async (roomId, studentId, questionIndex) => {
  const [room, player] = await Promise.all([roomOf(roomId), privatePlayer(roomId, studentId)]);
  const required = rush.rushNextAttemptRequiredMs({ receipts: player?.submissionReceipts || {}, roundIndex: Number(room.currentRound), questionIndex });
  const delay = (room.startsAt?.toMillis?.() || 0) + required + 50 - Date.now();
  if (delay > 0) await sleep(delay);
};

const checkOf = (question, set) => ({
  attemptId: randomUUID(), questionIndex: question.questionIndex, kind: 'check', drawing: sets.drawingToPlain(sets.drawingForSet(set)), clientElapsedMs: 4_000,
});
const noSolution = (question) => ({ attemptId: randomUUID(), questionIndex: question.questionIndex, kind: 'dne', clientElapsedMs: 4_000 });
const answerOf = (question) => (question.targets.length ? checkOf(question, sets.setFromPlain(question.targets[0].set)) : noSolution(question));
// Never an answer: no item's solution set is the single number 9.
const wrongOf = (question) => checkOf(question, sets.pointSet(9));

const submit = async (roomId, studentId, attempts) => call('submitGraphFeatureRushAttempts', student(studentId, { ...(await identityOf(roomId)), attempts }));
const fetchItems = async (roomId, studentId, count = 6) => call('getGraphFeatureRushRound', student(studentId, { ...(await identityOf(roomId)), count }));

const closeRound = async (roomId) => {
  const identity = await identityOf(roomId);
  return call('closeLiveChallengeRound', teacher({ roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion, force: true }));
};
const advance = async (roomId) => {
  const identity = await identityOf(roomId);
  return call('advanceLiveChallenge', teacher({ roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion }));
};
const publishedGuide = async (roomId, roundIndex) => (await roomRef(roomId).collection('solutions').doc(String(roundIndex)).get()).data() || null;

/* ============================ one game, two students ============================ */

const game = await createGame();
const G = game.roomId;

test('an inequality lobby is a Live Challenge room with its settings, and the seed stays private', async () => {
  const room = await roomOf(G);
  assert.equal(room.status, 'lobby');
  assert.equal(room.challengeMode, 'inequalityRush');
  assert.equal(room.scoringStrategyId, 'grandPrix');
  assert.deepEqual(room.inequalityRush.config.itemTypes, ['compoundAnd', 'oneStep', 'absolute']);
  assert.equal(room.inequalityRush.config.difficulty, 'standard');
  assert.equal(room.inequalityRush.generatorVersion, inequality.INEQUALITY_GENERATOR_VERSION);
  assert.ok(!('seed' in room.inequalityRush), 'the seed never reaches a client-readable document');
  const secret = (await privateRef(G).get()).data();
  assert.ok(secret.inequalityRush.seed);
  assert.equal(secret.scoringConfig.placementCurve, 'field');
  assert.deepEqual(secret.questionIds, ['inequalityRush:round:1', 'inequalityRush:round:2']);
});

test('a round opens with a card, never an inequality, and its guide is kept until the round closes', async () => {
  await call('joinLiveChallenge', student(A, { roomId: G }));
  await call('joinLiveChallenge', student(B, { roomId: G }));
  const early = await call('getGraphFeatureRushRound', student(A, { roomId: G, roundIndex: 0 }));
  assert.equal(early.roundOpen, false);
  await call('startLiveChallenge', teacher({ roomId: G }));
  const room = await roomOf(G);
  assert.equal(room.currentQuestion.kind, 'inequalityRush');
  assert.deepEqual(room.currentQuestion.itemTypes, ['compoundAnd', 'oneStep', 'absolute']);
  assert.ok(!('targets' in room.currentQuestion) && !('inequality' in room.currentQuestion), 'the projector never sees an item or an answer');
  const secret = (await privateRef(G).get()).data();
  assert.equal(secret.roundSolutions['0'].guide, true);
  assert.equal(secret.roundSolutions['0'].guideTitle, 'How to graph inequalities');
  assert.equal(await publishedGuide(G, 0), null);
});

test('each student gets their own inequalities, on a number line, the same every time they ask', async () => {
  await waitForRoundStart(G);
  const a = await fetchItems(G, A);
  const b = await fetchItems(G, B);
  assert.equal(a.questions.length, 6);
  assert.ok(a.questions.every((question) => question.kind === 'inequality' && question.numberLine.min === -10 && question.numberLine.max === 10));
  assert.notDeepEqual(a.questions.map((question) => question.inequality), b.questions.map((question) => question.inequality));
  // The same six slots for both, in their own order.
  assert.deepEqual(a.questions.map((question) => question.family).sort(), b.questions.map((question) => question.family).sort());
  assert.deepEqual((await fetchItems(G, A)).questions, a.questions);
});

test('a check is graded by its set, a forgotten flip is recorded as one, and "No solution" answers an item with none', async () => {
  // The server's own items for A, from the room's seed: where the first flip
  // and the first item with no solution come (both appear early at Standard).
  const { seed, config } = (await privateRef(G).get()).data().inequalityRush;
  const items = Array.from({ length: 150 }, (_, questionIndex) => inequality.generateInequalityQuestion({ seed, studentKey: A, roundIndex: 0, questionIndex, config }));
  const flipAt = items.findIndex((item) => item.flipSet);
  const noneAt = items.findIndex((item) => item.targets.length === 0);
  assert.ok(flipAt >= 0 && noneAt >= 0, 'a Standard game asks both');
  let fetched = [];
  for (let index = 0; index <= Math.max(flipAt, noneAt); index += 1) {
    if (!fetched.some((question) => question.questionIndex === index)) {
      // eslint-disable-next-line no-await-in-loop
      fetched = (await fetchItems(G, A, 8)).questions;
    }
    const question = fetched.find((entry) => entry.questionIndex === index);
    assert.deepEqual(question.targets, inequality.publicInequalityQuestion(items[index]).targets, 'the device gets the server\'s own item');
    const attempts = [];
    if (index === flipAt) attempts.push(checkOf(question, sets.setFromPlain(question.flipSet)));
    if (index === noneAt) attempts.push(wrongOf(question));
    attempts.push(answerOf(question));
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(G, A, index);
    // eslint-disable-next-line no-await-in-loop
    const result = await submit(G, A, attempts);
    assert.equal(result.verdicts.at(-1).completesQuestion, true, `${question.inequality}: ${JSON.stringify(result.verdicts)}`);
    if (attempts.length > 1) assert.equal(result.verdicts[0].verdict, 'miss');
    if (index === 0) {
      const replay = await submit(G, A, attempts);
      assert.equal(replay.recorded, 0, 'a retried batch is a replay');
    }
  }
  const receipts = Object.values((await privatePlayer(G, A)).submissionReceipts);
  const slip = receipts.find((receipt) => receipt.questionIndex === flipAt && receipt.isCorrect === false);
  assert.equal(slip.diagnosis, 'signFlip', 'the teacher\'s report counts the slip for what it was');
  assert.equal(slip.attemptKind, 'check');
  const pressed = receipts.find((receipt) => receipt.questionIndex === noneAt && receipt.isCorrect === true);
  assert.equal(pressed.attemptKind, 'dne', '"No solution" completed the item with none');
  assert.equal(receipts.filter((receipt) => receipt.completesQuestion === true).length, Math.max(flipAt, noneAt) + 1);
  // On an item that has solutions, "No solution" is a miss.
  const next = (await fetchItems(G, A, 1)).questions[0];
  if (next.targets.length) {
    await waitForPace(G, A, next.questionIndex);
    assert.equal((await submit(G, A, [noSolution(next)])).verdicts[0].verdict, 'miss');
  }
});

test('three wrong answers skip an item on the server, and the student resumes on the next', async () => {
  const [question] = (await fetchItems(G, B, 1)).questions;
  const verdicts = [];
  for (let miss = 0; miss < 3; miss += 1) {
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(G, B, question.questionIndex);
    // eslint-disable-next-line no-await-in-loop
    verdicts.push(...(await submit(G, B, [wrongOf(question)])).verdicts);
  }
  assert.deepEqual(verdicts.map((row) => row.verdict), ['miss', 'miss', 'miss']);
  assert.equal(verdicts[2].autoSkipped, true);
  const resumed = await fetchItems(G, B, 1);
  assert.equal(resumed.state.cursor, question.questionIndex + 1);
});

test('the round closes into results and publishes its guide to graphing inequalities', async () => {
  await closeRound(G);
  const round = (await roomRef(G).collection('hostRounds').doc('0').get()).data();
  assert.equal(round.fieldSize, 2);
  assert.ok(round.standings[0].completed >= round.standings[1].completed);
  let guide = null;
  for (let attempt = 0; attempt < 20 && !guide; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    guide = await publishedGuide(G, 0);
    // eslint-disable-next-line no-await-in-loop
    if (!guide) await sleep(100);
  }
  assert.equal(guide?.guide, true);
  assert.equal(guide.guideTitle, 'How to graph inequalities');
  assert.ok(guide.solutionReview.reasoning.some((line) => /flips the sign/.test(line)));
});

test('the last round finishes the match, and the report breaks it down by kind of inequality', async () => {
  await advance(G);
  await waitForRoundStart(G);
  for (const studentId of [A, B]) {
    // eslint-disable-next-line no-await-in-loop
    const { questions } = await fetchItems(G, studentId, 2);
    for (const question of questions) {
      // eslint-disable-next-line no-await-in-loop
      await waitForPace(G, studentId, question.questionIndex);
      // eslint-disable-next-line no-await-in-loop
      await submit(G, studentId, [answerOf(question)]);
    }
  }
  await closeRound(G);
  const finished = await advance(G);
  assert.equal(finished.status, 'finished');
  const result = (await db.collection('liveChallengeMatchResults').doc(G).get()).data();
  assert.equal(result.modeId, 'inequalityRush');
  let report = null;
  for (let attempt = 0; attempt < 20 && !report; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    report = (await db.collection('liveChallengeReports').doc(G).get()).data() || null;
    // eslint-disable-next-line no-await-in-loop
    if (!report) await sleep(100);
  }
  assert.ok(report?.inequalityRush, 'the report carries the game\'s breakdown under its own key');
  assert.equal(report.graphFeatureRush, undefined);
  const labels = report.inequalityRush.byFamily.map((row) => row.label);
  assert.ok(labels.every((label) => ['Compound "and"', 'Solve first: one step', 'Absolute value (Algebra II)'].includes(label)), labels.join(', '));
  assert.ok(report.inequalityRush.mistakes.some((row) => row.key === 'signFlip' && row.label === 'Did not flip the sign'));
  assert.ok(report.inequalityRush.doesNotExist.correct >= 1);
  assert.equal(report.classAccuracyPercent, report.inequalityRush.accuracyPercent);
  assert.deepEqual((await roomOf(G)).revealedSolutionRounds, [0, 1]);
});

/* =============================== refusals, preview =============================== */

test('settings with nothing to ask are refused at create, with the reason', async () => {
  const empty = await failureOf(createGame({ inequalityRush: { itemTypes: [] } }));
  assert.equal(empty?.code, 'invalid-argument');
  assert.match(empty.message, /at least one kind of inequality/);
});

test('a room created under another generator refuses to play rather than grade an item the student never saw', async () => {
  const created = await createGame({ roundCount: 1 });
  try {
    await call('joinLiveChallenge', student(A, { roomId: created.roomId }));
    await call('startLiveChallenge', teacher({ roomId: created.roomId }));
    await privateRef(created.roomId).set({ inequalityRush: { generatorVersion: 0 } }, { merge: true });
    const refused = await failureOf(call('getGraphFeatureRushRound', student(A, { roomId: created.roomId, roundIndex: 0 })));
    assert.equal(refused?.code, 'failed-precondition');
    assert.match(refused.message, /This Inequality Graphing Rush was created before an update/);
  } finally {
    await call('finishLiveChallenge', teacher({ roomId: created.roomId }));
  }
});

test('a teacher previews sample inequalities without creating anything; a student cannot', async () => {
  const preview = await call('previewInequalityRush', teacher({ inequalityRush: { presetId: 'everything' }, count: 6 }));
  assert.equal(preview.questions.length, 6);
  assert.ok(preview.questions.every((question) => question.kind === 'inequality' && typeof question.inequality === 'string'));
  assert.equal(preview.config.presetId, 'everything');
  const refused = await failureOf(call('previewInequalityRush', teacher({ inequalityRush: { itemTypes: [] } })));
  assert.equal(refused?.code, 'invalid-argument');
  assert.ok(await failureOf(call('previewInequalityRush', student(A, {}))), 'students cannot preview');
});
