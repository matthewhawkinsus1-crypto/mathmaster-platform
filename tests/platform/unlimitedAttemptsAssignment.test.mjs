/*
 * AN ASSIGNMENT MAY DECLARE UNLIMITED ATTEMPTS — AND NOTHING ELSE MOVES.
 *
 * `gradingPolicy.attemptPolicy: "unlimited"` in an Assignment V5 file gives
 * that assignment's Warm-Up, Classwork and Practice questions unlimited
 * attempts. The number of tries is read in many places (the question on the
 * student's screen, the Overview, submission ingestion and the deadline
 * finalizer on the server, the teacher's case review, Pre-Flight); they all
 * take it from ONE resolver, `getEffectiveActivityPolicy(role, assignment)`.
 *
 * What this file holds the platform to:
 *
 *   1. the declaration survives the teacher's import and publish chain and the
 *      round trip through the stored assignment, and a value outside the
 *      vocabulary is refused in words a teacher can act on;
 *   2. a DOL, quiz, test, Test Cycle Review or Corrections question keeps its
 *      own count whatever the file says — on the server, where it matters;
 *   3. the server (ingestion and the deadline finalizer) and the browser
 *      record the same thing for the same answers, a 4th and 5th miss
 *      included, and a correct answer after them is full credit as a correct
 *      2nd or 3rd attempt has always been;
 *   4. nothing a person reads prints the very large number that stands for
 *      "unlimited";
 *   5. with the field absent, every existing lesson resolves exactly as it
 *      did: the same policy object, the same limit for every question.
 *
 * Synthetic identities only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTIVITY_POLICIES,
  ACTIVITY_ROLES,
  ATTEMPT_POLICY,
  UNLIMITED_ATTEMPTS,
  UNLIMITED_ATTEMPT_ROLES,
  assignmentDeclaresUnlimitedAttempts,
  attemptLimitLabel,
  attemptsAreUnlimited,
  getEffectiveActivityPolicy,
  toEnforcedActivityPolicy,
} from '../../functions/shared/activityPolicies.mjs';
import * as clientPolicies from '../../src/platform/policies/activityPolicies.js';
import {
  getAttemptsRemaining,
  getQuestionCredit,
  normalizeQuestionRecord,
  recordQuestionAttempt,
  resolveQuestionMaximumAttempts,
} from '../../src/attemptPolicy.js';
import { buildIngestedAttempt } from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope, normalizeSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { buildCheckpointFinalization } from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { normalizeCheckpointResponse } from '../../src/platform/performance/responseCheckpoint.js';
import { normalizeAssignmentV5, validateAssignmentV5, flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { canonicalV5PersistencePatch, storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import {
  UNLIMITED_TRIES_MISS,
  UNLIMITED_TRIES_STRIP,
  missOutcomeText,
  submitActionLabel,
  submitTryCost,
  triesLeftText,
} from '../../src/platform/student/submitCost.js';
import { QUESTION_STATUS, describeNavigatorQuestion } from '../../src/platform/student/assignmentNavigator.js';
import { analyzeAssignmentQuestions, QUESTION_OUTCOME } from '../../src/platform/caseReview/attemptAnalysis.js';
import { loadLanguagePack, translateWithPack } from '../../src/platform/language/translationProviders.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { functionsBackendSource } from './helpers/functionsBackendSource.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(REPO, path), 'utf8');

const UNLIMITED = { gradingPolicy: { attemptPolicy: 'unlimited', scoring: 'platformDefault' } };
const ROLE_POLICY = { gradingPolicy: { attemptPolicy: 'rolePolicy', scoring: 'platformDefault' } };

/* ------------------------------------------------------------ the resolver */

test('unlimited applies to Warm-Up, Classwork and Practice, and to no other role', () => {
  assert.deepEqual([...UNLIMITED_ATTEMPT_ROLES].sort(), ['classwork', 'practice', 'warmup']);
  Object.values(ACTIVITY_ROLES).forEach((role) => {
    const base = getEffectiveActivityPolicy(role);
    const resolved = getEffectiveActivityPolicy(role, UNLIMITED);
    if (UNLIMITED_ATTEMPT_ROLES.includes(role)) {
      assert.equal(resolved.attempts, UNLIMITED_ATTEMPTS, `${role} is unlimited`);
      assert.equal(attemptsAreUnlimited(resolved.attempts), true);
      // Nothing but the count changes: feedback, hints, replacement, grading
      // and mastery weights are the role's own.
      const { attempts: _attempts, attemptsUnlimited: _flag, ...rest } = resolved;
      const { attempts: _baseAttempts, ...baseRest } = base;
      assert.deepEqual(rest, baseRest, `${role} keeps every other policy field`);
      assert.equal(Object.isFrozen(resolved), true);
    } else {
      assert.equal(resolved, base, `${role} keeps the role's own policy object, whatever the file says`);
    }
  });
  assert.equal(getEffectiveActivityPolicy('dol', UNLIMITED).attempts, 1);
  assert.equal(getEffectiveActivityPolicy('quiz', UNLIMITED).attempts, 1);
  assert.equal(getEffectiveActivityPolicy('test', UNLIMITED).attempts, 1);
  assert.equal(getEffectiveActivityPolicy('review', UNLIMITED).attempts, 3);
  assert.equal(getEffectiveActivityPolicy('corrections', UNLIMITED).attempts, 3);
});

