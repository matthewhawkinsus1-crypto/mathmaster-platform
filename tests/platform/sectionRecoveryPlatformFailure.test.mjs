/*
 * A MATHMASTER PLATFORM FAILURE IS NEVER EVIDENCE THAT A STUDENT WAS WRONG.
 *
 * PR #430's investigation found the remaining P0: when a Section Recovery
 * assessment item could not be reproduced from its authoritative delivery pin
 * (a re-tuned family, a version the build lacks, a damaged pin, constraints
 * that can no longer be met, a generator that throws), Recovery SUBMIT stored
 *
 *   { isCorrect: false, credit: 0, weight: <full>, graded: false, reason: 'question-unavailable' }
 *
 * and applyRecoveryCompletion added that weight to the denominator. A
 * platform failure lowered the Recovery result exactly as a wrong answer
 * would — and with every item unavailable the student's one automatic
 * Recovery was recorded as 0% and used up.
 *
 * The other half of the invariant matters as much: a platform failure must
 * never silently award credit the student did not earn. So an item MathMaster
 * cannot grade is left out of the score only when the questions it COULD grade
 * still assess what the Recovery was built to assess (the sufficient-evidence
 * rule in functions/shared/sectionRecoveryEvidence.mjs). Otherwise the
 * Recovery is HELD: no Recovery score, no grade replacement, no Classroom
 * passback, no Grade Transfer row — until a teacher resolves it.
 *
 * Everything here runs the REAL server path (runSectionRecoveryAction, the
 * shared projection, the passback helpers, Grade Transfer, the Grade Center
 * and the teacher audit). The callable and both Classroom triggers are
 * certified against the Firestore emulator in
 * tests/integration/sectionRecoveryPlatformFailure.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { RECOVERY_STATE } from '../../functions/shared/sectionRecoveryEligibility.mjs';
import {
  RECOVERY_ACTION,
  buildSectionRecoveryContext,
  nextRecoveryPracticeItem,
} from '../../functions/shared/sectionRecoveryService.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import * as recordModule from '../../functions/shared/sectionRecoveryRecord.mjs';
import * as projectionModule from '../../functions/shared/sectionRecoveryProjection.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import { buildStudentRecoverySummary } from '../../src/platform/recovery/studentRecoveryModel.js';
import * as teacherAuditModule from '../../src/platform/recovery/teacherRecoveryAudit.js';
import { projectSectionRecoveryForAssignment } from '../../src/platform/grading/sectionRecoveryGrades.js';
import * as canonicalModule from '../../src/platform/grading/canonicalGradeProjection.js';
import { TRANSFER_STATE, buildTransferUnit } from '../../src/platform/gradeTransfer/gradeTransferModel.js';
import { projectGradeTransferUnits } from '../../src/platform/gradeTransfer/gradeTransferProjection.js';
import { buildStudentGradeCenter, findGradeCenterEntry } from '../../src/platform/student/studentGradeCenterModel.js';
import { QUESTION_RESOLUTION_FAILURE, classifyFamilyFailure } from '../../src/platform/generation/familyPinReplay.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const recoveryLib = require('../../functions/lib/sectionRecoveryGrades.js');
const { assignmentGradeProgress } = require('../../functions/lib/classroomGradeRuntime.js');

// The new shared module. Imported lazily so that, before the fix, each test
// fails on its own assertion rather than the whole file failing to load.
const evidenceModule = async () => import('../../functions/shared/sectionRecoveryEvidence.mjs').catch(() => ({}));
const resolutionModule = async () => import('../../functions/shared/sectionRecoveryResolution.mjs').catch(() => ({}));

const NOW = Date.parse('2026-10-01T15:00:00Z');
const STUDENT = 'student-07';
const CLASSMATE = 'student-03';
const CLASS = 'class-A';
const ROSTER = Array.from({ length: 12 }, (_, index) => `student-${String(index).padStart(2, '0')}`);

const twoStep = (questionId, questionWeight, constraints = null) => ({
  questionId, type: 'stepAlgebra', prompt: 'Solve for x.', questionWeight,
  questionFamily: { id: 'linear.twoStepEquation', ...(constraints ? { constraints } : {}) },
});
const zeros = (questionId, questionWeight, extra = {}) => ({
  questionId, type: 'multiAnswer', prompt: 'Find the zeros.', questionWeight,
  questionFamily: { id: 'functions.identifyZeros', ...extra },
});
const intercepts = (questionId, questionWeight, constraints = null) => ({
  questionId, type: 'multiAnswer', prompt: 'Find both intercepts.', questionWeight,
  questionFamily: { id: 'functions.identifyIntercepts', ...(constraints ? { constraints } : {}) },
});
// An assignment-local family (its own generator), for the unsatisfiable and
// generation-failure cases a platform family cannot be pushed into.
const AREA = (questionId, questionWeight, generator = null) => ({
  questionId,
  type: 'multiAnswer',
  prompt: 'A garden is {{w}} m wide and {{l}} m long. What is its area in square meters?',
  questionWeight,
  generator: generator || { parameters: { w: { type: 'int', min: 3, max: 12 }, l: { type: 'int', min: 4, max: 15 } }, derived: { area: 'w*l' }, constraints: ['w!=l'] },
  answerFields: [{ id: 'area', label: 'Area', inputProfile: 'number', answer: '{{area}}' }],
  questionFamily: { scope: 'assignment' },
});

// Q1 = 40, Q2 = 30, Q3 = 30 (the brief's weights, inside the engine's bounds).
const DISTINCT_SKILLS = () => [twoStep('d1', 4), zeros('d2', 3), intercepts('d3', 3)];
const Q3_SHARES_Q1_SKILL = () => [twoStep('d1', 4), zeros('d2', 3), twoStep('d3', 3)];

const buildAssignment = (dolQuestions, overrides = {}) => {
  const assignment = {
    id: 'asg-recovery-p0',
    schemaVersion: 5,
    title: 'Recovery platform failure',
    assignedClassIds: [CLASS],
    dueAt: '2026-09-01T20:00:00Z',
    lateDueAt: '2026-10-10T23:00:00Z',
    warmup: { instructionDate: '2026-09-01' },
    dol: { instructionDate: '2026-09-01' },
    sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: dolQuestions }],
    ...overrides,
  };
  assignment.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: ROSTER }) } };
  return assignment;
};

// The original DOL: only d2 right (weights 4/3/3 -> 30%).
const ORIGINAL = Object.freeze({
  0: Object.freeze({ status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 }),
  1: Object.freeze({ status: 'correct', attemptCount: 1, totalAttempts: 1, variantIndex: 0 }),
  2: Object.freeze({ status: 'expired', attemptCount: 1, totalAttempts: 1, variantIndex: 0 }),
});

const entriesFor = (assignment, section) => getStoredAssignmentQuestions(assignment)
  .map((question, storageIndex) => ({ storageIndex, question }))
  .filter((entry) => entry.question.activityRole === section);

const contextFor = ({ assignment, tracker = ORIGINAL, record = null, section = 'dol', studentId = STUDENT, nowValue = NOW }) => {
  const original = splitGradesBySection({ tracker, assignment })[section];
  return buildSectionRecoveryContext({
    assignment,
    section,
    sectionEntries: entriesFor(assignment, section),
    questions: getStoredAssignmentQuestions(assignment),
    tracker,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record,
    studentId,
    classId: CLASS,
    classPeriod: '1',
    schedule: null,
    supportEvents: [],
    sectionModeFor: () => 'personalized',
    nowValue,
  });
};

const reproduce = (assignment, item) => reproduceFamilyQuestionFromPin({
  question: getStoredAssignmentQuestions(assignment)[item.storageIndex],
  assignmentId: assignment.id,
  storageIndex: item.storageIndex,
  pin: item.pin,
});

const correctResponse = (reproduced) => {
  const { question, instance } = reproduced;
  if (question.type === 'stepAlgebra') {
    return { kind: 'opaque', type: 'stepAlgebra', value: `${question.variable || 'x'}=${question.generatedAnswer}`, fields: [] };
  }
  const answer = instance.answer;
  const fields = question.answerFields || [];
  // An assignment-local family answers per field id.
  const values = answer.kind === 'fields'
    ? fields.map((field) => String(answer.value[field.id]))
    : answer.kind === 'set'
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

/** Practice to mastery, then Start: the student's pinned plan. */
const startRecovery = ({ assignment, tracker = ORIGINAL, section = 'dol', studentId = STUDENT }) => {
  let record = null;
  for (let step = 0; step < 24; step += 1) {
    const context = contextFor({ assignment, tracker, record, section, studentId });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    record = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: correctResponse(reproduce(assignment, item)) },
      at: NOW + step,
    }).record;
  }
  const context = contextFor({ assignment, tracker, record, section, studentId });
  assert.equal(context.eligibility.state, RECOVERY_STATE.UNLOCKED, `fixture: Recovery unlocks (${context.eligibility.reason})`);
  return runSectionRecoveryAction({ context, action: RECOVERY_ACTION.START, at: NOW + 1_000 }).record;
};

