/*
 * A RICH-TOOL QUESTION FAMILY GOES THROUGH PRACTICE-BASED RECOVERY ON THE
 * SERVER'S OWN GRADER — WITH NO ALLOW-LIST.
 *
 * A DOL whose question is a Complex Plane Lab family is Recovery-ready because
 * the registry says the server can rebuild and grade each instance, and every
 * Practice item and Recovery item is then marked by the same shared grader the
 * lab runs in the browser, from the structured work the lab sends. Tampered or
 * old-shaped work is never credited.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RECOVERY_ACTION,
  buildSectionRecoveryContext,
  nextRecoveryPracticeItem,
} from '../../functions/shared/sectionRecoveryService.mjs';
import { RECOVERY_STATE } from '../../functions/shared/sectionRecoveryEligibility.mjs';
import { runSectionRecoveryAction } from '../../functions/shared/sectionRecoveryActions.mjs';
import { assessSectionRecoveryReadiness } from '../../functions/shared/sectionRecoveryReadiness.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { planSeatAdditions } from '../../functions/shared/questionGenerationIdentity.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { splitGradesBySection } from '../../src/platform/teacher/gradeEvidence.js';

const NOW = Date.parse('2026-10-01T15:00:00Z');
const STUDENT = 'student-03';
const CLASS = 'class-A';
const ROSTER = Array.from({ length: 10 }, (_, index) => `student-${String(index).padStart(2, '0')}`);

const LAB_FAMILY = {
  questionId: 'd1',
  type: 'complexPlaneLab',
  toolId: 'complexPlaneLab',
  mode: 'operations',
  operation: 'add',
  prompt: 'Add ({{a}} + {{b}}i) and (2 - i).',
  z: { re: '{{a}}', im: '{{b}}' },
  w: { re: 2, im: -1 },
  questionFamily: { scope: 'assignment' },
  generator: { parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 } } },
};

const buildAssignment = () => {
  const assignment = {
    id: 'asg-lab-recovery',
    schemaVersion: 5,
    title: 'Complex numbers',
    assignedClassIds: [CLASS],
    dueAt: '2026-09-01T20:00:00Z',
    lateDueAt: '2026-10-10T23:00:00Z',
    dol: { instructionDate: '2026-09-01' },
    sections: [
      { id: 'dol', role: 'dol', title: 'DOL', questions: [LAB_FAMILY] },
    ],
  };
  assignment.generationSeats = { byClassId: { [CLASS]: planSeatAdditions({ assignment, classId: CLASS, studentIds: ROSTER }) } };
  return assignment;
};

// The original DOL: the lab answered wrong three times.
const TRACKER = Object.freeze({ 0: { status: 'expired', attemptCount: 3, totalAttempts: 3, variantIndex: 0 } });

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
    classId: CLASS,
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

/** The structured work the lab sends when the student adds correctly (or not). */
const labResponse = (assignment, item, { correct = true } = {}) => {
  const { question } = reproduce(assignment, item);
  const work = {
    real: String(Number(question.z.re) + 2 + (correct ? 0 : 1)),
    imaginary: String(Number(question.z.im) - 1),
  };
  const browser = gradeToolWork({ toolId: 'complexPlaneLab', question, work });
  assert.equal(browser.isCorrect, correct, 'the browser verdict the student saw');
  return browser.toolResponse;
};

test('a Complex Plane Lab family DOL is Recovery-ready through the grading registry', () => {
  const assignment = buildAssignment();
  const questions = getStoredAssignmentQuestions(assignment);
  const readiness = assessSectionRecoveryReadiness({
    assignmentId: assignment.id,
    section: 'dol',
    entries: questions.map((question, storageIndex) => ({ question, storageIndex })),
  });
  assert.equal(readiness.ready, true, JSON.stringify(readiness.blockers));
});

