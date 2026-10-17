// Graph the Line end to end, through the real callables, against a real
// Firestore. Run through `npm run test:challenge-finish`.
//
// WHY. The game's rules are pure and unit tested (lineGraph*.test.mjs). What
// only a database shows is that the callables apply them inside transactions
// on the engine's lifecycle: a mode still in preview launches for the
// administrator only; each student gets their own items (or, in Classic, the
// class the same one); a line is checked the moment it is drawn and recorded
// once however a batch is retried; three misses end an item; a refresh
// resumes where the student was; a Sprint round is ready to close when
// everyone has worked through it (and each student's public row says when
// they have), and the engine ranks it; the finished match writes the report
// by form, item type and mistake; a Classic round the class graphed together
// publishes its line and the class's most common mistake — only once it has
// closed; and extended time never holds a round no answer can reach.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as Q from '../../functions/shared/graphFeatureRational.mjs';
import { latticePointsInView, slopeOf, yInterceptOf } from '../../functions/shared/lineGraphMath.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const { ROOT_ADMIN_EMAIL } = require(path.join(repo, 'functions/shared/rolePolicyIdentity.cjs'));
const db = admin.firestore();

// Unique to this file: the integration files share one emulator in parallel.
// While the modes are in preview only the administrator can launch them, so
// the games here are the administrator's (one at a time: one active room per
// teacher), and a regular teacher's class shows the refusal.
const TEACHER = 'line-teacher@example.com';
const CLASSES = {
  sprint: { id: 'line-class-sprint', size: 3, teacher: ROOT_ADMIN_EMAIL },
  classic: { id: 'line-class-classic', size: 3, teacher: ROOT_ADMIN_EMAIL },
  regular: { id: 'line-class-regular', size: 2, teacher: TEACHER },
  extended: { id: 'line-class-extended', size: 2, teacher: ROOT_ADMIN_EMAIL },
};
const studentsOf = (key) => Array.from({ length: CLASSES[key].size }, (_, index) => `${CLASSES[key].id}-s${index + 1}`);

const teacherAs = (email) => (data) => ({
  auth: { uid: `${email}-uid`, token: { role: 'teacher', email, email_verified: true } },
  data,
  rawRequest: { headers: {} },
});
const administrator = teacherAs(ROOT_ADMIN_EMAIL);
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
const publicRow = async (roomId, studentId) => {
  const { playerKey } = await privatePlayer(roomId, studentId);
  return (await roomRef(roomId).collection('players').doc(playerKey).get()).data() || null;
};

for (const entry of Object.values(CLASSES)) {
  // eslint-disable-next-line no-await-in-loop
  await db.collection('classes').doc(entry.id).set({ teacherOfRecord: entry.teacher, status: 'active', course: 'algebra1', period: entry.id, name: `Lines ${entry.id}` });
}
for (const key of Object.keys(CLASSES)) {
  const batch = db.batch();
  studentsOf(key).forEach((studentId, index) => batch.set(db.collection('grades').doc(studentId), {
    assignedTeacherEmail: CLASSES[key].teacher, classId: CLASSES[key].id, classPeriod: CLASSES[key].id, firstName: `Line${index + 1}`, lastName: 'Student',
    // The extended-time class's second student has extra time on their plan (1.5×).
    ...(key === 'extended' && index === 1 ? { profile: { accommodations: ['extra-time'] } } : {}),
  }));
  // eslint-disable-next-line no-await-in-loop
  await batch.commit();
}

/* ------------------------------- playing -------------------------------- */