/** Responses the student saved while every question was still on screen. */
const responsesFor = (assignment, record, answer = correctResponse, only = null) => Object.fromEntries(
  record.plan.items
    .filter((item) => !only || only.includes(item.itemId))
    .map((item) => [item.itemId, answer(reproduce(assignment, item))]),
);

const submit = ({ assignment, record, responses, tracker = ORIGINAL, section = 'dol', unavailableItems = undefined, prepare = null }) => {
  const context = contextFor({ assignment, tracker, record, section });
  if (prepare) prepare(context);
  return runSectionRecoveryAction({
    context,
    action: RECOVERY_ACTION.SUBMIT,
    payload: { responses, ...(unavailableItems ? { unavailableItems } : {}) },
    at: NOW + 5_000,
  });
};

/** The teacher re-tunes one DOL question AFTER the plan was pinned. */
const retune = (assignment, storageIndex, questionFamily) => {
  const edited = structuredClone(assignment);
  edited.sections[0].questions[storageIndex] = { ...edited.sections[0].questions[storageIndex], questionFamily };
  return edited;
};

/** The canonical scenario: 3 items, two answered correctly, Q3's pin no longer reproduces. */
const scenario = ({ questions = Q3_SHARES_Q1_SKILL(), breakQ3 = null, answer = correctResponse } = {}) => {
  const assignment = buildAssignment(questions);
  const started = startRecovery({ assignment });
  const responses = { ...responsesFor(assignment, started, answer) };
  // The student could not answer Q3: it would not render once it broke.
  delete responses.r3;
  const broken = breakQ3 ? breakQ3(assignment) : retune(assignment, 2, { id: questions[2].questionFamily.id, constraints: questions[2].questionFamily.id === 'linear.twoStepEquation' ? { solutionRange: [30, 40] } : { interceptRange: [-6, 6] } });
  return { assignment, broken, started, responses };
};

const resultOf = (outcome, itemId) => outcome.record.results[itemId];

/* ===========================================================================
 * 1-3. Valid items behave exactly as before.
 * ======================================================================== */

test('1. a Recovery whose items all reproduce is graded exactly as before', () => {
  const assignment = buildAssignment(DISTINCT_SKILLS());
  const started = startRecovery({ assignment });
  const responses = {
    r1: correctResponse(reproduce(assignment, started.plan.items[0])),
    r2: wrongResponse(reproduce(assignment, started.plan.items[1])),
    r3: correctResponse(reproduce(assignment, started.plan.items[2])),
  };
  const outcome = submit({ assignment, record: started, responses });
  assert.equal(outcome.record.status, 'completed');
  assert.equal(outcome.record.rawScore, 70, '(4 + 3) / (4 + 3 + 3)');
  assert.equal(outcome.response.rawScore, 70);
  assert.equal(outcome.response.recordedScore, 70, 'max(30, min(70, 90))');
  assert.equal(outcome.response.held ?? false, false);
  ['r1', 'r2', 'r3'].forEach((itemId) => {
    const stored = resultOf(outcome, itemId);
    assert.equal(stored.weight, { r1: 4, r2: 3, r3: 3 }[itemId]);
    assert.equal(stored.credit, itemId === 'r2' ? 0 : 1);
  });
  // Nothing about the new policy shows up on an ordinary Recovery.
  assert.equal(outcome.record.hold ?? null, null);
  assert.deepEqual(outcome.record.evidence?.excludedItemIds ?? [], []);
});

test('2. a valid question answered wrong still counts wrong — with its full weight', () => {
  const assignment = buildAssignment(DISTINCT_SKILLS());
  const started = startRecovery({ assignment });
  const responses = responsesFor(assignment, started, wrongResponse);
  const outcome = submit({ assignment, record: started, responses });
  assert.equal(outcome.record.status, 'completed');
  assert.equal(outcome.record.rawScore, 0);
  Object.values(outcome.record.results).forEach((stored) => {
    assert.equal(stored.isCorrect, false);
    assert.equal(stored.credit, 0);
    assert.ok(stored.weight > 0);
    assert.notEqual(stored.status, 'platform-unavailable');
  });
  // A question the student left blank is the student's, too: it counts.
  const blank = submit({ assignment, record: started, responses: { r1: responses.r1 } });
  assert.equal(blank.record.status, 'completed');
  assert.equal(blank.record.rawScore, 0);
  assert.equal(resultOf(blank, 'r2').credit, 0, 'an unanswered valid question is worth zero, as it always was');
  assert.equal(resultOf(blank, 'r2').status, 'unanswered');
});

test('3. a valid question answered correctly still counts correct', () => {
  const assignment = buildAssignment(DISTINCT_SKILLS());
  const started = startRecovery({ assignment });
  const outcome = submit({ assignment, record: started, responses: responsesFor(assignment, started) });
  assert.equal(outcome.record.rawScore, 100);
  assert.equal(outcome.response.recordedScore, 90, 'the 90 cap, as before');
  Object.values(outcome.record.results).forEach((stored) => {
    assert.equal(stored.isCorrect, true);
    assert.equal(stored.credit, 1);
    assert.equal(stored.status, 'correct');
  });
});

/* ===========================================================================
 * 4-8. The P0: a platform failure is not a wrong answer.
 * ======================================================================== */

test('4. REPRO: a question whose pin no longer reproduces is not counted as incorrect', () => {
  const { broken, started, responses } = scenario();
  const outcome = submit({ assignment: broken, record: started, responses });
  const r3 = resultOf(outcome, 'r3');
  // Before the fix: { isCorrect: false, credit: 0, weight: 3, graded: false, reason: 'question-unavailable' }.
  assert.equal(r3.status, 'platform-unavailable');
  assert.notEqual(r3.isCorrect, false, 'never "incorrect"');
  assert.notEqual(r3.credit, 0, 'never zero points');
  assert.equal(r3.credit, null);
  assert.equal(r3.countsTowardScore, false);
  assert.equal(r3.classification, QUESTION_RESOLUTION_FAILURE.PIN_FINGERPRINT_MISMATCH, 'PR #430\'s classification, consumed');
  assert.equal(r3.weight, 3, 'the planned weight is kept for the audit');
});

