// Trying to defeat the platform on purpose.
//
// Every test here is an attack a student could actually run from a browser
// console: forge a verdict, swap a tool id, replay a submission, ask for the
// answer early, grant yourself an accommodation. The assertions are what must
// remain true when they do.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildPublicToolPayload, buildPrivateToolGrading, gradePathResponse, resolvePathToolId,
} from '../../functions/shared/pathToolContracts.mjs';
import { buildAttemptSupportPayload, buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { resolveSupportEntitlements, reconcileSupportDelivery, attemptsWithEntitlements, SUPPORT } from '../../functions/shared/supportEntitlements.mjs';
import { createTeacherPathRuntime } from '../../src/platform/simulation/teacherPathRuntime.js';

const serverSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

const TARGET = 'A.5C';
const item = (overrides = {}) => ({
  id: 'adv_item_1',
  active: true,
  alignmentKeys: [`texas:${TARGET}`],
  courseId: 'algebra1',
  familyId: 'path:adv:1',
  familyVersion: 1,
  questionType: 'response',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 2,
  prompt: 'Solve for x.',
  responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected: '7' }],
  solutionReview: { headline: 'Here is how', reasoning: ['Step one.', 'Step two.'], answerSummary: 'x = 7' },
  ...overrides,
});

const runtimeFor = (records, options = {}) => createTeacherPathRuntime({
  assignments: [],
  pathBankQuestions: records,
  courseId: 'algebra1',
  learner: { id: 'teacherSimulation:adv', gradesByAssignment: {} },
  ...options,
});

// --- Forging the verdict -------------------------------------------------------

test('ATTACK a forged isCorrect does not decide a secure grade', async () => {
  const runtime = runtimeFor([item()]);
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 1 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const result = await runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    responsePayload: { responses: { answer: '999' } },
    isCorrect: true, // the lie
    supportUsage: { isMathematicallyIndependent: true },
  });
  assert.equal(result.grading.isCorrect, false,
    'a field-graded question is marked from the server-held key, not from what the browser asserts');
});

test('ATTACK the production grader never reads a browser verdict', () => {
  // Assert the MECHANISM rather than the prose around it: the verdict is built
  // from what the grader returned, and the grader was handed the key the
  // server stored on the session document.
  assert.ok(serverSource.includes('mathPath.gradePathToolResponse(currentQuestion.privateGrading, request.data?.responsePayload'),
    'grading must read the server-held key and only the response from the request');
  assert.ok(serverSource.includes('const gradingCore = { isCorrect: gradingResult.isCorrect'),
    'the recorded verdict must come from the grader');
  assert.ok(!/isCorrect:\s*(?:Boolean\()?request\.data/.test(serverSource),
    'no verdict field may be taken from the request');
});

// --- Reading the answer early --------------------------------------------------

test('ATTACK the public payload of every contracted tool withholds the key', () => {
  const shapes = [
    { type: 'stepAlgebra', equation: '2x + 5 = 19', variable: 'x', answer: '7', acceptedAnswers: ['7.0'] },
    { type: 'intervalNumberLine', min: -10, max: 10, ask: ['graph'], expectedIntervals: [{ start: 2, end: Infinity }], expectedNotation: '[2, inf)' },
    { type: 'systemsWorkspace', mode: 'linear', system: { m1: 2, b1: -1, m2: -1, b2: 5 } },
    { type: 'relationMapping', pairs: [{ x: 1, y: 2 }], ask: ['isFunction'] },
    { type: 'functionInvestigation', functionSpec: { type: 'linear', m: 2, b: 1 }, pointTasks: [{ id: 'p1', x: 0, expected: [0, 1] }] },
  ];
  shapes.forEach((question) => {
    const payload = buildPublicToolPayload({ ...question, prompt: 'x' });
    assert.ok(payload, `${question.type} must produce a payload`);
    const serialized = JSON.stringify(payload);
    ['expectedIntervals', 'expectedNotation', 'acceptedAnswers', '"answer"', '"solution"', '"expected"']
      .forEach((key) => assert.ok(!serialized.includes(key),
        `${question.type} public payload leaks ${key}`));
  });
});

test('ATTACK the solution review is withheld until the question is finalized', () => {
  const support = buildPrivateSupport(item());
  const midQuestion = buildAttemptSupportPayload({
    support, attemptNumber: 1, attemptsAllowed: 3, isCorrect: false, questionFinalized: false,
  });
  assert.equal(midQuestion.solutionReview ?? null, null,
    'a student with attempts left must not be able to read the worked solution');

  const closed = buildAttemptSupportPayload({
    support, attemptNumber: 3, attemptsAllowed: 3, isCorrect: false, questionFinalized: true,
  });
  assert.ok(closed.solutionReview, 'and must receive it once the question closes');
});

test('ATTACK asking for a hint early does not release one', () => {
  const support = buildPrivateSupport(item({ hints: ['Think about the inverse operation.'] }));
  const first = buildAttemptSupportPayload({
    support, attemptNumber: 1, attemptsAllowed: 3, isCorrect: false, questionFinalized: false,
  });
  assert.equal(first.support?.hint ?? null, null, 'the hint is released on the second miss, not the first');
});

// --- Swapping the tool ---------------------------------------------------------

test('ATTACK an unknown or swapped tool id fails closed', () => {
  assert.equal(resolvePathToolId({ type: 'notATool' }), null);
  assert.equal(resolvePathToolId({ type: 'parabolaGeometryLab' }), null,
    'a registry tool with no server contract must not be issuable on the Path');
  assert.equal(buildPublicToolPayload({ type: 'parabolaGeometryLab', prompt: 'x' }), null,
    'and must produce no payload rather than a downgraded text box');
});

test('ATTACK a response in the wrong shape is rejected, not marked wrong', () => {
  const question = { type: 'intervalNumberLine', min: -10, max: 10, ask: ['graph'], expectedIntervals: [{ start: 2, end: 5 }] };
  const definition = buildPrivateToolGrading(question);
  const rejected = gradePathResponse({ privateGrading: definition, raw: { nonsense: true } });
  assert.equal(rejected.rejected, true,
    'a malformed response must not burn an attempt by being graded as incorrect');
});

test('ATTACK the grading definition comes from the server, never from the request', () => {
  assert.ok(serverSource.includes('privateGrading: issuePlan.privateGrading'),
    'the key is written onto the session document at issue time');
  assert.ok(!/privateGrading:\s*request\.data/.test(serverSource),
    'and is never taken from the request');
});

// --- Replaying and double-submitting -------------------------------------------

test('ATTACK replaying a submission id returns the first result rather than a second attempt', async () => {
  const runtime = runtimeFor([item(), item({ id: 'adv_item_2' })]);
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 2 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const args = {
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId: 'replay-me',
    responsePayload: { responses: { answer: '1' } },
    supportUsage: { isMathematicallyIndependent: true },
  };
  const first = await runtime.submitStudentResponse(args);
  const replay = await runtime.submitStudentResponse(args);
  const replayAgain = await runtime.submitStudentResponse(args);

  assert.deepEqual(replay.grading, first.grading);
  assert.deepEqual(replayAgain.grading, first.grading);
  assert.equal(first.grading.attemptNumber, replayAgain.grading.attemptNumber,
    'three replays must not consume three attempts');
});

test('ATTACK a rapid double-submit with different answers does not skip an attempt', async () => {
  const runtime = runtimeFor([item()]);
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 1 });
  const { questionInstance } = await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });

  const submit = (answer, submissionId) => runtime.submitStudentResponse({
    sessionId: session.sessionId,
    questionInstanceId: questionInstance.questionInstanceId,
    submissionId,
    responsePayload: { responses: { answer } },
    supportUsage: { isMathematicallyIndependent: true },
  });
  const a = await submit('1', 'sub-a');
  const b = await submit('2', 'sub-b');
  assert.equal(a.grading.attemptNumber, 1);
  assert.equal(b.grading.attemptNumber, 2, 'two genuinely different answers are two attempts');
});

