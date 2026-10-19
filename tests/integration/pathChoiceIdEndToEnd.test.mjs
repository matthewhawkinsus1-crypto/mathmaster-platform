// A My Math Path multiple-choice item, issued and answered through the real
// Cloud Functions against a real Firestore.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-path-choice-harness \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/pathChoiceIdEndToEnd.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up too, which is how full-platform-suite.yml runs it.)
//
// WHY. issueNextQuestion stores the issued item already sanitized — its options
// carry opaque runtime ids, and the private answer key names those ids — and
// then sanitizes the stored item AGAIN for the browser, on first issue and on
// every resume. When re-sanitizing re-hashed the ids, the browser's options no
// longer matched the key, and every option, the right one included, was graded
// wrong. No unit test runs the issue callable and the submit callable back to
// back, which is the only place the two id spaces meet; this does.
//
// The seed is the open session issueNextQuestion writes: an active session
// whose `currentQuestion` is the sanitized item plus its private grading. The
// real exported functions run with a synthetic student auth context (v2 onCall
// exposes `.run`).

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

const CLASS_ID = 'path-choice-harness-class';
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
  familyId: `mathmaster:A.5A:choice-harness:${id}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 2,
  calculatorPolicy: 'inherit',
  ...fields,
});

// Question-level options answered through a choice field.
const questionLevelChoice = question('choice-harness-question-level', {
  prompt: 'Which value of x solves 2x + 3 = 11?',
  choices: [{ id: 'opt-1', label: '$x = 7$' }, { id: 'opt-2', label: '$x = 4$' }, { id: 'opt-3', label: '$x = 3$' }],
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-2' }],
});

// Options declared on the field itself.
const fieldLevelChoice = question('choice-harness-field-level', {
  prompt: 'Is the relation {(1, 2), (2, 3), (3, 4)} a function?',
  responseFields: [{
    id: 'answer', label: 'Relation', inputProfile: 'choice', expected: 'yes',
    choices: [{ id: 'yes', label: 'Function' }, { id: 'no', label: 'Not a function' }],
  }],
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
  });
};

const seedSession = async ({ studentId, sessionId, item }) => {
  await db.recursiveDelete(db.collection('grades').doc(studentId)).catch(() => {});
  await db.collection('pathSessions').doc(sessionId).delete().catch(() => {});
  const prior = await db.collection('pathSubmissions').where('sessionId', '==', sessionId).get();
  await Promise.all(prior.docs.map((entry) => entry.ref.delete()));
  await db.collection('grades').doc(studentId).set({ studentId, classId: CLASS_ID, classPeriod: '2', assignedTeacherEmail: 'choice-harness@example.com' });
  const now = Date.now();
  await db.collection('pathSessions').doc(sessionId).set({
    sessionId,
    studentId,
    status: 'active',
    sessionKind: 'practice',
    assessmentFramework: null,
    coursePracticeIntent: null,
    courseId: 'algebra1',
    classId: CLASS_ID,
    weekKey: null,
    weeklySlotKey: null,
    weeklySlot: null,
    requiredQuestions: 2,
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

const servedOptions = (questionInstance) => (
  questionInstance.choices?.length
    ? questionInstance.choices
    : (questionInstance.responseFields || []).flatMap((field) => field.choices || [])
);

const answerAsServed = async ({ authored, label, tag }) => {
  const studentId = `path-choice-harness-${tag}-student`;
  const sessionId = `path-choice-harness-${tag}-session`;
  await seedSession({ studentId, sessionId, item: await openItem(authored, `qi-choice-harness-${tag}`) });

  // The browser's copy of the open item, from the real issue callable — the
  // same call a resume makes.
  const { questionInstance } = await functionsIndex.issueNextQuestion.run(studentRequest(studentId, { sessionId }));
  const option = servedOptions(questionInstance).find((choice) => choice.label === label);
  assert.ok(option, `the served item lists the option "${label}"`);
  assert.doesNotMatch(option.id, /^(opt-|yes$|no$)/, 'author ids never reach the browser');

  const result = await functionsIndex.submitPathResponse.run(studentRequest(studentId, {
    sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId: `sub-choice-harness-${tag}`,
    responsePayload: { responses: { answer: option.id } },
  }));
  return result.grading;
};

test('the right option of a question-level multiple-choice item, as served, is graded right', async () => {
  const grading = await answerAsServed({ authored: questionLevelChoice, label: '$x = 4$', tag: 'question-right' });
  assert.equal(grading.isCorrect, true, 'the option the browser was given for the right answer must be graded right');
});

test('a wrong option, as served, is still graded wrong', async () => {
  const grading = await answerAsServed({ authored: questionLevelChoice, label: '$x = 7$', tag: 'question-wrong' });
  assert.equal(grading.isCorrect, false);
});

test('the right option of a field-level multiple-choice item, as served, is graded right', async () => {
  const grading = await answerAsServed({ authored: fieldLevelChoice, label: 'Function', tag: 'field-right' });
  assert.equal(grading.isCorrect, true);
});
