/*
 * THE SERVER, NOT JUST THE BROWSER, MUST HONOR AN ATTENDANCE EXTENSION.
 *
 * A per-student final-cutoff extension
 * (`assignment.studentOverrides[studentId].lateDueAt`, written by
 * src/platform/attendance/extensionReconciliation.js) is worthless if the
 * Cloud Functions deadline finalizer, submission ingestion, Practice Pass
 * eligibility, or Classroom grade passback still only ever consult the
 * class-level `assignment.lateDueAt`. Every shared module here mirrors the
 * SAME fallback chain assignmentLifecycle.js uses client-side
 * (`studentOverrides[id].lateDueAt || .dueAt || assignment.lateDueAt || ...`)
 * — these tests exercise that mirror directly, without a Functions runtime
 * or an emulator, the same way responseCheckpointFinalizer.test.mjs already
 * does for the rest of the deadline finalizer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  assignmentFinalCloseAt,
  resolveAuthoritativeClose,
} from '../../functions/shared/sectionDeadline.mjs';
import { decideCheckpointFinalization } from '../../functions/shared/responseCheckpointFinalizer.mjs';
import { CHECKPOINT_STATUS } from '../../functions/shared/responseCheckpointSchema.mjs';
import { buildResponseCheckpointAction } from '../../src/platform/performance/responseCheckpoint.js';
import { assignmentCreditLifecycle, evaluatePracticePassEligibility } from '../../functions/shared/classPointRewards.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { studentClassroomDeadlines } from '../../functions/shared/classroomStudentDeadlines.mjs';
import { createRequire } from 'node:module';

const runtime = createRequire(import.meta.url)('../../functions/lib/classroomGradeRuntime.js');

const CLASS_ID = 'class-a';
const CLASS_PERIOD = 'Period 3';
const DAY = '2026-09-14';
const SCHEDULE = {
  version: 2,
  daySchedules: { A: { periods: { [CLASS_PERIOD]: { enabled: true, start: '10:00', end: '10:50' } } } },
  weeklyDayTypes: { 1: 'A' },
  dayTypeOverrides: { [DAY]: 'A' },
  modifiedSchedules: {},
};

const CLASS_DUE = '2026-09-18T23:59:59.000Z';
const CLASS_LATE_DUE = '2026-09-25T23:59:59.000Z'; // the ordinary final cutoff
const STUDENT_EXTENDED_LATE_DUE = '2026-10-02T23:59:59.000Z'; // one meeting's absence extension

const baseAssignment = () => ({
  id: 'A1',
  assignedClassIds: [CLASS_ID],
  dueAt: CLASS_DUE,
  lateDueAt: CLASS_LATE_DUE,
  studentOverrides: {
    S1042: { lateDueAt: STUDENT_EXTENDED_LATE_DUE },
  },
});

test('assignmentFinalCloseAt extends only for the named student, and never earlier than the class cutoff', () => {
  const assignment = baseAssignment();
  assert.equal(assignmentFinalCloseAt(assignment, null, 'S1042'), Date.parse(STUDENT_EXTENDED_LATE_DUE));
  assert.equal(assignmentFinalCloseAt(assignment, null, 'S9999'), Date.parse(CLASS_LATE_DUE));
  assert.equal(assignmentFinalCloseAt(assignment), Date.parse(CLASS_LATE_DUE));
});

test('resolveAuthoritativeClose for classwork threads the per-student extension into the fallback close', () => {
  const assignment = baseAssignment();
  const forExtended = resolveAuthoritativeClose({
    assignment, activityRole: 'classwork', schedule: SCHEDULE, classId: CLASS_ID, classPeriod: CLASS_PERIOD,
    nowValue: Date.parse('2026-09-26T00:00:00.000Z'), studentId: 'S1042',
  });
  const forEveryoneElse = resolveAuthoritativeClose({
    assignment, activityRole: 'classwork', schedule: SCHEDULE, classId: CLASS_ID, classPeriod: CLASS_PERIOD,
    nowValue: Date.parse('2026-09-26T00:00:00.000Z'),
  });
  assert.equal(forExtended.closesAtMs, Date.parse(STUDENT_EXTENDED_LATE_DUE));
  assert.equal(forEveryoneElse.closesAtMs, Date.parse(CLASS_LATE_DUE));
});

const classworkQuestion = {
  questionId: 'q-classwork-1',
  type: 'multiAnswer',
  activityRole: 'classwork',
  prompt: 'Give the slope and the intercept.',
  answerFields: [{ id: 'slope', answer: '3' }, { id: 'intercept', answer: '-2' }],
};

const buildCheckpointFixture = ({ studentId, capturedAt, acknowledgedAt }) => {
  const assignment = { ...baseAssignment(), schemaVersion: 5, sections: [{ id: 's-cw', role: 'classwork', questions: [classworkQuestion] }] };
  const question = { ...classworkQuestion, activityRole: 'classwork' };
  const action = buildResponseCheckpointAction({
    identity: {
      studentId, assignmentId: 'A1', questionIndex: 0, questionId: question.questionId,
      variantIndex: 0, generationKey: `A1|${studentId}|0|variant:0`,
    },
    question,
    activityRole: 'classwork',
    answerState: {
      isComplete: true,
      parts: [
        { id: 'slope', response: '3', isComplete: true },
        { id: 'intercept', response: '-2', isComplete: true },
      ],
    },
    revision: 1,
    finalizeAt: new Date(capturedAt).toISOString(),
    finalizationReason: 'assignment-final-deadline',
    finalizationContext: { classId: CLASS_ID, classPeriod: CLASS_PERIOD },
    previousTotalAttempts: 0,
    capturedAt,
  });
  assert.ok(action, 'the client refused to build a checkpoint for this fixture');
  const checkpoint = {
    ...action.payload,
    classId: CLASS_ID,
    serverAcknowledgedAt: new Date(acknowledgedAt),
    status: CHECKPOINT_STATUS.ACTIVE,
  };
  const gradeDocument = { studentId, classId: CLASS_ID, classPeriod: CLASS_PERIOD, gradesByAssignment: {} };
  return { assignment, question, checkpoint, gradeDocument };
};

/*
 * THE CROSS-RUNTIME PROOF: an ordinary class cutoff has passed. A student
 * with an authorized attendance extension submits inside their own extended
 * window — the server must grade it for credit. A different, unextended
 * student submitting at the EXACT SAME moment must not: their work is
 * voluntary Practice Mode, non-credit, exactly as it would be without this
 * feature at all.
 */