test('only the exact declaration counts, and a Test Cycle is never unlimited', () => {
  assert.equal(assignmentDeclaresUnlimitedAttempts(UNLIMITED), true);
  [
    null, undefined, {}, ROLE_POLICY,
    { gradingPolicy: null },
    { gradingPolicy: { attemptPolicy: 'Unlimited' } },
    { gradingPolicy: { attemptPolicy: ' unlimited ' } },
    { gradingPolicy: { attemptPolicy: true } },
    { gradingPolicy: { attemptPolicy: 99 } },
    { attemptPolicy: 'unlimited' },
    { deliveryPolicy: { attemptPolicy: 'unlimited' } },
    // An assignment with an assessment policy is a Test Cycle.
    { ...UNLIMITED, assessmentPolicy: { mode: 'testCycle' } },
  ].forEach((assignment) => {
    assert.equal(assignmentDeclaresUnlimitedAttempts(assignment), false, JSON.stringify(assignment));
    Object.values(ACTIVITY_ROLES).forEach((role) => {
      assert.equal(getEffectiveActivityPolicy(role, assignment), ACTIVITY_POLICIES[role], `${role} with ${JSON.stringify(assignment)}`);
    });
  });
});

test('the browser resolves through the server\'s own module: there is no second copy to drift', () => {
  assert.equal(clientPolicies.getEffectiveActivityPolicy, getEffectiveActivityPolicy);
  assert.equal(clientPolicies.toEnforcedActivityPolicy, toEnforcedActivityPolicy);
  assert.equal(clientPolicies.UNLIMITED_ATTEMPTS, UNLIMITED_ATTEMPTS);
  assert.equal(clientPolicies.attemptsAreUnlimited, attemptsAreUnlimited);
  assert.equal(clientPolicies.assignmentDeclaresUnlimitedAttempts, assignmentDeclaresUnlimitedAttempts);
});

test('"unlimited" is a number that survives JSON and the attempt arithmetic', () => {
  assert.equal(Number.isSafeInteger(UNLIMITED_ATTEMPTS), true);
  assert.equal(JSON.parse(JSON.stringify({ n: UNLIMITED_ATTEMPTS })).n, UNLIMITED_ATTEMPTS);
  // What is left after any real number of tries is still unlimited.
  assert.equal(attemptsAreUnlimited(UNLIMITED_ATTEMPTS - 5000), true);
  [0, 1, 3, 23, 99, null, undefined, NaN, 'unlimited'].forEach((count) => {
    assert.equal(attemptsAreUnlimited(count), false, String(count));
  });
  assert.equal(attemptLimitLabel(UNLIMITED_ATTEMPTS), 'unlimited');
  assert.equal(attemptLimitLabel(3), '3');
  assert.equal(attemptLimitLabel(1), '1');
});

/* ------------------------------------------------- the file, and the store */

const packet = (patch = {}) => ({
  schemaVersion: 5,
  assignment: { title: 'Cumulative review packet', courseId: 'algebra1', instructionalPurpose: 'review' },
  sections: [
    {
      id: 'cw',
      role: 'classwork',
      title: 'Classwork',
      questions: [
        { questionId: 'cw-1', type: 'multiAnswer', prompt: 'Solve 2x = 8.', answerFields: [{ id: 'x', label: 'x', answer: '4' }], standards: { primary: [{ code: 'A.5A' }] } },
        { questionId: 'cw-2', type: 'multiAnswer', prompt: 'Which family is y = 3x + 1?', answerFields: [{ id: 'family', type: 'choice', options: ['linear', 'quadratic', 'exponential'], answer: 'linear' }], standards: { primary: [{ code: 'A.5A' }] } },
      ],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [
        { questionId: 'dol-1', type: 'multiAnswer', prompt: 'Solve 3x = 9.', answerFields: [{ id: 'x', label: 'x', answer: '3' }], standards: { primary: [{ code: 'A.5A' }] } },
      ],
    },
  ],
  ...patch,
});

test('the validator accepts the two attempt policies and refuses anything else in plain words', () => {
  const errorsFor = (gradingPolicy, extra = {}) => validateAssignmentV5(packet({ gradingPolicy, ...extra })).errors
    .filter((error) => /attemptPolicy/.test(error));
  assert.deepEqual(errorsFor(undefined), []);
  assert.deepEqual(errorsFor({}), []);
  assert.deepEqual(errorsFor({ attemptPolicy: 'rolePolicy' }), []);
  assert.deepEqual(errorsFor({ attemptPolicy: 'unlimited' }), []);
  ['Unlimited', 'unlimted', 'infinite', '', 5, true, { mode: 'unlimited' }].forEach((value) => {
    const errors = errorsFor({ attemptPolicy: value });
    assert.equal(errors.length, 1, `refused: ${JSON.stringify(value)}`);
    assert.match(errors[0], /^gradingPolicy\.attemptPolicy /, 'the field path leads the message');
    assert.match(errors[0], /"rolePolicy"/);
    assert.match(errors[0], /"unlimited"/);
    assert.match(errors[0], /DOL, quiz or test keeps its one attempt/);
  });
  const cycle = errorsFor({ attemptPolicy: 'unlimited' }, { assessmentPolicy: { mode: 'testCycle' } });
  assert.equal(cycle.length, 1);
  assert.match(cycle[0], /cannot be used on an assignment with an assessmentPolicy/);
});

