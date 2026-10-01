/*
 * PRACTICE-BASED WARM-UP AND DOL RECOVERY.
 *
 * Recovery is a second, generated opportunity at a Warm-Up or DOL that a
 * student unlocks with RECENT INDEPENDENT Practice mastery after the original
 * has closed. These tests walk the whole path the way a student would — the
 * server-graded Practice, the unlock, the pinned fresh questions, the submit —
 * and pin every rule that decides a grade:
 *
 *   final = max(original, min(recovery, cap))   (excused make-up: uncapped)
 *
 * plus the boundaries the brief draws: nothing while the original is open,
 * nothing for a Live Challenge Warm-Up, nothing without a generator-backed
 * question, one automatic opportunity, history preserved, the same grade on
 * every surface (browser, teacher, Classroom passback).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { DEFAULT_RECOVERY_POLICY, RECOVERY_TYPE, normalizeRecoveryPolicy, recoveryCapFor } from '../../functions/shared/recoveryPolicy.mjs';
import { buildSectionRecoveryGradeState, recordedSectionScore } from '../../functions/shared/sectionRecoveryGrade.mjs';
import { evaluateRecentPracticeMastery } from '../../functions/shared/practiceMastery.mjs';
import {
  ORIGINAL_OPPORTUNITY,
  RECOVERY_STATE,
  evaluateSectionRecoveryEligibility,
  resolveOriginalOpportunity,
} from '../../functions/shared/sectionRecoveryEligibility.mjs';
import {
  RECOVERY_ACTION,
  buildSectionRecoveryContext,
  nextRecoveryPracticeItem,
} from '../../functions/shared/sectionRecoveryService.mjs';
// The grading half is its own module so the student app never loads every
// shared tool grader to draw a Recovery panel.
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { resolveWarmupDelivery } from '../../functions/shared/warmupDelivery.mjs';
import { warmupChallengeScore, warmupChallengeSignature } from '../../functions/shared/warmupChallengeGrade.mjs';
import { assessSectionRecoveryReadiness } from '../../functions/shared/sectionRecoveryReadiness.mjs';
import { reproduceFamilyQuestionFromPin, resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions, resolveGenerationAllocation, resolveLearnerSeat } from '../../functions/shared/questionGenerationIdentity.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { buildStudentRecoverySummary } from '../../src/platform/recovery/studentRecoveryModel.js';
import {
  buildTeacherRecoveryAudit,
  buildTeacherWarmupChallengeAudit,
  completedRecoverySections,
  warmupChallengeCounts,
} from '../../src/platform/recovery/teacherRecoveryAudit.js';
import { projectSectionRecoveryForAssignment } from '../../src/platform/grading/sectionRecoveryGrades.js';
import { canonicalPresentedAssignmentGrade } from '../../src/platform/grading/canonicalGradeProjection.js';
import { componentSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const { projectRecoveredGradeInputs, recoveryChangedAssignmentIds, warmupChallengeCreditSignature } = require('../../functions/lib/sectionRecoveryGrades.js');
const { assignmentGradeProgress } = require('../../functions/lib/classroomGradeRuntime.js');

const NOW = Date.parse('2026-10-01T15:00:00Z');
const STUDENT = 'student-07';
const CLASS = 'class-A';
const ROSTER = Array.from({ length: 12 }, (_, index) => `student-${String(index).padStart(2, '0')}`);

const buildAssignment = (overrides = {}) => {
  const assignment = {
    id: 'asg-recovery',
    schemaVersion: 5,
    title: 'Two-step equations and zeros',
    assignedClassIds: [CLASS],
    dueAt: '2026-09-01T20:00:00Z',
    // The final submission date — and so the Recovery end date — is still
    // ahead of NOW; the DOL's own day (Sep 1) is long past.
    lateDueAt: '2026-10-10T23:00:00Z',
    warmup: { instructionDate: '2026-09-01' },
    dol: { instructionDate: '2026-09-01' },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [
        { questionId: 'w1', type: 'multiAnswer', prompt: 'Find both intercepts.', questionFamily: { id: 'functions.identifyIntercepts' } },
      ] },
      { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [
        { questionId: 'c1', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } },
      ] },
      { id: 'dol', role: 'dol', title: 'DOL', questions: [
        { questionId: 'd1', type: 'stepAlgebra', prompt: 'Solve for x.', questionFamily: { id: 'linear.twoStepEquation' } },
        { questionId: 'd2', type: 'multiAnswer', prompt: 'Find the zeros.', questionFamily: { id: 'functions.identifyZeros' } },
      ] },
    ],
    ...overrides,
  };
  assignment.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: ROSTER }) } };
  return assignment;
};

// DOL: d1 answered wrong, d2 right — an original of 50%.
const ORIGINAL_TRACKER = Object.freeze({
  0: { status: 'expired', attemptCount: 3, totalAttempts: 3, variantIndex: 0 },
  2: { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 },
  3: { status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0 },
});

const sectionEntriesFor = (assignment, section) => {
  const questions = getStoredAssignmentQuestions(assignment);
  return questions
    .map((question, storageIndex) => ({ storageIndex, question }))
    .filter((entry) => entry.question.activityRole === section);
};

const contextFor = ({ assignment = buildAssignment(), section = 'dol', tracker = ORIGINAL_TRACKER, record = null, supportEvents = [], nowValue = NOW, challengeCredit = null } = {}) => {
  const original = splitGradesBySection({ tracker, assignment })[section];
  return buildSectionRecoveryContext({
    assignment,
    section,
    sectionEntries: sectionEntriesFor(assignment, section),
    questions: getStoredAssignmentQuestions(assignment),
    tracker,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record,
    studentId: STUDENT,
    classId: CLASS,
    classPeriod: '1',
    schedule: null,
    supportEvents,
    challengeCredit,
    sectionModeFor: () => 'personalized',
    nowValue,
  });
};

/** What a student who solved it would send, in the normalized response shape. */
const correctResponse = (reproduced) => {
  const { question, instance } = reproduced;
  if (question.type === 'stepAlgebra') {
    const variable = String(question.variable || question.objective?.variable || 'x');
    return { kind: 'opaque', type: 'stepAlgebra', value: `${variable}=${question.generatedAnswer}`, fields: [] };
  }
  const fields = question.answerFields || [];
  const answer = instance.answer;
  const values = answer.kind === 'set'
    ? answer.value.map(String)
    : answer.kind === 'points'
      ? [`(${answer.value.xIntercept.join(', ')})`, `(${answer.value.yIntercept.join(', ')})`]
      : answer.kind === 'orderedPair' ? [`(${answer.value.join(', ')})`] : [String(answer.value)];
  return { kind: 'fields', type: question.type, value: '', fields: fields.map((field, index) => ({ id: field.id, value: values[index] ?? '', isComplete: true })) };
};

const wrongResponse = (reproduced) => {
  const right = correctResponse(reproduced);
  if (right.kind === 'opaque') return { ...right, value: `x=${Number(reproduced.question.generatedAnswer) + 1}` };
  return { ...right, fields: right.fields.map((field) => ({ ...field, value: '9999' })) };
};

const reproduce = (assignment, item) => reproduceFamilyQuestionFromPin({
  question: getStoredAssignmentQuestions(assignment)[item.storageIndex],
  assignmentId: assignment.id,
  storageIndex: item.storageIndex,
  pin: item.pin,
});

/** Answer Practice items until the record unlocks (or `limit` items). */
const practiceUntilUnlocked = ({ assignment, record = null, limit = 12, answer = correctResponse, supportUsage = {} }) => {
  let current = record;
  const items = [];
  for (let step = 0; step < limit; step += 1) {
    const context = contextFor({ assignment, record: current });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    const outcome = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: answer(reproduce(assignment, item)), supportUsage },
      at: NOW + step * 60_000,
    });
    items.push({ item, outcome });
    current = outcome.record;
  }
  return { record: current, items };
};

