/*
 * THE ASSESSMENT LIFECYCLE RULES, AS PURE FUNCTIONS.
 *
 * The emulator suite (tests/integration/testCycleLifecycleSecurity.test.mjs)
 * proves these rules are ENFORCED by the real Cloud Functions. This file proves
 * the rules themselves, fast and exhaustively: when an exam is timed, when an
 * assessment is open, what a retest may do to a grade under each configured
 * rule, what a student is told at each stage, which teacher overrides apply to
 * which student, what an edit does to a Test Cycle's contract, and that the
 * teacher preview reproduces every stage from the assignment's real policy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  ASSESSMENT_AVAILABILITY,
  resolveAssessmentAvailability,
} from '../../functions/shared/assessmentAvailability.mjs';
import {
  GRADE_REPLACEMENT,
  normalizeTestCyclePolicy,
} from '../../functions/shared/testCyclePolicy.mjs';
import {
  buildTestCycleGradeState,
  describeTestCycleGradePolicy,
  recordedTestCycleGrade,
} from '../../functions/shared/testCycleGrade.mjs';
import {
  TEST_CYCLE_STAGE,
  applyAssessmentAvailability,
  buildTestCyclePhaseStatus,
  resolveTestCycleStage,
} from '../../functions/shared/testCycleStages.mjs';
import {
  buildTestCycleCardRefreshKey, describeCorrectionTargetForStudent, describeTestCycleForStudent, reviewProgressFromTracker,
} from '../../src/platform/student/testCycleDiscovery.js';
import { TEST_CYCLE_CONTRACT_EDIT, planTestCycleContractEdit } from '../../src/platform/assessment/testCycleContractEdit.js';
import { testCycleContractFields } from '../../src/platform/contract/storedAssignmentV5.js';
import { describeTeacherRow, teacherActionsForRow } from '../../src/platform/teacher/testCycleTeacherRows.js';
import { TEST_CYCLE_PREVIEW_SCENARIOS, buildTestCyclePreviewCard, previewScenariosFor } from '../../src/platform/teacher/testCyclePreviewModel.js';
import { COURSE_TEST_EXAM_TYPE, getExamPolicy, resolveExamCalculatorPolicy } from '../../src/platform/policies/examPolicyResolver.js';

const require = createRequire(import.meta.url);
const secureExam = require('../../functions/lib/secureExam.js');

const POLICY = { mode: 'testCycle' };
const NOW = Date.parse('2026-10-05T15:00:00Z');

/* --- 1. timing --------------------------------------------------------------- */

test('an untimed exam has no deadline: null, missing, 0, true and junk are all untimed', () => {
  for (const timeLimitSeconds of [null, undefined, '', 0, -5, 'abc', false, true]) {
    const session = { startedAt: NOW, timeLimitSeconds };
    assert.equal(secureExam.deadlineFor(session), null, `timeLimitSeconds=${String(timeLimitSeconds)}`);
    assert.equal(secureExam.isExpired(session, NOW + 10 * 60 * 60 * 1000), false);
    assert.equal(secureExam.publicSession(session).timed, false);
  }
});

test('only an explicit positive limit times an exam, from when it STARTED, plus added time', () => {
  const session = { startedAt: NOW, timeLimitSeconds: 45 * 60, addedTimeSeconds: 300 };
  assert.equal(secureExam.deadlineFor(session), NOW + 50 * 60 * 1000);
  assert.equal(secureExam.isExpired(session, NOW + 49 * 60 * 1000), false);
  assert.equal(secureExam.isExpired(session, NOW + 50 * 60 * 1000), true);
  // Not started: no deadline yet, rather than one counted from the epoch.
  assert.equal(secureExam.deadlineFor({ timeLimitSeconds: 2700, startedAt: null }), null);
});

