// THE BROWSER'S MISCONCEPTION-CODE PASS-THROUGH IS CLOSED.
//
// Until server-authoritative misconception evidence, a catalog code a tool put
// on a part travelled — registry tool part → QuestionEngine forwarder →
// recordQuestionAttempt → server ingestion of a type it cannot re-mark → the
// stored record and the attempt evidence event → the case review. Every step
// of that path started in the browser, so a forged `misconceptionCode` became
// teacher evidence. This file walks the same path and checks each seam now
// refuses it. What replaced it — the server classifying the raw work itself
// and storing provenance — is tested in misconceptionEvidence.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { buildAttemptEvidenceEvent } from '../../functions/shared/attemptEvidenceEvent.mjs';
import { buildIngestedAttempt, buildSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildCaseEvidenceResponse } from '../../functions/shared/caseReviewEvidence.mjs';
import { analyzeAssignmentQuestions } from '../../src/platform/caseReview/attemptAnalysis.js';
import { ERROR_PATTERN_NOT_DETERMINABLE, errorPatternForQuestion } from '../../src/platform/caseReview/errorPatterns.js';
import { toolSubmissionParts } from '../../src/tools/shared/toolSubmissionParts.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const STUDENT_ID = 'S930001'; // synthetic
const CAPTURED_AT = Date.parse('2026-09-22T15:10:00Z');
const INGESTED_AT = CAPTURED_AT + 20_000;

// A registry-tool question the server cannot re-mark: ingestion accepts the
// browser's record, sanitized — the path a forged code used to ride.
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

// A registered code, so nothing below passes merely because the id is unknown.
const FORGED = 'slope-sign-reversed';
const forgedParts = () => [
  { id: 'slope', label: 'Slope', isComplete: true, isCorrect: false, response: '-2', misconceptionCode: FORGED },
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

test('the QuestionEngine forwarder no longer carries a tool part\'s code', () => {
  assert.deepEqual(toolSubmissionParts({ parts: [{ id: 'slope', label: 'Slope', isCorrect: false, response: '-2', misconceptionCode: FORGED }] }),
    [{ id: 'slope', label: 'Slope', isComplete: true, isCorrect: false, response: '-2' }]);
  // …and what it returns is still what the attempt recorder receives.
  const engine = readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');
  const handler = executableSource(region(engine, 'const handleMissingToolAction = async', 'const handleModelingLabGrade', 'registry tool forwarder'));
  assert.match(handler, /const parts = toolSubmissionParts\(payload\?\.metadata\);/);
  assert.doesNotMatch(handler, /misconception/i);
});

test('the attempt recorder keeps no code on a part, and its parts keep exactly their earlier shape', () => {
  const outcome = recordQuestionAttempt({ record: null, isCorrect: false, parts: forgedParts(), maximumAttempts: 3 });
  outcome.record.partGrades.forEach((part) => assert.deepEqual(Object.keys(part), LEGACY_PART_KEYS));
  outcome.result.partGrades.forEach((part) => assert.deepEqual(Object.keys(part), LEGACY_PART_KEYS));
});

test('ingestion of a record it cannot re-mark drops a claimed code from the stored record, and the event names none', () => {
  // A record built outside the attempt policy, as a modified client would send it.
  const clientRecord = { status: 'attempted', attemptCount: 1, totalAttempts: 1, partGrades: forgedParts().map((part) => ({ ...part, graded: true, weight: 1, credit: 0 })) };
  const built = ingest(clientRecord);
  assert.equal(built.blocked, false);
  assert.equal(built.gradedBy, 'client');
  assert.equal(built.record.partGrades.length, 2, 'the parts themselves are kept');
  built.record.partGrades.forEach((part) => assert.equal('misconceptionCode' in part, false));
  assert.deepEqual(Object.keys(built.evidenceEvent.performance), LEGACY_PERFORMANCE_KEYS);
});

test('the evidence builder does not read part codes off the record it is handed', () => {
  const record = { status: 'attempted', totalAttempts: 1, attemptCount: 1, partGrades: forgedParts() };
  const event = buildAttemptEvidenceEvent({ studentId: STUDENT_ID, assignment, question: toolQuestion, questionIndex: 0, activityRole: 'classwork', attemptRecord: record, attemptResult: { isCorrect: false } });
  assert.deepEqual(Object.keys(event.performance), LEGACY_PERFORMANCE_KEYS);
});

test('a code written onto grades/{sid} or a bare code list on an event never reaches the case review', () => {
  const built = ingest({ status: 'attempted', attemptCount: 1, totalAttempts: 1 });
  const record = { ...built.record, partGrades: forgedParts() };
  const event = { ...built.evidenceEvent, performance: { ...built.evidenceEvent.performance, misconceptionCodes: [FORGED] } };
  const evidence = buildCaseEvidenceResponse({
    request: { studentId: STUDENT_ID, assignmentIds: [assignment.id], fromMs: CAPTURED_AT - 86_400_000, toMs: INGESTED_AT + 86_400_000 },
    events: [{ id: event.eventKey, data: event }],
    nowMs: INGESTED_AT,
  });
  assert.equal('misconceptionCodes' in evidence.attemptEvents[0].performance, false);
  const analysis = analyzeAssignmentQuestions({
    assignment,
    student: { id: STUDENT_ID, classId: 'class-synthetic', gradesByAssignment: { [assignment.id]: { 0: record } } },
    attemptEvents: [{ ...evidence.attemptEvents[0], performance: { ...evidence.attemptEvents[0].performance, misconceptionCodes: [FORGED] } }],
  });
  assert.deepEqual(analysis.questions[0].misconceptionCodes, []);
  assert.equal(errorPatternForQuestion(analysis.questions[0]).statement, ERROR_PATTERN_NOT_DETERMINABLE);
});