/* ---------------------------------------------------------------------------
 * Policy and the grade rule.
 * ------------------------------------------------------------------------- */

test('the defaults are the brief: 7 of the last 8, Warm-Up capped at 85, DOL at 90, one opportunity', () => {
  const policy = normalizeRecoveryPolicy({});
  assert.equal(policy.mastery.windowSize, 8);
  assert.equal(policy.mastery.requiredCorrect, 7);
  assert.equal(policy.warmup.maxRecordedScore, 85);
  assert.equal(policy.dol.maxRecordedScore, 90);
  assert.equal(policy.automaticOpportunities, 1);
  assert.equal(policy.warmup.questionCount, 3);
  assert.equal(DEFAULT_RECOVERY_POLICY.dol.excusedMaxRecordedScore, 100);
  // Per-assignment tuning is bounded rather than trusted.
  const tuned = normalizeRecoveryPolicy({ gradingPolicy: { recovery: { mastery: { windowSize: 5, requiredCorrect: 9 }, dol: { maxRecordedScore: 140 } } } });
  assert.equal(tuned.mastery.requiredCorrect, 5, 'required correct can never exceed the window');
  assert.equal(tuned.dol.maxRecordedScore, 100);
  assert.equal(recoveryCapFor(tuned, 'warmup', RECOVERY_TYPE.EXCUSED_MAKE_UP), 100);
});

test('final = max(original, min(recovery, cap)): the brief\'s worked examples', () => {
  assert.equal(recordedSectionScore({ originalScore: 48, rawRecoveryScore: 72, cap: 90 }), 72);
  assert.equal(recordedSectionScore({ originalScore: 62, rawRecoveryScore: 96, cap: 90 }), 90);
  assert.equal(recordedSectionScore({ originalScore: 88, rawRecoveryScore: 81, cap: 90 }), 88, 'a Recovery can never lower a grade');
  assert.equal(recordedSectionScore({ originalScore: null, rawRecoveryScore: 70, cap: 90 }), 70, 'a missing original is replaced up to the cap');
  assert.equal(recordedSectionScore({ originalScore: 40, rawRecoveryScore: 100, cap: 85 }), 85, 'Warm-Up cap');
  const excused = buildSectionRecoveryGradeState({ section: 'dol', originalScore: null, originalAttempted: false, rawRecoveryScore: 96, type: RECOVERY_TYPE.EXCUSED_MAKE_UP });
  assert.equal(excused.recordedScore, 96, 'an excused make-up earns full credit');
  assert.equal(excused.capApplied, false);
  const kept = buildSectionRecoveryGradeState({ section: 'dol', originalScore: 88, rawRecoveryScore: 95 });
  assert.equal(kept.recordedScore, 90);
  assert.match(kept.reason, /90% recovery cap/);
  // The cap frozen when the Recovery started wins over a later policy edit.
  assert.equal(buildSectionRecoveryGradeState({ section: 'dol', originalScore: 50, rawRecoveryScore: 100, capOverride: 80 }).recordedScore, 80);
});

/* ---------------------------------------------------------------------------
 * The mastery gate.
 * ------------------------------------------------------------------------- */

const outcome = (key, overrides = {}) => ({ key, familyId: 'fam', coverageKey: 'fam', correct: true, independent: true, attempts: 1, at: NOW - 1000, ...overrides });

test('mastery is RECENT: a student who struggled early and then got it unlocks', () => {
  const early = Array.from({ length: 6 }, (_, index) => outcome(`early-${index}`, { correct: false, at: NOW - 900_000 + index }));
  const late = Array.from({ length: 7 }, (_, index) => outcome(`late-${index}`, { at: NOW - 100_000 + index }));
  const result = evaluateRecentPracticeMastery({ outcomes: [...early, ...late], requiredCoverage: ['fam'], now: NOW });
  assert.equal(result.met, true);
  assert.equal(result.correct, 7);
  assert.equal(result.windowSize, 8);
});

test('mastery counts each question once, and only independent work before the solution was shown', () => {
  const repeats = Array.from({ length: 7 }, () => outcome('same-question'));
  assert.equal(evaluateRecentPracticeMastery({ outcomes: repeats, requiredCoverage: ['fam'], now: NOW }).met, false, 'one question answered seven times is one item');
  const hinted = Array.from({ length: 8 }, (_, index) => outcome(`hint-${index}`, { independent: index < 5 }));
  assert.equal(evaluateRecentPracticeMastery({ outcomes: hinted, requiredCoverage: ['fam'], now: NOW }).met, false, 'answers given with a hint are not independent mastery');
  const peeked = Array.from({ length: 8 }, (_, index) => outcome(`peek-${index}`, { solutionViewed: index >= 5 }));
  assert.equal(evaluateRecentPracticeMastery({ outcomes: peeked, requiredCoverage: ['fam'], now: NOW }).met, false);
});

test('mastery must cover every skill the original assessed', () => {
  const oneSkill = Array.from({ length: 8 }, (_, index) => outcome(`a-${index}`, { familyId: 'skillA', coverageKey: 'skillA' }));
  const result = evaluateRecentPracticeMastery({ outcomes: oneSkill, requiredCoverage: ['skillA', 'skillB'], now: NOW });
  assert.equal(result.met, false, 'eight right answers on one skill cannot unlock a two-skill DOL');
});

/* ---------------------------------------------------------------------------
 * Who may recover, and when.
 * ------------------------------------------------------------------------- */

test('nothing is shown while the original is still available — Recovery is never advertised as the easier path', () => {
  const assignment = buildAssignment({
    lateDueAt: '2026-12-01T23:00:00Z',
    dueAt: '2026-12-01T20:00:00Z',
    warmup: { instructionDate: '2026-12-01' },
    dol: { instructionDate: '2026-12-01' },
  });
  const opportunity = resolveOriginalOpportunity({ assignment, section: 'dol', classId: CLASS, nowValue: NOW });
  assert.equal(opportunity.status, ORIGINAL_OPPORTUNITY.UPCOMING);
  const context = contextFor({ assignment });
  assert.equal(context.eligibility.state, RECOVERY_STATE.HIDDEN);
  assert.equal(context.eligibility.studentVisible, false);
  assert.deepEqual(buildStudentRecoverySummary({ assignment, tracker: ORIGINAL_TRACKER, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW }), []);
});

test('a closed original always reports its instructional day and the Recovery end date', () => {
  const dayPassed = resolveOriginalOpportunity({ assignment: buildAssignment(), section: 'dol', classId: CLASS, nowValue: NOW });
  assert.equal(dayPassed.status, ORIGINAL_OPPORTUNITY.CLOSED);
  assert.equal(dayPassed.reason, 'instruction-day-passed');
  assert.equal(dayPassed.instructionDateKey, '2026-09-01', 'the excused-absence hook reads this day');
  assert.ok(dayPassed.recoveryEndsAtMs > NOW);
  assert.equal(dayPassed.recoveryWindowEnded, false);
  const finalPassed = resolveOriginalOpportunity({ assignment: buildAssignment({ lateDueAt: '2026-09-03T23:00:00Z' }), section: 'dol', classId: CLASS, nowValue: NOW });
  assert.equal(finalPassed.reason, 'assignment-final-deadline');
  assert.equal(finalPassed.instructionDateKey, '2026-09-01');
  assert.equal(finalPassed.recoveryWindowEnded, true);
});

