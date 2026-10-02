/*
 * A MODELING LAB'S GRADEBOOK ATTEMPT COMES FROM THE SERVER'S EVALUATION.
 *
 * The submitModelingLab callable evaluates a lab and writes the result to a
 * server-owned marker. Before this change the browser relayed that result as
 * an ordinary attempt and ingestion accepted it through the sanitized client
 * path, so mastery could be claimed without any evaluation. These tests pin
 * the replacement: ingestion records the attempt from the marker, checks every
 * identity against what the server knows, and holds anything unverifiable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModelingLabResponse,
  gradeModelingLabEvaluation,
  modelingLabSubmissionReference,
  selectModelingLabMarker,
} from '../../functions/shared/serverGrading/modelingLabGrading.mjs';
import { buildIngestedAttempt, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';

const QUESTION = { questionId: 'lab-q', type: 'modelingLab', labDefinition: { labId: 'lab-1' }, activityRole: 'classwork' };
const EVALUATION = { isMastered: false, compositeScore: 0.72, rubricBreakdown: { modelAccuracy: 90, hypothesisCompleteness: 60, writtenJustificationCompleteness: 88 } };
const marker = (patch = {}) => ({ studentId: 'S1', assignmentId: 'A1', labId: 'lab-1', submissionId: 'sub-1', createdAt: 100, result: { success: true, evaluation: EVALUATION }, ...patch });

const ingest = ({ response, modelingLabMarker, record = { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100 } }) => buildIngestedAttempt({
  envelope: normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: 'act-lab', kind: 'ordinarySubmission', studentId: 'S1', assignmentId: 'A1', questionIndex: 0,
    questionId: 'lab-q', activityRole: 'classwork', capturedAt: Date.parse('2026-09-14T15:00:00Z'), record, response,
  })),
  assignment: { id: 'A1', releaseAt: '2026-09-01T00:00:00Z' },
  question: QUESTION,
  canonicalRecord: null,
  ingestedAt: Date.parse('2026-09-14T15:00:05Z'),
  modelingLabMarker,
});

test('the Modeling Lab is declared a specialized server subsystem', () => {
  const support = serverResponseGradingSupport(QUESTION);
  assert.equal(support.authority, GRADING_AUTHORITY.SPECIALIZED_SUBSYSTEM);
  assert.equal(support.supported, false, 'it is not graded by the shared dispatch — its own subsystem owns it');
});

test('the attempt the browser queues names the evaluation and carries no verdict', () => {
  const response = buildModelingLabResponse({ question: QUESTION, labId: 'lab-1', submissionId: 'sub-1' });
  assert.deepEqual(JSON.parse(response.value), { labId: 'lab-1', submissionId: 'sub-1' });
  assert.deepEqual(modelingLabSubmissionReference(response), { labId: 'lab-1', submissionId: 'sub-1' });
  assert.deepEqual(modelingLabSubmissionReference({ kind: 'opaque', value: 'lab:lab-1:72' }), { labId: 'lab-1', submissionId: null }, 'an older client names the lab only');
});

test('ingestion records the attempt from the server marker, not from the forged browser record', () => {
  const built = ingest({ response: buildModelingLabResponse({ question: QUESTION, labId: 'lab-1', submissionId: 'sub-1' }), modelingLabMarker: marker() });
  assert.equal(built.blocked, false);
  assert.equal(built.gradedBy, 'server');
  assert.equal(built.record.status, 'attempted', 'the browser claimed correct; the evaluation says not mastered');
  assert.equal(built.record.partialCredit, 72);
  assert.equal(built.record.modelingLabSubmissionId, 'sub-1');
  assert.equal(built.gradingEvidence.graderVersion, 'modeling-lab-server-evaluation-v1');
});

test('the browser shows exactly what the gradebook records, from the same evaluation', () => {
  const browserInputs = attemptInputsFromGrading(gradeModelingLabEvaluation(EVALUATION));
  const browserRecord = recordQuestionAttempt({ record: null, ...browserInputs, maximumAttempts: 3 }).record;
  const ingested = ingest({ response: buildModelingLabResponse({ question: QUESTION, labId: 'lab-1', submissionId: 'sub-1' }), modelingLabMarker: marker() }).record;
  ['status', 'partialCredit', 'attemptCount'].forEach((key) => assert.equal(ingested[key], browserRecord[key], key));
});

test('no evaluation means no credit on the browser\'s word: the attempt is held for review', () => {
  const built = ingest({ response: buildModelingLabResponse({ question: QUESTION, labId: 'lab-1', submissionId: 'sub-1' }), modelingLabMarker: null });
  assert.deepEqual(built, { blocked: true, reason: 'modeling-lab-evaluation-missing' });
});

test('a marker for another student, assignment or lab is never used', () => {
  const reference = { labId: 'lab-1', submissionId: 'sub-1' };
  const select = (markers) => selectModelingLabMarker({ markers, studentId: 'S1', assignmentId: 'A1', question: QUESTION, reference });
  assert.equal(select([marker({ studentId: 'S2' })]), null);
  assert.equal(select([marker({ assignmentId: 'A2' })]), null);
  assert.equal(select([marker({ labId: 'lab-2' })]), null);
  assert.equal(select([marker({ submissionId: 'sub-9' })]), null, 'a named submission must be that submission');
  assert.equal(selectModelingLabMarker({ markers: [marker()], studentId: 'S1', assignmentId: 'A1', question: QUESTION, reference: { labId: 'lab-2', submissionId: null } }), null, 'the attempt cannot redirect to another lab');
  // An older client named no submission: the newest evaluation of this lab.
  const newest = selectModelingLabMarker({ markers: [marker({ submissionId: 'a', createdAt: 1 }), marker({ submissionId: 'b', createdAt: 5 })], studentId: 'S1', assignmentId: 'A1', question: QUESTION, reference: { labId: 'lab-1', submissionId: null } });
  assert.equal(newest.submissionId, 'b');
});

test('the ingestion transaction reads the server marker before writing and hands it to buildIngestedAttempt', async () => {
  const { readFileSync } = await import('node:fs');
  const { executableSource } = await import('./helpers/sourceContract.mjs');
  const source = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const start = source.indexOf('async function ingestOneSubmission(');
  const end = source.indexOf('\nasync function ', start + 10);
  const region = source.slice(start, end > start ? end : undefined);
  const markerRead = region.search(/transaction\.get\(db\.collection\("modelingLabSubmissions"\)/);
  const build = region.indexOf('ingestion.buildIngestedAttempt(');
  const firstWrite = region.search(/transaction\.(set|update)\(gradeRef/);
  assert.ok(markerRead > 0, 'the marker is read inside the ingestion transaction');
  assert.ok(build > markerRead, 'the marker is read before the attempt is built');
  assert.ok(firstWrite < 0 || firstWrite > markerRead, 'every read precedes every write');
  assert.match(region.slice(build, build + 600), /modelingLabMarker,/, 'the marker reaches buildIngestedAttempt');
});
