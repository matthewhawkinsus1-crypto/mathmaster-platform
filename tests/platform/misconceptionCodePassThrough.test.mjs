// A STRUCTURED MISCONCEPTION CODE A TOOL PUTS ON A PART REACHES THE CASE REVIEW.
//
// functions/shared/misconceptionCodes.mjs names the only form a code may take
// (a catalog id on the part of a grading result it concerns) and the three
// seams that carry it. This file follows one code through every one of them,
// as production moves it:
//
//   registry tool part → QuestionEngine forwarder → recordQuestionAttempt (the
//   browser's queued record) → server ingestion of a type it cannot re-mark →
//   the stored question record and the attempt evidence event → the
//   `loadStudentCaseEvidence` projection → the case review's error patterns
//
// and checks the other half of the contract: a part or an event without a code
// keeps exactly the shape it always had, anything that is not a catalog id is
// dropped, and the amount stored is bounded.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { buildAttemptEvidenceEvent } from '../../functions/shared/attemptEvidenceEvent.mjs';
import { buildIngestedAttempt, buildSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildCaseEvidenceResponse } from '../../functions/shared/caseReviewEvidence.mjs';
import { MAX_CODES_PER_RECORD } from '../../functions/shared/misconceptionCodes.mjs';
import { analyzeAssignmentQuestions } from '../../src/platform/caseReview/attemptAnalysis.js';
import {
  ERROR_PATTERN_NOT_DETERMINABLE, analyzeErrorPatterns, errorPatternForQuestion,
} from '../../src/platform/caseReview/errorPatterns.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const STUDENT_ID = 'S930001'; // synthetic
const CAPTURED_AT = Date.parse('2026-09-22T15:10:00Z');
const INGESTED_AT = CAPTURED_AT + 20_000;

// A registry-tool question: the server cannot re-mark it, so ingestion accepts
// the browser's record (sanitized) — the path every registry tool takes.
const toolQuestion = { questionId: 'q-graph-1', id: 'q-graph-1', type: 'graphing2', activityRole: 'classwork', prompt: 'Graph the line (synthetic).', standards: { primary: ['A.3C'] } };
const assignment = {
  id: 'a-synthetic-graphs',
  title: 'Graphing lines (synthetic)',
  schemaVersion: 5,
  assignedClassIds: ['class-synthetic'],
  releaseAt: '2026-09-21T08:00:00-05:00',
  dueAt: '2026-09-25',
  sections: [{ id: 'cw', role: 'classwork', questions: [toolQuestion] }],
};

// What the QuestionEngine forwarder hands the attempt recorder for a tool whose
// `metadata.parts` named a misconception on its slope part.
const forwardedParts = (slopeCode = 'slope-direction') => [
  { id: 'slope', label: 'Slope', isComplete: true, isCorrect: false, response: '-2', ...(slopeCode ? { misconceptionCode: slopeCode } : {}) },
  { id: 'intercept', label: 'y-intercept', isComplete: true, isCorrect: true, response: '3' },
];

const LEGACY_PART_KEYS = ['id', 'label', 'isComplete', 'isCorrect', 'graded', 'weight', 'credit', 'response'];
const LEGACY_PERFORMANCE_KEYS = ['score', 'isCorrect', 'attemptNumber', 'status', 'partialCredit', 'isMathematicallyIndependent'];

const ingest = (clientRecord) => buildIngestedAttempt({
  envelope: buildSubmissionEnvelope({
    actionId: `action-${clientRecord.totalAttempts}`,
    kind: 'ordinarySubmission',
    studentId: STUDENT_ID,
    assignmentId: assignment.id,
    questionIndex: 0,
    questionId: toolQuestion.questionId,
    activityRole: 'classwork',
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: clientRecord.totalAttempts - 1,
    record: clientRecord,
  }),
  assignment,
  question: toolQuestion,
  canonicalRecord: null,
  ingestedAt: INGESTED_AT,
});