test('the final submission date is the Recovery end date: open until then, refused after it', () => {
  const assignment = buildAssignment();
  const open = contextFor({ assignment });
  assert.equal(open.eligibility.state, RECOVERY_STATE.LOCKED);
  assert.equal(open.eligibility.endsAtMs, open.opportunity.recoveryEndsAtMs);
  const [dolEntry] = buildStudentRecoverySummary({ assignment, tracker: ORIGINAL_TRACKER, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW }).filter((entry) => entry.section === 'dol');
  assert.ok(dolEntry.endsAtLabel, 'the panel says when Recovery closes');
  assert.equal(dolEntry.endsAtMs, open.opportunity.recoveryEndsAtMs);

  // Practice until unlocked and start, all before the end date.
  const { record: unlocked } = practiceUntilUnlocked({ assignment });
  const started = runSectionRecoveryAction({ context: contextFor({ assignment, record: unlocked }), action: RECOVERY_ACTION.START, at: NOW + 1 }).record;
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, correctResponse(reproduce(assignment, item))]));
  const afterEnd = Date.parse('2026-10-12T15:00:00Z');

  // Started but not submitted: closed, and the original stands.
  const closed = contextFor({ assignment, record: started, nowValue: afterEnd });
  assert.equal(closed.eligibility.state, RECOVERY_STATE.CLOSED);
  assert.equal(closed.eligibility.studentVisible, true);
  assert.throws(
    () => runSectionRecoveryAction({ context: closed, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: afterEnd }),
    (error) => error.code === 'recovery-window-ended',
  );
  const closedSummary = buildStudentRecoverySummary({ assignment, tracker: ORIGINAL_TRACKER, recoveryForAssignment: { dol: started }, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: afterEnd })
    .find((entry) => entry.section === 'dol');
  assert.equal(closedSummary.state, 'closed');
  assert.match(closedSummary.message, /original score stands/);
  assert.equal(closedSummary.canContinue, false);
  assert.equal(closedSummary.endsAtLabel, null);

  // Never started: simply no longer offered, and nothing is accepted.
  const neverStarted = contextFor({ assignment, nowValue: afterEnd });
  assert.equal(neverStarted.eligibility.state, RECOVERY_STATE.HIDDEN);
  assert.equal(neverStarted.eligibility.reason, 'recovery-window-ended');
  const item = nextRecoveryPracticeItem(open);
  assert.throws(
    () => runSectionRecoveryAction({ context: neverStarted, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, response: correctResponse(reproduce(assignment, item)) }, at: afterEnd }),
    (error) => error.code === 'recovery-window-ended',
  );
  assert.throws(() => runSectionRecoveryAction({ context: neverStarted, action: RECOVERY_ACTION.START, at: afterEnd }), (error) => error.code === 'recovery-window-ended');

  // A Recovery submitted in time keeps its result after the end date.
  const submitted = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 2 }).record;
  assert.equal(contextFor({ assignment, record: submitted, nowValue: afterEnd }).eligibility.state, RECOVERY_STATE.COMPLETED);

  // The teacher sees the closed one for what it is.
  const student = { id: STUDENT, gradesByAssignment: { [assignment.id]: ORIGINAL_TRACKER }, sectionRecoveryByAssignment: { [assignment.id]: { dol: started } } };
  const [auditRow] = buildTeacherRecoveryAudit({ student, assignment, nowValue: afterEnd });
  assert.equal(auditRow.status, 'closed');
  assert.match(auditRow.statusLabel, /not submitted by the final submission date/);
});

test('individualized extra time extends the Recovery end date — and never moves the DOL\'s own class window', () => {
  const extraTime = {
    supportPlan: { windows: [{ effectiveStart: '2026-08-01', status: 'active', revision: 1, accommodations: [
      { id: 'extra-time', params: { dueDateExtension: { mode: 'hours', value: 72 } } },
    ] }] },
  };
  // The class's final submission date was yesterday; this student has 72 more hours.
  const assignment = buildAssignment({ dueAt: '2026-09-30T20:00:00Z', lateDueAt: '2026-09-30T21:00:00Z', dol: { instructionDate: '2026-09-29' } });
  const withoutProfile = resolveOriginalOpportunity({ assignment, section: 'dol', classId: CLASS, studentId: STUDENT, nowValue: NOW });
  assert.equal(withoutProfile.recoveryWindowEnded, true);
  const withProfile = resolveOriginalOpportunity({ assignment, section: 'dol', classId: CLASS, studentId: STUDENT, nowValue: NOW, studentProfile: extraTime });
  assert.equal(withProfile.recoveryWindowEnded, false, 'their Recovery stays open as long as their own final submission date');
  assert.equal(withProfile.status, ORIGINAL_OPPORTUNITY.CLOSED);
  assert.equal(withProfile.reason, 'instruction-day-passed', 'extra time does not reopen the DOL itself');
  // The browser summary (and the server context) read the same profile.
  assert.deepEqual(buildStudentRecoverySummary({ assignment, tracker: ORIGINAL_TRACKER, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW }), []);
  const extended = buildStudentRecoverySummary({ assignment, tracker: ORIGINAL_TRACKER, studentId: STUDENT, classId: CLASS, classPeriod: '1', studentProfile: extraTime, nowValue: NOW });
  assert.ok(extended.some((entry) => entry.section === 'dol' && entry.state === 'locked'));
});

test('a DOL with no generator-backed question cannot recover — it says why instead of reusing a static question', () => {
  const assignment = buildAssignment();
  assignment.sections[2].questions = [{ questionId: 'd-static', type: 'multiAnswer', prompt: 'What is 3 + 4?', answerFields: [{ id: 'a', answer: '7' }] }];
  const context = contextFor({ assignment, tracker: { 2: { status: 'expired', attemptCount: 1, totalAttempts: 1 } } });
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNAVAILABLE);
  assert.equal(context.eligibility.reason, 'generation-unavailable');
  const readiness = assessSectionRecoveryReadiness({ assignmentId: assignment.id, section: 'dol', entries: sectionEntriesFor(assignment, 'dol') });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.reason, 'static-question');
  assert.equal(readiness.blockers[0].message, 'DOL Q1 does not reference a generator-backed Question Family.');
});

test('a Live Challenge Warm-Up never produces a Warm-Up Recovery, whatever the authored Warm-Up score says', () => {
  const assignment = buildAssignment({ warmup: { instructionDate: '2026-09-01', liveChallenge: { enabled: true } } });
  const delivery = resolveWarmupDelivery({ assignment, hasAuthoredWarmup: true });
  assert.equal(delivery.mode, 'liveChallenge');
  // The student never answered the authored Warm-Up — because they played the game.
  const tracker = { 2: ORIGINAL_TRACKER[2], 3: ORIGINAL_TRACKER[3] };
  const context = contextFor({ assignment, section: 'warmup', tracker });
  assert.equal(context.eligibility.state, RECOVERY_STATE.HIDDEN);
  assert.equal(context.eligibility.reason, 'warmup-delivered-by-live-challenge');
  const summary = buildStudentRecoverySummary({ assignment, tracker, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW });
  assert.deepEqual(summary.map((entry) => entry.section), ['dol'], 'the DOL may still recover; the Warm-Up is not offered');
  // A teacher-choice Warm-Up with no decision yet is treated the same way.
  const pending = buildAssignment({ warmup: { instructionDate: '2026-09-01', liveChallenge: { enabled: true, deliveryMode: 'teacherChoice' } } });
  assert.equal(contextFor({ assignment: pending, section: 'warmup', tracker }).eligibility.state, RECOVERY_STATE.HIDDEN);
});

