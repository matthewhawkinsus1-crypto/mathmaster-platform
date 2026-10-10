// A correct first try on My Math Path is independent evidence, through the
// real Cloud Functions against a real Firestore (QA round 2, R2-M2).
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-path-independence \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/pathIndependentFirstTry.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up too, which is how full-platform-suite.yml runs it.)
//
// THE BUG. submitPathResponse marked an answer as helped by whatever THAT
// SAME response released. A Path item allows one attempt, so every answer
// closes its item, and a closed item always releases its solution review. So
// every Path answer, including a correct first try, was stored as
// "worked example used". A student working only on the Path could never
// reach Mastered: "0 of 2 on your own", estimate 45 for 3 right of 5.
//
// The repro is the QA sequence: five one-attempt multiple-choice items
// answered right, wrong, right, wrong, right, with no hints. The evidence then
// runs through the real mastery trigger and the shared checklist.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { masteryChecklist } from '../../functions/shared/masteryRule.mjs';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';

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

const CLASS_ID = 'path-independence-harness-class';
const SKILL = 'A.4B';
const studentRequest = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId } },
  data,
  rawRequest: { headers: {} },
});

// An authored item with everything the ladder can release: a review on close
// and hints after a second miss.
const authoredItem = (n) => ({
  id: `path-independence-item-${n}`,
  active: true,
  alignmentKeys: [`texas:${SKILL}`],
  courseId: 'algebra1',
  familyId: `mathmaster:${SKILL}:independence-harness:${n}`,
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 2,
  calculatorPolicy: 'inherit',
  prompt: `Item ${n}: which value of x solves 2x + 3 = 11?`,
  choices: [{ id: 'opt-1', label: '$x = 7$' }, { id: 'opt-2', label: '$x = 4$' }, { id: 'opt-3', label: '$x = 3$' }],
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'choice', expected: 'opt-2' }],
  supportHints: ['Undo the addition first, then the multiplication.'],
  solutionReview: {
    headline: 'Undo each operation in reverse order.',
    reasoning: ['Subtract 3 from both sides.', 'Divide both sides by 2.'],
  },
});

// The `currentQuestion` issueNextQuestion writes for a bank item.
const openItem = async (authored, questionInstanceId, { attemptsAllowed = 1, supportReleased } = {}) => {
  const plan = await mathPath.buildIssuePlan(authored);
  assert.ok(plan.issuable, `${authored.id} must be issuable`);
  return secureItems.storableItem({
    ...mathPath.buildSanitizedQuestion(authored, { questionInstanceId, attemptsAllowed, attemptsUsed: 0, toolPayload: plan.toolPayload }),
    bankQuestionId: authored.id,
    sourceBankQuestionId: authored.id,
    generatorParameters: null,
    skillCode: SKILL,
    pathRole: 'continue',
    coursePassLevel: 1,
    alignmentKeys: [`texas:${SKILL}`],
    attemptsAllowed,
    attemptsUsed: 0,
    applicableSupports: [],
    authorizedSupports: [],
    privateGrading: plan.privateGrading,
    privateSupport: buildPrivateSupport(authored),
    ...(supportReleased ? { supportReleased } : {}),
  });
};

const resetStudent = async (studentId, sessionId) => {
  await db.recursiveDelete(db.collection('grades').doc(studentId)).catch(() => {});
  await db.collection('studentMasteryProfiles').doc(studentId).delete().catch(() => {});
  await db.collection('pathSessions').doc(sessionId).delete().catch(() => {});
  const prior = await db.collection('pathSubmissions').where('sessionId', '==', sessionId).get();
  await Promise.all(prior.docs.map((entry) => entry.ref.delete()));
  await db.collection('grades').doc(studentId).set({ studentId, classId: CLASS_ID, classPeriod: '2', assignedTeacherEmail: 'independence-harness@example.com' });
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
    requiredQuestions: 20,
    coursePassLevel: 1,
    target: { alignmentKey: `texas:${SKILL}` },
    summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
    pathState: { counters: { questionsThisSession: 0 } },
    currentSkillCode: SKILL,
    excursion: null,
    diagnosing: null,
    lastDecision: null,
    evidenceBySkill: {},
    route: [],
    createdAt: now,
    updatedAt: now,
    currentQuestion: null,
  });
};

// Put `item` on screen (the issue callable, as a resume would) and answer it.
let submissions = 0;
const answer = async ({ studentId, sessionId, item, right }) => {
  // A later attempt on the same item answers what the server stored.
  if (item) await db.collection('pathSessions').doc(sessionId).update({ status: 'active', currentQuestion: item });
  const { questionInstance } = await functionsIndex.issueNextQuestion.run(studentRequest(studentId, { sessionId }));
  const options = questionInstance.choices?.length ? questionInstance.choices : (questionInstance.responseFields || []).flatMap((field) => field.choices || []);
  const option = options.find((choice) => choice.label === (right ? '$x = 4$' : '$x = 7$'));
  assert.ok(option, 'the served item lists the option');
  submissions += 1;
  const result = await functionsIndex.submitPathResponse.run(studentRequest(studentId, {
    sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId: `sub-independence-${submissions}`,
    responsePayload: { responses: { answer: option.id } },
  }));
  assert.equal(result.grading.isCorrect, right, `graded ${right ? 'right' : 'wrong'}`);
  return result;
};

