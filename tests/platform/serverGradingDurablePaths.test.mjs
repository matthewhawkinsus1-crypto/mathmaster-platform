/*
 * ONE RAW RESPONSE, ONE VERDICT — ON EVERY DURABLE PATH.
 *
 * The same student work can reach the gradebook four ways: a manual Submit
 * that ingests immediately, a submission that waited in an offline queue, a
 * response checkpoint finalized at the deadline, or (for a Question Family
 * slot) any of those from another device that only has the delivery pin.
 * These tests drive a registry tool's work through the REAL client builders
 * and the REAL server decisions and require the same academic verdict.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildResponseCheckpointAction, checkpointEligibility } from '../../src/platform/performance/responseCheckpoint.js';
import {
  buildCheckpointFinalization,
  decideCheckpointFinalization,
} from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { CHECKPOINT_STATUS } from '../../functions/shared/responseCheckpointSchema.mjs';
import { buildIngestedAttempt, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';

const DAY = '2026-09-14';
const CLASS_ID = 'class-a';
const CLASS_PERIOD = 'Period 3';
const DURING_CLASS = Date.parse('2026-09-14T15:20:00Z');
const AFTER_DUE = Date.parse('2026-09-22T12:00:00Z');

const SCHEDULE = {
  version: 2,
  daySchedules: { A: { periods: { [CLASS_PERIOD]: { enabled: true, start: '10:00', end: '10:50' } } } },
  weeklyDayTypes: { 1: 'A' },
  dayTypeOverrides: { [DAY]: 'A' },
  modifiedSchedules: {},
};

const TOOL_QUESTION = {
  questionId: 'q-cpl', type: 'complexPlaneLab', toolId: 'complexPlaneLab', mode: 'operations', operation: 'multiply',
  z: { re: 2, im: 3 }, w: { re: -1, im: 2 }, prompt: 'Multiply.',
};
const FAMILY_TEMPLATE = {
  questionId: 'q-cpl-family', type: 'complexPlaneLab', toolId: 'complexPlaneLab', mode: 'operations', operation: 'add',
  prompt: 'Add ({{a}} + {{b}}i) and (2 - i).', z: { re: '{{a}}', im: '{{b}}' }, w: { re: 2, im: -1 },
  questionFamily: { scope: 'assignment' },
  generator: { parameters: { a: { type: 'int', min: 1, max: 9 }, b: { type: 'int', min: 1, max: 9 } } },
};

const buildAssignment = () => ({
  id: 'A1',
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  releaseAt: '2026-09-01T00:00:00Z',
  dueAt: '2026-09-20',
  lateDueAt: '2026-09-21',
  sections: [{ id: 's-classwork', role: 'classwork', questions: [TOOL_QUESTION, FAMILY_TEMPLATE] }],
});
const runtimeQuestions = (assignment) => assignment.sections.flatMap((section) => section.questions.map((question) => ({ ...question, activityRole: question.activityRole || section.role })));
const gradeDocument = () => ({ studentId: 'S1', classId: CLASS_ID, classPeriod: CLASS_PERIOD, gradesByAssignment: {} });

/** The answerState QuestionEngine builds from a tool's reported live work. */
const toolAnswerState = ({ question, work }) => {
  const result = gradeToolWork({ toolId: 'complexPlaneLab', question, work });
  return { isComplete: result.isComplete === true, isCorrect: false, responseKey: result.toolResponse.value, questionDetails: '', parts: [], toolResponse: result.toolResponse };
};

const checkpointFor = ({ question, questionIndex, gradingQuestion = question, work, familyDelivery = null }) => {
  const action = buildResponseCheckpointAction({
    identity: { studentId: 'S1', assignmentId: 'A1', questionIndex, questionId: question.questionId, variantIndex: 0, generationKey: `A1|S1|${questionIndex}|variant:0` },
    question: gradingQuestion,
    activityRole: 'classwork',
    answerState: toolAnswerState({ question: gradingQuestion, work }),
    revision: 1,
    finalizeAt: new Date(AFTER_DUE).toISOString(),
    finalizationReason: 'final-due',
    finalizationContext: { classId: CLASS_ID, classPeriod: CLASS_PERIOD },
    previousTotalAttempts: 0,
    capturedAt: DURING_CLASS,
    familyDelivery,
  });
  assert.ok(action, 'the client builder refused this checkpoint');
  return { ...action.payload, classId: CLASS_ID, serverAcknowledgedAt: new Date(DURING_CLASS), status: CHECKPOINT_STATUS.ACTIVE };
};

const decide = (checkpoint) => {
  const assignment = buildAssignment();
  return decideCheckpointFinalization({
    checkpoint,
    assignment,
    gradeDocument: gradeDocument(),
    gradeDocumentId: 'S1',
    question: runtimeQuestions(assignment)[Number(checkpoint.questionIndex)],
    schedule: SCHEDULE,
    classPeriod: CLASS_PERIOD,
    now: AFTER_DUE,
  });
};

