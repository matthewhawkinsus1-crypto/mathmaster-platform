// A My Math Path item, issued, answered and reviewed through the real Cloud
// Functions against a real Firestore.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-path-recap-harness \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/pathSessionRecapEndToEnd.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// WHY.
//
//   1. A MULTIPLE-CHOICE ITEM MUST BE ANSWERABLE. issueNextQuestion stores the
//      item already sanitized — its options carry opaque runtime ids, and the
//      private answer key names those ids — and then sanitizes the stored item
//      again for the browser. When re-sanitizing re-hashed the ids, the
//      browser's options no longer matched the key, and every option, the
//      right one included, was marked wrong. No unit test runs the issue
//      callable and the submit callable back to back, which is the only place
//      the two id spaces meet.
//
//   2. THE RECAP IS RECORDED IN THE SUBMIT TRANSACTION AND RELEASED ONLY FOR A
//      COMPLETED SESSION. This proves the entry is a value Firestore accepts
//      inside the real transaction (a refused write would fail the student's
//      graded answer), that getMyPathSessionRecap refuses while the session is
//      active and for another student, and that it returns the missed item
//      once the session is completed.
//
// The seed is the open session issueNextQuestion writes: an active session
// whose `currentQuestion` is the sanitized item plus its private grading and
// support. The real exported functions run with a synthetic student auth
// context (v2 onCall exposes `.run`).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

// functions/index.js calls initializeApp() at module load, so it is required
// FIRST and owns the default app.
const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const secureItems = require(path.join(repo, 'functions/lib/secureItems.js'));
const db = admin.firestore();

const CLASS_ID = 'path-recap-harness-class';
const studentRequest = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId } },
  data,
  rawRequest: { headers: {} },
});