test('a course Test is not the SAT in the browser: own title, no clock of its own, blueprint calculator', () => {
  const policy = getExamPolicy(COURSE_TEST_EXAM_TYPE);
  assert.equal(policy.title, 'Course Test');
  assert.equal(policy.timeLimitSeconds, null, 'only the server deadline may time a course test');
  assert.notEqual(getExamPolicy(COURSE_TEST_EXAM_TYPE), getExamPolicy('digitalSAT'));
  // No calculator unless the blueprint or the item provides one.
  assert.equal(resolveExamCalculatorPolicy({ examType: COURSE_TEST_EXAM_TYPE, questionSpec: {} }).available, false);
  assert.equal(resolveExamCalculatorPolicy({ examType: COURSE_TEST_EXAM_TYPE, questionSpec: { sessionCalculatorMode: 'scientific' } }).mode, 'scientific');
  assert.equal(resolveExamCalculatorPolicy({ examType: COURSE_TEST_EXAM_TYPE, questionSpec: { sessionCalculatorMode: 'questionSpecific', calculatorMode: 'graphing' } }).mode, 'graphing');
  assert.equal(resolveExamCalculatorPolicy({ examType: COURSE_TEST_EXAM_TYPE, questionSpec: { sessionCalculatorMode: 'none' } }).available, false);
  // A documented calculator accommodation applies on the student's own classroom test.
  const accommodated = resolveExamCalculatorPolicy({
    examType: COURSE_TEST_EXAM_TYPE, questionSpec: {}, studentSupportProfile: { accommodations: ['calculator-basic'] },
  });
  assert.equal(accommodated.available, true);
  assert.equal(accommodated.requiresHumanConfirmation, false);
  // A simulation still needs the proctor's confirmation, as before.
  assert.equal(resolveExamCalculatorPolicy({ examType: 'asvab', studentSupportProfile: { accommodations: ['calculator'] } }).available, false);
});

test('a course-test review reports the recorded (weighted, planned) score, not the answered-only mean', () => {
  const session = {
    examType: 'courseTest',
    status: 'submitted',
    feedbackReleased: true,
    requiredQuestions: 4,
    issuancePlan: { entries: [1, 2, 3, 4].map((n) => ({ slotId: `s${n}`, questionInstanceId: `q${n}`, weight: 1 })) },
    responses: { q1: { questionInstanceId: 'q1', grading: { score: 1, isCorrect: true } }, q2: { questionInstanceId: 'q2', grading: { score: 1, isCorrect: true } } },
  };
  const review = secureExam.publicReview(session);
  assert.equal(review.scorePercent, 50, 'two of four planned items, not 2/2 = 100%');
  assert.equal(review.scoreBasis, 'plannedWeighted');
});

/* --- 2. availability ------------------------------------------------------- */

test('assessment availability: archived, paused and scheduled close it; due dates do not', () => {
  assert.equal(resolveAssessmentAvailability({ assignment: null }).reason, ASSESSMENT_AVAILABILITY.MISSING);
  assert.equal(resolveAssessmentAvailability({ assignment: { archived: true } }).reason, ASSESSMENT_AVAILABILITY.ARCHIVED);
  assert.equal(resolveAssessmentAvailability({ assignment: { unpublished: true } }).reason, ASSESSMENT_AVAILABILITY.UNPUBLISHED);
  const scheduled = resolveAssessmentAvailability({ assignment: { releaseAt: '2026-10-06T13:00:00Z' }, now: NOW });
  assert.equal(scheduled.reason, ASSESSMENT_AVAILABILITY.SCHEDULED);
  assert.equal(scheduled.opensAt, Date.parse('2026-10-06T13:00:00Z'));
  assert.equal(resolveAssessmentAvailability({ assignment: { releaseAt: '2026-10-01T13:00:00Z' }, now: NOW }).open, true);
  // Late work stays open: a make-up Test after the class due date is ordinary.
  assert.equal(resolveAssessmentAvailability({ assignment: { dueAt: '2026-09-01T00:00:00Z', lateDueAt: '2026-09-02T00:00:00Z' }, now: NOW }).open, true);
});

test('a closed assessment keeps the student\'s stage but nothing can be entered, except released results', () => {
  const closed = resolveAssessmentAvailability({ assignment: { archived: true } });
  const testState = resolveTestCycleStage({ policy: POLICY, record: { review: { complete: true }, test: { examSessionId: 's', state: 'assigned' } } });
  const overlaid = applyAssessmentAvailability(testState, closed);
  assert.equal(overlaid.stage, TEST_CYCLE_STAGE.TEST);
  assert.equal(overlaid.canEnter, false);
  assert.equal(overlaid.actionLabel, 'Archived');
  const passed = resolveTestCycleStage({ policy: POLICY, record: { test: { state: 'released', rawScore: 90, examSessionId: 's' } } });
  assert.equal(applyAssessmentAvailability(passed, closed).canEnter, true, 'reviewing released results is a read');
});