const caseReviewRows = ({ record, events }) => {
  const evidence = buildCaseEvidenceResponse({
    request: { studentId: STUDENT_ID, assignmentIds: [assignment.id], fromMs: CAPTURED_AT - 86_400_000, toMs: INGESTED_AT + 86_400_000 },
    events: events.map((event) => ({ id: event.eventKey, data: event })),
    nowMs: INGESTED_AT,
  });
  const analysis = analyzeAssignmentQuestions({
    assignment,
    student: { id: STUDENT_ID, classId: 'class-synthetic', gradesByAssignment: { [assignment.id]: { 0: record } } },
    attemptEvents: evidence.attemptEvents,
  });
  return { evidence, rows: analysis.questions };
};

test('a code a tool put on a part travels to the stored record, the attempt event, the callable and the case review', () => {
  // 1. The browser records the attempt; the part keeps its code.
  const client = recordQuestionAttempt({ record: null, isCorrect: false, parts: forwardedParts(), maximumAttempts: 3 });
  assert.equal(client.record.partGrades[0].misconceptionCode, 'slope-direction');
  assert.equal('misconceptionCode' in client.record.partGrades[1], false, 'a part without a code gets no key');

  // 2. Server ingestion accepts the record of a type it cannot re-mark.
  const built = ingest(client.record);
  assert.equal(built.blocked, false);
  assert.equal(built.gradedBy, 'client');
  assert.equal(built.record.partGrades[0].misconceptionCode, 'slope-direction', 'on the question record written to grades/{sid}');
  assert.deepEqual(built.evidenceEvent.performance.misconceptionCodes, ['slope-direction'], 'on this attempt\'s evidence event');

  // 3. The case review's read-only callable projects it; 4. the case review names it.
  const { evidence, rows } = caseReviewRows({ record: built.record, events: [built.evidenceEvent] });
  assert.deepEqual(evidence.attemptEvents[0].performance.misconceptionCodes, ['slope-direction']);
  assert.deepEqual(rows[0].misconceptionCodes, ['slope-direction']);
  const pattern = errorPatternForQuestion(rows[0]);
  assert.equal(pattern.determinable, true);
  assert.deepEqual(pattern.codes, [{ code: 'slope-direction', label: 'Incorrect slope direction' }]);
  const patterns = analyzeErrorPatterns({ questions: rows });
  assert.equal(patterns.determinable, true);
  assert.deepEqual(patterns.codes.map((entry) => [entry.code, entry.questions, entry.assignmentIds]), [['slope-direction', 1, [assignment.id]]]);
});

test('each attempt keeps its own codes: a later attempt without one does not inherit the earlier one', () => {
  const first = recordQuestionAttempt({ record: null, isCorrect: false, parts: forwardedParts('slope-direction'), maximumAttempts: 3 });
  const firstBuilt = ingest(first.record);
  const second = recordQuestionAttempt({ record: firstBuilt.record, isCorrect: false, parts: forwardedParts(null), maximumAttempts: 3 });
  const secondBuilt = ingest(second.record);
  assert.deepEqual(firstBuilt.evidenceEvent.performance.misconceptionCodes, ['slope-direction']);
  assert.equal('misconceptionCodes' in secondBuilt.evidenceEvent.performance, false, 'the second attempt named none');
  assert.equal('misconceptionCode' in secondBuilt.record.partGrades[0], false, 'the record holds the latest attempt\'s parts');
  // The case review still finds the first attempt's code in its event.
  const { rows } = caseReviewRows({ record: secondBuilt.record, events: [firstBuilt.evidenceEvent, secondBuilt.evidenceEvent] });
  assert.deepEqual(rows[0].misconceptionCodes, ['slope-direction']);
});

test('a server grader\'s part code is kept the same way (ingestion re-mark and the deadline finalizer both compact through the attempt policy)', () => {
  const graderParts = [{ id: 'literal', label: 'Expression for y', isComplete: true, isCorrect: false, response: '2x-1', misconceptionCode: 'sign-error' }];
  const outcome = recordQuestionAttempt({ record: null, isCorrect: false, parts: graderParts, maximumAttempts: 3 });
  assert.equal(outcome.record.partGrades[0].misconceptionCode, 'sign-error');
  assert.equal(outcome.result.partGrades[0].misconceptionCode, 'sign-error');
  const event = buildAttemptEvidenceEvent({ studentId: STUDENT_ID, assignment, question: toolQuestion, questionIndex: 0, activityRole: 'classwork', attemptRecord: outcome.record, attemptResult: outcome.result });
  assert.deepEqual(event.performance.misconceptionCodes, ['sign-error']);
});

