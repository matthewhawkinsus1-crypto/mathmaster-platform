/*
 * A PIN'S SUPPORT MUST BE ONE THE STUDENT HOLDS (SI03, VH-48).
 *
 * A Question Family can narrow its numbers for a student support
 * (`supportConstraints`, "reduce-complexity"), and the delivery pin names the
 * support its instance was built under. The server rebuilt and graded that
 * instance on the pin's word, so a student with no such support could send a
 * pin for the narrower, easier list. Now the support is checked against the
 * student's own profile, read the way their app reads it, and a pin naming a
 * support they do not hold is refused — held for a teacher, never graded as
 * the other instance (whose numbers differ, so an entitled student's right
 * answer would be marked wrong).
 *
 * Proven here: the grant reads the profile exactly as the student's app does;
 * the grading resolver refuses the forged pin and accepts the entitled one;
 * the canonical record's own delivery keeps its support after a plan ends;
 * ingestion holds the forged work and still credits the entitled student's
 * right answer, even when the support ended before the queue drained; and the
 * deadline finalizer refuses the forged pin too.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { familySupportsGranted, resolveServerGradingQuestion } from '../../functions/shared/questionFamilyGrading.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import {
  learnerToken,
  resolveGenerationAllocation,
  resolveLearnerSeat,
} from '../../functions/shared/questionGenerationIdentity.mjs';
import { buildIngestedAttempt, normalizeSubmissionEnvelope } from '../../functions/shared/submissionIngestion.mjs';
import { buildSubmissionEnvelope } from '../../functions/shared/submissionEnvelope.mjs';
import { verifyCheckpointAuthorization } from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { RESPONSE_CHECKPOINT_SCHEMA_VERSION } from '../../functions/shared/responseCheckpointSchema.mjs';
import { normalizeStudentProfile } from '../../src/studentSupport.js';

const SUPPORT = 'reduce-complexity';
const CLASS = 'C1';
const ASSIGNMENT_ID = 'A-support';
const SLOT = {
  questionId: 'kc-1',
  type: 'multiAnswer',
  prompt: 'Describe the line.',
  activityRole: 'dol',
  questionFamily: { id: 'linear.keyCharacteristics' },
};
const ASSIGNMENT = {
  id: ASSIGNMENT_ID,
  schemaVersion: 5,
  releaseAt: '2026-09-01T00:00:00Z',
  assignedClassIds: [CLASS],
  sections: [{ id: 'dol', role: 'dol', questions: [SLOT] }],
  generationSeats: {
    version: 1,
    byClassId: { [CLASS]: { [learnerToken(ASSIGNMENT_ID, 'S-plain')]: 2, [learnerToken(ASSIGNMENT_ID, 'S-iep')]: 5 } },
  },
};

// Chicago days (the profile's time zone): the work, and the queue draining.
const OCT_19 = Date.parse('2026-10-19T17:00:00Z');
const OCT_21 = Date.parse('2026-10-21T17:00:00Z');

const window = (effectiveStart, modifications, status = 'active') => ({
  revisionId: `rev-${effectiveStart}`,
  revision: 1,
  status,
  effectiveStart,
  effectiveEnd: null,
  inclusionStatus: false,
  accommodations: [],
  modifications: modifications.map((id) => ({ id, params: {}, appliesTo: [] })),
  translationLanguage: null,
});
const planRow = (windows) => ({ classId: CLASS, profile: { supportPlan: { schemaVersion: 1, windows, entitledIds: [] } } });

const ROWS = Object.freeze({
  plain: { classId: CLASS, profile: { accommodations: ['large-text'], modifications: [] } },
  iep: { classId: CLASS, profile: { modifications: [SUPPORT] } },
  // A row saved before profiles had their own field: the app reads the row.
  preProfileRow: { classId: CLASS, modifications: [SUPPORT] },
  planGranting: planRow([window('2026-09-01', [SUPPORT])]),
  inactivePlan: planRow([window('2026-09-01', [SUPPORT], 'inactive')]),
  // The teacher ended the modification from October 20.
  supportEnding: planRow([window('2026-09-01', [SUPPORT]), window('2026-10-20', [])]),
  // …or began it on October 20.
  supportStarting: planRow([window('2026-09-01', []), window('2026-10-20', [SUPPORT])]),
});

// What the student's app decides (App.jsx: normalizeStudentProfile(studentData.profile || studentData),
// then problemGenerator's studentHasSupport): the support it builds the question under.
const appGrants = (row, nowValue) => {
  const view = normalizeStudentProfile(row.profile || row, { nowValue });
  return [...view.accommodations, ...view.modifications].includes(SUPPORT);
};

const deliver = (studentId, { support = null } = {}) => {
  const seatInfo = resolveLearnerSeat({ assignment: ASSIGNMENT, studentId, classId: CLASS });
  const delivered = resolveFamilyQuestionInstance({
    question: SLOT,
    assignmentId: ASSIGNMENT_ID,
    storageIndex: 0,
    allocation: resolveGenerationAllocation({ sectionMode: 'personalized', seatInfo, variant: 0 }),
    support,
  });
  assert.equal(delivered.error, null);
  return delivered;
};

const rightAnswer = (question) => ({
  kind: 'fields',
  fields: question.answerFields.map((field) => ({ id: field.id, value: String(field.answer) })),
});

test('the grant reads a profile exactly as the student\'s app does, at every moment it is asked about', () => {
  for (const [name, row] of Object.entries(ROWS)) {
    for (const moment of [OCT_19, OCT_21]) {
      assert.equal(
        familySupportsGranted(row, { at: [moment] }).includes(SUPPORT),
        appGrants(row, moment),
        `${name} on ${new Date(moment).toISOString().slice(0, 10)}`,
      );
    }
  }
  assert.equal(familySupportsGranted(ROWS.preProfileRow, { at: [OCT_19] }).includes(SUPPORT), true, 'a row with no profile field is read whole, as the app reads it');
  assert.equal(familySupportsGranted(ROWS.inactivePlan, { at: [OCT_19] }).includes(SUPPORT), false, 'an inactive plan grants nothing');
  // Granted at ANY moment given: the day the work was done or the day it arrived.
  assert.equal(familySupportsGranted(ROWS.supportEnding, { at: [OCT_19, OCT_21] }).includes(SUPPORT), true);
  assert.equal(familySupportsGranted(ROWS.supportStarting, { at: [OCT_19, OCT_21] }).includes(SUPPORT), true);
  // A moment nobody recorded is skipped, not read as 1970.
  assert.deepEqual(familySupportsGranted(ROWS.supportEnding, { at: [null, OCT_21] }), []);
  assert.deepEqual(familySupportsGranted(null, { at: [OCT_19] }), [], 'no row, no supports');
});

test('the grading resolver refuses a pin whose support the student does not hold, and accepts it from a student who does', () => {
  const supportedForPlain = deliver('S-plain', { support: SUPPORT });
  const ordinaryForPlain = deliver('S-plain');
  assert.notEqual(supportedForPlain.delivery.fingerprint, ordinaryForPlain.delivery.fingerprint, 'the support narrows the numbers: another instance');
  const resolveAs = (studentId, claimedDelivery, grantedSupports, extra = {}) => resolveServerGradingQuestion({
    assignment: ASSIGNMENT, question: SLOT, questionIndex: 0, variantIndex: 0, claimedDelivery, studentId, classId: CLASS, grantedSupports, ...extra,
  });

  // A student without the support sends a pin built under it, at their own seat.
  const forged = resolveAs('S-plain', supportedForPlain.delivery, familySupportsGranted(ROWS.plain, { at: [OCT_19] }));
  assert.equal(forged.question, null);
  assert.equal(forged.refused, true, 'held for a teacher, never graded on the browser\'s word');
  assert.equal(forged.reason, 'family-pin-support-not-granted');

  // The same kind of pin from a student whose plan grants it is theirs.
  const supportedForIep = deliver('S-iep', { support: SUPPORT });
  const entitled = resolveAs('S-iep', supportedForIep.delivery, familySupportsGranted(ROWS.iep, { at: [OCT_19] }));
  assert.equal(entitled.reason, null);
  assert.equal(entitled.question.familyInstance.fingerprint, supportedForIep.delivery.fingerprint, 'graded against the instance they were shown');

  // A pin with no support is never refused for it: the ordinary list is never easier.
  assert.equal(resolveAs('S-plain', ordinaryForPlain.delivery, []).reason, null);
  assert.equal(resolveAs('S-iep', deliver('S-iep').delivery, familySupportsGranted(ROWS.iep, { at: [OCT_19] })).reason, null);

  // The canonical record's own delivery keeps its support after the plan ends:
  // the server accepted it with the first answer, and the question was started.
  const canonical = resolveAs('S-iep', supportedForIep.delivery, [], { canonicalRecord: { variantIndex: 0, familyDelivery: supportedForIep.delivery } });
  assert.equal(canonical.reason, null);
  assert.equal(canonical.pin.fingerprint, supportedForIep.delivery.fingerprint);

  // A caller that does not check (a teacher's inspection, a regrade of
  // records already accepted) keeps exactly the old behaviour.
  assert.equal(resolveAs('S-plain', supportedForPlain.delivery, null).reason, null);
});

const ingest = ({ studentId, gradeDocument, delivered, capturedAt = OCT_19, ingestedAt = OCT_19 + 60_000 }) => {
  const envelope = Object.assign(normalizeSubmissionEnvelope(buildSubmissionEnvelope({
    actionId: `act-${studentId}-${capturedAt}`,
    kind: 'ordinarySubmission',
    studentId,
    assignmentId: ASSIGNMENT_ID,
    questionIndex: 0,
    questionId: SLOT.questionId,
    activityRole: 'dol',
    capturedAt,
    previousTotalAttempts: 0,
    // A browser record claiming full marks: never consulted when the server grades.
    record: { status: 'correct', attemptCount: 1, totalAttempts: 1, partialCredit: 100, bestPartialCredit: 100 },
    response: rightAnswer(delivered.question),
    familyDelivery: delivered.delivery,
  })), { studentId });
  return buildIngestedAttempt({
    envelope, assignment: ASSIGNMENT, question: SLOT, canonicalRecord: null, gradeDocument, ingestedAt,
  });
};

test('ingestion holds work on a forged support pin, and credits the entitled student\'s right answer — even after the support ended', () => {
  const forged = ingest({ studentId: 'S-plain', gradeDocument: ROWS.plain, delivered: deliver('S-plain', { support: SUPPORT }) });
  assert.equal(forged.blocked, true, 'kept for a teacher (needs-review), not credited');
  assert.equal(forged.reason, 'family-pin-support-not-granted');

  const entitled = ingest({ studentId: 'S-iep', gradeDocument: ROWS.iep, delivered: deliver('S-iep', { support: SUPPORT }) });
  assert.equal(entitled.blocked, false);
  assert.equal(entitled.gradedBy, 'server');
  assert.equal(entitled.record.status, 'correct', 'a right answer stays right');
  assert.equal(entitled.record.familyDelivery.support, SUPPORT, 'and the canonical pin keeps the support it was shown under');

  // Answered on October 19 under the plan; the queue drained on the 21st,
  // after the teacher ended the modification.
  const late = ingest({
    studentId: 'S-iep', gradeDocument: { ...ROWS.supportEnding }, delivered: deliver('S-iep', { support: SUPPORT }), capturedAt: OCT_19, ingestedAt: OCT_21,
  });
  assert.equal(late.blocked, false);
  assert.equal(late.record.status, 'correct', 'entitled when they answered: still credited');
});

test('the deadline finalizer refuses a forged support pin and finalizes the entitled student\'s', () => {
  const checkpointFor = (studentId, delivered) => ({
    schemaVersion: RESPONSE_CHECKPOINT_SCHEMA_VERSION,
    studentId,
    assignmentId: ASSIGNMENT_ID,
    classId: CLASS,
    questionIndex: 0,
    questionId: SLOT.questionId,
    activityRole: 'dol',
    variantIndex: 0,
    familyDelivery: delivered.delivery,
    response: rightAnswer(delivered.question),
    isComplete: true,
    serverAcknowledgedAt: new Date(OCT_19),
  });
  const authorize = (studentId, gradeDocument, delivered) => verifyCheckpointAuthorization({
    checkpoint: checkpointFor(studentId, delivered),
    assignment: ASSIGNMENT,
    gradeDocument: { ...gradeDocument, studentId },
    gradeDocumentId: studentId,
    question: SLOT,
    now: OCT_19 + 3_600_000,
  });
  const forged = authorize('S-plain', ROWS.plain, deliver('S-plain', { support: SUPPORT }));
  assert.equal(forged.ok, false);
  assert.equal(forged.unsupported, true, 'closed as a question the server could not grade, writing no grade');
  assert.equal(forged.reason, 'unsupported-question:family-pin-support-not-granted');

  const entitled = authorize('S-iep', ROWS.iep, deliver('S-iep', { support: SUPPORT }));
  assert.equal(entitled.ok, true, entitled.reason);
  assert.equal(entitled.family.pin.support, SUPPORT);
});