test('an original already at the cap needs nothing; a policy can switch Recovery off', () => {
  const strong = { ...ORIGINAL_TRACKER, 2: { status: 'correct', attemptCount: 1, totalAttempts: 1 } };
  assert.equal(contextFor({ tracker: strong }).eligibility.state, RECOVERY_STATE.NOT_NEEDED);
  const off = buildAssignment({ gradingPolicy: { recovery: { enabled: false } } });
  assert.equal(contextFor({ assignment: off }).eligibility.state, RECOVERY_STATE.UNAVAILABLE);
  assert.equal(evaluateSectionRecoveryEligibility({ section: 'quiz', original: { total: 1 } }).state, RECOVERY_STATE.HIDDEN);
});

/* ---------------------------------------------------------------------------
 * The full path: Practice -> unlock -> fresh questions -> submit.
 * ------------------------------------------------------------------------- */

test('Practice is server-graded, never repeats a seen question, and unlocks Recovery in the same write as the mastery', () => {
  const assignment = buildAssignment();
  const start = contextFor({ assignment });
  assert.equal(start.eligibility.state, RECOVERY_STATE.LOCKED);
  const originalFingerprints = new Set(start.seenFingerprints);
  assert.ok(originalFingerprints.size >= 3, 'the student\'s original deliveries are known as seen');

  const { record, items } = practiceUntilUnlocked({ assignment });
  assert.equal(record.status, 'unlocked');
  assert.ok(items.length >= 7 && items.length <= 8, `unlocked after ${items.length} items`);
  assert.equal(items.at(-1).outcome.response.unlocked, true);
  assert.equal(record.masteryEvidence.met, true);
  assert.equal(record.masteryEvidence.itemKeys.length, record.masteryEvidence.correct, 'the evidence names the items that unlocked it');
  const practiced = items.map(({ item }) => item.pin.fingerprint);
  assert.equal(new Set(practiced).size, practiced.length, 'no Practice question repeats');
  practiced.forEach((fingerprint) => assert.ok(!originalFingerprints.has(fingerprint), 'Practice never re-serves the original DOL question'));
  assert.deepEqual(new Set(items.map(({ item }) => item.storageIndex)), new Set([2, 3]), 'Practice covers every DOL skill');
});

test('a Practice answer is marked by the server, and a wrong or hinted answer is not mastery', () => {
  const assignment = buildAssignment();
  const context = contextFor({ assignment });
  const item = nextRecoveryPracticeItem(context);
  const wrong = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: 0, response: wrongResponse(reproduce(assignment, item)) }, at: NOW });
  assert.equal(wrong.response.isCorrect, false);
  assert.equal(wrong.record.practice.items[0].correct, false);
  const next = contextFor({ assignment, record: wrong.record });
  const nextItem = nextRecoveryPracticeItem(next);
  const hinted = runSectionRecoveryAction({ context: next, action: RECOVERY_ACTION.PRACTICE, payload: { pin: nextItem.pin, practiceIndex: 1, response: correctResponse(reproduce(assignment, nextItem)), supportUsage: { hintUsed: true } }, at: NOW + 1 });
  assert.equal(hinted.response.isCorrect, true);
  assert.equal(hinted.record.practice.items[1].independent, false);
  assert.equal(hinted.response.mastery.correct, 0, 'neither answer counts toward mastery');
});

test('the server refuses a repeated, foreign or unreadable Practice item', () => {
  const assignment = buildAssignment();
  const context = contextFor({ assignment });
  const item = nextRecoveryPracticeItem(context);
  const answered = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: 0, response: correctResponse(reproduce(assignment, item)) }, at: NOW });
  const after = contextFor({ assignment, record: answered.record });
  assert.throws(
    () => runSectionRecoveryAction({ context: after, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: 0, response: correctResponse(reproduce(assignment, item)) }, at: NOW + 1 }),
    (error) => error.code === 'practice-item-repeated',
  );
  // The student's own ordinary DOL delivery is not a Practice item.
  const seatInfo = resolveLearnerSeat({ assignment, studentId: STUDENT, classId: CLASS });
  const ordinary = resolveFamilyQuestionInstance({ question: getStoredAssignmentQuestions(assignment)[2], assignmentId: assignment.id, storageIndex: 2, allocation: resolveGenerationAllocation({ seatInfo, variant: 0 }) });
  assert.throws(
    () => runSectionRecoveryAction({ context: after, action: RECOVERY_ACTION.PRACTICE, payload: { pin: ordinary.delivery, response: { kind: 'opaque', type: 'stepAlgebra', value: 'x=1' } }, at: NOW + 2 }),
    (error) => error.code === 'practice-pin-invalid',
  );
  const fresh = nextRecoveryPracticeItem(after);
  assert.throws(
    () => runSectionRecoveryAction({ context: after, action: RECOVERY_ACTION.PRACTICE, payload: { pin: fresh.pin, response: { kind: 'opaque', type: 'stepAlgebra', value: '' } }, at: NOW + 3 }),
    (error) => error.code === 'practice-response-ungradable',
  );
  // A genuine Practice pin that happens to land on the student's ORIGINAL DOL
  // question is refused as well: Practice evidence must be a question they
  // have not already seen.
  const zerosSlot = getStoredAssignmentQuestions(assignment)[3];
  const originalZeros = resolveFamilyQuestionInstance({ question: zerosSlot, assignmentId: assignment.id, storageIndex: 3, allocation: resolveGenerationAllocation({ seatInfo, variant: 0 }) });
  let collision = null;
  for (let index = 0; index < 400 && !collision; index += 1) {
    const candidate = resolveFamilyQuestionInstance({
      question: zerosSlot,
      assignmentId: assignment.id,
      storageIndex: 3,
      slotKey: `${assignment.id}|recoveryPractice:dol:o1|d2`,
      allocation: { seat: 0, variant: 0, stride: 1, index },
      exact: true,
    });
    if (!candidate.error && candidate.delivery.fingerprint === originalZeros.delivery.fingerprint) collision = candidate;
  }
  assert.ok(collision, 'the Practice list holds the original question somewhere');
  assert.throws(
    () => runSectionRecoveryAction({ context: after, action: RECOVERY_ACTION.PRACTICE, payload: { pin: collision.delivery, response: correctResponse(collision) }, at: NOW + 4 }),
    (error) => error.code === 'practice-item-repeated',
  );
});

test('an item whose tries ran out is recorded as incorrect (a forfeit), so it never blocks Practice and never becomes a free skip', () => {
  const assignment = buildAssignment();
  const context = contextFor({ assignment });
  const item = nextRecoveryPracticeItem(context);
  const forfeited = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: null, forfeit: true }, at: NOW });
  assert.equal(forfeited.response.isCorrect, false);
  assert.equal(forfeited.record.practice.items[0].correct, false);
  const next = nextRecoveryPracticeItem(contextFor({ assignment, record: forfeited.record }));
  assert.notEqual(next.pin.fingerprint, item.pin.fingerprint, 'Practice moves on to a fresh question');
  // A forfeit still has to be a genuine item of this Recovery.
  const seatInfo = resolveLearnerSeat({ assignment, studentId: STUDENT, classId: CLASS });
  const ordinary = resolveFamilyQuestionInstance({ question: getStoredAssignmentQuestions(assignment)[2], assignmentId: assignment.id, storageIndex: 2, allocation: resolveGenerationAllocation({ seatInfo, variant: 0 }) });
  assert.throws(
    () => runSectionRecoveryAction({ context: contextFor({ assignment, record: forfeited.record }), action: RECOVERY_ACTION.PRACTICE, payload: { pin: ordinary.delivery, forfeit: true }, at: NOW + 1 }),
    (error) => error.code === 'practice-pin-invalid',
  );
});