test('a bad value stops Pre-Flight: the assignment cannot be created with a misspelt policy', () => {
  const model = buildAssignmentV5PreflightModel(packet({ gradingPolicy: { attemptPolicy: 'unlimted' } }), {});
  assert.equal(model.isValid, false);
  assert.ok(model.errors.some((error) => /gradingPolicy\.attemptPolicy "unlimted" is not an attempt policy/.test(error)), model.errors.join('\n'));
});

// The teacher's import + publish chain (TeacherWorkspace.jsx handleCreateAssignment)
// on a lesson from the library, read here and never written: the authored
// file, with or without the field, then the stored document.
const LIBRARY_LESSON = 'teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json';
const importAndStore = (patch = {}) => {
  const source = { ...JSON.parse(read(LIBRARY_LESSON)), ...patch };
  const parsed = parseAssignmentBlueprintText(JSON.stringify(source));
  const reviewed = buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {});
  const model = buildAssignmentV5PreflightModel(reviewed, {});
  const stored = JSON.parse(JSON.stringify({ id: 'stored-packet', ...canonicalV5PersistencePatch(model.assignmentV5) }));
  return { parsed, reviewed, model, stored };
};

test('the declaration survives compile, Pre-Flight, the stored assignment and the way back', () => {
  const { parsed, reviewed, model, stored } = importAndStore(UNLIMITED);
  assert.equal(parsed.assignmentV5.gradingPolicy.attemptPolicy, 'unlimited', 'through the authoring compiler');
  assert.equal(reviewed.gradingPolicy.attemptPolicy, 'unlimited', 'through the teacher\'s review');
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.assignmentV5.gradingPolicy.attemptPolicy, 'unlimited');
  assert.equal(stored.gradingPolicy.attemptPolicy, 'unlimited', 'on the stored assignment the server reads');
  assert.equal(stored.gradingPolicy.scoring, 'platformDefault', 'scoring is untouched');
  assert.equal(storedAssignmentToV5(stored).gradingPolicy.attemptPolicy, 'unlimited', 'and back into Pre-Flight when it is edited');
  // The stored assignment is what every runtime resolver is handed.
  assert.equal(getEffectiveActivityPolicy('classwork', stored).attempts, UNLIMITED_ATTEMPTS);
  assert.equal(getEffectiveActivityPolicy('dol', stored).attempts, 1);
});

test('Pre-Flight shows the teacher the attempts each section will really get', () => {
  const { model } = importAndStore(UNLIMITED);
  const byRole = Object.fromEntries(model.sections.map((section) => [section.role, section.policy]));
  assert.equal(attemptLimitLabel(byRole.classwork.attemptsAllowed), 'unlimited');
  assert.equal(byRole.dol.attemptsAllowed, 1);
  const plain = importAndStore().model;
  assert.deepEqual(
    plain.sections.map((section) => section.policy),
    plain.sections.map((section) => toEnforcedActivityPolicy(section.role)),
    'without the field a section\'s enforced policy is the role\'s, field for field',
  );

  // The two lines of Pre-Flight that print a limit print the label, from the
  // policy resolved for the assignment under review.
  const modal = executableSource(read('src/components/teacher/LessonPreflightModal.jsx'));
  assert.match(modal, /getEffectiveActivityPolicy\(currentActivity\.role, effectiveAssignmentV5\)/);
  assert.match(modal, /<div>Attempts: \{attemptLimitLabel\(currentPolicy\.attempts\)\}<\/div>/);
  assert.match(modal, /\{attemptLimitLabel\(activity\.policy\.attemptsAllowed\)\} attempt/);
  assert.doesNotMatch(modal, /Attempts: \{currentPolicy\.attempts\}/);
  // And its student preview runs under that same policy.
  assert.match(region(modal, '<MathMasterToolWrapper', 'executionScope="teacherPreview"', 'the Pre-Flight preview'), /activityPolicy=\{currentPolicy\}/);
});

/* ------------------------------------------------------------- the server */

const CAPTURED_AT = Date.parse('2026-11-23T15:00:00.000Z');
const STUDENT = 'synthetic-student-1';
const classworkQuestion = { questionId: 'cw-1', type: 'multiAnswer', prompt: 'Solve 2x = 8.', answerFields: [{ id: 'x', label: 'x', answer: '4' }], activityRole: 'classwork' };
const choiceQuestion = { questionId: 'cw-2', type: 'multiAnswer', prompt: 'Which family?', answerFields: [{ id: 'family', type: 'choice', options: ['linear', 'quadratic', 'exponential'], answer: 'linear' }], activityRole: 'classwork' };
const warmupQuestion = { ...classworkQuestion, questionId: 'wu-1', activityRole: 'warmup' };
const practiceQuestion = { ...classworkQuestion, questionId: 'pr-1', activityRole: 'practice' };
const dolQuestion = { questionId: 'dol-1', type: 'multiAnswer', prompt: 'Solve 3x = 9.', answerFields: [{ id: 'x', label: 'x', answer: '3' }], activityRole: 'dol' };
const quizQuestion = { ...dolQuestion, questionId: 'quiz-1', activityRole: 'quiz' };
const testQuestion = { ...dolQuestion, questionId: 'test-1', activityRole: 'test' };