const ingest = ({ question, questionIndex, response, familyDelivery = null }) => buildIngestedAttempt({
  envelope: normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-${questionIndex}`,
    kind: 'ordinarySubmission',
    studentId: 'S1',
    assignmentId: 'A1',
    questionIndex,
    questionId: question.questionId,
    activityRole: 'classwork',
    capturedAt: DURING_CLASS,
    record: { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100 },
    response,
    familyDelivery,
  })),
  assignment: buildAssignment(),
  question: runtimeQuestions(buildAssignment())[questionIndex],
  canonicalRecord: null,
  gradeDocument: gradeDocument(),
  ingestedAt: DURING_CLASS + 5_000,
});

const academicFields = (record) => ({
  status: record.status,
  attemptCount: record.attemptCount,
  totalAttempts: record.totalAttempts,
  partialCredit: record.partialCredit,
  lastResponseKey: record.lastResponseKey,
  partGrades: record.partGrades.map(({ id, isCorrect, credit, weight }) => ({ id, isCorrect, credit, weight })),
});

test('registry-tool work is now checkpoint-eligible (it was refused before the shared registry)', () => {
  assert.equal(checkpointEligibility({ question: TOOL_QUESTION, activityRole: 'classwork' }).eligible, true);
});

test('the deadline finalizer and queued ingestion record the SAME attempt for the same tool work', () => {
  const work = { real: '-8', imaginary: '5' };
  const checkpoint = checkpointFor({ question: TOOL_QUESTION, questionIndex: 0, work });
  assert.equal(checkpoint.response.kind, 'tool', 'the checkpoint stores the structured work, not a truncated string');
  const decision = decide(checkpoint);
  assert.equal(decision.action, 'finalize', decision.reason);
  const finalized = buildCheckpointFinalization({ checkpoint, assignment: buildAssignment(), question: runtimeQuestions(buildAssignment())[0], decision, gradeDocument: gradeDocument(), occurredAt: DURING_CLASS });
  const ingested = ingest({ question: TOOL_QUESTION, questionIndex: 0, response: checkpoint.response });
  assert.equal(ingested.gradedBy, 'server');
  assert.equal(finalized.record.gradedBy, 'server');
  assert.deepEqual(academicFields(finalized.record), academicFields(ingested.record));
  assert.equal(finalized.record.status, 'attempted');
  assert.equal(finalized.record.partialCredit, 50);
});

test('a deadline never invents an attempt from unfinished tool work', () => {
  const checkpoint = checkpointFor({ question: TOOL_QUESTION, questionIndex: 0, work: { real: '-8', imaginary: '' } });
  assert.equal(checkpoint.isComplete, false);
  const decision = decide(checkpoint);
  assert.equal(decision.action, 'close');
  assert.equal(decision.status, CHECKPOINT_STATUS.INCOMPLETE_AT_CLOSE);
});

test('a forged "complete" flag cannot make the deadline submit unfinished work: the server re-derives completeness', () => {
  const checkpoint = { ...checkpointFor({ question: TOOL_QUESTION, questionIndex: 0, work: { real: '-8', imaginary: '' } }), isComplete: true };
  const decision = decide(checkpoint);
  assert.equal(decision.action, 'close');
  assert.equal(decision.status, CHECKPOINT_STATUS.INCOMPLETE_AT_CLOSE);
  assert.equal(decision.reason, 'incomplete-response');
});

test('a Question Family slot finalizes at the deadline against the instance its own pin names', () => {
  const instance = resolveFamilyQuestionInstance({ question: FAMILY_TEMPLATE, assignmentId: 'A1', storageIndex: 1, allocation: { seat: 4, variant: 0, stride: 40, index: 4, basis: 'provisional' } });
  assert.equal(instance.error, null);
  const work = { real: String(Number(instance.question.z.re) + 2), imaginary: String(Number(instance.question.z.im) - 1) };
  const checkpoint = checkpointFor({ question: FAMILY_TEMPLATE, questionIndex: 1, gradingQuestion: instance.question, work, familyDelivery: instance.delivery });
  assert.equal(checkpoint.familyDelivery.fingerprint, instance.delivery.fingerprint);
  const decision = decide(checkpoint);
  assert.equal(decision.action, 'finalize', decision.reason);
  assert.equal(decision.grading.isCorrect, true);
  const finalized = buildCheckpointFinalization({ checkpoint, assignment: buildAssignment(), question: runtimeQuestions(buildAssignment())[1], decision, gradeDocument: gradeDocument(), occurredAt: DURING_CLASS });
  assert.equal(finalized.record.status, 'correct');
  assert.equal(finalized.record.familyDelivery.fingerprint, instance.delivery.fingerprint, 'the deadline stamps the canonical pin, as ingestion does');

  // The same work ingested from another device that only holds the pin.
  const ingested = ingest({ question: FAMILY_TEMPLATE, questionIndex: 1, response: checkpoint.response, familyDelivery: instance.delivery });
  assert.deepEqual(academicFields(ingested.record), academicFields(finalized.record));
});

test('a family checkpoint with no pin cannot be graded at a deadline, and says so rather than grading the template', () => {
  const instance = resolveFamilyQuestionInstance({ question: FAMILY_TEMPLATE, assignmentId: 'A1', storageIndex: 1, allocation: { seat: 4, variant: 0, stride: 40, index: 4, basis: 'provisional' } });
  const work = { real: String(Number(instance.question.z.re) + 2), imaginary: String(Number(instance.question.z.im) - 1) };
  const checkpoint = { ...checkpointFor({ question: FAMILY_TEMPLATE, questionIndex: 1, gradingQuestion: instance.question, work, familyDelivery: instance.delivery }), familyDelivery: null };
  const decision = decide(checkpoint);
  assert.equal(decision.action, 'close');
  assert.equal(decision.status, CHECKPOINT_STATUS.UNSUPPORTED_QUESTION);
  assert.match(decision.reason, /family-delivery-missing/);
});
