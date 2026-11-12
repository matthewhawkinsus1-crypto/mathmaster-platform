// Systems of Equations Rush end to end, through the real callables, against a
// real Firestore. Run through `npm run test:challenge-finish`.
//
// WHY. The game's mathematics, its presses and its words are pure and unit
// tested (tests/platform/systemsRush.test.mjs). What only a database shows is
// that a systems room plays on the rush's callables and lifecycle: each
// student gets their own systems from the room's private seed, a tap on the
// crossing answers a solution question, "No Solution", "Infinitely Many" and
// "Can't Be Determined" are each recorded as the press they were and graded
// right only where they are the answer, a wrong tap is recorded as the
// feature it landed on, the third miss skips a solution question but not an
// intercept question, a round publishes its guide at its close, and the
// report and the class's memory carry the game's own breakdown.

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
const systems = await import('../../functions/shared/systemsRush.mjs');
const generator = await import('../../functions/shared/systemsGenerator.mjs');
const memoryRules = await import('../../functions/shared/liveChallengeClassMemory.mjs');
const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
const db = admin.firestore();

// Unique to this file: the integration files share one emulator in parallel.
const TEACHER = 'systems-teacher@example.com';
const CLASS_ID = 'systems-class-pair';
const [A, B] = ['systems-class-pair-s01', 'systems-class-pair-s02'];

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
const memoryOf = async () => (await db.collection('liveChallengeClassMemory').doc(memoryRules.classMemoryId(CLASS_ID, 'systemsRush')).get()).data() || null;

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, status: 'active', course: 'algebra1', period: '3', name: 'Period 3' });
await Promise.all([A, B].map((studentId, index) => db.collection('grades').doc(studentId).set({
  assignedTeacherEmail: TEACHER, classId: CLASS_ID, classPeriod: '3', firstName: `Systems${index + 1}`, lastName: 'Student',
})));