test('records and events without a code keep exactly their earlier shape — older data simply lacks the field', () => {
  const outcome = recordQuestionAttempt({ record: null, isCorrect: false, parts: forwardedParts(null), maximumAttempts: 3 });
  outcome.record.partGrades.forEach((part) => assert.deepEqual(Object.keys(part), LEGACY_PART_KEYS));
  const built = ingest(outcome.record);
  assert.deepEqual(Object.keys(built.evidenceEvent.performance), LEGACY_PERFORMANCE_KEYS);
  // A record written before codes were carried reads exactly as before.
  const { rows } = caseReviewRows({ record: built.record, events: [built.evidenceEvent] });
  assert.deepEqual(rows[0].misconceptionCodes, []);
  assert.equal(errorPatternForQuestion(rows[0]).statement, ERROR_PATTERN_NOT_DETERMINABLE);
});

test('only catalog ids are stored, one per part and at most the catalog cap per attempt', () => {
  const noisy = [
    { id: 'a', label: 'A', isComplete: true, isCorrect: false, misconceptionCode: 'the student is confused' },
    { id: 'b', label: 'B', isComplete: true, isCorrect: false, misconceptionCode: 'SIGN-ERROR' },
    { id: 'c', label: 'C', isComplete: true, isCorrect: false, misconceptionCode: 'x'.repeat(10_000) },
    { id: 'd', label: 'D', isComplete: true, isCorrect: false, misconceptionCode: ['distribution-error', 'sign-error'] },
  ];
  const outcome = recordQuestionAttempt({ record: null, isCorrect: false, parts: noisy, maximumAttempts: 3 });
  assert.deepEqual(outcome.record.partGrades.map((part) => part.misconceptionCode), [undefined, undefined, undefined, 'distribution-error']);
  assert.deepEqual(Object.keys(outcome.record.partGrades[0]), LEGACY_PART_KEYS, 'free text adds no key at all');

  const codes = ['sign-error', 'distribution-error', 'slope-direction', 'intercept-confusion', 'coordinate-order', 'domain-range-confusion', 'sign-error'];
  const many = recordQuestionAttempt({
    record: null,
    isCorrect: false,
    parts: codes.map((code, index) => ({ id: `p${index}`, label: `P${index}`, isComplete: true, isCorrect: false, misconceptionCode: code })),
    maximumAttempts: 3,
  });
  const event = buildAttemptEvidenceEvent({ studentId: STUDENT_ID, assignment, question: toolQuestion, questionIndex: 0, activityRole: 'classwork', attemptRecord: many.record, attemptResult: many.result });
  assert.equal(event.performance.misconceptionCodes.length, MAX_CODES_PER_RECORD);
  assert.deepEqual(event.performance.misconceptionCodes, ['sign-error', 'distribution-error', 'slope-direction', 'intercept-confusion', 'coordinate-order']);
});

test('the QuestionEngine forwarder copies a tool part\'s code onto the part it hands the attempt recorder', () => {
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const handler = region(engine, 'const handleMissingToolAction = async', 'const handleModelingLabGrade', 'registry tool forwarder');
  const mapping = executableSource(region(handler, 'const rawParts = payload?.metadata?.parts;', 'const score = Number(payload?.score);', 'tool part mapping'));
  // The mapped part carries the code read from the tool's own part…
  assert.match(mapping, /rawParts\.map\(\(part, index\) => \(\{[\s\S]*misconceptionCode: part\??\.misconceptionCode[\s\S]*\}\)\)/);
  // …and those mapped parts are what the attempt recorder receives.
  assert.match(handler, /await onGrade\?\.\(\s*Boolean\(payload\?\.isCorrect\),\s*details,\s*parts,/);
});