test('5. the failed question\'s weight leaves the denominator when the remaining questions still cover its skill', () => {
  const { broken, started, responses } = scenario();
  const outcome = submit({ assignment: broken, record: started, responses });
  // Before the fix: 7 / 10 = 70, recorded 70.
  assert.equal(outcome.record.status, 'completed');
  assert.equal(outcome.record.rawScore, 100, '(4 + 3) / (4 + 3), not 70');
  assert.equal(outcome.response.recordedScore, 90, 'min(100, 90) beats the 30 original');
  assert.deepEqual(outcome.record.evidence.excludedItemIds, ['r3']);
  assert.equal(outcome.record.evidence.sufficient, true);
  assert.equal(outcome.record.evidence.plannedWeight, 10);
  assert.equal(outcome.record.evidence.gradedWeight, 7);
});

test('6. every question unavailable: no final grade, the Recovery is held — not recorded as 0% and not used up', () => {
  const assignment = buildAssignment(Q3_SHARES_Q1_SKILL());
  const started = startRecovery({ assignment });
  let broken = retune(assignment, 0, { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } });
  broken = retune(broken, 1, { id: 'functions.identifyZeros', constraints: { zeroRange: [7, 9] } });
  broken = retune(broken, 2, { id: 'linear.twoStepEquation', constraints: { solutionRange: [-40, -30] } });
  const outcome = submit({ assignment: broken, record: started, responses: {} });
  // Before the fix: status completed, rawScore 0, "Recovery 0% did not beat the original".
  assert.equal(outcome.record.status, 'held');
  assert.equal(outcome.record.rawScore, null);
  assert.equal(outcome.record.hold.reason, 'no-graded-items');
  assert.deepEqual(outcome.record.hold.itemIds, ['r1', 'r2', 'r3']);
  assert.equal(outcome.response.held, true);
  assert.equal(outcome.response.rawScore, null);
  assert.equal(outcome.response.recordedScore, null, 'nothing is recorded from a Recovery MathMaster could not grade');
  assert.equal(outcome.record.completedAt ?? null, null);
  assert.ok(outcome.record.submittedAt, 'the student submitted in time, and that is kept');
  const after = contextFor({ assignment: broken, record: outcome.record });
  assert.equal(after.eligibility.state, RECOVERY_STATE.HELD);
  assert.equal(after.eligibility.studentVisible, true);
  // Held is not completed: the projection does not replace the original.
  assert.deepEqual(Object.keys(projectionModule.completedSectionRecoveries({ dol: outcome.record })), []);
});

test('7. the only evidence for a required skill is unavailable: held, not finalized as a pass or a fail', () => {
  const { broken, started, responses } = scenario({ questions: DISTINCT_SKILLS() });
  const outcome = submit({ assignment: broken, record: started, responses });
  // Before the fix: 7 / 10 = 70, recorded 70, completed.
  assert.equal(outcome.record.status, 'held');
  assert.equal(outcome.record.rawScore, null);
  assert.equal(outcome.record.hold.reason, 'skill-without-evidence');
  assert.deepEqual(outcome.record.evidence.missingSkills, ['functions.identifyIntercepts']);
  assert.equal(outcome.record.evidence.sufficient, false);
  // The two questions MathMaster could grade keep their real results.
  assert.equal(resultOf(outcome, 'r1').isCorrect, true);
  assert.equal(resultOf(outcome, 'r2').isCorrect, true);
  assert.equal(resultOf(outcome, 'r3').status, 'platform-unavailable');
});

test('8. enough valid evidence: recalculated over exactly the questions that were graded', () => {
  // r1 wrong (4), r2 right (3), r3 unavailable (3, same skill as r1): 3 / 7.
  const assignment = buildAssignment(Q3_SHARES_Q1_SKILL());
  const started = startRecovery({ assignment });
  const responses = {
    r1: wrongResponse(reproduce(assignment, started.plan.items[0])),
    r2: correctResponse(reproduce(assignment, started.plan.items[1])),
  };
  const broken = retune(assignment, 2, { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } });
  const outcome = submit({ assignment: broken, record: started, responses });
  assert.equal(outcome.record.status, 'completed');
  assert.equal(outcome.record.rawScore, 43, 'round(3 / 7 * 100)');
  assert.equal(outcome.response.recordedScore, 43, 'max(30, 43)');
  assert.deepEqual(outcome.record.evidence.excludedItemIds, ['r3']);
});

test('the sufficient-evidence rule: a minority of the planned weight is not enough', async () => {
  // Three two-step questions, one heavy: losing the heavy one leaves 2 of 6.
  const assignment = buildAssignment([twoStep('d1', 1), twoStep('d2', 1), twoStep('d3', 4)]);
  const tracker = { 0: ORIGINAL[0], 1: ORIGINAL[0], 2: ORIGINAL[0] };
  const started = startRecovery({ assignment, tracker });
  const responses = responsesFor(assignment, started, correctResponse, ['r1', 'r2']);
  const broken = retune(assignment, 2, { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } });
  const outcome = submit({ assignment: broken, record: started, responses, tracker });
  assert.equal(outcome.record.status, 'held');
  assert.equal(outcome.record.hold.reason, 'too-little-evidence');
  const { evaluateRecoveryEvidence, MINIMUM_GRADED_WEIGHT_SHARE } = await evidenceModule();
  assert.equal(MINIMUM_GRADED_WEIGHT_SHARE, 0.5);
  assert.equal(typeof evaluateRecoveryEvidence, 'function');
});

test('the sufficient-evidence rule: a Warm-Up Recovery never finalizes on fewer than the two questions it may ask', () => {
  const assignment = buildAssignment([twoStep('d1', 1)], {
    gradingPolicy: { recovery: { warmup: { questionCount: 2 } } },
    sections: [
      { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [{ ...twoStep('w1', 1), activityRole: 'warmup' }] },
      { id: 'dol', role: 'dol', title: 'DOL', questions: [twoStep('d1', 1)] },
    ],
  });
  const tracker = { 0: ORIGINAL[0], 1: ORIGINAL[0] };
  const started = startRecovery({ assignment, tracker, section: 'warmup' });
  assert.equal(started.plan.items.length, 2);
  // One of the two pinned items names an instance the family no longer produces.
  const damaged = structuredClone(started);
  damaged.plan.items[1].pin = { ...damaged.plan.items[1].pin, fingerprint: 'linear.twoStepEquation:1|1|1' };
  const outcome = submit({ assignment, record: damaged, responses: responsesFor(assignment, started, correctResponse, ['r1']), tracker, section: 'warmup' });
  assert.equal(outcome.record.status, 'held', 'half the weight and the same skill, but one question is not a Warm-Up Recovery');
  assert.equal(outcome.record.hold.reason, 'too-few-questions');
});

/* ===========================================================================
 * 9-12. Nothing historical moves.
 * ======================================================================== */