test('Practice items are marked by the shared lab grader on the server, and tampered work is never credited', () => {
  const assignment = buildAssignment();
  const context = contextFor({ assignment });
  assert.equal(context.eligibility.state, RECOVERY_STATE.LOCKED);
  const item = nextRecoveryPracticeItem(context);

  const wrong = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: labResponse(assignment, item, { correct: false }) }, at: NOW });
  assert.equal(wrong.response.isCorrect, false);

  // The browser's claim rides inside the work: stripped by the contract, it
  // changes nothing.
  const next = contextFor({ assignment, record: wrong.record });
  const nextItem = nextRecoveryPracticeItem(next);
  const forged = labResponse(assignment, nextItem, { correct: false });
  const withClaims = buildToolResponse({ toolId: 'complexPlaneLab', mode: 'operations', work: { ...JSON.parse(forged.value), isCorrect: true, score: 1 } });
  const tampered = runSectionRecoveryAction({ context: next, action: RECOVERY_ACTION.PRACTICE, payload: { pin: nextItem.pin, practiceIndex: nextItem.practiceIndex, response: withClaims }, at: NOW + 1 });
  assert.equal(tampered.response.isCorrect, false);

  // An old client's opaque string for a tool question is not graded correct.
  const after = contextFor({ assignment, record: tampered.record });
  const oldItem = nextRecoveryPracticeItem(after);
  const opaque = { kind: 'opaque', type: 'complexPlaneLab', value: JSON.stringify({ real: '99', imaginary: '99' }), fields: [] };
  let opaqueOutcome = null;
  try {
    opaqueOutcome = runSectionRecoveryAction({ context: after, action: RECOVERY_ACTION.PRACTICE, payload: { pin: oldItem.pin, practiceIndex: oldItem.practiceIndex, response: opaque }, at: NOW + 2 });
  } catch (error) {
    opaqueOutcome = { refused: error.code || error.message };
  }
  assert.notEqual(opaqueOutcome?.response?.isCorrect, true);
});

test('mastery unlocks Recovery, and the Recovery item is graded from its pin by the same grader', () => {
  const assignment = buildAssignment();
  let record = null;
  for (let step = 0; step < 12; step += 1) {
    const context = contextFor({ assignment, record });
    if (context.eligibility.state !== RECOVERY_STATE.LOCKED) break;
    const item = nextRecoveryPracticeItem(context);
    record = runSectionRecoveryAction({ context, action: RECOVERY_ACTION.PRACTICE, payload: { pin: item.pin, practiceIndex: item.practiceIndex, response: labResponse(assignment, item) }, at: NOW + step * 60_000 }).record;
  }
  assert.notEqual(contextFor({ assignment, record }).eligibility.state, RECOVERY_STATE.LOCKED, 'correct lab work unlocks Recovery');

  const started = runSectionRecoveryAction({ context: contextFor({ assignment, record }), action: RECOVERY_ACTION.START, at: NOW + 3_600_000 }).record;
  assert.equal(started.plan.items.length, 1);
  const [item] = started.plan.items;

  // Answering with ANOTHER instance's correct work scores nothing: the item is
  // graded against its own pin.
  const otherWork = { real: '0', imaginary: '0' };
  const wrongResponses = { [item.itemId]: buildToolResponse({ toolId: 'complexPlaneLab', mode: 'operations', work: otherWork }) };
  const rightResponses = { [item.itemId]: labResponse(assignment, item) };

  const submitted = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses: rightResponses }, at: NOW + 3_700_000 });
  assert.equal(submitted.response.rawScore, 100);
  assert.equal(submitted.response.recordedScore, 90, 'a 0% original recovers to the 90% DOL cap');
  assert.equal(submitted.record.status, 'completed');

  const failed = runSectionRecoveryAction({ context: contextFor({ assignment, record: started }), action: RECOVERY_ACTION.SUBMIT, payload: { responses: wrongResponses }, at: NOW + 3_700_000 });
  assert.equal(failed.response.rawScore, 0);
});