test('Recovery cannot start while locked', () => {
  assert.throws(
    () => runSectionRecoveryAction({ context: contextFor(), action: RECOVERY_ACTION.START, at: NOW }),
    (error) => error.code === 'recovery-locked',
  );
});

test('a DOL Recovery is one fresh, unseen instance of every original DOL question, pinned once for every device', () => {
  const assignment = buildAssignment();
  const { record: unlocked } = practiceUntilUnlocked({ assignment });
  const context = contextFor({ assignment, record: unlocked });
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED);
  const started = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: NOW + 3_600_000 });
  const plan = started.record.plan;
  assert.equal(started.record.status, 'inProgress');
  assert.equal(started.record.type, RECOVERY_TYPE.RECOVERY);
  assert.equal(started.record.cap, 90);
  assert.deepEqual(plan.items.map((item) => item.storageIndex), [2, 3], 'same questions, same order');
  const questions = getStoredAssignmentQuestions(assignment);
  plan.items.forEach((item) => {
    assert.equal(item.familyId, questions[item.storageIndex].questionFamily.id, 'same family, so the same skill and rigor');
    assert.ok(!context.seenFingerprints.includes(item.pin.fingerprint), 'never a question the student has seen');
    const rebuilt = reproduce(assignment, item);
    assert.ok(!rebuilt.error);
    assert.equal(rebuilt.question.type, questions[item.storageIndex].type, 'same tool as the original');
  });
  // Starting again (a refresh, another device) returns the SAME pinned plan.
  const again = runSectionRecoveryAction({ context: contextFor({ assignment, record: started.record }), action: RECOVERY_ACTION.START, at: NOW + 3_700_000 });
  assert.equal(again.changed, false);
  assert.deepEqual(again.response.plan, plan);
});

test('submitting grades every item from its pin on the server and records max(original, min(recovery, 90))', () => {
  const assignment = buildAssignment();
  const { record: unlocked } = practiceUntilUnlocked({ assignment });
  const started = runSectionRecoveryAction({ context: contextFor({ assignment, record: unlocked }), action: RECOVERY_ACTION.START, at: NOW + 1 }).record;
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, correctResponse(reproduce(assignment, item))]));
  const submitted = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 2 });
  assert.equal(submitted.gradeChanged, true);
  assert.equal(submitted.response.rawScore, 100);
  assert.equal(submitted.response.recordedScore, 90, '100% Recovery over a 50% original records at the 90 cap');
  assert.equal(submitted.record.status, 'completed');

  // History is preserved: the original answers are untouched and the record
  // keeps the practice, the unlock, the start and the completion.
  assert.deepEqual(ORIGINAL_TRACKER[2], { status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 });
  assert.ok(submitted.record.practice.items.length >= 7);
  const events = submitted.record.history.map((entry) => entry.event);
  ['unlocked', 'started', 'completed'].forEach((event) => assert.ok(events.includes(event), `history keeps "${event}"`));
  assert.ok(submitted.record.unlockedAt && submitted.record.startedAt && submitted.record.completedAt);

  // One automatic opportunity.
  const finished = contextFor({ assignment, record: submitted.record });
  assert.equal(finished.eligibility.state, RECOVERY_STATE.COMPLETED);
  assert.throws(() => runSectionRecoveryAction({ context: finished, action: RECOVERY_ACTION.START, at: NOW + 3 }), (error) => error.code === 'recovery-locked');
  assert.throws(() => runSectionRecoveryAction({ context: finished, action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 4 }), (error) => error.code === 'recovery-not-in-progress');
});

test('a Recovery that does not beat the original keeps the original', () => {
  const assignment = buildAssignment();
  const { record: unlocked } = practiceUntilUnlocked({ assignment });
  const started = runSectionRecoveryAction({ context: contextFor({ assignment, record: unlocked }), action: RECOVERY_ACTION.START, at: NOW + 1 }).record;
  const [first, second] = started.plan.items;
  const responses = { [first.itemId]: correctResponse(reproduce(assignment, first)), [second.itemId]: wrongResponse(reproduce(assignment, second)) };
  const submitted = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 2 });
  assert.equal(submitted.response.rawScore, 50);
  assert.equal(submitted.response.recordedScore, 50);
});

test('an excused absence on the original day becomes a full-credit make-up (still after Practice mastery)', () => {
  const assignment = buildAssignment();
  const excusedEvent = {
    kind: 'attendanceHistory',
    studentId: STUDENT,
    classId: CLASS,
    dateKey: '2026-09-01',
    evidence: { dateKey: '2026-09-01', mark: 'excused', markedAt: NOW - 86_400_000 },
  };
  const missedEverything = {};
  const locked = contextFor({ assignment, tracker: missedEverything, supportEvents: [excusedEvent] });
  assert.equal(locked.attendance.excused, true);
  assert.equal(locked.eligibility.type, RECOVERY_TYPE.EXCUSED_MAKE_UP);
  assert.equal(locked.eligibility.state, RECOVERY_STATE.LOCKED, 'by default an excused make-up still asks for Practice mastery');

  let record = null;
  for (let step = 0; step < 10; step += 1) {
    const context = contextFor({ assignment, tracker: missedEverything, supportEvents: [excusedEvent], record });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    record = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: correctResponse(reproduce(assignment, item)) }, at: NOW + step }).record;
  }
  const started = runSectionRecoveryAction({ context: contextFor({ assignment, tracker: missedEverything, supportEvents: [excusedEvent], record }), action: RECOVERY_ACTION.START, at: NOW + 100 }).record;
  assert.equal(started.type, RECOVERY_TYPE.EXCUSED_MAKE_UP);
  assert.equal(started.cap, 100);
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, correctResponse(reproduce(assignment, item))]));
  const submitted = runSectionRecoveryAction({ context: contextFor({ assignment, tracker: missedEverything, supportEvents: [excusedEvent], record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 200 });
  assert.equal(submitted.response.recordedScore, 100, 'full credit, uncapped');

  // A bare live "absent" is not an excused absence.
  const absentOnly = contextFor({ assignment, tracker: missedEverything, supportEvents: [{ kind: 'liveAttendance', studentId: STUDENT, classId: CLASS, dateKey: '2026-09-01', evidence: { dateKey: '2026-09-01', attendanceMark: 'absent', markedAt: NOW - 86_400_000 } }] });
  assert.equal(absentOnly.eligibility.type, RECOVERY_TYPE.RECOVERY);
});

test('a Warm-Up Recovery asks 2-3 fresh questions and caps at 85', () => {
  const assignment = buildAssignment();
  const tracker = {};
  let record = null;
  for (let step = 0; step < 10; step += 1) {
    const context = contextFor({ assignment, section: 'warmup', tracker, record });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    record = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: correctResponse(reproduce(assignment, item)) }, at: NOW + step }).record;
  }
  const started = runSectionRecoveryAction({ context: contextFor({ assignment, section: 'warmup', tracker, record }), action: RECOVERY_ACTION.START, at: NOW + 50 }).record;
  assert.equal(started.plan.items.length, 3);
  assert.equal(new Set(started.plan.items.map((item) => item.pin.fingerprint)).size, 3, 'three different questions even from one Warm-Up question');
  assert.equal(started.cap, 85);
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, correctResponse(reproduce(assignment, item))]));
  const submitted = runSectionRecoveryAction({ context: contextFor({ assignment, section: 'warmup', tracker, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 60 });
  assert.equal(submitted.response.recordedScore, 85);
});

/* ---------------------------------------------------------------------------
 * A Live Challenge Warm-Up result is the Warm-Up grade.
 * ------------------------------------------------------------------------- */

