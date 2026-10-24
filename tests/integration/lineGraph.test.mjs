// Graph the Line end to end, through the real callables, against a real
// Firestore. Run through `npm run test:challenge-finish`.
//
// WHY. The game's rules are pure and unit tested (lineGraph*.test.mjs). What
// only a database shows is that the callables apply them inside transactions
// on the engine's lifecycle: any teacher launches each format; each student
// gets their own items (or, in Classic, the class the same one); a line is
// checked the moment it is drawn and recorded once however a batch is retried; three misses end an item; a refresh
// resumes where the student was; a Sprint round is ready to close when
// everyone has worked through it (and each student's public row says when
// they have), and the engine ranks it; the finished match writes the report
// by form, item type and mistake; a Classic round the class graphed together
// publishes its line and the class's most common mistake — only once it has
// closed; a student with extended time finishes after the buzzer while the
// race stays the class's, and nothing public says who; and a finished game
// writes each student's first tries as mastery evidence only while the
// owner's switch is on.

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
// The games here are the administrator's (one at a time: one active room per
// teacher), as they were while the modes were a preview; a regular teacher's
// class shows that every teacher can launch them now.
const TEACHER = 'line-teacher@example.com';
const CLASSES = {
  sprint: { id: 'line-class-sprint', size: 3, teacher: ROOT_ADMIN_EMAIL },
  classic: { id: 'line-class-classic', size: 3, teacher: ROOT_ADMIN_EMAIL },
  regular: { id: 'line-class-regular', size: 2, teacher: TEACHER },
  extended: { id: 'line-class-extended', size: 3, teacher: ROOT_ADMIN_EMAIL },
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
    // The extended-time class's second student has extra time on their plan
    // (1.5×) and a graphing aid (graph paper: the slope helper is theirs).
    ...(key === 'extended' && index === 1 ? { profile: { accommodations: ['extra-time', 'graph-paper'] } } : {}),
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

/* ============================== launched ============================== */

test('every teacher can launch each format', async () => {
  for (const mode of ['lineGraphClassic', 'lineGraphSprint', 'lineGraphRush']) {
    // eslint-disable-next-line no-await-in-loop
    const { roomId } = await createLine('regular', mode);
    // eslint-disable-next-line no-await-in-loop
    const room = (await db.collection('liveChallengeRooms').doc(roomId).get()).data();
    assert.equal(room.challengeMode, mode);
    assert.equal(room.teacherEmail, CLASSES.regular.teacher);
    // One active room per teacher: this one makes way for the next format.
    // eslint-disable-next-line no-await-in-loop
    await call('cancelLiveChallenge', teacherAs(TEACHER)({ roomId }));
  }
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
  assert.deepEqual(Object.values(secret.roundStandards), ['', ''], 'no standard per round: the bank rounds\' evidence never reads a line game (its own rules do: lineGraphEvidence.mjs)');
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

/* ===== GAME 3: a student's plan — extra time after the buzzer, their own slope helper ===== */

// What a classmate (or the projector) can read about a room: the room, every
// public row, the class's round copy, the standings snapshot and a published
// solution. None of it may say who has an accommodation.
const publicDocumentsOf = async (roomId) => {
  const ref = roomRef(roomId);
  const [room, players, rounds, standings, solutions] = await Promise.all([
    ref.get(), ref.collection('players').get(), ref.collection('rounds').get(), ref.collection('standings').get(), ref.collection('solutions').get(),
  ]);
  return JSON.stringify([room.data(), ...[players, rounds, standings, solutions].flatMap((snapshot) => snapshot.docs.map((doc) => doc.data()))]);
};

test('a student with extended time finishes their Classic line after the buzzer; the race is decided at the buzzer, and nothing public says who', async () => {
  const [onTime, extra, slow] = studentsOf('extended');
  const created = await createLine('extended', 'lineGraphClassic', { itemTypes: ['graph'] }, { roundCount: 3, roundSeconds: 20 });
  const roomId = created.roomId;
  assert.equal((await roomOf(roomId)).lineGraph.config.slopeHelper, false, 'the room has no slope helper');
  await Promise.all([onTime, extra, slow].map((studentId) => call('joinLiveChallenge', student(studentId, { roomId }))));

  // THE PLAN, privately: 1.5× and the slope helper on the student's own record
  // and (the multiplier) their own invite — never on the room or a public row.
  const extraRecord = await privatePlayer(roomId, extra);
  assert.equal(extraRecord.timeMultiplier, 1.5);
  assert.equal(extraRecord.lineSlopeHelper, true);
  assert.equal((await privatePlayer(roomId, onTime)).timeMultiplier, 1);
  assert.equal((await privatePlayer(roomId, onTime)).lineSlopeHelper, false);
  assert.equal((await db.collection('liveChallengeInvites').doc(extra).get()).data().timeMultiplier, 1.5);
  await call('startLiveChallenge', administrator({ roomId }));
  const opened = await roomOf(roomId);
  assert.equal(opened.extendedTimeInPlay, true, 'the room says someone has more time — never who');
  await waitForRoundStart(roomId);

  // Their own round request turns their slope helper on; a classmate's does not.
  const extraItems = await fetchItems(roomId, extra);
  assert.equal(extraItems.slopeHelper, true);
  const onTimeItems = await fetchItems(roomId, onTime);
  assert.equal(onTimeItems.slopeHelper, false);

  // The race: one student right, the student with extra time one miss.
  const item = onTimeItems.questions[0];
  assert.equal((await submit(roomId, onTime, [rightAttempt(item)])).verdicts[0].verdict, 'correct');
  assert.equal((await submit(roomId, extra, [wrongLine(extraItems.questions[0], 0)])).verdicts[0].verdict, 'incorrect');
  const extraRowAtBuzzer = await publicRow(roomId, extra);

  // PAST THE CLASS'S BUZZER (and its arrival grace).
  await sleep(Math.max(0, opened.endsAt.toMillis() - Date.now() + 1_500));
  // A classmate without extra time is refused…
  const late = await failureOf(submit(roomId, slow, [rightAttempt(item)]));
  assert.equal(late?.code, 'deadline-exceeded');
  // …and the round waits for the student inside their own time.
  let identity = await identityOf(roomId);
  const held = await failureOf(call('closeLiveChallengeRound', administrator({ roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion })));
  assert.equal(held?.code, 'failed-precondition');
  assert.equal(held?.details?.readiness, 'extended_time');
  assert.equal((await roomOf(roomId)).roundState, 'open');

  // EXTRA TIME: they finish their line. Recorded, apart from the race.
  const finished = await submit(roomId, extra, [rightAttempt(extraItems.questions[0])]);
  assert.equal(finished.verdicts[0].verdict, 'correct');
  assert.equal(finished.state.finished, true);
  const afterRecord = await privatePlayer(roomId, extra);
  const raceReceipts = Object.values(afterRecord.submissionReceipts);
  assert.equal(raceReceipts.length, 1, 'the race holds their miss only');
  assert.equal(raceReceipts[0].isCorrect, false);
  const extraTimeReceipts = Object.values(afterRecord.extraTimeReceipts || {});
  assert.equal(extraTimeReceipts.length, 1);
  assert.equal(extraTimeReceipts[0].extraTime, true);
  assert.equal(extraTimeReceipts[0].pointsAwarded, 0);
  // Their public row did not move: a row that changed now would name them.
  const extraRowNow = await publicRow(roomId, extra);
  for (const field of ['score', 'correctCount', 'rushRoundCompleted', 'rushRoundFinished', 'matchAccuracy']) {
    assert.deepEqual(extraRowNow[field], extraRowAtBuzzer[field], field);
  }
  assert.equal(extraRowNow.updatedAt?.toMillis?.(), extraRowAtBuzzer.updatedAt?.toMillis?.(), 'not written at all');

  // Everyone is done: the round closes without force.
  identity = await identityOf(roomId);
  await call('closeLiveChallengeRound', administrator({ roomId, expectedRoundIndex: identity.roundIndex, expectedRoundVersion: identity.roundVersion }));
  assert.equal((await roomOf(roomId)).roundState, 'closed');
  // THE RACE AT THE BUZZER: the student with extra time is placed by what they
  // had done then (no line), exactly as a classmate who did the same.
  const table = (await roomRef(roomId).collection('hostRounds').doc('0').get()).data();
  const keyOf = async (studentId) => (await privatePlayer(roomId, studentId)).playerKey;
  const byKey = new Map(table.standings.map((row) => [row.playerKey, row]));
  assert.equal(byKey.get(await keyOf(onTime)).rank, 1);
  assert.equal(byKey.get(await keyOf(extra)).completed, 0, 'their line in extra time is not the race\'s');
  assert.equal(byKey.get(await keyOf(extra)).matchPointsAwarded, byKey.get(await keyOf(slow)).matchPointsAwarded, 'placed as the class\'s clock alone would place them');
  // The class's line, published at the close, counts the work done in extra time — as counts.
  const solution = (await roomRef(roomId).collection('solutions').doc('0').get()).data();
  assert.equal(solution.lineGraph.class.answered, 2);
  assert.equal(solution.lineGraph.class.correct, 2);
  assert.equal(solution.lineGraph.class.firstTry, 1);

  // NOTHING PUBLIC SAYS WHO.
  const published = await publicDocumentsOf(roomId);
  assert.doesNotMatch(published, /extraTime|timeMultiplier|SlopeHelper|"slopeHelper":true/);
  assert.ok(!published.includes(extra), 'no student id');

  // The finished match: the race's numbers from the race, the report from all their work.
  await call('finishLiveChallenge', administrator({ roomId }));
  let report = null;
  for (let attempt = 0; attempt < 30 && !report?.lineGraph; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    report = (await db.collection('liveChallengeReports').doc(roomId).get()).data() || null;
    // eslint-disable-next-line no-await-in-loop
    if (!report?.lineGraph) await sleep(100);
  }
  const match = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data();
  const standing = match.standings.find((row) => row.studentId === extra);
  assert.equal(standing.matchAccuracy, 0, 'the race\'s accuracy: their one miss');
  assert.equal(standing.questionSetSummary.completed, 1);
  assert.equal(standing.questionSetSummary.extraTimeCompleted, 1);
  const reportRow = report.lineGraph.players.find((row) => row.studentId === extra);
  assert.equal(reportRow.itemsCompleted, 1);
  assert.equal(reportRow.itemsCompletedInExtraTime, 1, 'the teacher sees it came after the buzzer');
});

test('a Rush gives no extra time; the slope helper from the plan still goes with the student', async () => {
  const extra = studentsOf('extended')[1];
  const { roomId } = await createLine('extended', 'lineGraphRush', { itemTypes: ['graph'] }, { roundCount: 1, roundSeconds: 30 });
  await call('joinLiveChallenge', student(extra, { roomId }));
  const record = await privatePlayer(roomId, extra);
  assert.equal(record.timeMultiplier, 1, 'as many as you can before the clock: nothing to finish');
  assert.equal(record.lineSlopeHelper, true);
  await call('cancelLiveChallenge', administrator({ roomId }));
});

/* ===== GAME 4: mastery evidence — each line's first try, per kind of item, behind the owner's switch ===== */

const evidenceSwitch = db.collection('platformFlags').doc('liveChallengeEvidence');
const lineEvidenceOf = async (studentId, roomId) => (await db.collection('grades').doc(studentId).collection('evidenceEvents')
  .where('source.roomId', '==', roomId).get()).docs.map((doc) => doc.data());

// A wrong answer of the item's own kind.
const wrongAttempt = (item) => (item.answerStyle === 'choice'
  ? { attemptId: randomUUID(), questionIndex: item.questionIndex, kind: 'choice', choice: item.choices.find((choice) => choice.id !== item.answerChoice).id, clientElapsedMs: 3_000 }
  : wrongLine(item, 0));

// What the rules should count, from what this test did: each line once (the
// first meeting), a vertical Graph it line never, right only when the first try was.
const expectedFirstTries = (items, firstTryRight) => {
  const tally = { graph: { lines: 0, right: 0 }, name: { lines: 0, right: 0 } };
  const met = new Set();
  items.forEach((item, index) => {
    if (item.itemType === 'graph' && item.line.b === 0) return;
    const identity = `${item.itemType}|${item.line.a}|${item.line.b}|${item.line.c}`;
    if (met.has(identity)) return;
    met.add(identity);
    tally[item.itemType].lines += 1;
    if (firstTryRight(index)) tally[item.itemType].right += 1;
  });
  return tally;
};

test('a line game writes no mastery evidence while the owner\'s switch is off', async () => {
  // GAME 1 finished with the switch off: its facts are on the result, and no event.
  const match = (await db.collection('liveChallengeMatchResults').doc(S).get()).data();
  assert.ok(match.standings.filter((row) => row.joined).every((row) => row.lineGraphEvidence?.version === 1), 'the facts are always counted');
  for (const studentId of [A, B, C]) {
    // eslint-disable-next-line no-await-in-loop
    assert.deepEqual(await lineEvidenceOf(studentId, S), [], studentId);
  }
});

test('with the switch on, a finished line game writes each student\'s first tries: Graph it as A.3C, Name it as A.2C', async () => {
  await evidenceSwitch.set({ lineGraph: true });
  try {
    const created = await createLine('sprint', 'lineGraphSprint', { presetId: 'graphAndName', itemTypes: ['graph', 'name'], nameStyle: 'choice', sprintLength: 5, triesPerItem: 2 }, { roundCount: 1, roundSeconds: 60 });
    const roomId = created.roomId;
    await Promise.all([A, B].map((studentId) => call('joinLiveChallenge', student(studentId, { roomId }))));
    await call('startLiveChallenge', administrator({ roomId }));
    await waitForRoundStart(roomId);
    // Five of a block of six, two of which are Name it: at least three Graph
    // it lines and one Name it. A: the first Graph it line wrong, then right
    // after the hint; the first Name it wrong (one try); the next line
    // skipped; the rest right at once. B: every line right at once. C never
    // joined.
    const aItems = (await fetchItems(roomId, A)).questions;
    assert.equal(aItems.length, 5);
    const retried = aItems.findIndex((item) => item.itemType === 'graph');
    const missed = aItems.findIndex((item) => item.itemType === 'name');
    const skipped = aItems.findIndex((_, index) => index !== retried && index !== missed);
    assert.ok(retried >= 0 && missed >= 0 && skipped >= 0, JSON.stringify(aItems.map((item) => item.itemType)));
    for (const [index, item] of aItems.entries()) {
      if (index === retried) {
        // eslint-disable-next-line no-await-in-loop
        await submit(roomId, A, [wrongAttempt(item)]);
        // eslint-disable-next-line no-await-in-loop
        assert.equal((await submit(roomId, A, [rightAttempt(item)])).verdicts[0].verdict, 'correct', 'right on the second try');
      } else if (index === missed) {
        // eslint-disable-next-line no-await-in-loop
        assert.equal((await submit(roomId, A, [wrongAttempt(item)])).verdicts[0].revealed, true, 'one try, then the answer is shown');
      } else if (index === skipped) {
        // eslint-disable-next-line no-await-in-loop
        await submit(roomId, A, [{ attemptId: randomUUID(), questionIndex: item.questionIndex, kind: 'skip' }]);
      } else {
        // eslint-disable-next-line no-await-in-loop
        await submit(roomId, A, [rightAttempt(item)]);
      }
    }
    const bItems = (await fetchItems(roomId, B)).questions;
    await submit(roomId, B, bItems.map(rightAttempt));
    const done = await call('finishLiveChallenge', administrator({ roomId }));
    assert.equal(done.status, 'finished');

    const expectedA = expectedFirstTries(aItems, (index) => ![retried, missed, skipped].includes(index));
    const expectedB = expectedFirstTries(bItems, () => true);
    const match = (await db.collection('liveChallengeMatchResults').doc(roomId).get()).data();
    const factsOf = (studentId) => match.standings.find((row) => row.studentId === studentId).lineGraphEvidence;
    assert.deepEqual([factsOf(A).graph.lines, factsOf(A).graph.firstTryRight, factsOf(A).name.lines, factsOf(A).name.firstTryRight],
      [expectedA.graph.lines, expectedA.graph.right, expectedA.name.lines, expectedA.name.right]);

    for (const [studentId, expected] of [[A, expectedA], [B, expectedB]]) {
      // eslint-disable-next-line no-await-in-loop
      const events = await lineEvidenceOf(studentId, roomId);
      const byStandard = Object.fromEntries(events.map((event) => [event.alignmentKeys[0], event]));
      assert.equal(events.length, ['graph', 'name'].filter((itemType) => expected[itemType].lines).length, `${studentId}: one event per standard`);
      for (const [itemType, standard] of [['graph', 'A.3C'], ['name', 'A.2C']]) {
        const want = expected[itemType];
        if (!want.lines) {
          assert.equal(byStandard[standard], undefined, `${studentId}: no ${standard} without a ${itemType} line`);
          continue;
        }
        const event = byStandard[standard];
        assert.ok(event, `${studentId}: ${standard}`);
        assert.equal(event.performance.linesCounted, want.lines);
        assert.equal(event.performance.linesRightFirstTry, want.right);
        assert.equal(event.performance.score, want.right / want.lines);
        assert.equal(event.source.kind, 'liveChallenge');
        assert.equal(event.source.activityRole, 'liveChallenge', 'weighted as a Live Challenge');
        assert.equal(event.source.itemType, itemType);
        assert.match(event.conditions, /first try/i, 'the record states its conditions');
      }
    }
    // A student who never joined has no evidence from the game.
    assert.deepEqual(await lineEvidenceOf(C, roomId), []);
  } finally {
    await evidenceSwitch.delete();
  }
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