test('9. a failed question spends no attempt', () => {
  const { broken, started, responses } = scenario();
  const tracker = structuredClone(ORIGINAL);
  const outcome = submit({ assignment: broken, record: started, responses, tracker });
  assert.equal(resultOf(outcome, 'r3').attempted, false, 'no attempt is recorded against a question MathMaster could not grade');
  assert.equal(outcome.record.opportunitiesUsed, started.opportunitiesUsed, 'submitting does not use another Recovery opportunity');
  assert.deepEqual(outcome.record.practice, started.practice, 'Practice evidence is untouched');
  assert.deepEqual(tracker, ORIGINAL, 'the original question records are untouched');
});

test('10. the historical attempt count stays intact across a hold', () => {
  const { broken, started, responses } = scenario({ questions: DISTINCT_SKILLS() });
  const before = JSON.stringify(ORIGINAL);
  const outcome = submit({ assignment: broken, record: started, responses });
  assert.equal(outcome.record.status, 'held');
  assert.equal(JSON.stringify(ORIGINAL), before);
  assert.equal(outcome.record.opportunitiesUsed, 1);
  const events = outcome.record.history.map((row) => row.event);
  ['unlocked', 'started', 'held'].forEach((event) => assert.ok(events.includes(event), `history keeps "${event}"`));
  assert.equal(events.filter((event) => event === 'practice').length, started.history.filter((row) => row.event === 'practice').length);
});

test('11. the historical pins stay byte-identical — including a damaged one', () => {
  const { broken, started, responses } = scenario();
  const planBefore = JSON.stringify(started.plan);
  const outcome = submit({ assignment: broken, record: started, responses });
  assert.equal(JSON.stringify(outcome.record.plan), planBefore);

  // A truncated pin in the stored plan is kept exactly as stored, never
  // "normalized" to null and written back.
  const assignment = buildAssignment(Q3_SHARES_Q1_SKILL());
  const fresh = startRecovery({ assignment });
  const damaged = structuredClone(fresh);
  damaged.plan.items[2].pin = { familyId: 'linear.twoStepEquation', fingerprint: fresh.plan.items[2].pin.fingerprint };
  const rawPin = JSON.stringify(damaged.plan.items[2].pin);
  const held = submit({ assignment, record: damaged, responses: responsesFor(assignment, fresh, correctResponse, ['r1', 'r2']) });
  assert.equal(JSON.stringify(held.record.plan.items[2].pin), rawPin);
  assert.equal(JSON.stringify(recordModule.normalizeRecoveryRecord(held.record, 'dol').plan.items[2].pin), rawPin);
});

test('12. no substitute question is silently allocated', () => {
  const { broken, started, responses } = scenario({ questions: DISTINCT_SKILLS() });
  const outcome = submit({ assignment: broken, record: started, responses });
  assert.deepEqual(outcome.record.plan.items.map((item) => item.itemId), ['r1', 'r2', 'r3']);
  assert.deepEqual(
    outcome.record.plan.items.map((item) => item.pin.fingerprint),
    started.plan.items.map((item) => item.pin.fingerprint),
  );
  assert.equal(JSON.stringify(outcome.response).includes('"pin"'), false, 'the response hands the browser no new question');
  assert.equal(Object.keys(outcome.record.results).length, 3, 'one result per pinned question, no extra item');
});

/* ===========================================================================
 * 13-16. Every failure kind PR #430 classifies.
 * ======================================================================== */

const classifiedSubmit = ({ questions = Q3_SHARES_Q1_SKILL(), mutate }) => {
  const assignment = buildAssignment(questions);
  const started = startRecovery({ assignment });
  const responses = responsesFor(assignment, started, correctResponse, ['r1', 'r2']);
  const { assignment: brokenAssignment = assignment, record = started, prepare = null } = mutate({ assignment, started });
  return { assignment, started, outcome: submit({ assignment: brokenAssignment, record, responses, prepare }) };
};

test('13. an unknown family version is a platform failure, classified as PR #430 classifies it', () => {
  const { outcome } = classifiedSubmit({
    mutate: ({ assignment }) => ({ assignment: retune(assignment, 2, { id: 'linear.twoStepEquation', version: 9 }) }),
  });
  const r3 = resultOf(outcome, 'r3');
  assert.equal(r3.status, 'platform-unavailable');
  assert.ok([QUESTION_RESOLUTION_FAILURE.PIN_FAMILY_VERSION_UNKNOWN, QUESTION_RESOLUTION_FAILURE.CLIENT_BUILD_BEHIND].includes(r3.classification), r3.classification);
  assert.equal(outcome.record.rawScore, 100);
  // A pin naming a version the slot does not have.
  const pinned = classifiedSubmit({
    mutate: ({ started }) => {
      const record = structuredClone(started);
      record.plan.items[2].pin = { ...record.plan.items[2].pin, familyVersion: 9 };
      return { record };
    },
  });
  assert.equal(resultOf(pinned.outcome, 'r3').status, 'platform-unavailable');
});

test('14. a malformed pin is a platform failure (pin-malformed), never a zero', () => {
  const { outcome } = classifiedSubmit({
    mutate: ({ started }) => {
      const record = structuredClone(started);
      record.plan.items[2].pin = { familyId: 'linear.twoStepEquation' };
      return { record };
    },
  });
  const r3 = resultOf(outcome, 'r3');
  assert.equal(r3.status, 'platform-unavailable');
  assert.equal(r3.classification, QUESTION_RESOLUTION_FAILURE.PIN_MALFORMED);
  assert.equal(outcome.record.rawScore, 100);
});

test('15. a family that can no longer satisfy its constraints is a platform failure (family-unsatisfiable)', () => {
  const { outcome } = classifiedSubmit({
    questions: [twoStep('d1', 4), zeros('d2', 3), AREA('d3', 3)],
    mutate: ({ assignment }) => {
      const edited = structuredClone(assignment);
      const area = edited.sections[0].questions[2];
      area.generator = { ...area.generator, constraints: ['w!=l', 'w>100'] };
      return { assignment: edited };
    },
  });
  const r3 = resultOf(outcome, 'r3');
  assert.equal(r3.status, 'platform-unavailable');
  assert.equal(r3.classification, QUESTION_RESOLUTION_FAILURE.FAMILY_UNSATISFIABLE);
  // Its own skill (an assignment-local family) has no other evidence: held.
  assert.equal(outcome.record.status, 'held');
  assert.equal(outcome.record.hold.reason, 'skill-without-evidence');
});

test('16. a generation failure — the template generator throws, or preparing the question throws — is contained to that question', () => {
  // A template whose generator throws while it builds instances.
  const template = classifiedSubmit({
    questions: [twoStep('d1', 4), zeros('d2', 3), AREA('d3', 3)],
    mutate: ({ assignment }) => {
      const edited = structuredClone(assignment);
      const area = edited.sections[0].questions[2];
      area.generator = { ...area.generator, parameters: { w: null, l: { type: 'int', min: 4, max: 15 } } };
      return { assignment: edited };
    },
  });
  assert.equal(resultOf(template.outcome, 'r3').status, 'platform-unavailable');
  assert.equal(resultOf(template.outcome, 'r3').classification, QUESTION_RESOLUTION_FAILURE.FAMILY_UNSATISFIABLE);

  // Anything that throws while the server prepares the question. Before the
  // fix this escaped SUBMIT entirely: the callable answered "internal" and the
  // student could never submit.
  let outcome;
  assert.doesNotThrow(() => {
    outcome = classifiedSubmit({
      mutate: () => ({
        prepare: (context) => {
          const question = { ...context.questionsByIndex[2] };
          Object.defineProperty(question, 'questionFamily', { enumerable: true, get: () => { throw new TypeError('unexpected failure while preparing'); } });
          context.questionsByIndex[2] = question;
        },
      }),
    }).outcome;
  });
  assert.equal(resultOf(outcome, 'r3').status, 'platform-unavailable');
  assert.equal(resultOf(outcome, 'r3').classification, QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION);
  assert.equal(outcome.record.rawScore, 100);
});