const createLine = (classKey, challengeMode, lineGraph = {}, extra = {}) => call('createLiveChallenge', teacherAs(CLASSES[classKey].teacher)({
  classId: CLASSES[classKey].id,
  courseId: 'algebra1',
  challengeMode,
  lineGraph: { presetId: 'allThreeForms', ...lineGraph },
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

// What a student who knows the answer sends for an item.
const rightAttempt = (item) => {
  const base = { attemptId: randomUUID(), questionIndex: item.questionIndex, clientElapsedMs: 4_000 };
  if (item.answerStyle === 'choice') return { ...base, kind: 'choice', choice: item.answerChoice };
  if (item.answerStyle === 'build') {
    const m = Q.format(slopeOf(item.line));
    if (item.build.form === 'standard') return { ...base, kind: 'equation', fields: { A: String(item.line.a), B: String(item.line.b), C: String(item.line.c) } };
    if (item.build.form === 'pointSlope') return { ...base, kind: 'equation', fields: { x1: String(item.marked.x), y1: String(item.marked.y), m } };
    return { ...base, kind: 'equation', fields: { m, b: Q.format(yInterceptOf(item.line)) } };
  }
  const [p, q] = latticePointsInView(item.line, item.view);
  return { ...base, kind: 'line', points: [p, q] };
};

// A wrong line, different for each n: from a grid point of the line, a step
// off it that stays on the grid.
const WRONG_STEPS = [[1, 1], [1, -1], [2, 1], [1, 2], [-1, 2], [2, -1], [1, 3], [3, 1]];
const wrongLine = (item, n = 0) => {
  const [p] = latticePointsInView(item.line, item.view, { inset: 2 });
  const slope = slopeOf(item.line);
  const usable = WRONG_STEPS
    .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy, dx, dy }))
    .filter(({ x, y, dx, dy }) => (slope ? !Q.eq(Q.rat(dy, dx), slope) : dx !== 0) && Math.abs(x) <= item.view.xMax && Math.abs(y) <= item.view.yMax);
  const q = usable[n];
  return { attemptId: randomUUID(), questionIndex: item.questionIndex, kind: 'line', points: [p, { x: q.x, y: q.y }], clientElapsedMs: 3_000 };
};

const fetchItems = async (roomId, studentId, extra = {}) => call('getLineGraphRound', student(studentId, { ...(await identityOf(roomId)), count: 8, ...extra }));
const submit = async (roomId, studentId, attempts) => call('submitLineGraphAttempts', student(studentId, { ...(await identityOf(roomId)), attempts }));

/* ========================== the preview gate ========================== */

test('a game still in preview launches for the platform administrator only', async () => {
  for (const mode of ['lineGraphClassic', 'lineGraphSprint', 'lineGraphRush']) {
    // eslint-disable-next-line no-await-in-loop
    const refused = await failureOf(createLine('regular', mode));
    assert.equal(refused?.code, 'failed-precondition', mode);
    assert.match(refused.message, /still in preview/);
  }
  const rooms = await db.collection('liveChallengeRooms').where('classId', '==', CLASSES.regular.id).get();
  assert.equal(rooms.size, 0, 'nothing was created');
});

/* ================= GAME 1: a Sprint of five, three students ================= */

const [A, B, C] = studentsOf('sprint');
const sprint = await createLine('sprint', 'lineGraphSprint', { itemTypes: ['graph'], sprintLength: 5, triesPerItem: 3 }, { roundCount: 2, roundSeconds: 120 });
const S = sprint.roomId;

test('a Sprint lobby carries its settings, and its seed stays on the server', async () => {
  const room = await roomOf(S);
  assert.equal(room.status, 'lobby');
  assert.equal(room.challengeMode, 'lineGraphSprint');
  assert.equal(room.scoringStrategyId, 'grandPrix');
  assert.equal(room.roundCount, 2);
  assert.equal(room.roundSeconds, 120);
  assert.equal(room.lineGraph.config.format, 'sprint');
  assert.equal(room.lineGraph.config.sprintLength, 5);
  assert.ok(!('seed' in room.lineGraph), 'the seed never reaches a client-readable document');
  const secret = (await privateRef(S).get()).data();
  assert.ok(secret.lineGraph.seed);
  assert.equal(secret.scoringConfig.placementCurve, 'field');
  assert.deepEqual(secret.questionIds, ['lineGraph:round:1', 'lineGraph:round:2']);
  assert.deepEqual(Object.values(secret.roundStandards), ['', ''], 'no standard per round: no evidence until outcomes can feed it');
});