const LC_ASSIGNMENT = () => buildAssignment({ warmup: { instructionDate: '2026-09-01', liveChallenge: { enabled: true } } });
// Shaped exactly as writeWarmupCreditFromResult (functions/index.js) stores it.
const credit = (correct, roundsAvailable, answered = roundsAvailable) => ({
  answered,
  correct,
  roundsAvailable,
  participationPercent: roundsAvailable ? Math.round((answered / roundsAvailable) * 100) : null,
  accuracyPercent: answered ? Math.round((correct / answered) * 100) : null,
  roomId: 'room-1',
  status: 'finished',
  roundCount: 5,
  roundsPlayed: 5,
  recordedAt: { seconds: 1 },
});

test('the challenge score is rounds correct out of the rounds the student could play — never challenge points', () => {
  assert.equal(warmupChallengeScore(credit(4, 5)), 80);
  assert.equal(warmupChallengeScore(credit(3, 3, 3)), 100, 'a late arrival is measured only on the rounds they were there for');
  assert.equal(warmupChallengeScore(credit(0, 5, 2)), 0, 'present and answering nothing correctly is 0');
  assert.equal(warmupChallengeScore(credit(0, 0, 0)), null, 'a game that offered no rounds measured nothing');
  assert.equal(warmupChallengeScore({ correct: 9, roundsAvailable: 5 }), 100, 'never more than every round');
  assert.equal(warmupChallengeScore(null), null);
});

test('the Live Challenge result becomes the Warm-Up grade in the same calculation — nothing else moves', () => {
  const assignment = LC_ASSIGNMENT();
  const challengeByAssignment = { [assignment.id]: credit(4, 5) };
  const before = splitGradesBySection({ tracker: ORIGINAL_TRACKER, assignment });
  const projected = projectSectionRecoveryForAssignment({ tracker: ORIGINAL_TRACKER, assignment, challengeByAssignment });
  const after = splitGradesBySection({ tracker: projected.tracker, assignment });
  assert.equal(after.warmup.score, 80);
  assert.equal(after.warmup.total, before.warmup.total, 'the Warm-Up keeps its questions and weights');
  assert.deepEqual(after.dol, before.dol);
  assert.deepEqual(after.classwork, before.classwork);
  assert.equal(projected.challenge.source, 'challenge');
  assert.deepEqual(projected.tracker[0].warmupChallengeDisplay, { challengeScore: 80, correct: 4, roundsAvailable: 5, recordedScore: 80, originalScore: 0 });

  // A student whose only work was the game still gets their Warm-Up grade.
  const gameOnly = projectSectionRecoveryForAssignment({ tracker: null, assignment, challengeByAssignment });
  assert.equal(splitGradesBySection({ tracker: gameOnly.tracker, assignment }).warmup.score, 80);

  // Authored Warm-Up work that scored higher is kept.
  const strongAuthored = { ...ORIGINAL_TRACKER, 0: { status: 'correct', attemptCount: 1, totalAttempts: 1 } };
  const kept = projectSectionRecoveryForAssignment({ tracker: strongAuthored, assignment, challengeByAssignment: { [assignment.id]: credit(3, 5) } });
  assert.equal(kept.challenge.source, 'original');
  assert.equal(splitGradesBySection({ tracker: kept.tracker, assignment }).warmup.score, 100);

  // No measurable result: the very same tracker.
  assert.equal(projectSectionRecoveryForAssignment({ tracker: ORIGINAL_TRACKER, assignment, challengeByAssignment: { [assignment.id]: credit(0, 0, 0) } }).tracker, ORIGINAL_TRACKER);
});

test('every grade surface reads the challenge result; an assignment-level override still wins', () => {
  const assignment = LC_ASSIGNMENT();
  const student = {
    id: STUDENT,
    gradesByAssignment: { [assignment.id]: ORIGINAL_TRACKER },
    warmupChallengeByAssignment: { [assignment.id]: credit(5, 5) },
    teacherGradeOverridesByAssignment: {},
  };
  const withChallenge = canonicalPresentedAssignmentGrade({ student, assignment });
  const without = canonicalPresentedAssignmentGrade({ student: { ...student, warmupChallengeByAssignment: {} }, assignment });
  assert.ok(withChallenge > without, 'the effective (exported) grade includes the Warm-Up challenge');
  const gameOnly = canonicalPresentedAssignmentGrade({ student: { ...student, gradesByAssignment: {} }, assignment });
  assert.ok(gameOnly > 0, 'a game-only student has a grade, not a blank');
  const overridden = { ...student, teacherGradeOverridesByAssignment: { [assignment.id]: { __assignment: { active: true, score: 55 } } } };
  assert.equal(canonicalPresentedAssignmentGrade({ student: overridden, assignment }), 55);
  // The teacher sees where the Warm-Up grade came from.
  const audit = buildTeacherWarmupChallengeAudit({ student, assignment });
  assert.equal(audit.challenge, '5 of 5 rounds correct (100%)');
  assert.equal(audit.final, '100%');
  assert.match(audit.reason, /Challenge points are not part of the grade/);
  assert.equal(warmupChallengeCounts(student, assignment.id), true);
  assert.equal(buildTeacherWarmupChallengeAudit({ student: { ...student, warmupChallengeByAssignment: {} }, assignment }), null);
});

test('Classroom passback applies the same challenge result and wakes only when the result itself changes', async () => {
  const assignment = LC_ASSIGNMENT();
  const questions = getStoredAssignmentQuestions(assignment);
  const result = credit(4, 5);
  // A teacher per-question override on the authored Warm-Up shaped only the
  // original; once the challenge result wins it no longer applies there.
  const server = await projectRecoveredGradeInputs({
    assignment,
    tracker: ORIGINAL_TRACKER,
    questions,
    overrides: { 0: { active: true, score: 100 }, 2: { active: true, score: 100 } },
    recoveryForAssignment: null,
    challengeCredit: result,
    gradeProgress: assignmentGradeProgress,
  });
  const browser = projectSectionRecoveryForAssignment({ tracker: ORIGINAL_TRACKER, assignment, challengeByAssignment: { [assignment.id]: result } });
  assert.deepEqual(server.tracker[0].warmupChallengeDisplay, browser.tracker[0].warmupChallengeDisplay);
  assert.deepEqual(Object.keys(server.overrides), ['2'], 'only the DOL override survives');

  const before = { warmupChallengeByAssignment: {} };
  assert.deepEqual(recoveryChangedAssignmentIds({ warmupChallengeByAssignment: { [assignment.id]: result } }, before), [assignment.id]);
  const rewritten = { ...result, recordedAt: { seconds: 999 }, roomId: 'room-1' };
  assert.deepEqual(recoveryChangedAssignmentIds({ warmupChallengeByAssignment: { [assignment.id]: rewritten } }, { warmupChallengeByAssignment: { [assignment.id]: result } }), [], 'rewriting the same result does not re-send a grade');
  // The synchronous trigger signature and the shared one agree.
  [credit(4, 5), credit(0, 3, 1), credit(0, 0, 0), null].forEach((entry) => {
    assert.equal(warmupChallengeCreditSignature(entry), warmupChallengeSignature(entry));
  });
});

/* ---------------------------------------------------------------------------
 * One grade on every surface.
 * ------------------------------------------------------------------------- */

const completedFor = (assignment) => {
  const { record: unlocked } = practiceUntilUnlocked({ assignment });
  const started = runSectionRecoveryAction({ context: contextFor({ assignment, record: unlocked }), action: RECOVERY_ACTION.START, at: NOW + 1 }).record;
  const responses = Object.fromEntries(started.plan.items.map((item) => [item.itemId, correctResponse(reproduce(assignment, item))]));
  return runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 2 }).record;
};