test('the server classification agrees with PR #430\'s client classifier for every pin failure it can see', async () => {
  const { classifyRecoveryReproductionFailure } = await evidenceModule();
  assert.equal(typeof classifyRecoveryReproductionFailure, 'function');
  const assignment = buildAssignment(Q3_SHARES_Q1_SKILL());
  const started = startRecovery({ assignment });
  const item = started.plan.items[2];
  const base = getStoredAssignmentQuestions(assignment)[2];
  const cases = [
    { question: base, pin: { ...item.pin, fingerprint: 'linear.twoStepEquation:1|1|1' } },
    { question: { ...base, questionFamily: { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } } }, pin: item.pin },
    { question: { ...base, questionFamily: { id: 'linear.twoStepEquation', version: 9 } }, pin: item.pin },
    { question: base, pin: { ...item.pin, familyVersion: 9 } },
    { question: { ...base, questionFamily: { id: 'linear.oneStepEquation' } }, pin: item.pin },
    { question: { ...base, questionFamily: { id: 'linear.noSuchFamily' } }, pin: item.pin },
    { question: base, pin: { familyId: 'linear.twoStepEquation' } },
  ];
  for (const { question, pin } of cases) {
    const reproduced = reproduceFamilyQuestionFromPin({ question, assignmentId: assignment.id, storageIndex: 2, pin });
    assert.ok(reproduced.error, 'fixture: the pin does not reproduce');
    const client = classifyFamilyFailure({ question, pin, error: reproduced.error, issues: reproduced.issues });
    const server = classifyRecoveryReproductionFailure({ question, pin, error: reproduced.error, issues: reproduced.issues });
    assert.equal(server, client, `server and client agree for ${reproduced.error}`);
  }
});

/* ===========================================================================
 * Unverifiable failures are held, never excluded on the browser's word.
 * ======================================================================== */

test('a question the student\'s device could not show but the server can rebuild is held for review — not zero, not excluded', () => {
  const assignment = buildAssignment(Q3_SHARES_Q1_SKILL());
  const started = startRecovery({ assignment });
  const responses = responsesFor(assignment, started, correctResponse, ['r1', 'r2']);
  const outcome = submit({ assignment, record: started, responses, unavailableItems: { r3: { classification: QUESTION_RESOLUTION_FAILURE.RESOLUTION_EXCEPTION } } });
  assert.equal(outcome.record.status, 'held', 'the server cannot verify the claim, so it cannot simply drop the question');
  assert.equal(outcome.record.hold.reason, 'needs-review');
  assert.equal(resultOf(outcome, 'r3').status, 'needs-review');
  assert.equal(resultOf(outcome, 'r3').classification, 'reported-unavailable');
  assert.equal(resultOf(outcome, 'r3').credit, null);
  // A claim about a question the student DID answer is ignored: it is graded.
  const answered = submit({ assignment, record: started, responses: responsesFor(assignment, started), unavailableItems: { r3: { classification: 'pin-malformed' } } });
  assert.equal(answered.record.status, 'completed');
  assert.equal(answered.record.rawScore, 100);
  // A claim the server confirms is an ordinary platform failure.
  const broken = retune(assignment, 2, { id: 'linear.twoStepEquation', constraints: { solutionRange: [30, 40] } });
  const confirmed = submit({ assignment: broken, record: started, responses, unavailableItems: { r3: { classification: 'pin-fingerprint-mismatch' } } });
  assert.equal(resultOf(confirmed, 'r3').status, 'platform-unavailable');
  assert.equal(confirmed.record.status, 'completed');
});

test('an answer MathMaster cannot read is held for review — never marked wrong and never excused', () => {
  const assignment = buildAssignment(Q3_SHARES_Q1_SKILL());
  const started = startRecovery({ assignment });
  const responses = {
    ...responsesFor(assignment, started, correctResponse, ['r1', 'r2']),
    // A shape the Step Algebra grader refuses rather than misreads.
    r3: { kind: 'opaque', type: 'stepAlgebra', value: '%%%' },
  };
  const outcome = submit({ assignment, record: started, responses });
  assert.equal(outcome.record.status, 'held');
  assert.equal(outcome.record.hold.reason, 'needs-review');
  assert.equal(resultOf(outcome, 'r3').status, 'needs-review');
  assert.equal(resultOf(outcome, 'r3').classification, 'response-unreadable');
  assert.equal(resultOf(outcome, 'r3').credit, null);
  assert.ok(outcome.record.hold.responses?.r3, 'the student\'s saved answer is kept for the teacher');
});

/* ===========================================================================
 * 17. Another student's pin.
 * ======================================================================== */

test('17. another student\'s Recovery Practice pin is refused', () => {
  const assignment = buildAssignment(Q3_SHARES_Q1_SKILL());
  const mine = contextFor({ assignment, studentId: STUDENT });
  const theirs = contextFor({ assignment, studentId: CLASSMATE });
  const theirItem = nextRecoveryPracticeItem(theirs);
  const myItem = nextRecoveryPracticeItem(mine);
  assert.notEqual(theirItem.pin.seat, myItem.pin.seat, 'fixture: different seats');
  // Before the fix this was accepted, graded and counted toward MY mastery.
  assert.throws(
    () => runSectionRecoveryAction({
      context: mine,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: theirItem.pin, practiceIndex: theirItem.practiceIndex, response: correctResponse(reproduce(assignment, theirItem)) },
      at: NOW,
    }),
    (error) => error.code === 'practice-pin-invalid',
  );
  // My own still works.
  const own = runSectionRecoveryAction({ context: mine, action: RECOVERY_ACTION.PRACTICE, payload: { pin: myItem.pin, practiceIndex: myItem.practiceIndex, response: correctResponse(reproduce(assignment, myItem)) }, at: NOW });
  assert.equal(own.response.isCorrect, true);
});

/* ===========================================================================
 * 18-21. A held Recovery does not escape.
 * ======================================================================== */

const heldFixture = () => {
  const { broken, started, responses } = scenario({ questions: DISTINCT_SKILLS() });
  const outcome = submit({ assignment: broken, record: started, responses });
  assert.equal(outcome.record.status, 'held', 'fixture: held');
  const student = {
    id: STUDENT,
    classId: CLASS,
    sisStudentId: '100007',
    gradesByAssignment: { [broken.id]: ORIGINAL },
    sectionRecoveryByAssignment: { [broken.id]: { dol: outcome.record } },
    teacherGradeOverridesByAssignment: {},
  };
  return { assignment: broken, record: outcome.record, student };
};

test('18. a held Recovery replaces no grade: the original stands on every grade surface', () => {
  const { assignment, record, student } = heldFixture();
  const projected = projectSectionRecoveryForAssignment({ tracker: ORIGINAL, assignment, recoveryByAssignment: { [assignment.id]: { dol: record } } });
  assert.equal(projected.tracker, ORIGINAL, 'the very same tracker: nothing was replaced');
  assert.deepEqual(projected.states, {});
  assert.equal(canonicalModule.canonicalPresentedSectionGrade({ student, assignment, sectionKey: 'dol' }), 30);
  assert.equal(typeof projectionModule.heldSectionRecoveries, 'function');
  assert.deepEqual(Object.keys(projectionModule.heldSectionRecoveries({ dol: record })), ['dol']);
});