const question = (id, fields) => ({
  id,
  active: true,
  alignmentKeys: ['texas:A.5A'],
  courseId: 'algebra1',
  familyId: `mathmaster:A.5A:recap-harness:${id}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 2,
  calculatorPolicy: 'inherit',
  ...fields,
});

const choiceQuestion = question('recap-harness-choice', {
  prompt: 'Which value of x solves 2x + 3 = 11?',
  choices: [{ id: 'opt-1', label: '$x = 7$' }, { id: 'opt-2', label: '$x = 4$' }, { id: 'opt-3', label: '$x = 3$' }],
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-2' }],
  solutionReview: { headline: 'Undo the operations in reverse order.', reasoning: ['Subtract 3: 2x = 8.', 'Divide by 2: x = 4.'], answerSummary: 'x = 4' },
});

const numberQuestion = question('recap-harness-number', {
  prompt: 'Solve $2x + 3 = 11$.',
  responseFields: [{ id: 'answer', label: 'x =', inputProfile: 'number', expected: '4' }],
  solutionReview: { headline: 'Undo the operations in reverse order.', reasoning: ['Subtract 3: $2x = 8$.', 'Divide by 2: $x = 4$.'] },
});

// The `currentQuestion` issueNextQuestion writes for a bank item.
const openItem = async (authored, questionInstanceId) => {
  const plan = await mathPath.buildIssuePlan(authored);
  assert.ok(plan.issuable, `${authored.id} must be issuable`);
  return secureItems.storableItem({
    ...mathPath.buildSanitizedQuestion(authored, { questionInstanceId, attemptsAllowed: 1, attemptsUsed: 0, toolPayload: plan.toolPayload }),
    bankQuestionId: authored.id,
    sourceBankQuestionId: authored.id,
    generatorParameters: null,
    skillCode: 'A.5A',
    pathRole: 'continue',
    coursePassLevel: 1,
    alignmentKeys: ['texas:A.5A'],
    attemptsAllowed: 1,
    attemptsUsed: 0,
    applicableSupports: [],
    authorizedSupports: [],
    privateGrading: plan.privateGrading,
    privateSupport: await mathPath.buildPrivateSupport(authored),
  });
};

const seedSession = async ({ studentId, sessionId, item, sessionKind = 'practice' }) => {
  await db.recursiveDelete(db.collection('grades').doc(studentId)).catch(() => {});
  await db.collection('pathSessions').doc(sessionId).delete().catch(() => {});
  const prior = await db.collection('pathSubmissions').where('sessionId', '==', sessionId).get();
  await Promise.all(prior.docs.map((entry) => entry.ref.delete()));
  await db.collection('grades').doc(studentId).set({ studentId, classId: CLASS_ID, classPeriod: '2', assignedTeacherEmail: 'recap-harness@example.com' });
  const now = Date.now();
  await db.collection('pathSessions').doc(sessionId).set({
    sessionId,
    studentId,
    status: 'active',
    sessionKind,
    assessmentFramework: null,
    coursePracticeIntent: null,
    courseId: 'algebra1',
    classId: CLASS_ID,
    weekKey: null,
    weeklySlotKey: null,
    weeklySlot: null,
    requiredQuestions: 1,
    coursePassLevel: 1,
    target: { alignmentKey: 'texas:A.5A' },
    summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
    pathState: { counters: { questionsThisSession: 0 } },
    currentSkillCode: 'A.5A',
    excursion: null,
    diagnosing: null,
    lastDecision: null,
    evidenceBySkill: {},
    route: [],
    createdAt: now,
    updatedAt: now,
    currentQuestion: item,
  });
};

test('the right option of a multiple-choice item, as served, is graded right', async () => {
  const studentId = 'path-recap-harness-choice-student';
  const sessionId = 'path-recap-harness-choice-session';
  await seedSession({ studentId, sessionId, item: await openItem(choiceQuestion, 'qi-recap-harness-choice') });

  // The browser's copy of the open item, from the real issue callable.
  const { questionInstance } = await functionsIndex.issueNextQuestion.run(studentRequest(studentId, { sessionId }));
  const right = questionInstance.choices.find((choice) => choice.label === '$x = 4$');
  assert.ok(right, 'the served item lists the options');
  assert.doesNotMatch(right.id, /^opt-/, 'author ids never reach the browser');

  const result = await functionsIndex.submitPathResponse.run(studentRequest(studentId, {
    sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId: 'sub-recap-harness-choice',
    responsePayload: { responses: { answer: right.id } },
  }));
  assert.equal(result.grading.isCorrect, true, 'the option the browser was given for the right answer must be graded right');
});

test('the recap is recorded in the submit transaction and released only for the owner\'s completed session', async () => {
  const studentId = 'path-recap-harness-number-student';
  const sessionId = 'path-recap-harness-number-session';
  // A one-question retention probe completes on its count alone. A course
  // session's next step after a miss is the router's call, which reads the
  // coverage indexes this suite does not seed (and parallel suites share).
  // The recap is recorded and released identically for both.
  await seedSession({ studentId, sessionId, item: await openItem(numberQuestion, 'qi-recap-harness-number'), sessionKind: 'retentionProbe' });

  await assert.rejects(
    functionsIndex.getMyPathSessionRecap.run(studentRequest(studentId, { sessionId })),
    (error) => error?.code === 'failed-precondition',
    'nothing is released while the session can still be answered',
  );

  const { questionInstance } = await functionsIndex.issueNextQuestion.run(studentRequest(studentId, { sessionId }));
  const result = await functionsIndex.submitPathResponse.run(studentRequest(studentId, {
    sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId: 'sub-recap-harness-number',
    responsePayload: { responses: { answer: '5' } },
  }));
  assert.equal(result.grading.questionFinalized, true);
  assert.equal(result.grading.isCorrect, false);
  assert.equal(result.session.status, 'completed', 'a one-question probe ends on its only answer');

  const stored = await db.collection('pathSubmissions').where('sessionId', '==', sessionId).get();
  assert.equal(stored.size, 1);
  assert.equal(typeof stored.docs[0].data().recapJson, 'string', 'the finalizing submission carries the recap entry');

  await assert.rejects(
    functionsIndex.getMyPathSessionRecap.run(studentRequest('someone-else', { sessionId })),
    (error) => error?.code === 'not-found',
  );

  const recap = await functionsIndex.getMyPathSessionRecap.run(studentRequest(studentId, { sessionId }));
  assert.equal(recap.available, true);
  assert.equal(recap.items.length, 1);
  const [missed] = recap.items;
  assert.equal(missed.question.prompt, 'Solve $2x + 3 = 11$.');
  assert.deepEqual(missed.response.entries, [{ label: 'x =', value: '5', format: 'math' }]);
  assert.deepEqual(missed.correctAnswer, [{ label: 'x =', value: '4', format: 'rich' }]);
  assert.equal(missed.solutionReview.reasoning[1], 'Divide by 2: $x = 4$.');
});

test('a missed multiple-choice item is recapped with the option the student chose and the right one', async () => {
  // The recap re-sends the STORED item, whose options already carry the issued
  // runtime ids the student answered with. It must keep them (`issued: true`),
  // or the student's answer matches nothing and "Your answer" comes out empty.
  const studentId = 'path-recap-harness-choice-recap-student';
  const sessionId = 'path-recap-harness-choice-recap-session';
  await seedSession({ studentId, sessionId, item: await openItem(choiceQuestion, 'qi-recap-harness-choice-recap'), sessionKind: 'retentionProbe' });

  const { questionInstance } = await functionsIndex.issueNextQuestion.run(studentRequest(studentId, { sessionId }));
  const wrong = questionInstance.choices.find((choice) => choice.label === '$x = 7$');
  assert.ok(wrong, 'the served item lists the options');
  const result = await functionsIndex.submitPathResponse.run(studentRequest(studentId, {
    sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId: 'sub-recap-harness-choice-recap',
    responsePayload: { responses: { answer: wrong.id } },
  }));
  assert.equal(result.grading.isCorrect, false);
  assert.equal(result.session.status, 'completed');

  const recap = await functionsIndex.getMyPathSessionRecap.run(studentRequest(studentId, { sessionId }));
  assert.equal(recap.available, true);
  assert.equal(recap.items.length, 1);
  const [missed] = recap.items;
  assert.deepEqual(missed.response.entries.map((entry) => entry.value), ['$x = 7$'], 'the option the student chose, by its label');
  assert.deepEqual(missed.correctAnswer.map((entry) => entry.value), ['$x = 4$']);
});