test('a completed Recovery rescores only its own section, inside the existing grade — no extra column, no double count', () => {
  const assignment = buildAssignment();
  const record = completedFor(assignment);
  const recoveryByAssignment = { [assignment.id]: { dol: record } };
  const before = splitGradesBySection({ tracker: ORIGINAL_TRACKER, assignment });
  const projected = projectSectionRecoveryForAssignment({ tracker: ORIGINAL_TRACKER, assignment, recoveryByAssignment });
  const after = splitGradesBySection({ tracker: projected.tracker, assignment });
  assert.equal(before.dol.score, 50);
  assert.equal(after.dol.score, 90);
  assert.equal(after.dol.total, before.dol.total, 'the DOL keeps its questions and weights');
  assert.deepEqual(after.warmup, before.warmup, 'other sections are untouched');
  assert.deepEqual(after.classwork, before.classwork);
  assert.equal(projected.states.dol.source, 'recovery');
  // Nothing completed -> the very same tracker object.
  assert.equal(projectSectionRecoveryForAssignment({ tracker: ORIGINAL_TRACKER, assignment, recoveryByAssignment: {} }).tracker, ORIGINAL_TRACKER);
});

test('teacher overrides keep their precedence: the assignment override still replaces the whole grade', () => {
  const assignment = buildAssignment();
  const record = completedFor(assignment);
  const student = {
    id: STUDENT,
    gradesByAssignment: { [assignment.id]: ORIGINAL_TRACKER },
    sectionRecoveryByAssignment: { [assignment.id]: { dol: record } },
    teacherGradeOverridesByAssignment: {},
  };
  const withRecovery = canonicalPresentedAssignmentGrade({ student, assignment });
  const withoutRecovery = canonicalPresentedAssignmentGrade({ student: { ...student, sectionRecoveryByAssignment: {} }, assignment });
  assert.ok(withRecovery > withoutRecovery, 'the effective grade includes the Recovery');
  const overridden = { ...student, teacherGradeOverridesByAssignment: { [assignment.id]: { __assignment: { active: true, score: 61 } } } };
  assert.equal(canonicalPresentedAssignmentGrade({ student: overridden, assignment }), 61);
});

test('Classroom passback projects the same Recovery as the browser, and only wakes when a completion changes', async () => {
  const assignment = buildAssignment();
  const record = completedFor(assignment);
  const questions = getStoredAssignmentQuestions(assignment);
  const server = await projectRecoveredGradeInputs({
    assignment,
    tracker: ORIGINAL_TRACKER,
    questions,
    overrides: {},
    recoveryForAssignment: { dol: record },
    gradeProgress: assignmentGradeProgress,
  });
  const browser = projectSectionRecoveryForAssignment({ tracker: ORIGINAL_TRACKER, assignment, recoveryByAssignment: { [assignment.id]: { dol: record } } });
  assert.equal(server.states.dol.recordedScore, browser.states.dol.recordedScore);
  assert.deepEqual(server.tracker[2].sectionRecoveryDisplay, browser.tracker[2].sectionRecoveryDisplay);

  const inProgress = { ...record, status: 'inProgress' };
  assert.deepEqual(recoveryChangedAssignmentIds({ sectionRecoveryByAssignment: { [assignment.id]: { dol: inProgress } } }, {}), [], 'practice and in-progress writes do not reach Classroom');
  assert.deepEqual(recoveryChangedAssignmentIds({ sectionRecoveryByAssignment: { [assignment.id]: { dol: record } } }, { sectionRecoveryByAssignment: { [assignment.id]: { dol: inProgress } } }), [assignment.id]);
});

/* ---------------------------------------------------------------------------
 * What students and teachers read.
 * ------------------------------------------------------------------------- */

test('the student panel speaks plainly: locked, unlocked, then Original / Recovery / Final', () => {
  const assignment = buildAssignment();
  const locked = buildStudentRecoverySummary({ assignment, tracker: ORIGINAL_TRACKER, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW });
  const dol = locked.find((entry) => entry.section === 'dol');
  assert.equal(dol.label, 'DOL Recovery');
  assert.equal(dol.state, 'locked');
  assert.equal(dol.canPractice, true);
  assert.equal(dol.canStart, false);
  assert.ok(dol.nextPracticeItem?.pin, 'the first Practice question is ready');
  const copy = JSON.stringify(locked.map(({ label, badge, message }) => ({ label, badge, message })));
  ['seed', 'family', 'variant', 'allocation', 'token', 'fingerprint', 'pin'].forEach((word) => {
    assert.doesNotMatch(copy, new RegExp(`\\b${word}\\b`, 'i'), `student copy must not say "${word}"`);
  });

  const record = completedFor(assignment);
  const done = buildStudentRecoverySummary({ assignment, tracker: ORIGINAL_TRACKER, recoveryForAssignment: { dol: record }, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW });
  const finished = done.find((entry) => entry.section === 'dol');
  assert.equal(finished.state, 'completed');
  assert.deepEqual(finished.result, { original: '50%', recovery: '100%', final: '90%' });
  assert.equal(finished.nextPracticeItem, null);
});

test('the teacher audit shows Original, Recovery, Final, the type and the evidence — and nothing for everyone else', () => {
  const assignment = buildAssignment();
  const record = completedFor(assignment);
  const student = { id: STUDENT, gradesByAssignment: { [assignment.id]: ORIGINAL_TRACKER }, sectionRecoveryByAssignment: { [assignment.id]: { dol: record } } };
  const [row] = buildTeacherRecoveryAudit({ student, assignment });
  assert.equal(row.label, 'DOL Recovery');
  assert.equal(row.original, '50%');
  assert.equal(row.recovery, '100%');
  assert.equal(row.final, '90%');
  assert.match(row.typeLabel, /up to 90%/);
  assert.match(row.evidence, /Practice mastery/);
  assert.deepEqual([...completedRecoverySections(student, assignment.id)], ['dol']);
  assert.deepEqual(buildTeacherRecoveryAudit({ student: { id: 'other', gradesByAssignment: {} }, assignment }), []);
});

/* ---------------------------------------------------------------------------
 * Wiring.
 * ------------------------------------------------------------------------- */