/* --- 3. the configurable grade rule ---------------------------------------- */

test('the district example under the default rule: 54, retest 86, cap 70 → 70', () => {
  assert.equal(recordedTestCycleGrade({ originalTestGrade: 54, rawRetestGrade: 86, maxRecordedGrade: 70 }), 70);
  const described = describeTestCycleGradePolicy(POLICY);
  assert.equal(described.example.recordedGrade, 70);
  assert.match(described.teacherSummary, /never lowers a grade/);
  assert.match(described.studentSummary, /can never lower it/);
});

test('the averaging rule averages with the ORIGINAL, caps, and still never lowers', () => {
  const policy = { mode: 'testCycle', retest: { gradeReplacement: GRADE_REPLACEMENT.AVERAGE_IF_HIGHER_CAPPED, maxRecordedGrade: 70 } };
  const cases = [
    [54, 86, 70],   // avg 70 → capped 70 → beats 54
    [40, 80, 60],   // avg 60 → beats 40
    [60, 50, 60],   // avg 55 → does not beat 60: original kept
    [75, 100, 75],  // avg 88 → capped 70 → original 75 kept, never pulled down
    [null, 80, 70], // no original: the retest contributes up to the cap
  ];
  for (const [original, retest, expected] of cases) {
    const state = buildTestCycleGradeState({ originalTestGrade: original, rawRetestGrade: retest, policy });
    assert.equal(state.recordedGrade, expected, `${original} / ${retest}`);
    if (original !== null) assert.ok(state.recordedGrade >= original, 'a retest never lowers a grade');
  }
  assert.match(buildTestCycleGradeState({ originalTestGrade: 40, rawRetestGrade: 80, policy }).reason, /average/);
});

test('an unknown replacement rule falls back to the district default, never to "always replace"', () => {
  const policy = normalizeTestCyclePolicy({ mode: 'testCycle', retest: { gradeReplacement: 'alwaysReplace' } });
  assert.equal(policy.retest.gradeReplacement, GRADE_REPLACEMENT.REPLACE_IF_HIGHER_CAPPED);
  assert.equal(buildTestCycleGradeState({ originalTestGrade: 80, rawRetestGrade: 20, policy }).recordedGrade, 80);
});

/* --- 4. stages, as the student is told them --------------------------------- */

test('closing the retest outranks a retest the student submitted anyway; only a release outranks it', () => {
  const record = {
    test: { state: 'released', rawScore: 50, examSessionId: 't' },
    corrections: { required: true, complete: true, planId: 'p' },
    retest: { state: 'submitted', examSessionId: 'r' },
    teacherControls: { retestDisabled: true },
  };
  assert.equal(resolveTestCycleStage({ policy: POLICY, record }).stage, TEST_CYCLE_STAGE.RETEST_CLOSED);
  assert.equal(resolveTestCycleStage({ policy: POLICY, record: { ...record, retest: { state: 'released', rawScore: 80, examSessionId: 'r' } } }).stage, TEST_CYCLE_STAGE.COMPLETE);
});

test('every locked phase says why, and nothing hints at a result before release', () => {
  const corrections = { test: { state: 'released', rawScore: 52, examSessionId: 't' }, corrections: { required: true, planId: 'p', total: 3, completedTargets: 1 } };
  const state = resolveTestCycleStage({ policy: POLICY, record: corrections });
  assert.match(state.detail, /passing is 70%/);
  const phases = buildTestCyclePhaseStatus({ state, record: corrections });
  assert.match(phases.find((phase) => phase.id === 'corrections').reason, /1 of 3/);
  assert.match(phases.find((phase) => phase.id === 'retest').reason, /Unlocks when your corrections are complete/);

  const submitted = { review: { complete: true }, test: { state: 'submitted', examSessionId: 't' } };
  const waiting = resolveTestCycleStage({ policy: POLICY, record: submitted });
  const waitingPhases = buildTestCyclePhaseStatus({ state: waiting, record: submitted });
  const text = JSON.stringify(waitingPhases) + waiting.detail;
  assert.doesNotMatch(text, /fail|retest is|corrections are/i);
});

