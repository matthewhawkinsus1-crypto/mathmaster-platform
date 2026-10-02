import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildIngestedAttempt,
  decideSubmissionIngestion,
  withAuthoritativeActivityRole,
} from '../../functions/shared/submissionIngestion.mjs';
import {
  buildSubmissionEnvelope,
  normalizeSubmissionEnvelope,
  resolveLiveSectionAccess,
} from '../../functions/shared/submissionEnvelope.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * THE ACTIVITY A SUBMISSION IS JUDGED UNDER IS ITS QUESTION'S.
 *
 * Ingestion read the role from the envelope, and an envelope with no role was
 * judged as Classwork. The device fills it in, but a row queued by an older
 * build, or a forged envelope, can leave it out: a DOL, quiz or test question
 * then allowed three attempts instead of one, a closed Practice section took
 * the work as if open, and a DOL answer missed the DOL bucket. The deadline
 * finalizer has always used the stored question's role
 * (responseCheckpointFinalizer.mjs); ingestion now does too, wherever the
 * question carries one. Synthetic identities only.
 */

const CAPTURED_AT = Date.parse('2026-09-21T15:00:00.000Z');
const dolQuestion = { questionId: 'q-dol', type: 'multiAnswer', prompt: 'Solve 2x = 8.', answerFields: [{ id: 'x', answer: '4' }], activityRole: 'dol' };
const practiceQuestion = { questionId: 'q-practice', type: 'multiAnswer', prompt: 'Solve 3x = 9.', answerFields: [{ id: 'x', answer: '3' }], activityRole: 'practice' };
const legacyQuestion = { questionId: 'q-legacy', type: 'multiAnswer', prompt: 'Solve x + 1 = 5.', answerFields: [{ id: 'x', answer: '4' }] };

const envelopeFor = (question, { activityRole, value = '3', actionId = 'act-1', previousTotalAttempts = 0, capturedSectionAccess = null } = {}) => (
  normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId,
    kind: 'ordinarySubmission',
    studentId: 'synthetic-student-1',
    assignmentId: 'synthetic-assignment-1',
    questionIndex: 0,
    questionId: question.questionId,
    activityRole,
    capturedAt: CAPTURED_AT,
    previousTotalAttempts,
    record: { status: 'incorrect', attemptCount: 1, totalAttempts: 1, partialCredit: 0 },
    response: { kind: 'multiAnswer', fields: [{ id: 'x', value }] },
    capturedSectionAccess,
  }))
);

const ingest = (question, envelope, extra = {}) => buildIngestedAttempt({
  envelope,
  assignment: { id: 'synthetic-assignment-1', questions: [question] },
  question,
  canonicalRecord: null,
  gradeDocument: { classId: 'synthetic-class-1', gradesByAssignment: {} },
  ingestedAt: CAPTURED_AT + 5_000,
  ...extra,
});

const decide = (question, envelope, liveSectionAccess = null) => decideSubmissionIngestion({
  envelope,
  assignmentExists: true,
  gradeRecordExists: true,
  authorizedForClass: true,
  assignmentClosedAtCapture: false,
  liveSectionAccess,
  question,
  canonicalRecord: null,
  now: CAPTURED_AT + 5_000,
});

test('a missing role is filled from the question; a stated one, or a question with none, is left as it is', () => {
  const missing = envelopeFor(dolQuestion, { activityRole: null });
  assert.equal(missing.activityRole, null, 'the probe envelope really carries no role');
  assert.equal(withAuthoritativeActivityRole({ envelope: missing, question: dolQuestion }).activityRole, 'dol');
  assert.equal(withAuthoritativeActivityRole({ envelope: missing, question: { ...dolQuestion, activityRole: ' DOL ' } }).activityRole, 'dol');

  const stated = envelopeFor(dolQuestion, { activityRole: 'dol' });
  assert.equal(withAuthoritativeActivityRole({ envelope: stated, question: dolQuestion }), stated, 'nothing to fill: the same envelope');

  const legacy = envelopeFor(legacyQuestion, { activityRole: 'classwork' });
  assert.equal(withAuthoritativeActivityRole({ envelope: legacy, question: legacyQuestion }), legacy, 'a question with no role is judged by what the device said');
  const legacyMissing = envelopeFor(legacyQuestion, { activityRole: null });
  assert.equal(withAuthoritativeActivityRole({ envelope: legacyMissing, question: legacyQuestion }).activityRole, null);

  assert.equal(withAuthoritativeActivityRole({ envelope: null, question: dolQuestion }), null);
});

