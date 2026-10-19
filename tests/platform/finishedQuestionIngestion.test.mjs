/*
 * A FINISHED QUESTION RECORDS NOTHING MORE — NOT EVEN WHO LAST TOUCHED IT.
 *
 * Found by running the lmr-wu-1 Warm-Up reopen lifecycle against the real
 * Cloud Functions (tests/integration/warmupReopen): the deadline auto-submitted
 * Q1's third attempt and closed it, the teacher reopened the Warm-Up, and a
 * Check that still reached ingestion came back ACCEPTED with no attempt
 * counted — while ingestOneSubmission restamped the closed record as that
 * Check's (`lastSubmissionId`, `submissionOrigin`), replaced the teacher's
 * evidence of the auto-submitted response with the uncounted one, overwrote
 * the third attempt's evidence event (keyed by attempt number) and marked the
 * deadline's checkpoint "explicitly submitted".
 *
 * `buildIngestedAttempt` now reports such a delivery as `final`, and
 * functions/index.js retires it as SUPERSEDED, writing only its receipt. The
 * emulator suite proves the whole server state is untouched; these are the
 * same decisions at unit speed, plus the orchestration contract.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as ingestion from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope, normalizeSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { SUBMISSION_DISPOSITION } from '../../functions/shared/studentSubmissionDisposition.mjs';
import { getQuestionCredit, normalizeQuestionRecord } from '../../functions/shared/attemptPolicy.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import {
  DAY,
  checkSort,
  checkpointSort,
  createDevice,
  finalizeLikeServer,
  gradeDocumentFor,
  ingestLikeServer,
  lmrAssignment,
  openQuestion,
  recordOf,
  runtimeQuestions,
  saveSort,
  sortFor,
  teacherWarmup,
  at,
} from './helpers/warmupServerLifecycle.mjs';

const { buildIngestedAttempt, questionIsFinal } = ingestion;

/* ------------------------------------------------------- the incident's Q1 */

test('lmr-wu-1: a Check reaching ingestion after the deadline closed the question is final — nothing to write', async () => {
  const STUDENT = 'student-final';
  const assignment = lmrAssignment({ studentIds: [STUDENT] });
  const chromebook = createDevice(STUDENT);
  let server = gradeDocumentFor(STUDENT);
  const opened = await openQuestion(chromebook, { assignment, nowMs: at(DAY, '08:01') });
  let session;
  for (const [hhmm, how] of [['08:02', 'all-a'], ['08:04', 'all-b']]) {
    const sort = sortFor(opened.processed, how);
    await saveSort(chromebook, opened, sort);
    const checked = await checkSort(chromebook, opened, { sort, sessionRecord: session, capturedAt: at(DAY, hhmm) });
    server = ingestLikeServer({ envelope: checked.envelope, assignment, gradeDocument: server, now: at(DAY, hhmm, 2) }).gradeDocument;
    session = checked.sessionRecord;
  }
  const lastSort = sortFor(opened.processed, 'one-off');
  await saveSort(chromebook, opened, lastSort);
  const checkpoint = await checkpointSort(chromebook, opened, { sort: lastSort, sessionRecord: session, capturedAt: at(DAY, '08:06') });
  server = finalizeLikeServer({ checkpoint, assignment, gradeDocument: server, now: at(DAY, '08:11') }).gradeDocument;
  const closed = recordOf(server, assignment.id);
  assert.equal(closed.status, 'expired');
  assert.equal(closed.submissionOrigin, 'deadline-auto-submit');

  // The teacher reopens the Warm-Up, and a correct sort arrives from a screen
  // that knew all three attempts: the ordinary classifier has nothing against
  // it (no older attempt count, an open section at capture)...
  const reopened = teacherWarmup(assignment, 'reopen', at(DAY, '08:15'), DAY);
  const reopenedQuestion = await openQuestion(chromebook, { assignment: reopened, record: closed, nowMs: at(DAY, '08:16') });
  const late = await checkSort(chromebook, reopenedQuestion, { sort: sortFor(reopenedQuestion.processed, 'correct'), sessionRecord: closed, capturedAt: at(DAY, '08:20') });
  const envelope = ingestion.normalizeSubmissionEnvelope(JSON.parse(JSON.stringify(late.envelope)));
  envelope.studentId = STUDENT;
  assert.equal(envelope.previousTotalAttempts, 3);

  // ...and the attempt builder says the question is finished.
  const built = buildIngestedAttempt({
    envelope,
    assignment: reopened,
    question: runtimeQuestions(reopened)[0],
    canonicalRecord: closed,
    gradeDocument: server,
    ingestedAt: at(DAY, '08:20', 2),
  });
  assert.equal(built.blocked, false);
  assert.equal(built.final, true);
  assert.equal(built.reason, 'question-already-final');
  assert.equal(built.gradingEvidence, undefined, 'no response evidence is built to replace the counted one');
  assert.equal(built.evidenceEvent, undefined, 'no evidence event is built over the third attempt\'s');
  assert.deepEqual(built.record, normalizeQuestionRecord(closed), 'the record as it stands, provenance included');
  assert.equal(built.record.lastSubmissionId, closed.lastSubmissionId);
  assert.equal(getQuestionCredit(built.record), getQuestionCredit(closed));

  // The server's orchestration (as functions/index.js does it) writes nothing but a receipt.
  const delivered = ingestLikeServer({ envelope: late.envelope, assignment: reopened, gradeDocument: server, now: at(DAY, '08:20', 2) });
  assert.equal(delivered.receipt.disposition, SUBMISSION_DISPOSITION.SUPERSEDED);
  assert.deepEqual(delivered.gradeDocument, server);
});