test('a round opens with a card, never an equation, and students get their own items', async () => {
  await Promise.all([A, B, C].map((studentId) => call('joinLiveChallenge', student(studentId, { roomId: S }))));
  const early = await call('getLineGraphRound', student(A, { roomId: S, roundIndex: 0 }));
  assert.equal(early.roundOpen, false);
  assert.deepEqual(early.questions, []);
  await call('startLiveChallenge', administrator({ roomId: S }));
  const room = await roomOf(S);
  assert.equal(room.roundState, 'open');
  assert.equal(room.currentQuestion.kind, 'lineGraph');
  assert.equal(room.currentQuestion.roundQuestionCount, 5);
  assert.ok(!('line' in room.currentQuestion) && !('equation' in room.currentQuestion), 'the projector never sees an item');
  await waitForRoundStart(S);
  const [a, b] = await Promise.all([fetchItems(S, A), fetchItems(S, B)]);
  assert.equal(a.poolSize, 5, 'the room\'s Sprint length');
  assert.equal(a.questions.length, 5);
  assert.ok(a.questions.some((item, index) => JSON.stringify(item.line) !== JSON.stringify(b.questions[index].line)), 'neighbours see different lines');
  assert.ok(a.questions.every((item) => item.equation && item.equation.text), 'Graph it items carry their equation');
});

test('a line is checked the moment it is drawn; the same wrong line again is not a second miss', async () => {
  const { questions } = await fetchItems(S, A);
  const wrong = wrongLine(questions[0]);
  const missed = await submit(S, A, [wrong]);
  assert.equal(missed.verdicts[0].verdict, 'incorrect');
  assert.ok(missed.verdicts[0].diagnosis);
  assert.equal(missed.recorded, 1);
  const same = await submit(S, A, [{ ...wrong, attemptId: randomUUID() }]);
  assert.equal(same.verdicts[0].verdict, 'repeated');
  assert.equal(same.recorded, 0);
  // A retried batch replays: nothing is recorded twice.
  const retried = await submit(S, A, [wrong]);
  assert.equal(retried.verdicts[0].replay, true);
  assert.equal(retried.recorded, 0);
  const receipts = (await privatePlayer(S, A)).submissionReceipts;
  assert.equal(Object.keys(receipts).length, 1);
  assert.equal(Object.values(receipts)[0].roundQuestionCount, 5);
});

test('a student works through the Sprint; past the end nothing is taken', async () => {
  const { questions } = await fetchItems(S, A);
  const outcome = await submit(S, A, questions.map(rightAttempt));
  assert.deepEqual(outcome.verdicts.map((row) => row.verdict), ['correct', 'correct', 'correct', 'correct', 'correct']);
  assert.equal(outcome.state.finished, true);
  assert.equal(outcome.state.questionsCorrect, 5);
  const beyond = await submit(S, A, [{ ...rightAttempt(questions[0]), questionIndex: 5 }]);
  assert.equal(beyond.verdicts[0].verdict, 'invalid');
  const row = await publicRow(S, A);
  assert.equal(row.rushRound, 0);
  assert.equal(row.rushRoundCompleted, 5, "the race board's count");
  assert.equal(row.rushRoundFinished, true, 'the host counts A as finished: the round may close early');
  assert.ok(!('submissionReceipts' in row) && !('studentId' in row), 'no answers or ids on the public row');
});