// The finalizer sweep itself only runs (and can only finalize) once the
// authoritative close has actually arrived — so `now` here is after the
// EXTENDED cutoff, not merely after the moment the work was captured.
const AFTER_EXTENDED_CUTOFF = Date.parse('2026-10-03T00:00:00.000Z');

test('a checkpoint captured after the class cutoff but within an authorized extension finalizes for credit', () => {
  // Between the class's ordinary final cutoff (25 Sept) and the extended
  // student's own cutoff (2 Oct).
  const acknowledgedAt = Date.parse('2026-09-28T12:00:00.000Z');
  const { assignment, question, checkpoint, gradeDocument } = buildCheckpointFixture({
    studentId: 'S1042', capturedAt: acknowledgedAt, acknowledgedAt,
  });

  const decision = decideCheckpointFinalization({
    checkpoint, assignment, gradeDocument, gradeDocumentId: 'S1042', question,
    schedule: SCHEDULE, classPeriod: CLASS_PERIOD, now: AFTER_EXTENDED_CUTOFF,
  });

  assert.equal(decision.action, 'finalize');
  assert.equal(decision.status, CHECKPOINT_STATUS.AUTO_SUBMITTED);
});

test('the identical submission moment is voluntary practice, non-credit, for a student with no extension', () => {
  const acknowledgedAt = Date.parse('2026-09-28T12:00:00.000Z');
  const { assignment, question, checkpoint, gradeDocument } = buildCheckpointFixture({
    studentId: 'S9999', capturedAt: acknowledgedAt, acknowledgedAt,
  });

  const decision = decideCheckpointFinalization({
    checkpoint, assignment, gradeDocument, gradeDocumentId: 'S9999', question,
    schedule: SCHEDULE, classPeriod: CLASS_PERIOD, now: AFTER_EXTENDED_CUTOFF,
  });

  assert.equal(decision.action, 'close');
  assert.equal(decision.status, CHECKPOINT_STATUS.RECOVERED_AFTER_CLOSE);
});

test('Practice Pass eligibility (assignmentCreditLifecycle) also recognizes the extended student as credit-eligible', () => {
  const assignment = baseAssignment();
  const now = Date.parse('2026-09-26T00:00:00.000Z');
  assert.equal(assignmentCreditLifecycle(assignment, now, 'S1042').creditEligible, true);
  assert.equal(assignmentCreditLifecycle(assignment, now, 'S9999').creditEligible, false);
  assert.equal(assignmentCreditLifecycle(assignment, now).creditEligible, false);
});