test('a DOL question allows one attempt whether or not the envelope names the DOL', () => {
  const named = ingest(dolQuestion, envelopeFor(dolQuestion, { activityRole: 'dol' }));
  const unnamed = ingest(dolQuestion, envelopeFor(dolQuestion, { activityRole: null }));
  assert.equal(named.blocked, false);
  assert.equal(unnamed.blocked, false);
  assert.equal(named.record.status, 'expired', 'one wrong DOL attempt uses the only attempt');
  assert.equal(unnamed.record.status, 'expired', 'leaving the role out no longer buys a Classwork attempt budget');
  assert.equal(unnamed.result.remainingAttempts, 0);
  assert.deepEqual(
    { status: unnamed.record.status, attemptCount: unnamed.record.attemptCount, partialCredit: unnamed.record.partialCredit },
    { status: named.record.status, attemptCount: named.record.attemptCount, partialCredit: named.record.partialCredit },
  );
  // The evidence event is filed under the DOL as well.
  assert.equal(unnamed.evidenceEvent.source.activityRole, 'dol');
});

test('a DOL answer without a named role still reaches the DOL bucket', () => {
  const extra = { dolIndices: [0], dolSectionScore: 0 };
  const named = ingest(dolQuestion, envelopeFor(dolQuestion, { activityRole: 'dol' }), extra);
  const unnamed = ingest(dolQuestion, envelopeFor(dolQuestion, { activityRole: null }), extra);
  assert.ok(named.dolGrade, 'the DOL projection exists for a named DOL answer');
  assert.ok(unnamed.dolGrade, 'and for the same answer with the role left out');
  assert.equal(unnamed.dolDateKey, named.dolDateKey);
});

test('a closed Practice section is judged as closed when the envelope leaves its role out', () => {
  const assignment = {
    id: 'synthetic-assignment-1',
    questions: [practiceQuestion],
    sectionAccess: {
      practice: {
        defaultState: 'open',
        overridesByClassId: { 'synthetic-class-1': { state: 'closed', changedAt: new Date(CAPTURED_AT - 60_000).toISOString() } },
      },
    },
  };
  const envelope = envelopeFor(practiceQuestion, { activityRole: null });
  // What ingestOneSubmission hands decideSubmissionIngestion: the live
  // section state for the role the work is judged under.
  const judgedRole = withAuthoritativeActivityRole({ envelope, question: practiceQuestion }).activityRole;
  const live = resolveLiveSectionAccess({ assignment, activityRole: judgedRole, classId: 'synthetic-class-1' });
  assert.equal(live.enabled, true);
  assert.equal(live.isOpen, false);
  const decision = decide(practiceQuestion, envelope, live);
  assert.equal(decision.disposition, 'permanently-invalid');
  assert.equal(decision.reason, 'section-closed-at-capture');
  // Read under the envelope's own (missing) role, the section did not exist.
  const unjudged = resolveLiveSectionAccess({ assignment, activityRole: envelope.activityRole, classId: 'synthetic-class-1' });
  assert.equal(unjudged.enabled, false, 'the probe shows what the omission used to bypass');
});

test('an envelope naming a different role than its question is still held for a teacher', () => {
  const decision = decide(dolQuestion, envelopeFor(dolQuestion, { activityRole: 'classwork' }));
  assert.equal(decision.disposition, 'needs-review');
  assert.equal(decision.reason, 'activity-role-mismatch');
  assert.equal(decide(dolQuestion, envelopeFor(dolQuestion, { activityRole: null })).disposition, 'accepted');
});

test('ingestOneSubmission reads the section window and the DOL bucket under the judged role', () => {
  const source = fs.readFileSync('functions/index.js', 'utf8');
  const body = executableSource(region(
    source,
    'async function ingestOneSubmission({ db, studentId, envelope, now',
    'exports.ingestStudentSubmissions = onCall(async (request) => {',
    'ingestOneSubmission',
  ));
  assert.match(body, /const activityRole = ingestion\.withAuthoritativeActivityRole\(\{ envelope, question \}\)\?\.activityRole \|\| null;/);
  assert.match(body, /ingestion\.resolveLiveSectionAccess\(\{ assignment, activityRole, classId \}\)/);
  assert.match(body, /if \(activityRole === "dol" && dolIndices\.length\)/);
  assert.doesNotMatch(body, /envelope\.activityRole/, 'no decision in ingestion reads the claimed role directly');
});