test('three wrong lines end an item, and a refresh resumes on the next one', async () => {
  const { questions } = await fetchItems(S, B);
  const outcomes = [];
  for (let n = 0; n < 3; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    outcomes.push(await submit(S, B, [wrongLine(questions[0], n)]));
  }
  assert.deepEqual(outcomes.map((outcome) => outcome.verdicts[0].revealed), [false, false, true]);
  assert.equal((await publicRow(S, B)).rushRoundFinished, false, 'one item done is not the round');
  // A refresh: where does B stand?
  const resumed = await fetchItems(S, B);
  assert.equal(resumed.state.cursor, 1);
  assert.equal(resumed.state.cursorMisses, 0);
  assert.equal(resumed.questions[0].questionIndex, 1);
  const done = await submit(S, B, resumed.questions.map(rightAttempt));
  assert.equal(done.state.finished, true);
  assert.equal(done.state.questionsCorrect, 4);
  assert.equal(done.state.ended, 1);
});

test('the round is ready to close once everyone has finished, and the engine ranks it', async () => {
  const { questions } = await fetchItems(S, C);
  await submit(S, C, questions.map(rightAttempt));
  const identity = await identityOf(S);
  // No force: every joined student has worked through the round.
  await call('closeLiveChallengeRound', administrator({ roomId: S, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion }));
  assert.equal((await roomOf(S)).roundState, 'closed');
  const result = (await roomRef(S).collection('hostRounds').doc('0').get()).data();
  const keyOf = async (studentId) => (await privatePlayer(S, studentId)).playerKey;
  const order = result.standings.map((row) => row.playerKey);
  // C: five clean. A: five, one miss. B: four, three misses.
  assert.deepEqual(order, [await keyOf(C), await keyOf(A), await keyOf(B)]);
  const lastRound = (await publicRow(S, B)).lastRound;
  assert.equal(lastRound.completed, 4);
  assert.equal(lastRound.fieldSize, 3);
});

test('the last round finishes the match, and the report breaks it down by form, item type and mistake', async () => {
  await call('advanceLiveChallenge', administrator({ roomId: S, ...(({ roundIndex, roundVersion }) => ({ expectedRoundIndex: roundIndex, expectedRoundVersion: roundVersion }))(await identityOf(S)) }));
  await waitForRoundStart(S);
  for (const studentId of [A, B, C]) {
    // eslint-disable-next-line no-await-in-loop
    const { questions } = await fetchItems(S, studentId);
    // eslint-disable-next-line no-await-in-loop
    await submit(S, studentId, [rightAttempt(questions[0])]);
  }
  const done = await call('finishLiveChallenge', administrator({ roomId: S }));
  assert.equal(done.status, 'finished');
  let report = null;
  for (let attempt = 0; attempt < 30 && !report?.lineGraph; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    report = (await db.collection('liveChallengeReports').doc(S).get()).data() || null;
    // eslint-disable-next-line no-await-in-loop
    if (!report?.lineGraph) await sleep(100);
  }
  assert.ok(report?.lineGraph, 'the report carries the Graph the Line breakdown');
  assert.equal(report.graphFeatureRush, undefined, "not the rush's");
  assert.equal(report.lineGraph.itemsCompleted, 17);
  assert.ok(report.lineGraph.byForm.length >= 1);
  assert.ok(report.lineGraph.mistakes.length >= 1, 'the misses are named');
  assert.equal(report.classAccuracyPercent, report.lineGraph.accuracyPercent);
  assert.equal(report.weakestStandard, null);
  const match = (await db.collection('liveChallengeMatchResults').doc(S).get()).data();
  assert.ok(match.standings.every((row) => row.questionSetSummary?.byTag?.form), 'each standing carries its breakdown');
});

/* ============= GAME 2: Classic — the class graphs the same line ============= */

const classicRoster = studentsOf('classic');