test('19. a held Recovery holds Classroom passback — and waking on it is what records the hold', async () => {
  const { assignment, record } = heldFixture();
  assert.equal(typeof recoveryLib.recoveryPassbackHold, 'function');
  const entry = { dol: record };
  assert.deepEqual(recoveryLib.recoveryPassbackHold({ recoveryForAssignment: entry, sectionKey: 'whole' }), { held: true, sections: ['dol'] });
  assert.deepEqual(recoveryLib.recoveryPassbackHold({ recoveryForAssignment: entry, sectionKey: 'dol' }), { held: true, sections: ['dol'] });
  assert.deepEqual(recoveryLib.recoveryPassbackHold({ recoveryForAssignment: entry, sectionKey: 'classwork' }), { held: false, sections: [] });
  // An assignment-level teacher override replaces the whole grade, so the
  // whole-assignment column no longer waits on the Recovery.
  assert.equal(recoveryLib.recoveryPassbackHold({ recoveryForAssignment: entry, sectionKey: 'whole', assignmentGradeOverride: { active: true, score: 55 } }).held, false);
  // The transition to held wakes the triggers so they can record it.
  const inProgress = { ...record, status: 'inProgress', results: {}, hold: null };
  assert.deepEqual(recoveryLib.recoveryChangedAssignmentIds({ sectionRecoveryByAssignment: { [assignment.id]: entry } }, { sectionRecoveryByAssignment: { [assignment.id]: { dol: inProgress } } }), [assignment.id]);
  // The server projection never applies a held Recovery either.
  const questions = getStoredAssignmentQuestions(assignment);
  const server = await recoveryLib.projectRecoveredGradeInputs({ assignment, tracker: ORIGINAL, questions, overrides: {}, recoveryForAssignment: entry, gradeProgress: assignmentGradeProgress });
  assert.equal(server.tracker, ORIGINAL);

  // Both triggers ask before any Classroom write, record the hold, and skip.
  const index = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const sync = region(index, 'exports.syncGradeToClassroom = onDocumentWritten', 'exports.queueReleasedAssessmentGrades', 'whole-assignment passback');
  const holdAt = sync.search(/recoveryPassbackHold\(\{/);
  assert.ok(holdAt > 0, 'the whole-assignment trigger asks whether a Recovery is held');
  const holdBlock = sync.slice(holdAt);
  // The answer gates the branch that records the hold and skips the write.
  assert.match(holdBlock, /^recoveryPassbackHold\(\{[^;]*\}\);\s*if \(recoveryHold\.held\) \{[\s\S]*?status: "recovery-held"[\s\S]*?isFinal: false[\s\S]*?studentVisible: false[\s\S]*?returnedToStudent: false[\s\S]*?\n\s*continue;/);
  assert.ok(holdAt < sync.indexOf('classroomLib().getClassroomClient'), 'decided before any Classroom client is created');
  const section = executableSource(readFileSync(new URL('../../functions/classroomSectionEntry.js', import.meta.url), 'utf8'));
  const sectionSync = region(section, 'const syncSectionGradeToClassroom = onDocumentWritten(', '\n);\n', 'section passback');
  const sectionHoldAt = sectionSync.search(/recoveryPassbackHold\(\{/);
  assert.ok(sectionHoldAt > 0, 'the section trigger asks too');
  assert.match(sectionSync.slice(sectionHoldAt), /^recoveryPassbackHold\(\{[^;]*\}\);\s*if \(recoveryHold\.held\) \{[\s\S]*?status: "recovery-held"[\s\S]*?\n\s*continue;/);
  assert.ok(sectionHoldAt < sectionSync.indexOf('getClassroomClient'), 'decided before any Classroom client is created');
});

test('20. a held Recovery holds Grade Transfer: no TEAMS row, a named problem the teacher can act on', () => {
  const { assignment, student } = heldFixture();
  const closed = { ...assignment, lateDueAt: '2026-09-20T23:00:00Z', dueAt: '2026-09-20T20:00:00Z' };
  const classRecord = { classId: CLASS, period: '1', name: 'Period 1', teacherOfRecord: 'teacher@desotoisd.org' };
  const unit = buildTransferUnit({
    classRecord,
    assignment: closed,
    students: [student],
    now: NOW,
    projectCanonicalGrade: canonicalModule.canonicalPresentedAssignmentGrade,
    recoveryHeldFor: ({ student: row }) => Boolean(canonicalModule.recoveryHoldFor?.({ student: row, assignment: closed })),
  });
  assert.equal(unit.rows.length, 0, 'no grade leaves while the Recovery is held');
  assert.deepEqual(unit.problems.map((row) => row.reason), ['Recovery held for teacher review']);
  assert.equal(unit.state, TRANSFER_STATE.REVIEW_REQUIRED);
  // Wired through the shared projection, per section.
  const projection = projectGradeTransferUnits({
    classes: [classRecord],
    assignments: [{ ...closed, assignedClassIds: [CLASS], sections: [...closed.sections, { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [twoStep('c1', 1)] }] }],
    students: [{ ...student, classPeriod: '1', status: 'active' }],
    teacherEmail: 'teacher@desotoisd.org',
    now: NOW,
  });
  const sections = projection.units[0]?.sectionUnits || [];
  const dolUnit = sections.find((unitEntry) => unitEntry.sectionKey === 'dol');
  assert.ok(dolUnit, 'a DOL section unit exists');
  assert.equal(dolUnit.allRows.length, 0);
  assert.ok(dolUnit.problems.some((row) => row.reason === 'Recovery held for teacher review'));
});

test('21. teacher overrides still win and are audited: an assignment override replaces the grade; a resolution releases the hold', async () => {
  const { assignment, record, student } = heldFixture();
  const overridden = { ...student, teacherGradeOverridesByAssignment: { [assignment.id]: { __assignment: { active: true, score: 55 } } } };
  assert.equal(canonicalModule.canonicalPresentedAssignmentGrade({ student: overridden, assignment }), 55);
  assert.equal(typeof canonicalModule.recoveryHoldFor, 'function');
  assert.deepEqual(canonicalModule.recoveryHoldFor({ student, assignment }), { sections: ['dol'] });
  assert.equal(canonicalModule.recoveryHoldFor({ student: overridden, assignment }), null, 'the override decided the grade');

  const { applyHeldRecoveryResolution, HELD_RECOVERY_ACTION } = await resolutionModule();
  assert.equal(typeof applyHeldRecoveryResolution, 'function');
  const actor = { uid: 'uid-teacher', email: 'teacher@desotoisd.org', name: 'Ms. Teacher' };
  const finalized = applyHeldRecoveryResolution({
    record,
    section: 'dol',
    action: HELD_RECOVERY_ACTION.FINALIZE_GRADED,
    actor,
    note: 'Two of three questions are enough here.',
    originalScore: 30,
    at: NOW + 60_000,
  });
  assert.equal(finalized.record.status, 'completed');
  assert.equal(finalized.record.rawScore, 100, 'scored over the two questions MathMaster could grade');
  assert.equal(finalized.record.hold.resolution.action, HELD_RECOVERY_ACTION.FINALIZE_GRADED);
  assert.equal(finalized.record.hold.resolution.actor.email, actor.email);
  const audit = finalized.record.history.at(-1);
  assert.equal(audit.event, 'teacherOverride');
  assert.match(audit.detail, /teacher@desotoisd\.org/);
  assert.equal(JSON.stringify(finalized.record.plan), JSON.stringify(record.plan), 'resolving moves no pin');
  assert.equal(JSON.stringify(finalized.record.results.r3), JSON.stringify(record.results.r3), 'resolving rewrites no result');

  const kept = applyHeldRecoveryResolution({ record, section: 'dol', action: HELD_RECOVERY_ACTION.KEEP_ORIGINAL, actor, originalScore: 30, at: NOW + 60_000 });
  assert.equal(kept.record.status, 'completed');
  assert.equal(kept.record.rawScore, null, 'no Recovery score is invented');
  const keptState = projectSectionRecoveryForAssignment({ tracker: ORIGINAL, assignment, recoveryByAssignment: { [assignment.id]: { dol: kept.record } } });
  assert.equal(keptState.tracker, ORIGINAL, 'the original stands');

  // The callable that applies it is a teacher-of-record action with an audit row.
  const index = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const callable = region(index, 'exports.resolveHeldSectionRecovery = onCall(', '\n});', 'resolve held Recovery');
  assert.match(callable, /requireTeacher\(request\)/);
  assert.match(callable, /teacherOfRecord/);
  assert.match(callable, /gradeOverrideAudits/);
  assert.match(callable, /applyHeldRecoveryResolution\(/);
  assert.match(callable, /runTransaction\(/);
});

/* ===========================================================================
 * 22-23. What students and teachers read.
 * ======================================================================== */

const FORBIDDEN_STUDENT_WORDS = [/\bincorrect\b/i, /\b0 points\b/i, /\btry again\b/i, /\bwrong\b/i, /fingerprint/i, /\bpin\b/i, /pin-/i, /stack/i, /classification/i];

test('22. the student never sees a platform failure called incorrect — held and partially graded Recoveries say what happened', () => {
  const { assignment, record } = heldFixture();
  const [held] = buildStudentRecoverySummary({
    assignment, tracker: ORIGINAL, recoveryForAssignment: { dol: record }, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW,
  }).filter((entry) => entry.section === 'dol');
  assert.equal(held.state, 'held');
  assert.equal(held.message, 'Your completed Recovery work has been saved. MathMaster could not grade one or more required questions, so your Recovery is being held for review.');
  assert.equal(held.result, null, 'no score is shown for a held Recovery');
  const copy = JSON.stringify({ badge: held.badge, message: held.message, note: held.note });
  FORBIDDEN_STUDENT_WORDS.forEach((pattern) => assert.doesNotMatch(copy, pattern));

  // Finalized with a question left out: the result says it did not count.
  const { broken, started, responses } = scenario();
  const outcome = submit({ assignment: broken, record: started, responses });
  const [done] = buildStudentRecoverySummary({
    assignment: broken, tracker: ORIGINAL, recoveryForAssignment: { dol: outcome.record }, studentId: STUDENT, classId: CLASS, classPeriod: '1', nowValue: NOW,
  }).filter((entry) => entry.section === 'dol');
  assert.equal(done.state, 'completed');
  assert.deepEqual(done.result, { original: '30%', recovery: '100%', final: '90%' });
  assert.equal(done.note, 'MathMaster could not grade 1 Recovery question. It did not count against your score.');
  FORBIDDEN_STUDENT_WORDS.forEach((pattern) => assert.doesNotMatch(JSON.stringify({ badge: done.badge, message: done.message, note: done.note }), pattern));

  // The runner: a question that could not be shown is never "will count as
  // incorrect", and says the required words instead.
  const runner = executableSource(readFileSync(new URL('../../src/components/student/SectionRecoveryRunner.jsx', import.meta.url), 'utf8'));
  assert.match(runner, /MathMaster could not grade this Recovery question\. It will not count against your score\./);
  const submitAll = region(runner, 'const submitAll = async () => {', '\n  };', 'submit handler');
  assert.match(submitAll, /unavailableItems/, 'the questions the device could not show travel with the submission');
  assert.match(submitAll, /unanswered = items\.filter\([\s\S]*?!unavailable\[/, 'unavailable questions are not counted as unanswered');
  const heldView = region(runner, "entry.state === 'held'", 'return (', 'held view');
  assert.ok(heldView.length > 0);

  // Inside a Recovery, PR #430's question-level panel keeps its plain words
  // but loses its "Technical details" fold and its copyable report: no
  // classification code and no pin reference on the student's screen (the
  // teacher reads the server's classification). The real screens are read by
  // tests/browser/teacherWorkflow/recoveryHoldJourneys.mjs; this pins the
  // wiring on every path a Recovery question can fail by.
  const pinned = region(runner, 'function PinnedQuestion(', 'function PracticeRunner(', 'pinned question');
  assert.match(pinned, /<QuestionEngine\b[^]*?resolutionTechnicalDetails=\{false\}/, 'a classified or thrown failure in the engine');
  assert.match(pinned, /<QuestionResolutionFailure\b[^]*?technicalDetails=\{false\}/, 'an unreadable plan pin');
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  assert.match(region(engine, 'export default function QuestionEngine(', '\n}\n', 'engine wrapper'), /technicalDetails=\{props\.resolutionTechnicalDetails !== false\}/, 'the boundary around preparation obeys it');
  assert.match(region(engine, 'const resolutionFailurePanel =', ') : null;', 'classified failure panel'), /technicalDetails=\{resolutionTechnicalDetails !== false\}/, 'the classified failure panel obeys it');
  const boundary = executableSource(readFileSync(new URL('../../src/QuestionResolutionBoundary.jsx', import.meta.url), 'utf8'));
  const failurePanel = region(boundary, 'export function QuestionResolutionFailure(', 'export default class QuestionResolutionBoundary', 'failure panel');
  assert.match(failurePanel, /technicalMessage=\{technicalDetails \|\| teacherView \? technicalMessage : ''\}/, 'no technical fold for the student');
  assert.match(failurePanel, /offerReport=\{technicalDetails \|\| teacherView\}/, 'no copyable report for the student');
  assert.match(region(boundary, 'render() {', '\n  }\n', 'boundary render'), /technicalDetails=\{this\.props\.technicalDetails !== false\}/);
});

test('23. the teacher sees what failed, why, whether the Recovery is held, and what to do next — and nothing secret', () => {
  const { assignment, record, student } = heldFixture();
  const [row] = teacherAuditModule.buildTeacherRecoveryAudit({ student, assignment, nowValue: NOW });
  assert.equal(row.status, 'held');
  assert.match(row.statusLabel, /Held for review/);
  assert.equal(row.recovery, '—');
  assert.equal(row.final, '30%', 'the original stands while held');
  const r3 = row.items.find((item) => item.itemId === 'r3');
  assert.equal(r3.questionLabel, 'DOL Q3');
  assert.equal(r3.classification, 'pin-fingerprint-mismatch');
  assert.match(r3.classificationLabel, /changed after this Recovery started/i);
  assert.equal(r3.countsTowardScore, false);
  assert.match(row.evidenceSummary, /2 of 3 questions/);
  assert.match(row.evidenceSummary, /Intercepts of a line in standard form/);
  assert.match(row.recommendedAction, /replacement question/i);
  assert.deepEqual([...row.actions].sort(), ['finalizeGraded', 'issueReplacement', 'keepOriginal']);
  assert.equal(row.held, true);
  assert.deepEqual([...(teacherAuditModule.heldRecoverySections?.(student, assignment.id) || [])], ['dol']);
  const text = JSON.stringify(row);
  [record.plan.items[2].pin.fingerprint, 'generatedAnswer', 'answerKey', '"pin"', 'seat', STUDENT].forEach((secret) => {
    assert.equal(text.includes(secret), false, `the audit row must not carry ${secret}`);
  });
});

test('the student Grade Center reads a held Recovery as Pending Grade — never a final number', () => {
  const { assignment, record } = heldFixture();
  const center = buildStudentGradeCenter({
    assignments: [assignment],
    classId: CLASS,
    classPeriod: '1',
    studentId: STUDENT,
    nowValue: NOW,
    tracker: { [assignment.id]: ORIGINAL },
    sectionRecoveryByAssignment: { [assignment.id]: { dol: record } },
  });
  const entry = findGradeCenterEntry(center, assignment.id);
  assert.equal(entry.status, 'pendingGrade');
  assert.equal(entry.displayGrade, null);
  assert.equal(entry.countsTowardPeriodGrade, false);
  assert.equal(entry.exclusionReason, 'recoveryHeld');
  assert.match(entry.exclusionText, /Recovery/);
  assert.equal(entry.recoveryHeld, true);
});

/* ===========================================================================
 * Teacher repair: a NEW question, never a rewritten one.
 * ======================================================================== */

test('a teacher-issued replacement is a new question with a new identity; the old pin, result and answers stay exactly as they were', async () => {
  const { buildRecoveryReplacementItems } = await import('../../functions/shared/sectionRecoveryPlan.mjs');
  const { applyHeldRecoveryResolution, HELD_RECOVERY_ACTION } = await resolutionModule();
  assert.equal(typeof buildRecoveryReplacementItems, 'function');
  const { assignment, record } = heldFixture();
  const context = contextFor({ assignment, record });
  const built = buildRecoveryReplacementItems({
    assignmentId: assignment.id,
    section: 'dol',
    record,
    itemIds: ['r3'],
    questionsByIndex: context.questionsByIndex,
    seatInfo: context.seatInfo,
    seenFingerprints: context.seenFingerprints,
  });
  assert.equal(built.error ?? null, null);
  const [replacement] = built.items;
  assert.equal(replacement.replaces, 'r3');
  assert.notEqual(replacement.itemId, 'r3');
  assert.notEqual(replacement.pin.fingerprint, record.plan.items[2].pin.fingerprint);
  assert.notEqual(replacement.pin.slot, record.plan.items[2].pin.slot, 'its own slot: a new identity, not a re-roll of the old one');
  assert.ok(!context.seenFingerprints.includes(replacement.pin.fingerprint), 'never a question the student has seen');
  assert.ok(!reproduceFamilyQuestionFromPin({ question: context.questionsByIndex[replacement.storageIndex], assignmentId: assignment.id, storageIndex: replacement.storageIndex, pin: replacement.pin }).error);

  const repaired = applyHeldRecoveryResolution({
    record, section: 'dol', action: HELD_RECOVERY_ACTION.ISSUE_REPLACEMENT, actor: { email: 'teacher@desotoisd.org' },
    replacements: built.items, originalScore: 30, at: NOW + 60_000,
  });
  assert.equal(repaired.record.status, 'inProgress');
  const oldItem = repaired.record.plan.items.find((item) => item.itemId === 'r3');
  assert.equal(JSON.stringify(oldItem.pin), JSON.stringify(record.plan.items[2].pin), 'the historical pin is byte-identical');
  assert.equal(oldItem.supersededBy, replacement.itemId);
  assert.equal(JSON.stringify(repaired.record.results), JSON.stringify(record.results), 'no earlier result is rewritten');
  assert.match(repaired.record.history.at(-1).detail, /replacement/i);

  // The student answers only the new question; r1 and r2 are not asked again.
  const fresh = reproduceFamilyQuestionFromPin({ question: context.questionsByIndex[replacement.storageIndex], assignmentId: assignment.id, storageIndex: replacement.storageIndex, pin: replacement.pin });
  const resubmitted = submit({ assignment, record: repaired.record, responses: { [replacement.itemId]: correctResponse(fresh) } });
  assert.equal(resubmitted.record.status, 'completed');
  assert.equal(resubmitted.record.rawScore, 100);
  assert.equal(JSON.stringify(resubmitted.record.results.r1), JSON.stringify(record.results.r1), 'r1 keeps its original result');
  assert.equal(resubmitted.record.results.r3.status, 'platform-unavailable', 'r3 stays what it was');
  assert.equal(JSON.stringify(resubmitted.record.results.r3), JSON.stringify(record.results.r3), 'r3 is history: its result is never rewritten');
  assert.equal(resubmitted.record.plan.items.find((item) => item.itemId === 'r3').supersededBy, replacement.itemId);
  assert.equal(resubmitted.record.results[replacement.itemId].isCorrect, true);
  assert.equal(resubmitted.record.evidence.plannedCount, 3, 'r1, r2 and the replacement — the replaced r3 is outside the score');
});

test('a replacement cannot be issued from a question that still cannot produce one — the teacher is told to fix the question first', async () => {
  const { buildRecoveryReplacementItems } = await import('../../functions/shared/sectionRecoveryPlan.mjs');
  assert.equal(typeof buildRecoveryReplacementItems, 'function');
  const assignment = buildAssignment([twoStep('d1', 4), zeros('d2', 3), AREA('d3', 3)]);
  const started = startRecovery({ assignment });
  const edited = structuredClone(assignment);
  edited.sections[0].questions[2].generator = { ...edited.sections[0].questions[2].generator, constraints: ['w!=l', 'w>100'] };
  const held = submit({ assignment: edited, record: started, responses: responsesFor(assignment, started, correctResponse, ['r1', 'r2']) });
  assert.equal(held.record.status, 'held');
  const context = contextFor({ assignment: edited, record: held.record });
  const built = buildRecoveryReplacementItems({ assignmentId: edited.id, section: 'dol', record: held.record, itemIds: ['r3'], questionsByIndex: context.questionsByIndex, seatInfo: context.seatInfo, seenFingerprints: context.seenFingerprints });
  assert.equal(built.error, 'replacement-unavailable');
  assert.equal(built.classification, QUESTION_RESOLUTION_FAILURE.FAMILY_UNSATISFIABLE);
});

/* ===========================================================================
 * 24-25. The neighbours stay green.
 * ======================================================================== */

test('24/25. PR #430 containment and PR #426 Warm-Up recovery suites are part of this gate', () => {
  // They run in this same glob; this pins that they still exist and still
  // cover what this PR leans on.
  const containment = readFileSync(new URL('./questionFamilyPinContainment.test.mjs', import.meta.url), 'utf8');
  assert.match(containment, /REPRO: a canonical pin that cannot replay is never swapped for a different question/);
  assert.match(containment, /2\/12\. a Recovery pin that cannot replay is a classified question-level failure/);
  const warmup = readFileSync(new URL('./warmupReopenDraftRecovery.test.mjs', import.meta.url), 'utf8');
  assert.ok(warmup.length > 0);
  const runner = executableSource(readFileSync(new URL('../../src/components/student/SectionRecoveryRunner.jsx', import.meta.url), 'utf8'));
  assert.match(runner, /requirePin: true/, 'a Recovery question is still only ever its own pinned instance');
});