const storedAssignment = (patch = {}) => ({
  id: 'synthetic-assignment-1',
  schemaVersion: 5,
  questions: [classworkQuestion, choiceQuestion, warmupQuestion, practiceQuestion, dolQuestion, quizQuestion, testQuestion],
  ...patch,
});

const fieldId = (question) => question.answerFields[0].id;

/*
 * One Submit, as the browser makes it and as the server hears it.
 *
 * The browser marks the answer with the shared grader, records the attempt
 * under the policy App.jsx resolves for the assignment (handleGradeSubmit
 * applyAttempt) and queues the envelope the outbox sends; ingestion then
 * builds the server's own record from the raw response. Returns both.
 */
const submitAnswer = ({ assignment, question, clientRecord = null, canonicalRecord = null, value, claimedRole = question.activityRole, at = CAPTURED_AT }) => {
  const responses = { [fieldId(question)]: value };
  const attemptInputs = attemptInputsFromGrading({ ...gradeMultiAnswerResponse(question, responses), graded: true });
  const policy = clientPolicies.getEffectiveActivityPolicy(question.activityRole, assignment);
  const client = recordQuestionAttempt({
    record: clientRecord,
    isCorrect: attemptInputs.isCorrect,
    questionDetails: question.prompt,
    parts: attemptInputs.parts,
    responseKey: JSON.stringify(responses),
    partialCreditPercent: attemptInputs.partialCreditPercent,
    maximumAttempts: resolveQuestionMaximumAttempts({ question, maximumAttempts: policy.attempts, activityPolicy: policy }),
  });
  const current = normalizeQuestionRecord(canonicalRecord);
  const envelope = normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-${question.questionId}-${current.totalAttempts + 1}`,
    kind: 'ordinarySubmission',
    studentId: STUDENT,
    assignmentId: assignment.id,
    questionIndex: assignment.questions.indexOf(question),
    questionId: question.questionId,
    activityRole: claimedRole,
    capturedAt: at + current.totalAttempts * 60_000,
    previousTotalAttempts: current.totalAttempts,
    record: client.record,
    response: normalizeCheckpointResponse(question, { parts: attemptInputs.parts, responseKey: JSON.stringify(responses), isComplete: true }),
  }));
  const server = buildIngestedAttempt({
    envelope,
    assignment,
    question,
    canonicalRecord,
    gradeDocument: { studentId: STUDENT, classId: 'synthetic-class-1', gradesByAssignment: {} },
    ingestedAt: at + current.totalAttempts * 60_000 + 5_000,
  });
  return { client, server };
};

const ingestAnswer = (options) => submitAnswer(options).server;

/** Wrong answers, then (optionally) the right one. Returns every step the server built. */
const serverRun = ({ assignment, question, wrong, thenCorrect = true }) => {
  const steps = [];
  let record = null;
  const answer = question.answerFields[0].answer;
  const wrongValue = question.answerFields[0].options ? question.answerFields[0].options.find((option) => option !== answer) : '999';
  for (let attempt = 0; attempt < wrong; attempt += 1) {
    const built = ingestAnswer({ assignment, question, canonicalRecord: record, value: wrongValue });
    steps.push(built);
    if (built.final || built.blocked) return steps;
    record = built.record;
  }
  if (thenCorrect) steps.push(ingestAnswer({ assignment, question, canonicalRecord: record, value: answer }));
  return steps;
};

test('server ingestion: a Classwork question in an unlimited assignment takes a 4th and a 5th miss and then a correct answer', () => {
  const assignment = storedAssignment(UNLIMITED);
  const steps = serverRun({ assignment, question: classworkQuestion, wrong: 5 });
  assert.equal(steps.length, 6);
  steps.slice(0, 5).forEach((built, index) => {
    assert.equal(built.blocked, false);
    assert.notEqual(built.final, true, `attempt ${index + 1} is recorded, not refused as finished`);
    assert.equal(built.gradedBy, 'server');
    assert.equal(built.record.status, 'attempted', `a miss on attempt ${index + 1} leaves the question open`);
    assert.equal(built.record.attemptCount, index + 1, 'every attempt is counted');
    assert.equal(built.record.totalAttempts, index + 1);
    assert.equal(built.result.expired, false);
    assert.equal(attemptsAreUnlimited(built.result.remainingAttempts), true);
    assert.equal(getQuestionCredit(built.record), 0, 'not yet correct scores as an incorrect question does');
    assert.equal(built.evidenceEvent.performance.attemptNumber, index + 1, 'the attempt number reaches the evidence');
  });
  const correct = steps[5];
  assert.equal(correct.record.status, 'correct');
  assert.equal(correct.record.attemptCount, 6);
  assert.equal(correct.record.totalAttempts, 6, 'six attempts stay on the record for the teacher');
  assert.equal(getQuestionCredit(correct.record), 1, 'correct on a later attempt is full credit, as on a 2nd or 3rd today');
  assert.equal(correct.evidenceEvent.performance.attemptNumber, 6);
  // A correct question is finished, here as everywhere.
  const after = ingestAnswer({ assignment, question: classworkQuestion, canonicalRecord: correct.record, value: '4' });
  assert.equal(after.final, true);
  assert.equal(after.reason, 'question-already-final');
});

test('server ingestion: Warm-Up and Practice are unlimited too, and so is a choice-only question', () => {
  const assignment = storedAssignment(UNLIMITED);
  [warmupQuestion, practiceQuestion, choiceQuestion].forEach((question) => {
    const steps = serverRun({ assignment, question, wrong: 4 });
    assert.equal(steps.length, 5, question.questionId);
    assert.deepEqual(steps.map((built) => built.record?.status), ['attempted', 'attempted', 'attempted', 'attempted', 'correct'], question.questionId);
    assert.equal(steps[4].record.attemptCount, 5);
  });
});

test('server ingestion: a DOL, quiz or test question in an unlimited assignment still gets exactly one attempt', () => {
  const assignment = storedAssignment(UNLIMITED);
  [dolQuestion, quizQuestion, testQuestion].forEach((question) => {
    const first = ingestAnswer({ assignment, question, canonicalRecord: null, value: '999' });
    assert.equal(first.blocked, false, question.questionId);
    assert.equal(first.record.status, 'expired', `${question.activityRole}: one wrong answer uses the only attempt`);
    assert.equal(first.record.attemptCount, 1);
    assert.equal(first.result.remainingAttempts, 0);
    assert.equal(first.result.expired, true);
    const second = ingestAnswer({ assignment, question, canonicalRecord: first.record, value: question.answerFields[0].answer });
    assert.equal(second.final, true, `${question.activityRole}: a second answer, even the right one, is not recorded`);
    assert.equal(second.reason, 'question-already-final');
    assert.equal(second.record.status, 'expired');
    assert.equal(second.record.totalAttempts, 1);
    // Claiming the question is Classwork does not buy the unlimited budget:
    // the role is the stored question's (withAuthoritativeActivityRole judges
    // a mismatch before this, and the limit here is the question's own).
    const claimed = ingestAnswer({ assignment, question, canonicalRecord: first.record, value: question.answerFields[0].answer, claimedRole: null });
    assert.equal(claimed.final, true);
  });
});

test('server ingestion without the declaration: three tries, one for a choice-only question — as before', () => {
  [storedAssignment(), storedAssignment(ROLE_POLICY), storedAssignment({ gradingPolicy: { attemptPolicy: 'Unlimited' } })].forEach((assignment) => {
    const steps = serverRun({ assignment, question: classworkQuestion, wrong: 5, thenCorrect: false });
    assert.deepEqual(steps.slice(0, 3).map((built) => built.record.status), ['attempted', 'attempted', 'expired']);
    assert.equal(steps[2].record.attemptCount, 3);
    assert.equal(steps[3].final, true, 'the 4th answer is not recorded');
    assert.equal(steps.length, 4);
    const choice = serverRun({ assignment, question: choiceQuestion, wrong: 2, thenCorrect: false });
    assert.equal(choice[0].record.status, 'expired');
    assert.equal(choice[1].final, true);
  });
});

/** The deadline finalizer's record for one auto-submitted response. */
const finalize = ({ assignment, question, canonicalRecord, value }) => {
  const responses = { [fieldId(question)]: value };
  const attemptInputs = attemptInputsFromGrading({ ...gradeMultiAnswerResponse(question, responses), graded: true });
  const response = normalizeCheckpointResponse(question, { parts: attemptInputs.parts, responseKey: JSON.stringify(responses), isComplete: true });
  const grading = gradeServerResponse({ question, response });
  assert.equal(grading.graded, true, 'the fixture is a server-graded question');
  return buildCheckpointFinalization({
    checkpoint: {
      documentId: 'cp-1',
      studentId: STUDENT,
      assignmentId: assignment.id,
      questionIndex: assignment.questions.indexOf(question),
      revision: 3,
      response,
      supportUsage: null,
      serverAcknowledgedAt: new Date(CAPTURED_AT),
    },
    assignment,
    question,
    decision: {
      action: 'finalize',
      status: 'auto-submitted',
      activityRole: question.activityRole,
      canonicalRecord: normalizeQuestionRecord(canonicalRecord),
      grading,
      gradingQuestion: question,
      cutoff: CAPTURED_AT + 60_000,
      submissionId: 'checkpoint-submission-1',
    },
    gradeDocument: { studentId: STUDENT, classId: 'synthetic-class-1', gradesByAssignment: {} },
    runAt: CAPTURED_AT + 120_000,
    timeZone: null,
  }).record;
};

test('the deadline finalizer counts the same way: unlimited for Classwork and Warm-Up, one for a DOL', () => {
  const threeMisses = { status: 'attempted', attemptCount: 3, totalAttempts: 3 };
  const unlimited = storedAssignment(UNLIMITED);
  [classworkQuestion, warmupQuestion].forEach((question) => {
    const fourth = finalize({ assignment: unlimited, question, canonicalRecord: threeMisses, value: '999' });
    assert.equal(fourth.status, 'attempted', `${question.activityRole}: an auto-submitted 4th miss does not close the question`);
    assert.equal(fourth.attemptCount, 4);
    const right = finalize({ assignment: unlimited, question, canonicalRecord: fourth, value: '4' });
    assert.equal(right.status, 'correct');
    assert.equal(right.attemptCount, 5);
  });
  const dol = finalize({ assignment: unlimited, question: dolQuestion, canonicalRecord: null, value: '999' });
  assert.equal(dol.status, 'expired', 'a DOL the bell submitted has used its one attempt');
  assert.equal(dol.attemptCount, 1);

  // Without the declaration the same third miss closes a Classwork question.
  const third = finalize({ assignment: storedAssignment(), question: classworkQuestion, canonicalRecord: { status: 'attempted', attemptCount: 2, totalAttempts: 2 }, value: '999' });
  assert.equal(third.status, 'expired');
  assert.equal(third.attemptCount, 3);
});

/* ------------------------------------------------ the browser, in agreement */

const comparable = (record) => {
  const { status, attemptCount, totalAttempts, partialCredit, bestPartialCredit } = normalizeQuestionRecord(record);
  return { status, attemptCount, totalAttempts, partialCredit, bestPartialCredit };
};

test('the browser and the server record the same thing for the same answers, with and without the declaration', () => {
  [storedAssignment(UNLIMITED), storedAssignment()].forEach((assignment) => {
    [classworkQuestion, choiceQuestion, warmupQuestion, practiceQuestion, dolQuestion].forEach((question) => {
      const answer = question.answerFields[0].answer;
      const wrongValue = question.answerFields[0].options ? 'quadratic' : '999';
      let client = null;
      let server = null;
      [false, false, false, false, false, true].forEach((isCorrect, index) => {
        const submitted = submitAnswer({ assignment, question, clientRecord: client, canonicalRecord: server, value: isCorrect ? answer : wrongValue });
        client = submitted.client.record;
        if (!submitted.server.final) {
          assert.equal(submitted.server.gradedBy, 'server');
          server = submitted.server.record;
        }
        assert.deepEqual(
          comparable(client),
          comparable(server),
          `${assignmentDeclaresUnlimitedAttempts(assignment) ? 'unlimited' : 'role policy'} · ${question.questionId} · answer ${index + 1}`,
        );
      });
    });
  });
});

test('the limit every screen shows for a question is the limit the server enforces', () => {
  const assignment = storedAssignment(UNLIMITED);
  const limit = (question) => {
    const policy = getEffectiveActivityPolicy(question.activityRole, assignment);
    return resolveQuestionMaximumAttempts({ question, maximumAttempts: policy.attempts, activityPolicy: policy });
  };
  assert.equal(limit(classworkQuestion), UNLIMITED_ATTEMPTS);
  assert.equal(limit(choiceQuestion), UNLIMITED_ATTEMPTS, 'a choice-only question is unlimited in an unlimited assignment');
  assert.equal(limit(dolQuestion), 1);
  // Without the declaration a choice-only question keeps its one try.
  const plain = getEffectiveActivityPolicy('classwork', storedAssignment());
  assert.equal(resolveQuestionMaximumAttempts({ question: choiceQuestion, maximumAttempts: plain.attempts, activityPolicy: plain }), 1);
  assert.equal(resolveQuestionMaximumAttempts({ question: classworkQuestion, maximumAttempts: plain.attempts, activityPolicy: plain }), 3);
  // A record with any real number of misses is never out of tries.
  assert.equal(getAttemptsRemaining({ status: 'attempted', attemptCount: 40 }, limit(classworkQuestion)) > 0, true);
});

/*
 * EVERY PLACE THAT COUNTS TRIES ON AN ASSIGNMENT HANDS THE RESOLVER THAT
 * ASSIGNMENT. Each is bound to the statement that resolves the policy, so a
 * call that drops the assignment (and silently goes back to three tries on
 * one screen while the server allows more) fails here.
 */
test('every assignment surface resolves its policy with the assignment', () => {
  const sites = [
    ['functions/shared/submissionIngestion.mjs', /const activityPolicy = getEffectiveActivityPolicy\(envelope\.activityRole, assignment\);/],
    ['functions/shared/responseCheckpointFinalizer.mjs', /const activityPolicy = getEffectiveActivityPolicy\(decision\.activityRole, assignment\);/],
    ['src/App.jsx', /const activeActivityPolicy = getEffectiveActivityPolicy\(isPracticeMode \? 'practice' : activeQuestionRole, activeAssignmentData\);/],
    ['src/app/student/assignmentWorkspaceView.jsx', /const runtimeActivityPolicy = getEffectiveActivityPolicy\(runtimeActivityRole, assignment\);/],
    ['src/app/student/assignmentWorkspaceView.jsx', /const policy = getEffectiveActivityPolicy\(entry\.role, assignment\);/],
    ['src/app/student/assignmentWorkspaceView.jsx', /const entryRuntimePolicy = \(entry\) => getEffectiveActivityPolicy\(!preview && lifecycle\.isPracticeOnly \? 'practice' : entry\.role, assignment\);/],
    ['src/platform/assignment/liveQuestionCorrection.js', /const activityPolicy = getEffectiveActivityPolicy\(activityRole, assignment\);/],
    ['src/platform/caseReview/attemptAnalysis.js', /activityPolicy: getEffectiveActivityPolicy\(role, assignment\),/],
    ['src/platform/preflight/assignmentV5PreflightModel.js', /policy: toEnforcedActivityPolicy\(section\?\.role, assignment\),/],
  ];
  sites.forEach(([path, pattern]) => {
    assert.match(executableSource(read(path)), pattern, path);
  });
  // The server hands ingestion and the finalizer the stored assignment
  // document itself, not a projection that could drop `gradingPolicy`.
  const backend = executableSource(functionsBackendSource());
  assert.match(backend, /const assignment = \{ id: assignmentSnapshot\.id, \.\.\.assignmentSnapshot\.data\(\) \};/);
  // The question on the student's screen takes its number from the policy the
  // host resolved (the `activityPolicy` and `maximumAttempts` props).
  const workspace = executableSource(read('src/app/student/assignmentWorkspaceView.jsx'));
  assert.match(workspace, /maximumAttempts: runtimeQuestionActivityPolicy\.attempts,\s*activityPolicy: runtimeQuestionActivityPolicy,/);
  assert.match(workspace, /activityPolicy=\{runtimeQuestionActivityPolicy\}/);
});

/* -------------------------------------------------------- what people read */

const NEVER_SHOWN = /Infinity|NaN|1000000|1,000,000|999\d{3}|undefined/;

test('the student\'s tries text never prints the number', () => {
  const policy = getEffectiveActivityPolicy('classwork', UNLIMITED);
  [0, 1, 2, 3, 4, 5, 37].forEach((used) => {
    const remaining = getAttemptsRemaining({ status: used ? 'attempted' : 'unattempted', attemptCount: used }, policy.attempts);
    const strip = triesLeftText({ maximumAttempts: policy.attempts, remainingAttempts: remaining });
    const miss = missOutcomeText(remaining);
    const cost = submitTryCost({ maximumAttempts: policy.attempts, remainingAttempts: remaining });
    const label = submitActionLabel({ cost });
    assert.equal(strip, UNLIMITED_TRIES_STRIP);
    assert.equal(strip, 'Unlimited tries on this question');
    assert.equal(miss, UNLIMITED_TRIES_MISS);
    assert.equal(miss, 'Not quite. You can try again — tries are unlimited on this question.');
    assert.equal(cost.kind, 'unlimited');
    assert.equal(label, 'Submit', 'the button names no cost: there is no last try to warn about');
    [strip, miss, label, cost.phrase, cost.short].forEach((text) => assert.doesNotMatch(text, NEVER_SHOWN));
  });
  // The counted wording is untouched.
  assert.equal(triesLeftText({ maximumAttempts: 3, remainingAttempts: 3 }), '3 of 3 tries left');
  assert.equal(triesLeftText({ maximumAttempts: 3, remainingAttempts: 1 }), 'Last try · 1 of 3 left');
  assert.equal(triesLeftText({ maximumAttempts: 1, remainingAttempts: 1 }), 'One try on this question');
  assert.equal(missOutcomeText(2), 'Not quite. You have 2 tries left.');
  assert.equal(missOutcomeText(1), 'Not quite. You have 1 try left — your last one.');
  assert.equal(submitActionLabel({ cost: submitTryCost({ maximumAttempts: 3, remainingAttempts: 3 }) }), 'Submit — uses 1 of 3 tries');
  assert.equal(submitActionLabel({ cost: submitTryCost({ maximumAttempts: 1, remainingAttempts: 1 }) }), 'Submit — your only try');
});

test('the miss sentence has its Spanish, sentence for sentence', async () => {
  const pack = await loadLanguagePack('es');
  const translated = translateWithPack(UNLIMITED_TRIES_MISS, pack);
  assert.equal(translated.coverage, 'full');
  assert.equal(translated.text, 'Todavía no. Puedes intentarlo de nuevo: los intentos son ilimitados en esta pregunta.');
});

test('the Overview says "unlimited tries" after a miss, and never "closed"', () => {
  const maximumAttempts = getEffectiveActivityPolicy('classwork', UNLIMITED).attempts;
  const afterFive = describeNavigatorQuestion({ record: { status: 'attempted', attemptCount: 5, totalAttempts: 5 }, maximumAttempts });
  assert.equal(afterFive.status, QUESTION_STATUS.TRY_AGAIN);
  assert.equal(afterFive.label, 'unlimited tries');
  assert.equal(afterFive.spoken, 'needs another try, unlimited tries');
  const partial = describeNavigatorQuestion({ record: { status: 'attempted', attemptCount: 2, totalAttempts: 2, bestPartialCredit: 50 }, maximumAttempts });
  assert.equal(partial.label, '50% so far · unlimited tries');
  [afterFive, partial].forEach((entry) => {
    assert.doesNotMatch(entry.label, NEVER_SHOWN);
    assert.doesNotMatch(entry.spoken, NEVER_SHOWN);
  });
  assert.equal(describeNavigatorQuestion({ record: { status: 'correct', attemptCount: 6, totalAttempts: 6 }, maximumAttempts }).label, 'Correct');
  // Counted wording is untouched.
  assert.equal(describeNavigatorQuestion({ record: { status: 'attempted', attemptCount: 1, totalAttempts: 1 }, maximumAttempts: 3 }).label, '2 tries left');
});

test('the teacher\'s case review counts every attempt and prints "unlimited" for the limit', () => {
  const assignment = { id: 'case-1', title: 'Packet', schemaVersion: 5, ...UNLIMITED, sections: [
    { id: 'cw', role: 'classwork', questions: [{ ...classworkQuestion }] },
    { id: 'dol', role: 'dol', questions: [{ ...dolQuestion }] },
  ] };
  const student = { id: STUDENT, classId: 'synthetic-class-1', gradesByAssignment: { 'case-1': {
    0: { status: 'attempted', attemptCount: 5, totalAttempts: 5 },
    1: { status: 'expired', attemptCount: 1, totalAttempts: 1 },
  } } };
  const analysis = analyzeAssignmentQuestions({ assignment, student });
  const rows = analysis.rows || analysis.questions || analysis;
  const [classwork, dol] = rows;
  assert.equal(classwork.totalAttempts, 5, 'five attempts are recorded and shown');
  assert.equal(attemptLimitLabel(classwork.maxAttempts), 'unlimited');
  assert.notEqual(classwork.outcome, QUESTION_OUTCOME.EXHAUSTED, 'five misses did not use the question up');
  assert.equal(dol.maxAttempts, 1);
  assert.equal(dol.outcome, QUESTION_OUTCOME.EXHAUSTED);

  // Without the declaration the same record is out of tries at three.
  const plain = analyzeAssignmentQuestions({
    assignment: { ...assignment, gradingPolicy: undefined },
    student: { ...student, gradesByAssignment: { 'case-1': { 0: { status: 'expired', attemptCount: 3, totalAttempts: 3 } } } },
  });
  const plainRows = plain.rows || plain.questions || plain;
  assert.equal(plainRows[0].maxAttempts, 3);
  assert.equal(plainRows[0].outcome, QUESTION_OUTCOME.EXHAUSTED);

  // The screen and the CSV print the label, not the number.
  const tab = executableSource(read('src/components/teacher/caseReview/CaseQuestionsTab.jsx'));
  assert.match(tab, /of \{attemptLimitLabel\(question\.maxAttempts\)\}/);
  assert.match(tab, /<dt>Attempts allowed<\/dt><dd>\{attemptLimitLabel\(question\.maxAttempts\)\}/);
  assert.doesNotMatch(tab, /\{question\.maxAttempts\}/);
  const exportSource = executableSource(read('src/platform/caseReview/caseReviewExport.js'));
  assert.match(exportSource, /attemptLimitCell\(row\.maxAttempts\)/);
  assert.doesNotMatch(exportSource, /, row\.maxAttempts,/);
});

/* ------------------------------------------ existing lessons are untouched */

const lessonFiles = () => {
  const found = [];
  const walk = (directory) => readdirSync(directory).forEach((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.json')) found.push(path);
  });
  walk(join(REPO, 'teacher-import-jsons'));
  walk(join(REPO, 'docs/assignments'));
  return found;
};

test('every existing lesson resolves exactly as before: the same policy object and the same limit for every question', () => {
  let lessons = 0;
  let questions = 0;
  lessonFiles().forEach((path) => {
    let source;
    try { source = JSON.parse(readFileSync(path, 'utf8')); } catch { return; }
    if (!source || Number(source.schemaVersion) !== 5 || !Array.isArray(source.sections)) return;
    lessons += 1;
    const name = path.slice(REPO.length);
    // No lesson in the repository declares the policy; the two that write the
    // field write the default.
    assert.equal(assignmentDeclaresUnlimitedAttempts(source), false, name);
    assert.ok([undefined, 'rolePolicy'].includes(source.gradingPolicy?.attemptPolicy), `${name}: ${source.gradingPolicy?.attemptPolicy}`);
    assert.deepEqual(validateAssignmentV5(source).errors.filter((error) => /attemptPolicy/.test(error)), [], name);

    const normalized = normalizeAssignmentV5(source);
    assert.equal(normalized.gradingPolicy.attemptPolicy, 'rolePolicy', name);
    // As authored, as normalized, and as stored and read back by the server.
    const stored = { id: 'stored', ...canonicalV5PersistencePatch(normalized) };
    [source, normalized, stored].forEach((assignment) => {
      flattenV5Sections(normalized).forEach((question) => {
        const role = question.activityRole;
        const withAssignment = getEffectiveActivityPolicy(role, assignment);
        const before = getEffectiveActivityPolicy(role);
        assert.equal(withAssignment, before, `${name}: ${role} resolves to the role's own policy object`);
        assert.equal(
          resolveQuestionMaximumAttempts({ question, maximumAttempts: withAssignment.attempts, activityPolicy: withAssignment }),
          resolveQuestionMaximumAttempts({ question, maximumAttempts: before.attempts, activityPolicy: before }),
          `${name}: ${question.questionId || question.prompt}`,
        );
        assert.deepEqual(toEnforcedActivityPolicy(role, assignment), toEnforcedActivityPolicy(role));
      });
    });
    questions += flattenV5Sections(normalized).length;
  });
  assert.ok(lessons >= 20, `the sweep read the lesson library (${lessons} lessons)`);
  assert.ok(questions >= 200, `and its questions (${questions})`);
});

test('the role policies themselves did not move', () => {
  assert.deepEqual(
    Object.fromEntries(Object.values(ACTIVITY_POLICIES).map((policy) => [policy.role, policy.attempts])),
    { warmup: 3, classwork: 3, dol: 1, practice: 3, quiz: 1, review: 3, corrections: 3, test: 1 },
  );
  Object.values(ACTIVITY_POLICIES).forEach((policy) => {
    assert.equal('attemptsUnlimited' in policy, false, `${policy.role} carries no new field`);
    assert.equal(getEffectiveActivityPolicy(policy.role), policy);
    assert.equal(getEffectiveActivityPolicy(policy.role, null), policy);
    assert.equal(getEffectiveActivityPolicy(policy.role, undefined), policy);
  });
  assert.equal(ATTEMPT_POLICY.ROLE, 'rolePolicy');
  assert.equal(ATTEMPT_POLICY.UNLIMITED, 'unlimited');
});