// Solution questions on every kind with a solution question's own answer:
// a crossing to tap, and each of the three presses. Four (question, kind)
// pairs in a block of six, so every block of every student's round has all four.
const SETTINGS = { questions: ['solution'], kinds: ['sameLine', 'slanted', 'parallel', 'cannotDetermine'], difficulty: 'standard' };
const createGame = (extra = {}) => call('createLiveChallenge', teacher({
  classId: CLASS_ID,
  courseId: 'algebra1',
  challengeMode: 'systemsRush',
  systemsRush: SETTINGS,
  roundCount: 2,
  roundSeconds: 90,
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

const tapAt = (question, point) => ({
  attemptId: randomUUID(),
  questionIndex: question.questionIndex,
  kind: 'tap',
  x: point.x,
  y: point.y,
  tolerance: { x: 0.4, y: 0.4 },
  pointer: 'touch',
  clientElapsedMs: 4_000,
});
const press = (question, kind) => ({ attemptId: randomUUID(), questionIndex: question.questionIndex, kind, clientElapsedMs: 4_000 });
// The device's own answer: a tap on each target, or the press the item names.
const answersOf = (question) => (question.targets.length
  ? question.targets.map((target) => tapAt(question, target))
  : [press(question, question.answerPress || 'dne')]);
// A wrong tap: a corner of the view, where no target is ever drawn.
const cornerTap = (question) => tapAt(question, {
  x: question.view.xMin + 0.01 * (question.view.xMax - question.view.xMin),
  y: question.view.yMax - 0.01 * (question.view.yMax - question.view.yMin),
});

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
const eventually = async (read, ready = Boolean) => {
  let value = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    value = await read();
    if (ready(value)) return value;
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  return value;
};

// Plays one student's items in order, from the room's own copies, with the
// attempts `plan` gives each (default: the right answer).
const playThrough = async (roomId, studentId, lastIndex, plan = () => null) => {
  let fetched = [];
  const results = [];
  for (let index = 0; index <= lastIndex; index += 1) {
    if (!fetched.some((question) => question.questionIndex === index)) {
      // eslint-disable-next-line no-await-in-loop
      fetched = (await fetchItems(roomId, studentId, 8)).questions;
    }
    const question = fetched.find((entry) => entry.questionIndex === index);
    assert.ok(question, `item ${index} reaches the device`);
    const attempts = [...(plan(question, index) || []), ...answersOf(question)];
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(roomId, studentId, index);
    // eslint-disable-next-line no-await-in-loop
    const result = await submit(roomId, studentId, attempts);
    results.push({ question, attempts, result });
  }
  return results;
};

/* ============================ one game, two students ============================ */

const game = await createGame();
const G = game.roomId;
// The room's private seed and settings: the server's own items, regenerated.
const seedOf = async (roomId) => (await privateRef(roomId).get()).data().systemsRush;

test('a systems lobby is a Live Challenge room with its settings, and the seed stays private', async () => {
  const room = await roomOf(G);
  assert.equal(room.status, 'lobby');
  assert.equal(room.challengeMode, 'systemsRush');
  assert.equal(room.scoringStrategyId, 'grandPrix');
  assert.deepEqual(room.systemsRush.config.questions, ['solution']);
  assert.deepEqual(room.systemsRush.config.kinds, ['slanted', 'cannotDetermine', 'parallel', 'sameLine']);
  assert.equal(room.systemsRush.config.difficulty, 'standard');
  assert.equal(room.systemsRush.generatorVersion, generator.SYSTEMS_GENERATOR_VERSION);
  assert.ok(!('seed' in room.systemsRush), 'the seed never reaches a client-readable document');
  const secret = (await privateRef(G).get()).data();
  assert.ok(secret.systemsRush.seed);
  assert.equal(secret.scoringConfig.placementCurve, 'field');
  assert.deepEqual(secret.questionIds, ['systemsRush:round:1', 'systemsRush:round:2']);
});

test('a round opens with a card, never a system, and its guide is kept until the round closes', async () => {
  await call('joinLiveChallenge', student(A, { roomId: G }));
  await call('joinLiveChallenge', student(B, { roomId: G }));
  const early = await call('getGraphFeatureRushRound', student(A, { roomId: G, roundIndex: 0 }));
  assert.equal(early.roundOpen, false);
  await call('startLiveChallenge', teacher({ roomId: G }));
  const room = await roomOf(G);
  assert.equal(room.currentQuestion.kind, 'systemsRush');
  assert.deepEqual(room.currentQuestion.questions, ['solution']);
  assert.deepEqual(room.currentQuestion.kinds, ['slanted', 'cannotDetermine', 'parallel', 'sameLine']);
  assert.ok(!('targets' in room.currentQuestion) && !('lines' in room.currentQuestion), 'the projector never sees a system or an answer');
  const secret = (await privateRef(G).get()).data();
  assert.equal(secret.roundSolutions['0'].guide, true);
  assert.equal(secret.roundSolutions['0'].guideTitle, 'How to read a system');
  assert.equal(await publishedGuide(G, 0), null);
});

test('each student gets their own systems, two lines each, the same every time they ask', async () => {
  await waitForRoundStart(G);
  const a = await fetchItems(G, A);
  const b = await fetchItems(G, B);
  assert.equal(a.questions.length, 6);
  assert.ok(a.questions.every((question) => question.kind === 'system' && question.lines.length === 2 && question.graph === null));
  assert.ok(a.questions.every((question) => !('graphFeatures' in question)), 'the report\'s features stay on the server');
  assert.notDeepEqual(a.questions.map((question) => question.lines), b.questions.map((question) => question.lines));
  // The same six slots for both, in their own order: all four kinds in each block.
  assert.deepEqual(a.questions.map((question) => question.family).sort(), b.questions.map((question) => question.family).sort());
  assert.deepEqual(new Set(a.questions.map((question) => question.family)), new Set(['slanted', 'cannotDetermine', 'parallel', 'sameLine']));
  assert.deepEqual((await fetchItems(G, A)).questions, a.questions);
});

test('a tap on the crossing answers it, each press is recorded as itself, and a wrong tap as the feature it landed on', async () => {
  const { seed, config } = await seedOf(G);
  const items = Array.from({ length: 60 }, (_, questionIndex) => generator.generateSystemsQuestion({ seed, studentKey: A, roundIndex: 0, questionIndex, config }));
  const inView = (point, view) => point.x >= view.xMin && point.x <= view.xMax && point.y >= view.yMin && point.y <= view.yMax;
  // The first crossing with an intercept in view well clear of it: tapped
  // first, it is the slip "Tapped a y-intercept when asked for the solution".
  const slipOf = (item) => {
    if (item.targets.length !== 1) return null;
    const [crossing] = item.targets;
    for (const feature of ['yIntercept', 'xIntercept']) {
      const point = item.graphFeatures[feature].find((entry) => inView(entry, item.view) && Math.hypot(entry.x - crossing.x, entry.y - crossing.y) >= 1);
      if (point) return { feature, point };
    }
    return null;
  };
  const crossingAt = items.findIndex((item) => slipOf(item));
  const parallelAt = items.findIndex((item) => item.family === 'parallel');
  const sameLineAt = items.findIndex((item) => item.answerPress === 'infinite');
  const betweenAt = items.findIndex((item) => item.answerPress === 'undetermined');
  assert.ok([crossingAt, parallelAt, sameLineAt, betweenAt].every((index) => index >= 0), 'A\'s round asks every kind');
  assert.equal(items[parallelAt].targets.length, 0, 'parallel lines: nothing to tap');
  const slip = slipOf(items[crossingAt]);

  // Wrong first where it is staged, then the device's own answer.
  const plan = (question, index) => {
    assert.deepEqual(question, generator.publicSystemsQuestion(items[index]), 'the device gets the server\'s own system');
    if (index === crossingAt) return [tapAt(question, slip.point)];
    if (index === parallelAt) return [press(question, 'infinite')];
    if (index === sameLineAt) return [press(question, 'dne')];
    if (index === betweenAt) return [tapAt(question, { x: Math.round(question.crossing.x), y: Math.round(question.crossing.y) })];
    return null;
  };
  const played = await playThrough(G, A, Math.max(crossingAt, parallelAt, sameLineAt, betweenAt), plan);
  played.forEach(({ question, attempts, result }) => {
    assert.equal(result.verdicts.at(-1).completesQuestion, true, `${question.family}: ${JSON.stringify(result.verdicts)}`);
    if (attempts.length > 1) assert.equal(result.verdicts[0].verdict, 'miss');
  });
  const replay = await submit(G, A, played[0].attempts);
  assert.equal(replay.recorded, 0, 'a retried batch is a replay');

  const receipts = Object.values((await privatePlayer(G, A)).submissionReceipts);
  const at = (questionIndex, isCorrect) => receipts.filter((receipt) => receipt.questionIndex === questionIndex && receipt.isCorrect === isCorrect);
  // The crossing: the slip's feature recorded, then the tap that found it.
  assert.equal(at(crossingAt, false)[0].diagnosis, slip.feature);
  assert.equal(at(crossingAt, true)[0].attemptKind, 'tap');
  assert.equal(at(crossingAt, true)[0].targetId, 'sol');
  // Parallel: "Infinitely Many" wrong, "No Solution" (the rush's "Does Not Exist") right.
  assert.deepEqual(at(parallelAt, false).map((receipt) => receipt.attemptKind), ['infinite']);
  assert.deepEqual(at(parallelAt, true).map((receipt) => receipt.attemptKind), ['dne']);
  // The same line: "No Solution" wrong, "Infinitely Many" right.
  assert.deepEqual(at(sameLineAt, false).map((receipt) => receipt.attemptKind), ['dne']);
  assert.deepEqual(at(sameLineAt, true).map((receipt) => [receipt.attemptKind, receipt.targetId]), [['infinite', 'infinite']]);
  // Between grid lines: the nearest grid point wrong, "Can't Be Determined" right.
  assert.deepEqual(at(betweenAt, false).map((receipt) => receipt.attemptKind), ['tap']);
  assert.deepEqual(at(betweenAt, true).map((receipt) => [receipt.attemptKind, receipt.targetId]), [['undetermined', 'undetermined']]);
  assert.equal(receipts.filter((receipt) => receipt.completesQuestion === true).length, played.length);
});

test('a press is right only where it is the answer', async () => {
  // A's next items: two presses that are not the answer — two misses, short
  // of the third that skips — then the answer.
  const { questions } = await fetchItems(G, A, 6);
  const tried = [];
  for (const question of questions) {
    const answer = question.targets.length ? null : (question.answerPress || 'dne');
    const wrong = ['dne', 'infinite', 'undetermined'].filter((kind) => kind !== answer).slice(-2);
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(G, A, question.questionIndex);
    // eslint-disable-next-line no-await-in-loop
    const result = await submit(G, A, [...wrong.map((kind) => press(question, kind)), ...answersOf(question)]);
    tried.push({ family: question.family, wrong, verdicts: result.verdicts.map((row) => row.verdict), completes: result.verdicts.at(-1).completesQuestion });
  }
  assert.ok(tried.every((row) => row.verdicts[0] === 'miss' && row.verdicts[1] === 'miss' && row.completes === true), JSON.stringify(tried));
});

test('three wrong answers skip a solution question on the server, and the student resumes on the next', async () => {
  const [question] = (await fetchItems(G, B, 1)).questions;
  const verdicts = [];
  for (let miss = 0; miss < 3; miss += 1) {
    // eslint-disable-next-line no-await-in-loop
    await waitForPace(G, B, question.questionIndex);
    // eslint-disable-next-line no-await-in-loop
    verdicts.push(...(await submit(G, B, [cornerTap(question)])).verdicts);
  }
  assert.deepEqual(verdicts.map((row) => row.verdict), ['miss', 'miss', 'miss']);
  assert.equal(verdicts[2].autoSkipped, true);
  const resumed = await fetchItems(G, B, 1);
  assert.equal(resumed.state.cursor, question.questionIndex + 1);
});

test('the round closes into results and publishes its guide to reading a system', async () => {
  await closeRound(G);
  const round = (await roomRef(G).collection('hostRounds').doc('0').get()).data();
  assert.equal(round.fieldSize, 2);
  assert.ok(round.standings[0].completed >= round.standings[1].completed);
  const guide = await eventually(() => publishedGuide(G, 0));
  assert.equal(guide?.guide, true);
  assert.equal(guide.guideTitle, 'How to read a system');
  const lines = guide.solutionReview.reasoning;
  assert.ok(lines.some((line) => /where the two lines intersect/.test(line)), lines.join('\n'));
  assert.ok(lines.some((line) => line.startsWith('No Solution: parallel lines')));
  assert.ok(lines.some((line) => line.startsWith('Infinitely Many: the same line twice')));
  assert.ok(lines.some((line) => line.startsWith('Can\'t Be Determined: they cross between grid lines')));
});

test('the last round finishes the match; the report breaks it down by kind of system and counts each press', async () => {
  await advance(G);
  await waitForRoundStart(G);
  for (const studentId of [A, B]) {
    // eslint-disable-next-line no-await-in-loop
    const { questions } = await fetchItems(G, studentId, 2);
    for (const question of questions) {
      // eslint-disable-next-line no-await-in-loop
      await waitForPace(G, studentId, question.questionIndex);
      // eslint-disable-next-line no-await-in-loop
      await submit(G, studentId, answersOf(question));
    }
  }
  await closeRound(G);
  const finished = await advance(G);
  assert.equal(finished.status, 'finished');
  const result = (await db.collection('liveChallengeMatchResults').doc(G).get()).data();
  assert.equal(result.modeId, 'systemsRush');
  const report = await eventually(async () => (await db.collection('liveChallengeReports').doc(G).get()).data() || null);
  assert.ok(report?.systemsRush, 'the report carries the game\'s breakdown under its own key');
  assert.equal(report.graphFeatureRush, undefined);
  const kindLabels = new Set(systems.SYSTEM_KINDS.map((kind) => kind.label));
  assert.ok(report.systemsRush.byFamily.length >= 4 && report.systemsRush.byFamily.every((row) => kindLabels.has(row.label)), JSON.stringify(report.systemsRush.byFamily));
  assert.deepEqual(report.systemsRush.byFeature.map((row) => row.label), ['Solution of the system']);
  // Each press, counted as itself: right where staged, wrong where tried elsewhere.
  for (const key of ['doesNotExist', 'infinitelyMany', 'cannotDetermine']) {
    assert.ok(report.systemsRush[key].correct >= 1 && report.systemsRush[key].presses > report.systemsRush[key].correct, `${key}: ${JSON.stringify(report.systemsRush[key])}`);
  }
  assert.ok(report.systemsRush.wrongTaps.some((row) => row.asked === 'solution' && /^Tapped an? [xy]-intercept when asked for the solution$/.test(row.label)), JSON.stringify(report.systemsRush.wrongTaps));
  assert.equal(report.classAccuracyPercent, report.systemsRush.accuracyPercent);
  assert.deepEqual((await roomOf(G)).revealedSolutionRounds, [0, 1]);
});

test('a finished game leaves its class a memory of its settings, naming no student', async () => {
  const memory = await eventually(memoryOf, (value) => value?.roomId === G);
  assert.equal(memory?.roomId, G, 'the memory is written');
  assert.equal(memory.game, 'systemsRush');
  assert.deepEqual(memory.settings.questions, ['solution']);
  assert.deepEqual(memory.settings.kinds, ['slanted', 'cannotDetermine', 'parallel', 'sameLine']);
  assert.equal(memory.settings.difficulty, 'standard');
  assert.equal(memory.results.players, 2);
  assert.doesNotMatch(JSON.stringify(memory), new RegExp(`${A}|${B}`), 'no student is named');
  assert.equal((await db.collection('liveChallengeMatchResults').doc(G).get()).data().effects.classMemory, 'done');
  const next = memoryRules.suggestNextSettings(memory);
  assert.match(memoryRules.classMemorySentence(memory, next), /^Period 3 last played this on .+ at Standard/);
});

/* ======================= intercepts: eight misses, not three ======================= */

test('on an intercept question three misses do not skip; both intercepts found complete it', async () => {
  const created = await createGame({ systemsRush: { presetId: 'intercepts' }, roundCount: 1 });
  const roomId = created.roomId;
  try {
    await call('joinLiveChallenge', student(B, { roomId }));
    await call('startLiveChallenge', teacher({ roomId }));
    await waitForRoundStart(roomId);
    const [question] = (await fetchItems(roomId, B, 1)).questions;
    assert.ok(['yIntercept', 'xIntercept'].includes(question.feature));
    assert.equal(question.targets.length, 2, 'Easy: two lines, two intercepts to find');
    const verdicts = [];
    for (let miss = 0; miss < 3; miss += 1) {
      // eslint-disable-next-line no-await-in-loop
      await waitForPace(roomId, B, question.questionIndex);
      // eslint-disable-next-line no-await-in-loop
      verdicts.push(...(await submit(roomId, B, [cornerTap(question)])).verdicts);
    }
    assert.deepEqual(verdicts.map((row) => [row.verdict, row.autoSkipped === true]), [['miss', false], ['miss', false], ['miss', false]]);
    await waitForPace(roomId, B, question.questionIndex);
    const found = await submit(roomId, B, answersOf(question));
    assert.deepEqual(found.verdicts.map((row) => row.verdict), ['hit', 'hit']);
    assert.equal(found.verdicts[1].completesQuestion, true);
    assert.equal((await fetchItems(roomId, B, 1)).state.cursor, question.questionIndex + 1);
  } finally {
    await call('finishLiveChallenge', teacher({ roomId }));
  }
});

/* =============================== refusals, preview =============================== */

test('settings with nothing to ask, or nothing to tap on a solution question, are refused at create', async () => {
  const empty = await failureOf(createGame({ systemsRush: { questions: [] } }));
  assert.equal(empty?.code, 'invalid-argument');
  assert.match(empty.message, /Choose at least one question/);
  const pressesOnly = await failureOf(createGame({ systemsRush: { questions: ['solution'], kinds: ['parallel', 'sameLine'] } }));
  assert.equal(pressesOnly?.code, 'invalid-argument');
  assert.match(pressesOnly.message, /Solution questions need some systems with one solution/);
});

test('a room created under another generator refuses to play rather than grade a system the student never saw', async () => {
  const created = await createGame({ roundCount: 1 });
  try {
    await call('joinLiveChallenge', student(A, { roomId: created.roomId }));
    await call('startLiveChallenge', teacher({ roomId: created.roomId }));
    await privateRef(created.roomId).set({ systemsRush: { generatorVersion: 0 } }, { merge: true });
    const refused = await failureOf(call('getGraphFeatureRushRound', student(A, { roomId: created.roomId, roundIndex: 0 })));
    assert.equal(refused?.code, 'failed-precondition');
    assert.match(refused.message, /This Systems of Equations Rush was created before an update/);
  } finally {
    await call('finishLiveChallenge', teacher({ roomId: created.roomId }));
  }
});

test('a teacher previews sample systems without creating anything; a student cannot', async () => {
  const preview = await call('previewSystemsRush', teacher({ systemsRush: { presetId: 'everySystem' }, count: 6 }));
  assert.equal(preview.questions.length, 6);
  assert.ok(preview.questions.every((question) => question.kind === 'system' && question.lines.length === 2 && !('graphFeatures' in question)));
  assert.equal(preview.config.presetId, 'everySystem');
  const refused = await failureOf(call('previewSystemsRush', teacher({ systemsRush: { questions: [] } })));
  assert.equal(refused?.code, 'invalid-argument');
  assert.ok(await failureOf(call('previewSystemsRush', student(A, {}))), 'students cannot preview');
});