test('a correction plan still being prepared is said, not shown as an enabled button that does nothing', () => {
  const state = resolveTestCycleStage({ policy: POLICY, record: { test: { state: 'released', rawScore: 40, examSessionId: 't' }, corrections: { required: true } } });
  assert.equal(state.stage, TEST_CYCLE_STAGE.CORRECTIONS);
  assert.equal(state.canEnter, false);
  assert.equal(state.actionLabel, 'Corrections being prepared');
});

/* --- 5. discovery: the list's description of a cycle ----------------------- */

const cycle = { id: 'a', assessmentPolicy: POLICY };
const reviewQuestions = [{ activityRole: 'review' }, { activityRole: 'review' }, { activityRole: 'classwork' }];

test('discovery counts Review the way the server gates it: answered, not correct', () => {
  assert.deepEqual(reviewProgressFromTracker({ questions: reviewQuestions, tracker: { 0: { status: 'attempted', totalAttempts: 1 } } }), { total: 2, attempted: 1, complete: false });
  assert.equal(reviewProgressFromTracker({ questions: reviewQuestions, tracker: { 0: { status: 'correct' }, 1: { status: 'attempted', totalAttempts: 2 } } }).complete, true);
});

test('discovery names the stage, the next step, and nothing a teacher has not released', () => {
  const at = (projection, tracker = null, assignment = cycle) => describeTestCycleForStudent({ assignment, projection, questions: reviewQuestions, tracker, nowValue: NOW });
  assert.equal(at(null).label, 'Review · 0 of 2');
  assert.equal(at(null, { 0: { status: 'correct' }, 1: { status: 'attempted', totalAttempts: 1 } }).key, 'testPending', 'Review done, sessions not opened');
  assert.equal(at({ stage: 'review', testState: 'assigned' }, { 0: { status: 'correct' }, 1: { status: 'correct' } }).label, 'Test ready');
  assert.equal(at({ stage: 'test', testState: 'inProgress' }).actionLabel, 'Resume Test');
  const waiting = at({ stage: 'awaitingRelease', testState: 'submitted' });
  assert.equal(waiting.label, 'Test submitted');
  assert.equal(waiting.recordedGrade, null);
  assert.doesNotMatch(waiting.detail, /retest|correction/i);
  assert.equal(at({ stage: 'corrections', testState: 'released', correctionsTotal: 3, correctionsCompleted: 2, recordedGrade: 52 }).label, 'Corrections · 2 of 3');
  assert.equal(at({ stage: 'retest', retestState: 'assigned' }).actionLabel, 'Start Retest');
  assert.equal(at({ stage: 'complete', recordedGrade: 70 }).label, 'Complete · 70%');
  assert.equal(at(null, null, { ...cycle, releaseAt: '2026-12-01T00:00:00Z' }).key, 'opensLater');
  assert.equal(at({ stage: 'test', testState: 'assigned' }, null, { ...cycle, unpublished: true }).label, 'Paused');
  assert.equal(describeTestCycleForStudent({ assignment: { id: 'plain' } }), null, 'an ordinary assignment is not described');
});

/* --- 6. what an edit does to the contract ---------------------------------- */

test('an edit that keeps the contract changes nothing on the server', () => {
  const stored = { assessmentPolicy: POLICY, testBlueprint: { blueprintId: 'b', targets: [{ targetId: 't', familyIds: ['f'], questionCount: 2 }] } };
  assert.equal(planTestCycleContractEdit({ stored, reviewed: { ...stored } }).kind, TEST_CYCLE_CONTRACT_EDIT.NONE);
});

test('changing only the cap or passing score is a policy edit; the blueprint is an attach; dropping the policy is refused', () => {
  const stored = { assessmentPolicy: POLICY, testBlueprint: { blueprintId: 'b', targets: [{ targetId: 't', familyIds: ['f'], questionCount: 2 }] } };
  const policyOnly = planTestCycleContractEdit({ stored, reviewed: { ...stored, assessmentPolicy: { mode: 'testCycle', passingScore: 65, retest: { maxRecordedGrade: 75 } } } });
  assert.equal(policyOnly.kind, TEST_CYCLE_CONTRACT_EDIT.POLICY);
  assert.deepEqual(policyOnly.policyChanges, { passingScore: 65, maxRecordedGrade: 75 });
  const blueprint = planTestCycleContractEdit({ stored, reviewed: { ...stored, testBlueprint: { blueprintId: 'b', targets: [{ targetId: 't', familyIds: ['g'], questionCount: 2 }] } } });
  assert.equal(blueprint.kind, TEST_CYCLE_CONTRACT_EDIT.ATTACH);
  assert.equal(planTestCycleContractEdit({ stored, reviewed: { testBlueprint: stored.testBlueprint } }).kind, TEST_CYCLE_CONTRACT_EDIT.REFUSE);
  // An assignment saved by the older build (policy dropped) gets it back.
  assert.equal(planTestCycleContractEdit({ stored: {}, reviewed: stored }).kind, TEST_CYCLE_CONTRACT_EDIT.ATTACH);
});