test('Google Classroom grade passback resolves stage against the per-student final cutoff, not only the class one', () => {
  // Rewritten (H-116) from pinned text to behaviour. What it protects: a
  // Classroom "final" grade is never posted for an extended student before
  // their own authorized cutoff — read from THEIR private controls with the
  // server's authority, merged with any copy still on the shared document.
  const assignment = baseAssignment();
  const own = studentClassroomDeadlines({ assignment, studentId: 'S1042', privateOverride: undefined });
  assert.equal(own.finalAtMs, Date.parse(STUDENT_EXTENDED_LATE_DUE), 'the shared copy alone');
  const fromPrivate = studentClassroomDeadlines({
    assignment: { ...assignment, studentOverrides: {} }, studentId: 'S1042',
    privateOverride: { studentId: 'S1042', assignmentId: 'A1', lateDueAt: STUDENT_EXTENDED_LATE_DUE },
  });
  assert.equal(fromPrivate.finalAtMs, Date.parse(STUDENT_EXTENDED_LATE_DUE), 'the private record alone');
  assert.equal(studentClassroomDeadlines({ assignment, studentId: 'S9999', privateOverride: null }).finalAtMs, null, 'no extension: the class cutoff decides');

  // The stage: between the class cutoff and S1042's, a class-wide final
  // wake-up is progress for S1042 and final for everyone else.
  const between = Date.parse('2026-09-28T12:00:00.000Z');
  const progress = { complete: false, attempted: 1, total: 4, meaningfulProgress: true };
  const stage = (studentFinalCutoff) => runtime.resolveClassroomGradeStage({
    assignment, progress, releaseSignal: { reason: 'final-deadline' }, nowValue: between, studentFinalCutoff,
  });
  assert.equal(stage(null), 'final-deadline');
  assert.match(String(stage(own.finalAtMs)), /progress/);
  assert.equal(runtime.resolveClassroomGradeStage({
    assignment, progress, releaseSignal: null, nowValue: Date.parse('2026-10-03T00:00:00.000Z'), studentFinalCutoff: own.finalAtMs,
  }), 'final-deadline', 'and final once their own cutoff passes');

  // The whole-assignment trigger in functions/index.js runs the same rule
  // (its stage helper cannot be imported here; the emulator suite
  // tests/integration/studentAssignmentOverrides.test.mjs runs it): its own
  // cutoff comes from the lib reader above, with the student's profile.
  const source = executableSource(fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const stageHelper = region(source, 'function resolveClassroomGradeStage(', 'if (progress.complete)', 'resolveClassroomGradeStage');
  assert.match(stageHelper, /const lateDueAt = studentLateDueAt\(assignment, studentFinalCutoff\);/);
  assert.match(stageHelper, /if \(reason === "final-deadline" && !\(lateDueAt && now < lateDueAt\.getTime\(\)\)\) return "final-deadline";/);
  const reader = region(source, 'async function resolvedStudentClassroomDeadlines(', 'function resolveClassroomGradeStage(', 'resolvedStudentClassroomDeadlines');
  assert.match(reader, /classroomStudentCheckpoints\.studentClassroomDeadlinesFor\(\{ db, assignmentId, assignment, studentId, studentProfile \}\)/);
  const sync = region(source, 'exports.syncGradeToClassroom = onDocumentWritten(', 'exports.queueReleasedAssessmentGrades', 'syncGradeToClassroom');
  assert.match(sync, /await resolvedStudentClassroomDeadlines\(db, assignmentId, assignment, event\.params\.studentId, afterData\.profile \|\| null\)/);
  assert.match(sync, /resolveClassroomGradeStage\(\{[^}]*studentFinalCutoff,\s*studentDueAt,\s*\}\)/);
  // The lib reader reads the private record by the student's own id.
  const lib = executableSource(fs.readFileSync(new URL('../../functions/lib/classroomStudentCheckpoints.js', import.meta.url), 'utf8'));
  const libReader = region(lib, 'async function studentClassroomDeadlinesFor(', 'async function recordDeferredStudentCheckpoint(', 'studentClassroomDeadlinesFor');
  assert.match(libReader, /const ref = await overrideRefFor\(db, studentId, assignmentId\);/);
  assert.match(libReader, /privateOverride: privateOverrideOf\(snapshot\)/);
});

test('evaluatePracticePassEligibility threads studentId through to the lifecycle check', () => {
  const assignment = baseAssignment();
  const now = Date.parse('2026-09-26T00:00:00.000Z');
  const commonArgs = {
    assignment, assignedToClass: true, isTestCycleAssignment: false, practiceIndices: [0],
    hasCreditBearingAttempt: false, alreadyRedeemed: false, balance: 100, nowValue: now,
  };
  const forExtended = evaluatePracticePassEligibility({ ...commonArgs, studentId: 'S1042' });
  const forEveryoneElse = evaluatePracticePassEligibility({ ...commonArgs, studentId: 'S9999' });
  assert.equal(forExtended.eligible, true);
  assert.equal(forEveryoneElse.eligible, false);
});