test('a Classic round: everyone gets the same equation, and the round is done when they are', async () => {
  const created = await createLine('classic', 'lineGraphClassic', { itemTypes: ['graph'] }, { roundCount: 3, roundSeconds: 60 });
  const roomId = created.roomId;
  assert.equal((await roomOf(roomId)).lineGraph.config.sameEquations, true);
  await Promise.all(classicRoster.map((studentId) => call('joinLiveChallenge', student(studentId, { roomId }))));
  await call('startLiveChallenge', administrator({ roomId }));
  await waitForRoundStart(roomId);
  const fetched = await Promise.all(classicRoster.map((studentId) => fetchItems(roomId, studentId)));
  assert.ok(fetched.every((entry) => entry.poolSize === 1 && entry.questions.length === 1));
  assert.deepEqual(fetched[1].questions[0], fetched[0].questions[0], 'the same equation for everyone');
  assert.deepEqual(fetched[2].questions[0], fetched[0].questions[0]);

  // Refusals while the round is open.
  const identity = await identityOf(roomId);
  const stale = await failureOf(call('submitLineGraphAttempts', student(classicRoster[0], { ...identity, roundToken: 'old-token', attempts: [rightAttempt(fetched[0].questions[0])] })));
  assert.equal(stale?.code, 'failed-precondition');
  const classicSubmit = await failureOf(call('submitLiveChallengeResponse', student(classicRoster[0], { ...identity, submissionId: randomUUID(), responsePayload: {} })));
  assert.equal(classicSubmit?.code, 'failed-precondition');
  assert.match(classicSubmit.message, /Graph the Line: Classic is played on its own game screen/);
  const rushCallable = await failureOf(call('getGraphFeatureRushRound', student(classicRoster[0], { roomId, roundIndex: 0 })));
  assert.equal(rushCallable?.code, 'failed-precondition');

  // Two students draw the same wrong line first; the class then gets it.
  const item = fetched[0].questions[0];
  const sharedMistake = wrongLine(item, 0);
  await submit(roomId, classicRoster[0], [sharedMistake]);
  await submit(roomId, classicRoster[1], [{ ...sharedMistake, attemptId: randomUUID() }]);
  // While anyone can still answer, nothing about the line is public.
  assert.equal((await roomRef(roomId).collection('solutions').doc('0').get()).exists, false);
  assert.deepEqual((await roomOf(roomId)).revealedSolutionRounds, []);
  await Promise.all(classicRoster.map((studentId, index) => submit(roomId, studentId, [rightAttempt(fetched[index].questions[0])])));
  await call('closeLiveChallengeRound', administrator({ roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion }));
  assert.equal((await roomOf(roomId)).roundState, 'closed');

  // THE REVEAL: published in the commit that closed the round.
  assert.deepEqual((await roomOf(roomId)).revealedSolutionRounds, [0]);
  const solution = (await roomRef(roomId).collection('solutions').doc('0').get()).data();
  assert.equal(solution.available, true);
  assert.equal(solution.solutionReview.answerSummary, item.equation.text);
  assert.ok(solution.solutionReview.reasoning.length >= 2, 'how to graph it');
  assert.deepEqual(solution.lineGraph.line, item.line);
  assert.equal(solution.lineGraph.equation.text, item.equation.text);
  assert.deepEqual(solution.lineGraph.class, {
    answered: 3,
    correct: 3,
    firstTry: 1,
    mistake: { ...solution.lineGraph.class.mistake, students: 2 },
  });
  const [p, q] = sharedMistake.points;
  const drawn = solution.lineGraph.class.mistake.line;
  assert.ok([p, q].every((point) => drawn.a * point.x + drawn.b * point.y === drawn.c), 'the class\'s wrong line is the one they drew');
  assert.match(solution.solutionReview.commonError, /^2 students drew /);
  const published = JSON.stringify(solution);
  for (const studentId of classicRoster) {
    // eslint-disable-next-line no-await-in-loop
    const { playerKey } = await privatePlayer(roomId, studentId);
    assert.ok(!published.includes(studentId) && !published.includes(playerKey), 'the reveal names no student');
  }
  const secret = (await privateRef(roomId).get()).data();
  assert.equal(secret.lineGraph.sharedLineKeys.length, 3, 'the schedule\'s lines, privately, for the same-line hold');
  // The next round is the next item of the shared schedule.
  await call('advanceLiveChallenge', administrator({ roomId, expectedRoundIndex: 0, expectedRoundVersion: identity.roundVersion }));
  await waitForRoundStart(roomId);
  const next = await fetchItems(roomId, classicRoster[0]);
  assert.equal(next.questions[0].questionIndex, 0, 'one item a round');
  assert.notDeepEqual(next.questions[0].line, fetched[0].questions[0].line);
  const finished = await call('finishLiveChallenge', administrator({ roomId }));
  assert.equal(finished.status, 'finished');
});

