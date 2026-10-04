/*
 * RECOVERY ON THE SPECIAL CASES — FRESH, REPRODUCIBLE, SERVER-GRADED.
 *
 * A DOL made of the new slots (an equation with no solution, an identity, an
 * exact fraction answer, a mixed slot, systems with no solution / infinitely
 * many / a fractional intersection, a fraction-coefficient two-step) is
 * Recovery-ready, and for a seated student:
 *
 *   - the original version exists (the initial delivery);
 *   - a Practice item and the Recovery item for every question are fresh:
 *     never a fingerprint the student has already been shown, while the
 *     family has others (it has thousands);
 *   - every Recovery pin reproduces exactly the question it names;
 *   - the server grades every Recovery item from its pin with the same shared
 *     grader the workspace runs — correct work is credited, wrong work is
 *     not, for every special case.
 *
 * Recovery's scoring policy (caps, recorded scores) belongs to another suite
 * and is deliberately not asserted here: only the raw marking is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { RECOVERY_ACTION, buildSectionRecoveryContext, nextRecoveryPracticeItem } from '../../functions/shared/sectionRecoveryService.mjs';
import { RECOVERY_STATE } from '../../functions/shared/sectionRecoveryEligibility.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { assessSectionRecoveryReadiness } from '../../functions/shared/sectionRecoveryReadiness.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';
import {
  CLASS_ID,
  KEY_CASE,
  correctWork,
  deliverTo,
  equationOracle,
  gradeBothWays,
  seatedAssignment,
  systemOracle,
  wrongWork,
} from './helpers/questionFamilyCases.mjs';

const NOW = Date.parse('2026-10-01T15:00:00Z');
const STUDENT = 'qf-student-04';

const multi = (questionId, constraints) => ({ questionId, type: 'stepAlgebra', questionFamily: { id: 'linear.multiStepEquation', version: 2, constraints } });
const DOL = Object.freeze([
  multi('d-none', { solutionCase: 'none', distribute: true }),
  multi('d-infinite', { solutionCase: 'infinite' }),
  multi('d-fraction', { solutionCase: 'one', solutionForm: 'fraction' }),
  multi('d-mixed', { solutionCase: 'mixed', coefficientForm: 'fraction' }),
  { questionId: 'd-two-step', type: 'stepAlgebra', questionFamily: { id: 'linear.twoStepEquation', version: 2, constraints: { coefficientForm: 'fraction', distribute: true } } },
  { questionId: 'd-sys-none', type: 'systemsWorkspace', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints: { solutionCase: 'none' } } },
  { questionId: 'd-sys-infinite', type: 'systemsWorkspace', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints: { solutionCase: 'infinite' } } },
  { questionId: 'd-sys-fraction', type: 'systemsWorkspace', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints: { solutionCase: 'one', solutionForm: 'fraction' } } },
]);

const buildAssignment = () => ({
  ...seatedAssignment('qf-case-recovery', DOL, { role: 'dol' }),
  title: 'Special cases',
  dueAt: '2026-09-01T20:00:00Z',
  lateDueAt: '2026-10-10T23:00:00Z',
  dol: { instructionDate: '2026-09-01' },
});

// The original DOL: every question answered wrong three times.
const TRACKER = Object.freeze(Object.fromEntries(DOL.map((_, index) => [index, { status: 'expired', attemptCount: 3, totalAttempts: 3, variantIndex: 0 }])));

const contextFor = ({ assignment, record = null }) => {
  const original = splitGradesBySection({ tracker: TRACKER, assignment }).dol;
  const questions = getStoredAssignmentQuestions(assignment);
  return buildSectionRecoveryContext({
    assignment,
    section: 'dol',
    sectionEntries: questions.map((question, storageIndex) => ({ storageIndex, question })).filter((entry) => entry.question.activityRole === 'dol'),
    questions,
    tracker: TRACKER,
    sectionOriginal: { score: original.total ? original.score : null, attempted: original.attempted, total: original.total },
    record,
    studentId: STUDENT,
    classId: CLASS_ID,
    classPeriod: '1',
    schedule: null,
    supportEvents: [],
    challengeCredit: null,
    sectionModeFor: () => 'personalized',
    nowValue: NOW,
  });
};

const reproduce = (assignment, item) => reproduceFamilyQuestionFromPin({
  question: getStoredAssignmentQuestions(assignment)[item.storageIndex],
  assignmentId: assignment.id,
  storageIndex: item.storageIndex,
  pin: item.pin,
});

/** The tool response a student's workspace sends for this item, right or wrong. */
const responseFor = (assignment, item, { correct = true } = {}) => {
  const { question } = reproduce(assignment, item);
  const { browser } = gradeBothWays(question, correct ? correctWork(question) : wrongWork(question));
  assert.equal(browser.isCorrect, correct, `${question.questionId}: the workspace's own verdict`);
  return browser.toolResponse;
};

const caseOf = (question) => (question.type === 'systemsWorkspace' ? systemOracle(question) : equationOracle(question)).case;

/** Practice correctly until the mastery gate opens; returns the record and the practice fingerprints. */
const practiceToMastery = (assignment) => {
  let record = null;
  const fingerprints = [];
  for (let step = 0; step < 40; step += 1) {
    const context = contextFor({ assignment, record });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    assert.ok(item, `practice item ${step}`);
    fingerprints.push(item.pin.fingerprint);
    assert.ok(!context.seenFingerprints.includes(item.pin.fingerprint), 'a practice item is never one the student has seen');
    record = runSectionRecoveryAction({
      context,
      action: RECOVERY_ACTION.PRACTICE,
      payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: responseFor(assignment, item) },
      at: NOW + step * 60_000,
    }).record;
  }
  return { record, fingerprints };
};