test('the contract travels with the assignment, and an empty blueprint is not stored beside a secure reference', () => {
  assert.deepEqual(testCycleContractFields({ title: 'lesson' }), {});
  const fields = testCycleContractFields({ assessmentPolicy: POLICY, testBlueprint: { targets: [] }, secureTestReference: { manifestId: 'm' } });
  assert.deepEqual(Object.keys(fields).sort(), ['assessmentPolicy', 'secureTestReference']);
});

/* --- 7. the teacher's row: words and the actions that apply ----------------- */

test('a student mid-Test is described as testing, and resetting asks first and says it ends the Test', () => {
  const row = { stage: 'test', bucket: 'testing', review: { complete: true }, test: { examSessionId: 't', state: 'inProgress', answeredQuestions: 7, totalQuestions: 25 }, retest: { state: 'none' }, teacherControls: {}, corrections: {} };
  const described = describeTeacherRow(row);
  assert.equal(described.testText, 'In progress 7/25');
  assert.equal(described.bucketLabel, 'Testing now');
  const reset = teacherActionsForRow(row).find((item) => item.key === 'resetTest');
  assert.equal(reset.confirm, true);
  assert.match(reset.detail, /Ends the Test this student is taking/);
  assert.equal(teacherActionsForRow(row).some((item) => item.action === 'waiveCorrections'), false, 'no corrections control mid-Test');
});

test('a submitted Test offers its release first; a passed student is offered an optional retest, not a corrections waiver', () => {
  const submitted = { stage: 'awaitingRelease', test: { examSessionId: 't', state: 'submitted' }, retest: { state: 'none' }, teacherControls: {} };
  assert.equal(teacherActionsForRow(submitted)[0].kind, 'release');
  assert.equal(describeTeacherRow(submitted).needsRelease, true);
  const passed = { stage: 'passed', test: { examSessionId: 't', state: 'released' }, retest: { state: 'none' }, teacherControls: { requireCorrections: true } };
  const keys = teacherActionsForRow(passed).map((item) => item.key);
  assert.ok(keys.includes('unlockRetest'));
  assert.ok(!keys.includes('waiveCorrections'));
  assert.ok(!keys.includes('disableRetest'), 'a passing student has no retest to close');
});

/* --- 8. the teacher preview reproduces every stage ------------------------- */

test('the preview builds every student stage from the assignment\'s real policy, with no student data', () => {
  const assignment = {
    id: 'a', title: 'Unit 3', schemaVersion: 5,
    assessmentPolicy: { mode: 'testCycle', retest: { maxRecordedGrade: 75 } },
    sections: [{ id: 'review', role: 'review', questions: [{ questionId: 'q1', type: 'response', prompt: 'x' }] }],
    testBlueprint: { blueprintId: 'b', targets: [{ targetId: 't', familyIds: ['f'], questionCount: 4 }], timeLimitSeconds: 2700 },
  };
  const expected = {
    review: 'review', testReady: 'test', testInProgress: 'test', awaitingRelease: 'awaitingRelease', passed: 'passed',
    corrections: 'corrections', retest: 'retest', complete: 'complete', scheduled: 'review', paused: 'test',
  };
  for (const scenario of TEST_CYCLE_PREVIEW_SCENARIOS) {
    const card = buildTestCyclePreviewCard({ assignment, scenario: scenario.id, now: NOW });
    assert.equal(card.stage, expected[scenario.id], scenario.id);
    assert.equal(card.preview, true);
  }
  // The configured 75 cap, not a default 70.
  assert.equal(buildTestCyclePreviewCard({ assignment, scenario: 'complete', now: NOW }).grade.recordedGrade, 75);
  assert.equal(buildTestCyclePreviewCard({ assignment, scenario: 'review', now: NOW }).delivery.timeLimitMinutes, 45);
  assert.equal(buildTestCyclePreviewCard({ assignment, scenario: 'scheduled', now: NOW }).canEnter, false);
});