/* ===== GAME 3: extended time never holds a round no answer can reach ===== */

test('a student with extended time does not hold a Graph the Line round past the class\'s deadline', async () => {
  const [onTime, extra] = studentsOf('extended');
  const created = await createLine('extended', 'lineGraphClassic', { itemTypes: ['graph'] }, { roundCount: 3, roundSeconds: 20 });
  const roomId = created.roomId;
  await Promise.all([onTime, extra].map((studentId) => call('joinLiveChallenge', student(studentId, { roomId }))));
  // Extended time is a synchronized round's: the join gives a question-set
  // game none, so the close guard has nobody's personal deadline to wait for.
  assert.equal((await privatePlayer(roomId, extra)).timeMultiplier, 1, 'no extra time in a question-set round');
  await call('startLiveChallenge', administrator({ roomId }));
  await waitForRoundStart(roomId);
  const { questions } = await fetchItems(roomId, onTime);
  await submit(roomId, onTime, [rightAttempt(questions[0])]);
  const room = await roomOf(roomId);
  assert.equal(room.extendedTimeInPlay, false, 'a question-set round has no extended time to announce');
  // Past the class's deadline and the arrival grace — inside what the
  // student's plan would give them in a question round — the round closes
  // without force: the submit callable takes nobody's answer now.
  await sleep(Math.max(0, room.endsAt.toMillis() - Date.now() + 1_500));
  const late = await failureOf(submit(roomId, extra, [rightAttempt((await fetchItems(roomId, extra)).questions[0] || questions[0])]));
  assert.ok(late, 'the extra student\'s answer after the class\'s deadline is refused');
  const identity = await identityOf(roomId);
  await call('closeLiveChallengeRound', administrator({ roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion }));
  const closed = await roomOf(roomId);
  assert.equal(closed.roundState, 'closed');
  assert.notEqual(closed.extendedTimeInPlay, true, 'and the room never says someone has extra time');
  await call('finishLiveChallenge', administrator({ roomId }));
});

/* ================================ preview ================================ */

test('a teacher can preview items for any format; nothing is written', async () => {
  for (const format of ['classic', 'sprint', 'rush']) {
    // eslint-disable-next-line no-await-in-loop
    const preview = await call('previewLineGraph', teacherAs(TEACHER)({ format, lineGraph: { presetId: 'graphAndName' }, count: 6 }));
    assert.equal(preview.config.format, format);
    assert.equal(preview.questions.length, 6);
    assert.ok(preview.questions.every((item) => item.line && item.title));
  }
  const badFormat = await failureOf(call('previewLineGraph', teacherAs(TEACHER)({ format: 'marathon' })));
  assert.equal(badFormat?.code, 'invalid-argument');
  const badConfig = await failureOf(call('previewLineGraph', teacherAs(TEACHER)({ format: 'rush', lineGraph: { forms: [] } })));
  assert.equal(badConfig?.code, 'invalid-argument');
  assert.match(badConfig.message, /at least one form/);
  const studentAsks = await failureOf(call('previewLineGraph', student(A, { format: 'rush' })));
  assert.ok(studentAsks, 'students cannot preview');
});