/* --------------------------------------------- what "finished" means, exactly */

const ASSIGNMENT = Object.freeze({ id: 'A1', schemaVersion: 5, releaseAt: '2026-09-01T00:00:00Z' });
const CAPTURED_AT = Date.parse('2026-09-14T15:00:00Z');
const LITERAL = Object.freeze({ questionId: 'q-lit', type: 'literal', prompt: 'Solve A = bh for h.', equation: 'A = bh', solveFor: 'h', acceptedAnswers: ['A/b'] });
const answer = (value) => ({ kind: 'scalar', type: 'literal', value, fields: [] });
let serial = 0;

const deliver = ({
  canonical,
  kind = 'ordinarySubmission',
  question = { ...LITERAL, activityRole: 'classwork' },
  response = answer('A/b'),
  record = null,
  assignment = ASSIGNMENT,
  classId = null,
}) => buildIngestedAttempt({
  envelope: normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-final-${(serial += 1)}`,
    kind,
    studentId: 'S1',
    assignmentId: assignment.id,
    questionIndex: 0,
    questionId: question.questionId,
    variantIndex: normalizeQuestionRecord(canonical).variantIndex,
    activityRole: question.activityRole,
    capturedAt: CAPTURED_AT,
    previousTotalAttempts: normalizeQuestionRecord(canonical).totalAttempts,
    record: record || { ...normalizeQuestionRecord(canonical), totalAttempts: normalizeQuestionRecord(canonical).totalAttempts + 1 },
    response,
  })),
  assignment,
  question,
  canonicalRecord: canonical,
  gradeDocument: { classId },
  ingestedAt: CAPTURED_AT + 1000,
});

test('a correct question and an expired one with no attempt left are final; their records come back as they stand', () => {
  const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100, lastSubmissionId: 'act-original' };
  const wrongAfterCorrect = deliver({ canonical: correct, response: answer('WRONG') });
  assert.equal(wrongAfterCorrect.final, true);
  assert.equal(wrongAfterCorrect.record.status, 'correct');
  assert.equal(wrongAfterCorrect.record.lastSubmissionId, 'act-original');

  const exhausted = { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 40, lastSubmissionId: 'act-third' };
  const rightAfterExpired = deliver({ canonical: exhausted });
  assert.equal(rightAfterExpired.final, true);
  assert.equal(rightAfterExpired.record.status, 'expired', 'a correct answer after the last attempt earns nothing');
  assert.equal(rightAfterExpired.record.lastSubmissionId, 'act-third');
  assert.equal(getQuestionCredit(rightAfterExpired.record), 0.4);

  // A step does not finish anything either.
  assert.equal(deliver({ canonical: correct, kind: 'stepSubmission', response: answer('WRONG') }).final, true);
});

test('an attempt still owed is not final: an unfinished question, and a DOL a teacher granted another try', () => {
  const inProgress = deliver({ canonical: { status: 'attempted', attemptCount: 2, totalAttempts: 2, partialCredit: 0 } });
  assert.equal(inProgress.final, undefined);
  assert.equal(inProgress.gradedBy, 'server');
  assert.equal(inProgress.record.status, 'correct');
  assert.equal(inProgress.record.totalAttempts, 3);

  const dolQuestion = { ...LITERAL, questionId: 'q-dol', activityRole: 'dol' };
  const usedItsOneTry = { status: 'expired', attemptCount: 1, totalAttempts: 1, partialCredit: 0 };
  assert.equal(deliver({ canonical: usedItsOneTry, question: dolQuestion, classId: 'class-1' }).final, true, 'one DOL attempt, used');
  const granted = deliver({
    canonical: usedItsOneTry,
    question: dolQuestion,
    classId: 'class-1',
    assignment: { ...ASSIGNMENT, dol: { attemptGrantsByClassId: { 'class-1': { extraAttempts: 1 } } } },
  });
  assert.equal(granted.final, undefined, 'the teacher\'s grant raises the server\'s own limit');
  assert.equal(granted.record.status, 'correct');
  assert.equal(granted.record.totalAttempts, 2);
});

test('a replacement is the one delivery a finished question still takes', () => {
  const exhausted = { status: 'expired', attemptCount: 3, totalAttempts: 3, partialCredit: 40, bestPartialCredit: 40, variantIndex: 0 };
  const replaced = deliver({
    canonical: exhausted,
    kind: 'questionReplacement',
    response: null,
    record: { status: 'unattempted', attemptCount: 0, totalAttempts: 0, bestPartialCredit: 0, variantIndex: 1 },
  });
  assert.equal(replaced.final, undefined);
  assert.equal(replaced.record.variantIndex, 1);
  assert.equal(replaced.record.status, 'unattempted');
});

test('questionIsFinal is the attempt policy\'s own rule', () => {
  assert.equal(questionIsFinal({ status: 'correct', attemptCount: 1 }, 3), true);
  assert.equal(questionIsFinal({ status: 'expired', attemptCount: 3 }, 3), true);
  assert.equal(questionIsFinal({ status: 'expired', attemptCount: 3 }, 4), false, 'another attempt is owed');
  assert.equal(questionIsFinal({ status: 'attempted', attemptCount: 3 }, 3), false);
  assert.equal(questionIsFinal(null, 3), false);
});

/* ----------------------------------- functions/index.js writes only a receipt */

// ingestOneSubmission cannot be imported here (Admin SDK at module scope);
// the emulator suite runs it. This pins its handling of `built.final`.
const ingestBody = executableSource(region(
  fs.readFileSync('functions/index.js', 'utf8'),
  'async function ingestOneSubmission({ db, studentId, envelope, now',
  'exports.ingestStudentSubmissions = onCall(async (request) => {',
  'ingestOneSubmission',
));

test('ingestOneSubmission retires a final delivery before any canonical write, with a receipt and nothing else', () => {
  const build = ingestBody.indexOf('ingestion.buildIngestedAttempt(');
  const branch = ingestBody.indexOf('if (built.final) {', build);
  const firstGradeWrite = ingestBody.indexOf('transaction.update(gradeRef', build);
  const evidenceWrite = ingestBody.indexOf('RESPONSE_INSPECTION_EVIDENCE_COLLECTION', build);
  const checkpointWrite = ingestBody.indexOf('"explicitly-submitted"', build);
  assert.ok(build > -1 && branch > build, 'the final branch follows the attempt builder');
  [firstGradeWrite, evidenceWrite, checkpointWrite].forEach((write) => assert.ok(write > branch, 'and precedes every write about the question'));

  const body = ingestBody.slice(branch, ingestBody.indexOf('\n    }\n', branch));
  assert.match(body, /transaction\.set\(receiptRef,[\s\S]*disposition: dispositions\.SUBMISSION_DISPOSITION\.SUPERSEDED,\s*reason: built\.reason/);
  assert.match(body, /return \{[\s\S]*disposition: dispositions\.SUBMISSION_DISPOSITION\.SUPERSEDED,\s*reason: built\.reason/);
  assert.equal((body.match(/transaction\.(set|update)\(/g) || []).length, 1, 'the receipt is the only write');
});