const evidenceFor = async (studentId) => (await db.collection('grades').doc(studentId).collection('evidenceEvents').get()).docs;

// The real mastery trigger, once per evidence event (v2 triggers expose `.run`).
const applyEvidence = async (studentId, docs) => {
  for (const snapshot of docs) {
    await functionsIndex.updateMyMathPathMasteryFromEvidence.run({ data: snapshot, params: { studentId, eventId: snapshot.id } });
  }
  const stored = (await db.collection('studentMasteryProfiles').doc(studentId).get()).data();
  const profile = stored?.profiles?.[SKILL];
  assert.ok(profile, `a mastery profile for ${SKILL} (stored: ${JSON.stringify(Object.keys(stored?.profiles || {}))}; evidence keys: ${JSON.stringify(docs.map((doc) => doc.data().masteryEvidenceKeys || doc.data().alignmentKeys))})`);
  return profile;
};

test('the QA sequence: three correct first tries are three independent successes', async () => {
  const studentId = 'path-independence-qa-student';
  const sessionId = 'path-independence-qa-session';
  await resetStudent(studentId, sessionId);
  const pattern = [true, false, true, false, true];
  for (const [n, right] of pattern.entries()) {
    const result = await answer({ studentId, sessionId, item: await openItem(authoredItem(n), `qi-independence-qa-${n}`), right });
    // The review IS released after each answer — that is not what changed.
    assert.equal(result.solutionReview?.headline, 'Undo each operation in reverse order.', `item ${n}: the review is shown once the item closes`);
  }

  const docs = await evidenceFor(studentId);
  assert.equal(docs.length, 5, 'one evidence event per closed item');
  for (const snapshot of docs) {
    const { supportUsage, performance } = snapshot.data();
    assert.equal(supportUsage.workedExampleUsed, false, `${snapshot.id}: the review shown after the answer did not help it`);
    assert.equal(supportUsage.hintUsed, false, `${snapshot.id}: no hint`);
    assert.equal(supportUsage.isMathematicallyIndependent, true, `${snapshot.id}: independent`);
    assert.equal(performance.isMathematicallyIndependent, true);
  }
  const session = (await db.collection('pathSessions').doc(sessionId).get()).data();
  assert.equal(session.summary.independentSuccesses, 3, 'the session counts 3 on your own');

  const profile = await applyEvidence(studentId, docs);
  assert.equal(profile.accumulator.independentSuccesses, 3);
  assert.equal(profile.mastery.estimate, 60, '3 of 5 right reads as 60, not 45');
  const onYourOwn = masteryChecklist(profile).items.find((item) => item.key === 'independent');
  assert.equal(onYourOwn.progress, '2 of 2');
  assert.equal(onYourOwn.met, true);
});

test('a hint released before the answer still marks it supported', async () => {
  const studentId = 'path-independence-hint-student';
  const sessionId = 'path-independence-hint-session';
  await resetStudent(studentId, sessionId);
  // Three attempts: miss, miss (the hint is released with this response),
  // then right with the hint on screen.
  const item = await openItem(authoredItem('hint'), 'qi-independence-hint', { attemptsAllowed: 3 });
  await answer({ studentId, sessionId, item, right: false });
  const second = await answer({ studentId, sessionId, item: null, right: false });
  assert.equal(second.support?.hint, 'Undo the addition first, then the multiplication.', 'the second miss releases the hint');
  const stored = (await db.collection('pathSessions').doc(sessionId).get()).data().currentQuestion;
  assert.equal(stored.supportReleased.hintReleased, true, 'and it is carried to the next attempt');
  await answer({ studentId, sessionId, item: null, right: true });

  const byAttempt = Object.fromEntries((await evidenceFor(studentId)).map((snapshot) => [snapshot.data().performance.attemptNumber, snapshot.data().supportUsage]));
  assert.deepEqual(Object.keys(byAttempt).sort(), ['1', '2', '3']);
  assert.equal(byAttempt[1].hintUsed, false, 'attempt 1: no hint yet');
  assert.equal(byAttempt[2].hintUsed, false, 'attempt 2: the hint it released came after it');
  assert.equal(byAttempt[2].isMathematicallyIndependent, true);
  assert.equal(byAttempt[3].hintUsed, true, 'attempt 3: the hint was on screen before it');
  assert.equal(byAttempt[3].isMathematicallyIndependent, false);
  assert.equal(byAttempt[3].workedExampleUsed, false, 'the review came after it');
});

test('a review released before the answer still marks it as a worked example', async () => {
  const studentId = 'path-independence-review-student';
  const sessionId = 'path-independence-review-session';
  await resetStudent(studentId, sessionId);
  const item = await openItem(authoredItem('review'), 'qi-independence-review', { supportReleased: { hintReleased: false, reviewReleased: true } });
  await answer({ studentId, sessionId, item, right: true });
  const [snapshot] = await evidenceFor(studentId);
  assert.equal(snapshot.data().supportUsage.workedExampleUsed, true);
  assert.equal(snapshot.data().supportUsage.isMathematicallyIndependent, false);
});