test('an open card reloads at every step the server writes, including the plan arriving after the score', () => {
  const key = (projection, reviewRecords = null) => buildTestCycleCardRefreshKey({ projection, reviewRecords });
  // Release is two writes: the score (stage → corrections, no plan yet)…
  const scoreReleased = { stage: 'corrections', stageChangedAt: 5, recordedGrade: 32, reviewComplete: true, testState: 'released', retestState: 'none', correctionsTotal: 0, correctionsCompleted: 0 };
  // …then the plan. Nothing but its size changes, and the card must follow.
  const planAttached = { ...scoreReleased, correctionsTotal: 3 };
  assert.notEqual(key(planAttached), key(scoreReleased), 'the corrections plan arriving reloads the card');
  assert.notEqual(key({ ...planAttached, correctionsCompleted: 1 }), key(planAttached), 'finishing a skill reloads it');
  // The retest session can be opened after the stage already reads Retest.
  const retestStage = { ...planAttached, stage: 'retest', stageChangedAt: 9, correctionsCompleted: 3 };
  assert.notEqual(key({ ...retestStage, retestState: 'assigned' }), key(retestStage), 'the retest session opening reloads it');
  assert.notEqual(key({ ...scoreReleased, testState: 'inProgress' }), key({ ...scoreReleased, testState: 'assigned' }));
  // Review answered on this device reloads it; a write that changes nothing the card shows does not.
  assert.notEqual(key(null, { 0: { status: 'attempted', totalAttempts: 1 } }), key(null, {}));
  assert.equal(key({ ...planAttached, updatedAt: 1 }), key({ ...planAttached, updatedAt: 2 }), 'a bare timestamp is not a change');
  assert.equal(typeof key(undefined), 'string');
});

test('a correction tells the student what they missed, in their words, and names a mistake pattern only when one was recorded', () => {
  const standard = describeCorrectionTargetForStudent({
    missed: 2, diagnosis: 'standard', diagnosisDetail: 'Targeting the missed standard texas:A.3C; no specific error pattern was recorded.',
  });
  assert.match(standard, /You missed 2 Test questions on this skill/);
  assert.doesNotMatch(standard, /texas:|standard|error pattern|mistake pattern/i, 'no standard codes or teacher wording');
  assert.match(standard, /never the Test questions themselves/);
  const pattern = describeCorrectionTargetForStudent({ missed: 1, diagnosis: 'misconception' });
  assert.match(pattern, /You missed 1 Test question on this skill/);
  assert.match(pattern, /specific mistake pattern/);
  assert.match(describeCorrectionTargetForStudent({}), /needs another look/);
});

test('a locked Test needs the teacher: it is named as locked and unlocking is offered first', () => {
  const row = {
    studentId: 'S1', stage: 'test', bucket: 'needsAttention',
    review: { complete: true }, test: { examSessionId: 'exam-1', state: 'inProgress', answeredQuestions: 4, totalQuestions: 25 },
    retest: {}, corrections: {}, teacherControls: {},
    attention: { kind: 'locked', stage: 'test', examSessionId: 'exam-1', lockedBy: 'integrity', violationCount: 3 },
  };
  const described = describeTeacherRow(row);
  assert.match(described.bucketLabel, /Needs attention/);
  assert.equal(described.testText, 'Locked · 3 integrity events');
  const [first] = teacherActionsForRow(row);
  assert.equal(first.kind, 'unlock');
  assert.equal(first.examSessionId, 'exam-1');
  // Without a lock the same student is simply testing, and nothing offers an unlock.
  const unlocked = { ...row, bucket: 'testing', attention: null };
  assert.match(describeTeacherRow(unlocked).testText, /In progress 4\/25/);
  assert.ok(!teacherActionsForRow(unlocked).some((action) => action.kind === 'unlock'));
});

/* ---- Merged with the district DOL work: mastery-gated Review, external originals ---- */