test('a DOL of special-case slots is Recovery-ready, every question', () => {
  const assignment = buildAssignment();
  const questions = getStoredAssignmentQuestions(assignment);
  const readiness = assessSectionRecoveryReadiness({
    assignmentId: assignment.id,
    section: 'dol',
    entries: questions.map((question, storageIndex) => ({ question, storageIndex })),
  });
  assert.equal(readiness.ready, true, JSON.stringify(readiness.blockers));
  assert.equal(readiness.readySlots.length, DOL.length);
});

test('Practice and Recovery items are fresh, reproducible, and the server grades every special case', () => {
  const assignment = buildAssignment();
  // The initial version of every question, as this student was given it.
  const originals = DOL.map((_, storageIndex) => deliverTo(assignment, storageIndex, STUDENT));
  originals.forEach((delivery) => assert.equal(delivery.error, null));
  const originalFingerprints = new Set(originals.map((delivery) => delivery.instance.fingerprint));

  const { record, fingerprints: practiced } = practiceToMastery(assignment);
  assert.notEqual(contextFor({ assignment, record }).eligibility.state, RECOVERY_STATE.LOCKED, 'correct practice unlocks Recovery');
  practiced.forEach((fingerprint) => assert.ok(!originalFingerprints.has(fingerprint), 'practice never repeats an original'));

  const started = runSectionRecoveryAction({ context: contextFor({ assignment, record }), action: RECOVERY_ACTION.START, at: NOW + 3_600_000 }).record;
  const { items } = started.plan;
  assert.equal(items.length, DOL.length, 'one fresh item for every DOL question');

  const casesSeen = new Set();
  items.forEach((item) => {
    // An alternate version of the same slot — never the original, never a practice item.
    assert.equal(item.pin.familyId, DOL[item.storageIndex].questionFamily.id);
    assert.notEqual(item.pin.fingerprint, originals[item.storageIndex].instance.fingerprint, `${item.itemId}: not the original version`);
    assert.ok(!practiced.includes(item.pin.fingerprint), `${item.itemId}: not a practice item`);
    // The pin reproduces exactly, every time.
    const first = reproduce(assignment, item);
    const second = reproduce(assignment, item);
    assert.equal(first.error, null, `${item.itemId}: ${first.error}`);
    assert.deepEqual(second.question, first.question);
    assert.equal(first.instance.fingerprint, item.pin.fingerprint);
    // The constraint is kept: a no-solution slot recovers to a no-solution question, and so on.
    const requested = DOL[item.storageIndex].questionFamily.constraints.solutionCase;
    const shown = caseOf(first.question);
    assert.equal(KEY_CASE[first.question.solutionKey.outcome], shown, `${item.itemId}: the key is the question's case`);
    if (requested && requested !== 'mixed') assert.equal(shown, requested, `${item.itemId}: still ${requested}`);
    casesSeen.add(`${first.question.type}:${shown}`);
  });
  assert.ok(casesSeen.has('stepAlgebra:none') && casesSeen.has('stepAlgebra:infinite') && casesSeen.has('stepAlgebra:one'));
  assert.ok(casesSeen.has('systemsWorkspace:none') && casesSeen.has('systemsWorkspace:infinite') && casesSeen.has('systemsWorkspace:one'));

  // The server grades each item from its pin: all right, then all wrong.
  const right = Object.fromEntries(items.map((item) => [item.itemId, responseFor(assignment, item)]));
  const wrong = Object.fromEntries(items.map((item) => [item.itemId, responseFor(assignment, item, { correct: false })]));
  const passed = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses: right }, at: NOW + 3_700_000 });
  assert.equal(passed.response.rawScore, 100, 'every special case credited on the server');
  const failed = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses: wrong }, at: NOW + 3_700_000 });
  assert.equal(failed.response.rawScore, 0, 'and every wrong conclusion refused');

  // One wrong special case among right answers costs exactly that item.
  const oneWrong = { ...right, [items[0].itemId]: wrong[items[0].itemId] };
  const partial = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses: oneWrong }, at: NOW + 3_700_000 });
  assert.ok(partial.response.rawScore > 0 && partial.response.rawScore < 100, `one wrong item: ${partial.response.rawScore}`);
});

test('answering a Recovery item with another instance\'s correct work earns nothing: items are graded against their own pins', () => {
  const assignment = buildAssignment();
  const { record } = practiceToMastery(assignment);
  const started = runSectionRecoveryAction({ context: contextFor({ assignment, record }), action: RECOVERY_ACTION.START, at: NOW + 3_600_000 }).record;
  const { items } = started.plan;
  // The fraction-answer equation item, answered with the student's ORIGINAL version's correct work.
  const item = items.find((entry) => DOL[entry.storageIndex].questionId === 'd-fraction');
  const original = deliverTo(assignment, item.storageIndex, STUDENT).question;
  const { browser } = gradeBothWays(original, correctWork(original));
  const responses = Object.fromEntries(items.map((entry) => [entry.itemId, entry === item ? browser.toolResponse : responseFor(assignment, entry)]));
  const submitted = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses }, at: NOW + 3_700_000 });
  assert.ok(submitted.response.rawScore < 100, 'the original version\'s answer is not this item\'s answer');
});