test('the assignment result screen shows the Recovery panel and runner, each imported where it is used', () => {
  const app = componentSource('src/App.jsx');
  const resultView = region(app, "activeView === 'assignmentResult' && assignmentResultRoute", 'if (isStudentAssignment)', 'assignment result view');
  assert.match(app, /^import SectionRecoveryPanel from '\.\/components\/student\/SectionRecoveryPanel\.jsx';$/m);
  // Lazy, so MathLive (which the runner's QuestionEngine brings) stays out of
  // the first load (tests/platform/initialBundleBoundary.test.mjs). Either form
  // binds the name to the same module.
  assert.match(app, /^(?:import SectionRecoveryRunner from |const SectionRecoveryRunner = lazy\(\(\) => import\()'\.\/components\/student\/SectionRecoveryRunner\.jsx'(?:\)\))?;$/m);
  assert.match(app, /^import \{ buildStudentRecoverySummary \} from '\.\/platform\/recovery\/studentRecoveryModel\.js';$/m);
  assert.match(app, /^import \{ recoveryErrorCode, startSectionRecovery \} from '\.\/services\/sectionRecoveryService\.js';$/m);
  assert.match(resultView, /<SectionRecoveryRunner\b/);
  assert.match(resultView, /recoveryPanel=\{studentRecoverySummary\.length \? \(\s*<SectionRecoveryPanel\b/);
  const summaryMemo = region(app, 'const studentRecoverySummary = useMemo(', '}, [recoveryAssignmentId', 'recovery summary memo');
  assert.match(summaryMemo, /buildStudentRecoverySummary\(/);
  // The original is compared after teacher overrides and BEFORE any Recovery.
  assert.match(summaryMemo, /projectTeacherOverridesForDisplay\(tracker, teacherGradeOverridesByAssignment\)/);
  assert.doesNotMatch(summaryMemo, /gradeDisplayTracker|projectSectionRecoveries/);
  assert.match(summaryMemo, /studentProfile: user\.profile \|\| null/, 'the browser decides with the same support profile as the server');
  const startHandler = region(app, 'const startStudentRecovery = async', '};', 'start handler');
  assert.match(startHandler, /await startSectionRecovery\(\{ assignmentId, section \}\)/);
  assert.match(startHandler, /recoveryErrorCode\(error\)/);
});

test('the Live Challenge Warm-Up grade reaches the student Grade Center and both Classroom passback triggers', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = componentSource('src/App.jsx');
  const display = region(app, 'const gradeDisplayTracker = useMemo(', '\n  );', 'student grade display memo');
  assert.match(display, /projectSectionRecoveriesForDisplay\([\s\S]*warmupChallengeByAssignment,\s*\)/);
  assert.match(display, /\[tracker, teacherGradeOverridesByAssignment, sectionRecoveryByAssignment, assignments, warmupChallengeByAssignment\]/);
  assert.match(app, /setWarmupChallengeByAssignment\(snapshot\.data\(\)\?\.warmupChallengeByAssignment \|\| \{\}\);/, 'a finished match reaches the Grade Center without a reload');
  const index = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const sync = region(index, 'exports.syncGradeToClassroom', 'exports.queueReleasedAssessmentGrades', 'whole-assignment passback');
  assert.match(sync, /challengeCredit: afterData\.warmupChallengeByAssignment\?\.\[assignmentId\] \|\| null,/);
  assert.match(sync, /sectionRecoveryGrades\.recoveryChangedAssignmentIds\(afterData, beforeData\)/);
  const sectionEntry = await readFile(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8');
  assert.match(sectionEntry, /challengeCredit: afterData\.warmupChallengeByAssignment\?\.\[assignmentId\] \|\| null,/);
});

test('the gradebook detail renders the Recovery audit trail and the section marker, each imported', () => {
  const app = componentSource('src/App.jsx');
  assert.match(app, /^import SectionRecoveryAuditTrail from '\.\/components\/teacher\/SectionRecoveryAuditTrail\.jsx';$/m);
  assert.match(app, /^import \{ completedRecoverySections, warmupChallengeCounts \} from '\.\/platform\/recovery\/teacherRecoveryAudit\.js';$/m);
  assert.match(app, /const challengeWarmup = warmupChallengeCounts\(student, selectedAssignment\.id\);/);
  assert.match(app, /<SectionRecoveryAuditTrail student=\{student\} assignment=\{selectedAssignment\} \/>/);
  assert.match(app, /const recoveredSections = completedRecoverySections\(student, selectedAssignment\.id\);/);
  assert.match(app, /\{recoveredMark\('dol'\)\}/);
});

test('the Recovery runner requires the pinned question and keeps its drafts apart from the assignment', () => {
  const runner = componentSource('src/components/student/SectionRecoveryRunner.jsx');
  assert.match(runner, /requirePin: true/);
  assert.match(runner, /assignmentId: `\$\{assignmentId\}~\$\{draftNamespace\}`/);
  // Answers go to the server raw; no browser verdict is sent.
  const practiceGrade = region(runner, 'const handleGrade = useCallback(async (unusedLocalVerdict', '}, [assignment.id', 'practice grade handler');
  assert.match(practiceGrade, /normalizeCheckpointResponse\(rendered,/);
  const sent = region(practiceGrade, 'submitRecoveryPracticeItem({', '});', 'practice submission payload');
  assert.match(sent, /\bresponse,/);
  assert.doesNotMatch(sent, /isCorrect|unusedLocalVerdict/, 'the browser verdict never travels');
  // The assessment shows no correctness before the whole Recovery is submitted.
  assert.match(runner, /feedback: 'afterAssignmentSubmit'/);
  assert.match(runner, /hintsAllowed: false/);
  // Step tools keep the original section's rules: rejected moves spend tries
  // through the same bookkeeping and limits the assignment player uses.
  const assessmentPolicySource = region(runner, 'const assessmentPolicy = (section) => Object.freeze({', '});', 'assessment policy');
  assert.doesNotMatch(assessmentPolicySource, /attempts:/, 'the section keeps its own attempt limit (a DOL keeps one try)');
  const assessmentRunner = region(runner, 'function AssessmentRunner(', 'export default function SectionRecoveryRunner', 'assessment runner');
  assert.match(assessmentRunner, /recordQuestionStep\(\{ record: stepRecords\[current\.itemId\], stepGrade, countsAttempt, statePatch, supportUsage, maximumAttempts \}\)/);
  assert.match(assessmentRunner, /resolveQuestionMaximumAttempts\(\{ question: currentQuestion, activityPolicy: policy \}\)/);
  assert.match(assessmentRunner, /onStepGrade=\{handleStepGrade\}/);
  const practiceRunner = region(runner, 'function PracticeRunner(', 'function AssessmentRunner(', 'practice runner');
  assert.match(practiceRunner, /recordQuestionStep\(\{ record: stepRecords\[fingerprint\], stepGrade, countsAttempt, statePatch, supportUsage, maximumAttempts \}\)/);
  assert.match(practiceRunner, /forfeit: true/);
  assert.doesNotMatch(runner, /onStepGrade=\{async \(\) => null\}/, 'a step tool must never get a no-op step grader');
});

test('the release deploy surface names every function this release changes, and deploys only those', async () => {
  const { readFile } = await import('node:fs/promises');
  const surface = await import('../../scripts/question-family-recovery-deploy-surface.mjs');
  const names = surface.questionFamilyRecoveryFunctionNames();
  const index = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const sectionEntry = await readFile(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8');
  names.forEach((name) => {
    const exported = index.includes(`exports.${name} = `)
      || (region(sectionEntry, 'module.exports = {', '};', 'section entry exports').includes(`    ${name},`) && sectionEntry.includes(`const ${name} = `));
    assert.ok(exported, `${name} is in the deploy list but is not an exported Cloud Function`);
  });
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(surface.browserCallableServiceIds().sort(), ['advancesectionrecovery', 'ingeststudentsubmissions']);
  // The browser calls exactly the callable this release deploys.
  const callable = region(index, 'exports.advanceSectionRecovery = onCall(', '\n});', 'advanceSectionRecovery');
  assert.match(callable, /studentProfile: gradeData\.profile \|\| null,/, 'individualized deadlines reach the server decision');
  assert.match(callable, /db\.runTransaction\(/);
  const service = await readFile(new URL('../../src/services/sectionRecoveryService.js', import.meta.url), 'utf8');
  assert.match(service, /httpsCallable\(functions, 'advanceSectionRecovery'\)/);
  const script = await readFile(new URL('../../scripts/deploy-question-family-recovery.sh', import.meta.url), 'utf8');
  assert.match(script, /firebase deploy --project "\$PROJECT" --only "\$FUNCTION_TARGETS"/);
  assert.match(script, /firebase deploy --project "\$PROJECT" --only firestore:rules/);
  assert.match(script, /npm run deploy:hosting/);
  assert.doesNotMatch(script, /--only (functions|hosting)(\s|"|$)/, 'never the whole fleet, never raw hosting');
  const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['deploy:question-family-recovery'], 'bash scripts/deploy-question-family-recovery.sh');
});