const DISTRICT_POLICY = { mode: 'testCycle', externalAssessment: { source: 'Eduphoria' }, review: { minimumMastery: 80 }, corrections: { requiredForRetest: false } };
const reviewItems = (count) => Array.from({ length: count }, (_, index) => ({ questionId: `r${index}`, activityRole: 'review', questionWeight: 1 }));

test('a mastery-gated Review is not done when every item is answered but mastery is below the bar — exactly as the server counts it', () => {
  const questions = reviewItems(4);
  const tracker = Object.fromEntries(questions.map((_, index) => [index, { status: 'attempted', totalAttempts: 1, bestPartialCredit: 80, bestRawPartialCredit: 75 }]));
  const short = reviewProgressFromTracker({ questions, tracker, minimumMastery: 80 });
  assert.equal(short.attempted, 4);
  assert.equal(short.complete, false, '75% is below the 80% bar, whatever the rounded display says');
  tracker[0].bestRawPartialCredit = 100;
  tracker[1].bestRawPartialCredit = 100;
  assert.equal(reviewProgressFromTracker({ questions, tracker, minimumMastery: 80 }).complete, true);
  // Without a bar, answering is enough — right or wrong.
  const answeredOnly = Object.fromEntries(questions.map((_, index) => [index, { status: 'attempted', totalAttempts: 1 }]));
  assert.equal(reviewProgressFromTracker({ questions, tracker: answeredOnly }).complete, true);

  const described = describeTestCycleForStudent({
    assignment: { id: 'dol', assessmentPolicy: { mode: 'testCycle', review: { minimumMastery: 80 } }, sections: [] },
    projection: null, questions, tracker: Object.fromEntries(questions.map((_, index) => [index, { status: 'attempted', totalAttempts: 1, bestRawPartialCredit: 50 }])),
  });
  assert.equal(described.key, 'review');
  assert.match(described.detail, /at least 80%/);
  assert.doesNotMatch(described.detail, /do not have to be correct/);
});

test('an external-original cycle reads as a retest everywhere: student list, teacher rows and preview', () => {
  const assignment = { id: 'dol', assessmentPolicy: DISTRICT_POLICY, sections: [] };
  // No session yet (no original entered): not "Review", not "Complete".
  const notOpen = describeTestCycleForStudent({ assignment, projection: null, questions: reviewItems(2), tracker: {} });
  assert.equal(notOpen.label, 'Retest not open');
  const ready = describeTestCycleForStudent({ assignment, projection: { stage: 'test', testState: 'assigned', reviewComplete: true }, questions: reviewItems(2), tracker: {} });
  assert.equal(ready.label, 'Retest ready');
  assert.equal(ready.actionLabel, 'Start Retest');

  const row = {
    studentId: 'S1', stage: 'test', bucket: 'readyForTest', originalTestGrade: 52,
    review: { attempted: 2, total: 2, complete: true }, test: { examSessionId: 'e1', state: 'assigned' }, retest: {}, corrections: {}, teacherControls: {},
  };
  const described = describeTeacherRow(row, { external: true });
  assert.equal(described.bucketLabel, 'Ready for retest');
  assert.equal(described.correctionsText, 'Not used');
  const actions = teacherActionsForRow(row, { external: true });
  assert.ok(!actions.some((action) => /corrections/i.test(action.action || '')), 'no corrections actions: the server refuses them');
  const reset = actions.find((action) => action.action === 'resetSecureSession');
  assert.equal(reset.stage, 'test');
  assert.equal(reset.label, 'Reset Retest session');
  // Mastery shows on the teacher's Review column too.
  assert.equal(describeTeacherRow({ ...row, review: { attempted: 7, total: 7, complete: false, mastery: 74.6, minimumMastery: 80 } }).reviewText, '7/7 · 74% of 80%');

  const scenarios = previewScenariosFor(assignment).map((scenario) => scenario.id);
  assert.ok(!scenarios.includes('corrections') && !scenarios.includes('passed'), 'stages that do not exist are not previewed');
  const preview = buildTestCyclePreviewCard({ assignment, scenario: 'testReady', now: NOW });
  assert.equal(preview.actionLabel, 'Start Retest');
  assert.equal(preview.policy.external, true);
  assert.deepEqual(preview.phases.map((phase) => phase.label), ['Review', 'Retest']);
});