test('ATTACK a stale question instance id is refused', async () => {
  const runtime = runtimeFor([item(), item({ id: 'adv_item_2' })]);
  const { session } = await runtime.startOrResumePathSession({ targetAlignmentKey: TARGET, requiredQuestions: 2 });
  await runtime.fetchNextSanitizedQuestion({ sessionId: session.sessionId });
  await assert.rejects(
    () => runtime.submitStudentResponse({
      sessionId: session.sessionId,
      questionInstanceId: 'qi_forged_by_hand',
      responsePayload: { responses: { answer: '7' } },
    }),
    /no longer active/i,
  );
});

// --- Self-granting an entitlement ----------------------------------------------

test('ATTACK a browser cannot grant itself an accommodation', () => {
  const entitlements = resolveSupportEntitlements({ accommodations: [] });
  const delivery = reconcileSupportDelivery({
    entitlements,
    applicable: [],
    clientPresented: [SUPPORT.CALCULATOR, SUPPORT.EXTRA_ATTEMPTS, SUPPORT.REDUCED_CHOICES],
    clientUsed: [SUPPORT.CALCULATOR],
  });
  assert.deepEqual(delivery.presented, []);
  assert.deepEqual(delivery.used, []);
  assert.equal(delivery.rejectedClaims.length, 3, 'every unauthorized claim is recorded');
});

test('ATTACK a browser cannot grant itself extra attempts', () => {
  // Attempts are computed on the server from the stored profile. Nothing in the
  // request participates.
  assert.ok(serverSource.includes('await mathPath.attemptsForQuestion(issued, baseAttempts, entitlements)'));
  assert.ok(!/attemptsAllowed[^\n]*request\.data/.test(serverSource),
    'the request must never influence how many attempts a question allows');
  const none = resolveSupportEntitlements({});
  assert.equal(attemptsWithEntitlements(3, none), 3);
});

test('ATTACK a self-declared modified curriculum does not reach the entitlement model', () => {
  // A modification changes what a student is expected to learn. It has to come
  // from the stored profile, not from a payload.
  const entitlements = resolveSupportEntitlements({ accommodations: [] });
  assert.equal(entitlements.modification.isModifiedCurriculum, false);
  assert.ok(serverSource.includes('modified: Boolean(claimed.modified)'),
    'a claimed modification is coerced, and it excludes the evidence rather than easing the grade');
});

test('ATTACK claimed support usage cannot make a supported success look independent', () => {
  // The inverse attack: a student who used a hint claims independence to earn
  // stronger mastery evidence. Hint release is a server fact.
  assert.ok(serverSource.includes('hintUsed: hintReleased'));
  assert.ok(!/hintUsed:\s*Boolean\(claimed/.test(serverSource),
    'hint usage must never be taken from the request');
});

// --- Teacher simulation must not become a student -------------------------------

test('ATTACK the simulator runtime has no route to real student data', () => {
  const runtimeSource = readFileSync(new URL('../../src/platform/simulation/teacherPathRuntime.js', import.meta.url), 'utf8');
  ['setDoc(', 'updateDoc(', 'addDoc(', 'writeBatch(', 'httpsCallable(', 'getFirestore(']
    .forEach((forbidden) => assert.ok(!runtimeSource.includes(forbidden),
      `the simulator must not be able to reach live data (found ${forbidden})`));
});

test('ATTACK the student callables still require a student claim', () => {
  assert.ok(serverSource.includes('requireStudent(request)'),
    'the Path callables must not have been loosened to admit a teacher simulation');
});
