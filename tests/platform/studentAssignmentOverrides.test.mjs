// ONE STUDENT'S CONTROLS ON ONE ASSIGNMENT — PRIVATE, AND RESOLVED ONCE.
//
// PR #415 left a known gap (its I-4): the shared assignment every student in
// a class receives still carried each classmate's deadline entry, excusal,
// reopen and DOL attempt grant, keyed by student id. This suite pins the
// replacement (functions/shared/studentAssignmentOverrides.mjs):
//
//   * every legacy shape the platform has written resolves to the same
//     effective controls — and the same deadlines, attempts and grade status —
//     before and after migration, for the client and the server alike;
//   * the precedence (class due, late window, individual extension, extra
//     time, excusal, reopen, attempt grants) is one pinned definition;
//   * the dual-read merge never loses a grant made in either place;
//   * a student's in-memory view carries only their own controls, and a
//     teacher's view never puts a private value where a teacher write would
//     carry it back to the shared document;
//   * the writers mirror while previous-release clients read the shared copy
//     and delete it once retired, and the record never carries support data,
//     reasons or emails;
//   * a copy or a deleted student leaves nothing behind.
//
// Rules: tests/rules/studentAssignmentOverrideRules.test.mjs (emulator).
// Callables, migration, ingestion and the finalizer against Firestore:
// tests/integration/studentAssignmentOverrides.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OVERRIDE_CHANGE,
  STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION,
  auditEntryStudentIds,
  buildAssignmentOverrideArchive,
  buildStudentOverrideRecord,
  legacyStudentIds,
  mergeStudentOverride,
  overrideAuthorizationContext,
  overrideEntryFor,
  overrideEventId,
  perStudentSharedDataChanged,
  planSharedAssignmentStrip,
  planSharedCopyWrites,
  planStudentAbsorption,
  planStudentOverrideChange,
  resolveOverrideStorageMode,
  resolveStudentDeadlines,
  resolveStudentDolExtraAttempts,
  resolveStudentOverride,
  scrubStudentFromArchive,
  sharedAssignmentFullyAbsorbed,
  sharedAssignmentIsClean,
  stableDigest,
  studentAssignmentOverrideId,
  studentAssignmentView,
  teacherAssignmentView,
} from '../../functions/shared/studentAssignmentOverrides.mjs';
import { assignmentFinalCloseAt, resolveAuthoritativeClose } from '../../functions/shared/sectionDeadline.mjs';
import { resolveTeacherGrantedExtraAttempts } from '../../functions/shared/attemptPolicy.mjs';
import { assignmentCreditLifecycle } from '../../functions/shared/classPointRewards.mjs';
import { withStudentSupportDates } from '../../functions/shared/supportDeadline.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import {
  PER_STUDENT_ASSIGNMENT_FIELDS,
  assignmentInstanceStatePaths,
  stripAssignmentInstanceState,
} from '../../functions/shared/assignmentPrivacy.mjs';
import { getAssignmentDate, getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { assignmentIsExcusedForStudent, assignmentIsReopenedForStudent } from '../../src/platform/student/studentGradeCenterModel.js';
import { resolveStudentFinalDeadlineFromAssignment } from '../../src/platform/gradeTransfer/studentDeadlineResolver.js';
import { summarizeStudentRecovery } from '../../src/platform/assessment/assessmentRecovery.js';
import { resolveStudentExtension } from '../../src/platform/attendance/extensionReconciliation.js';
import {
  CLASS_ID,
  TEACHER,
  LEGACY_V1_DUE_ONLY,
  LEGACY_V2_FULL_EXTENSION,
  LEGACY_V3_STUB,
  LEGACY_V4_FLAGS,
  LEGACY_V5_ARRAYS,
  LEGACY_V6_DOL_OBJECT,
  LEGACY_V7_DOL_NUMBER,
  LEGACY_V8_EVERYTHING,
  NO_CONTROLS,
  ALL_STUDENTS,
  legacyAssignment,
} from '../fixtures/studentAssignmentOverrideLegacyFixtures.mjs';

const authorization = (studentId) => overrideAuthorizationContext({ studentId, student: { classId: CLASS_ID, assignedTeacherEmail: TEACHER } });

/** The migration's own planner, run per student, then the shared document stripped. */
const migrate = (assignment) => {
  const records = {};
  legacyStudentIds(assignment).forEach((studentId) => {
    const plan = planStudentAbsorption({ assignmentId: assignment.id, assignment, studentId, existingPrivate: null, authorization: authorization(studentId) });
    if (plan.record) records[studentId] = plan.record;
  });
  const stripped = applyWrites(assignment, planSharedAssignmentStrip(assignment));
  return { records, stripped };
};

/** Apply planner writes ({op, path, value}) to a plain object, as Firestore would. */
const applyWrites = (document, writes) => {
  const next = JSON.parse(JSON.stringify(document));
  writes.forEach(({ op, path, value }) => {
    let node = next;
    path.slice(0, -1).forEach((key) => { if (!node[key] || typeof node[key] !== 'object') node[key] = {}; node = node[key]; });
    const leaf = path[path.length - 1];
    if (op === 'delete') delete node[leaf];
    else if (op === 'arrayRemove') node[leaf] = (node[leaf] || []).filter((entry) => entry !== value);
    else node[leaf] = JSON.parse(JSON.stringify(value));
  });
  return next;
};

// Times that straddle every boundary in the fixture.
const TIMES = [
  '2026-09-14T12:00:00.000Z', // before release
  '2026-09-17T15:00:00.000Z', // on time
  '2026-09-22T15:00:00.000Z', // late window
  '2026-09-28T15:00:00.000Z', // after the class final, inside V1's and V2's extensions
  '2026-10-01T15:00:00.000Z',
  '2026-10-03T15:00:00.000Z',
  '2026-10-07T15:00:00.000Z',
  '2026-10-12T15:00:00.000Z', // after every extension
].map((iso) => Date.parse(iso));

/* -------------------------------------------------------------------- 12/13 */

test('12/13. every legacy shape resolves to the same student experience before and after migration — client and server', () => {
  const before = legacyAssignment();
  const { records, stripped } = migrate(before);
  assert.equal(sharedAssignmentIsClean(stripped), true, 'the migrated shared document must carry no per-student data');

  ALL_STUDENTS.forEach((studentId) => {
    const record = records[studentId] ?? null;
    // The student's own device after the migration: the clean shared document
    // plus their private record.
    const view = studentAssignmentView(stripped, { studentId, privateOverride: record });
    TIMES.forEach((now) => {
      const was = getAssignmentLifecycle(before, now, { studentId });
      assert.deepEqual(getAssignmentLifecycle(view, now, { studentId }), was, `${studentId} lifecycle at ${new Date(now).toISOString()} (student view)`);
      assert.deepEqual(getAssignmentLifecycle(stripped, now, { studentId, privateOverride: record }), was, `${studentId} lifecycle (explicit private record)`);
    });
    // The server's authoritative final cutoff (ingestion, finalizer, Recovery).
    assert.equal(
      assignmentFinalCloseAt(stripped, 'America/Chicago', studentId, null, { privateOverride: record }),
      assignmentFinalCloseAt(before, 'America/Chicago', studentId),
      `${studentId} server final cutoff`,
    );
    // Attempts the student may make on each DOL question.
    assert.equal(
      resolveTeacherGrantedExtraAttempts({ assignment: stripped, activityRole: 'dol', classId: CLASS_ID, studentId, privateOverride: record }),
      resolveTeacherGrantedExtraAttempts({ assignment: before, activityRole: 'dol', classId: CLASS_ID, studentId }),
      `${studentId} DOL attempt grant`,
    );
    // Grade Center status and Grade Transfer withholding.
    assert.equal(assignmentIsExcusedForStudent(view, studentId), assignmentIsExcusedForStudent(before, studentId), `${studentId} excused`);
    assert.equal(assignmentIsReopenedForStudent(view, studentId), assignmentIsReopenedForStudent(before, studentId), `${studentId} reopened`);
    assert.deepEqual(
      resolveStudentFinalDeadlineFromAssignment({ student: { id: studentId }, assignment: stripped, privateOverride: record }),
      resolveStudentFinalDeadlineFromAssignment({ student: { id: studentId }, assignment: before }),
      `${studentId} Grade Transfer deadline`,
    );
    // Practice Pass eligibility (server).
    TIMES.forEach((now) => assert.deepEqual(
      assignmentCreditLifecycle(stripped, now, studentId, { privateOverride: record }),
      assignmentCreditLifecycle(before, now, studentId),
      `${studentId} Practice Pass lifecycle`,
    ));
    // The DOL recovery message the student sees.
    assert.deepEqual(
      summarizeStudentRecovery({ assignment: view, classId: CLASS_ID, studentId, now: TIMES[1] }),
      summarizeStudentRecovery({ assignment: before, classId: CLASS_ID, studentId, now: TIMES[1] }),
      `${studentId} recovery summary`,
    );
  });
});

test('13. the backfill converts each legacy shape into exactly the controls it meant', () => {
  const { records } = migrate(legacyAssignment());
  const controls = (id) => {
    const { lateDueAt, extension, excused, reopened, dolExtraAttempts } = records[id];
    return { lateDueAt, extension, excused, reopened, dolExtraAttempts };
  };
  assert.deepEqual(controls(LEGACY_V1_DUE_ONLY), { lateDueAt: '2026-09-30', extension: null, excused: false, reopened: false, dolExtraAttempts: 0 });
  assert.deepEqual(controls(LEGACY_V2_FULL_EXTENSION), {
    lateDueAt: '2026-10-02T23:59:59.000Z', extension: { dateKey: '2026-10-02', grantedAt: 1758000000000 }, excused: false, reopened: false, dolExtraAttempts: 0,
  });
  assert.deepEqual(controls(LEGACY_V3_STUB).extension, { dateKey: '2026-10-05', grantedAt: 1758100000000 });
  assert.deepEqual(controls(LEGACY_V4_FLAGS), { lateDueAt: null, extension: null, excused: true, reopened: true, dolExtraAttempts: 0 });
  assert.deepEqual(controls(LEGACY_V5_ARRAYS), { lateDueAt: null, extension: null, excused: true, reopened: true, dolExtraAttempts: 0 });
  assert.equal(controls(LEGACY_V6_DOL_OBJECT).dolExtraAttempts, 2);
  // The grant keeps its count, time and reason; the student-readable record
  // names a ROLE, never the granting account (the client follow-up's rule:
  // a student never receives granting-teacher metadata). The verbatim legacy
  // value, account included, is kept in the staff-only history entry.
  assert.deepEqual(records[LEGACY_V6_DOL_OBJECT].dolAttemptGrant, { extraAttempts: 2, changedAt: '2026-09-16T15:05:00.000Z', changedBy: 'teacher', reason: 'teacher-dol-recovery' });
  const v6Plan = planStudentAbsorption({ assignmentId: 'A1', assignment: legacyAssignment(), studentId: LEGACY_V6_DOL_OBJECT, existingPrivate: null, authorization: authorization(LEGACY_V6_DOL_OBJECT) });
  assert.equal(v6Plan.event.legacy.attemptGrant.changedBy, 'uid-t', 'who granted it is still on record, for staff');
  assert.equal(controls(LEGACY_V7_DOL_NUMBER).dolExtraAttempts, 3);
  assert.deepEqual(controls(LEGACY_V8_EVERYTHING), {
    lateDueAt: '2026-10-09T23:59:59.000Z', extension: { dateKey: '2026-10-09', grantedAt: 1758200000000 }, excused: true, reopened: true, dolExtraAttempts: 1,
  });
  assert.equal(records[NO_CONTROLS], undefined, 'a student with nothing on the shared document gets no record');
  // The record is readable by the student: no reasons, no emails, no support data.
  Object.values(records).forEach((record) => {
    const text = JSON.stringify(record);
    ['sourceAbsenceDates', 'meetingsGranted', 'grantedByEmail', 'supportDueAt', 'supportFinalAt', 'supportDeadline'].forEach((key) => {
      assert.equal(text.includes(key), false, `${key} must never be stored on a student-readable record`);
    });
    assert.deepEqual(record.authorizedTeacherEmails, [TEACHER]);
    assert.equal(record.classId, CLASS_ID);
  });
});

test('13. the migration history keeps every shared value verbatim, and each student\'s share of the DOL recovery audit', () => {
  const assignment = legacyAssignment();
  const v2 = planStudentAbsorption({ assignmentId: 'A1', assignment, studentId: LEGACY_V2_FULL_EXTENSION, existingPrivate: null, authorization: authorization(LEGACY_V2_FULL_EXTENSION) });
  // Staff-only history keeps exactly what the shared document said, reasons included.
  assert.deepEqual(v2.event.legacy.studentOverridesEntry, assignment.studentOverrides[LEGACY_V2_FULL_EXTENSION]);
  assert.equal(v2.event.kind, 'migrated');
  const v6 = planStudentAbsorption({ assignmentId: 'A1', assignment, studentId: LEGACY_V6_DOL_OBJECT, existingPrivate: null, authorization: authorization(LEGACY_V6_DOL_OBJECT) });
  assert.equal(v6.auditCopies.length, 1);
  const copy = v6.auditCopies[0].event.legacy.recoveryAuditEntry;
  assert.deepEqual(copy.scope.studentIds, [LEGACY_V6_DOL_OBJECT], 'a student\'s history names only that student');
  assert.deepEqual(copy.next.extraAttemptsByStudent, { [LEGACY_V6_DOL_OBJECT]: 2 });
  assert.equal(JSON.stringify(copy).includes(LEGACY_V8_EVERYTHING), false, 'the classmate in the same grant is not in this student\'s history');
  // Deterministic ids: a rerun writes the same documents, never duplicates.
  const again = planStudentAbsorption({ assignmentId: 'A1', assignment, studentId: LEGACY_V6_DOL_OBJECT, existingPrivate: null, authorization: authorization(LEGACY_V6_DOL_OBJECT) });
  assert.equal(again.auditCopies[0].eventId, v6.auditCopies[0].eventId);
  assert.equal(again.eventId, v6.eventId);
  // The verbatim archive holds the whole removed content; the strip keeps the class-wide audit.
  const { archive } = buildAssignmentOverrideArchive({ assignmentId: 'A1', assignment });
  assert.deepEqual(archive.content.studentOverrides, assignment.studentOverrides);
  assert.deepEqual(archive.content.recoveryAuditStudentEntries, [assignment.dol.recoveryAudit[0]]);
  assert.deepEqual(archive.studentIds, legacyStudentIds(assignment));
});

test('14. a second backfill over migrated records plans nothing', () => {
  const assignment = legacyAssignment();
  const { records } = migrate(assignment);
  legacyStudentIds(assignment).forEach((studentId) => {
    const rerun = planStudentAbsorption({ assignmentId: 'A1', assignment, studentId, existingPrivate: records[studentId] ?? null, authorization: authorization(studentId) });
    assert.ok(['unchanged', 'none'].includes(rerun.action), `${studentId}: ${rerun.action}`);
    assert.equal(rerun.record, undefined);
  });
  assert.equal(sharedAssignmentFullyAbsorbed({ assignment, privateById: records }).absorbed, true);
  // …and before any record exists the strip is refused.
  assert.equal(sharedAssignmentFullyAbsorbed({ assignment, privateById: {} }).absorbed, false);
});

/* ------------------------------------------------------------- precedence */

const extraTimeProfile = buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-08-17', effectiveEnd: null, inclusionStatus: false,
    accommodations: [{ id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 2 } }, appliesTo: [] }],
    modifications: [],
  }],
  todayKey: '2026-09-14',
});

test('precedence: on-time due = max(class due, extra time); an individual extension never moves it', () => {
  const assignment = legacyAssignment();
  const extended = resolveStudentDeadlines({ assignment, override: resolveStudentOverride({ assignment, studentId: LEGACY_V3_STUB }) });
  assert.equal(extended.dueAtMs, Date.parse(assignment.dueAt), 'an attendance extension buys credit time, not on-time status');
  const withSupport = withStudentSupportDates(assignment, NO_CONTROLS, extraTimeProfile);
  const supported = resolveStudentDeadlines({ assignment, override: resolveStudentOverride({ assignment: withSupport, studentId: NO_CONTROLS }) });
  assert.ok(supported.dueAtMs > Date.parse(assignment.dueAt), 'extra time does move the on-time due date');
});

test('precedence: final cutoff = max(class final, individual extension, extra-time final); none shortens another', () => {
  const assignment = { ...legacyAssignment(), studentOverrides: { X: { lateDueAt: '2026-09-20T00:00:00.000Z' } } };
  // An "extension" earlier than the class's own final cutoff cannot shorten it.
  const shorter = resolveStudentDeadlines({ assignment, override: resolveStudentOverride({ assignment, studentId: 'X' }) });
  assert.equal(shorter.finalCloseAtMs, Date.parse(assignment.lateDueAt));
  const longer = resolveStudentDeadlines({ assignment: legacyAssignment(), override: resolveStudentOverride({ assignment: legacyAssignment(), studentId: LEGACY_V8_EVERYTHING }) });
  assert.equal(longer.finalCloseAtMs, Date.parse('2026-10-09T23:59:59.000Z'));
  // With extra time AND an extension, the later wins.
  const both = withStudentSupportDates(legacyAssignment(), LEGACY_V3_STUB, extraTimeProfile);
  const resolved = resolveStudentDeadlines({ assignment: legacyAssignment(), override: resolveStudentOverride({ assignment: both, studentId: LEGACY_V3_STUB }) });
  assert.equal(resolved.finalCloseAtMs, Math.max(Date.parse('2026-10-05T23:59:59.000Z'), resolved.supportFinalAtMs));
  // No late window: the class final is the class due.
  const noLate = { dueAt: '2026-09-18T23:59:59.000Z' };
  assert.equal(resolveStudentDeadlines({ assignment: noLate }).finalCloseAtMs, Date.parse(noLate.dueAt));
});

test('precedence: excusal and reopen change no date — and closed stays closed without an extension', () => {
  const assignment = legacyAssignment();
  const flags = resolveStudentDeadlines({ assignment, override: resolveStudentOverride({ assignment, studentId: LEGACY_V4_FLAGS }) });
  const plain = resolveStudentDeadlines({ assignment, override: null });
  assert.equal(flags.finalCloseAtMs, plain.finalCloseAtMs);
  assert.equal(flags.dueAtMs, plain.dueAtMs);
  assert.equal(flags.excused, true);
  assert.equal(flags.reopened, true);
  assert.equal(getAssignmentLifecycle(assignment, TIMES[3], { studentId: LEGACY_V4_FLAGS }).isPracticeOnly, true, 'a reopen flag alone does not reopen credit');
});

test('precedence: DOL attempts = class grant + the student\'s own, capped at 20; only on DOL questions', () => {
  const assignment = legacyAssignment();
  assert.deepEqual(resolveStudentDolExtraAttempts({ assignment, classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT }), { classGrant: 1, studentGrant: 2, total: 3 });
  assert.equal(resolveTeacherGrantedExtraAttempts({ assignment, activityRole: 'classwork', classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT }), 0);
  const capped = { dol: { attemptGrantsByClassId: { [CLASS_ID]: 15 } } };
  assert.equal(resolveTeacherGrantedExtraAttempts({ assignment: capped, activityRole: 'dol', classId: CLASS_ID, studentId: 'Z', privateOverride: { dolExtraAttempts: 15 } }), 20);
  // Another class's grant never applies.
  assert.equal(resolveStudentDolExtraAttempts({ assignment, classId: 'class-b', studentId: LEGACY_V7_DOL_NUMBER }).total, 3);
});

test('precedence: a Warm-Up/DOL class window is class-wide — an individual extension only replaces the no-window fallback', () => {
  const assignment = { ...legacyAssignment(), warmup: { enabled: true }, sections: [] };
  const close = (studentId, privateOverride) => resolveAuthoritativeClose({
    assignment, activityRole: 'classwork', schedule: null, classId: CLASS_ID, nowValue: TIMES[3], studentId, privateOverride,
  });
  assert.equal(close(NO_CONTROLS, null).closesAtMs, Date.parse(assignment.lateDueAt));
  assert.equal(close(NO_CONTROLS, { lateDueAt: '2026-10-20T23:59:59.000Z' }).closesAtMs, Date.parse('2026-10-20T23:59:59.000Z'));
  // A teacher's manual Classwork close for the class still beats any individual extension.
  const closed = { ...assignment, sectionAccess: { classwork: { overridesByClassId: { [CLASS_ID]: { state: 'closed', changedAt: '2026-09-20T15:00:00.000Z' } } } } };
  const manual = resolveAuthoritativeClose({
    assignment: closed, activityRole: 'classwork', schedule: null, classId: CLASS_ID, nowValue: TIMES[3], studentId: NO_CONTROLS,
    privateOverride: { lateDueAt: '2026-10-20T23:59:59.000Z' },
  });
  assert.equal(manual.reason, 'manual-section-close');
});

/* ------------------------------------------------------------------ merge */

test('merge: the newer teacher decision on a deadline wins, whichever store holds it', () => {
  const older = { lateDueAt: '2026-10-05T23:59:59.000Z', extension: { dateKey: '2026-10-05', grantedAt: 1000 } };
  const newerShorter = { lateDueAt: '2026-10-02T23:59:59.000Z', extension: { dateKey: '2026-10-02', grantedAt: 2000 } };
  assert.equal(mergeStudentOverride({ privateOverride: newerShorter, legacyOverride: older }).lateDueAt, newerShorter.lateDueAt, 'a reviewed shortening in private storage stands');
  assert.equal(mergeStudentOverride({ privateOverride: older, legacyOverride: newerShorter }).lateDueAt, newerShorter.lateDueAt, 'a newer grant an old function instance wrote to the shared copy stands');
  // A stamped grant is newer than an un-stamped one.
  const unstamped = { lateDueAt: '2026-12-01' };
  assert.equal(mergeStudentOverride({ privateOverride: older, legacyOverride: unstamped }).lateDueAt, older.lateDueAt);
  // Neither stamped: the later cutoff — no one loses time.
  assert.equal(mergeStudentOverride({ privateOverride: { lateDueAt: '2026-10-01' }, legacyOverride: { lateDueAt: '2026-10-03' } }).lateDueAt, '2026-10-03');
});

test('merge: an excusal or reopen in either place stands; the larger DOL grant stands', () => {
  const merged = mergeStudentOverride({
    privateOverride: { excused: false, reopened: true, dolExtraAttempts: 2 },
    legacyOverride: { excused: true, reopened: false, dolExtraAttempts: 3, dolAttemptGrant: { extraAttempts: 3 } },
  });
  assert.equal(merged.excused, true);
  assert.equal(merged.reopened, true);
  assert.equal(merged.dolExtraAttempts, 3, 'a stale tab writing a smaller grant back can never take an attempt away');
  assert.deepEqual(merged.dolAttemptGrant, { extraAttempts: 3 });
});

test('merge: resolving a resolved view again changes nothing (idempotent)', () => {
  const assignment = legacyAssignment();
  ALL_STUDENTS.forEach((studentId) => {
    const record = { lateDueAt: '2026-10-07T23:59:59.000Z', extension: { dateKey: '2026-10-07', grantedAt: 9e12 }, excused: false, reopened: false, dolExtraAttempts: 1 };
    const once = resolveStudentOverride({ assignment, studentId, privateOverride: record });
    const view = studentAssignmentView(assignment, { studentId, privateOverride: record });
    const twice = resolveStudentOverride({ assignment: view, studentId, privateOverride: record });
    const viewOnly = resolveStudentOverride({ assignment: view, studentId });
    ['lateDueAt', 'extension', 'excused', 'reopened', 'dolExtraAttempts'].forEach((key) => {
      assert.deepEqual(twice[key], once[key], `${studentId}.${key} (record + view)`);
      assert.deepEqual(viewOnly[key], once[key], `${studentId}.${key} (view alone)`);
    });
  });
});

test('undefined means "private storage was not read": the shared document is the whole answer, as before', () => {
  const assignment = legacyAssignment();
  assert.equal(resolveStudentOverride({ assignment, studentId: LEGACY_V3_STUB }).source, 'shared');
  assert.equal(resolveStudentOverride({ assignment, studentId: LEGACY_V3_STUB, privateOverride: null }).source, 'shared');
  assert.equal(resolveStudentOverride({ assignment: {}, studentId: 'X', privateOverride: { excused: true } }).source, 'private');
  assert.equal(resolveStudentOverride({ assignment, studentId: NO_CONTROLS }), null);
});

/* ------------------------------------------------------------------ views */

test('1/3/9. a student\'s view of a shared assignment carries their own controls and no classmate\'s', () => {
  const assignment = legacyAssignment();
  ALL_STUDENTS.forEach((studentId) => {
    const view = studentAssignmentView(assignment, { studentId });
    const text = JSON.stringify(view);
    ALL_STUDENTS.filter((other) => other !== studentId).forEach((other) => {
      assert.equal(text.includes(other), false, `${studentId}'s view names classmate ${other}`);
    });
    assert.equal(view.excusedStudentIds, undefined);
    assert.equal(view.reopenedStudentIds, undefined);
    assert.ok(Object.keys(view.studentOverrides || {}).every((id) => id === studentId));
    assert.ok(Object.keys(view.dol.attemptGrantsByStudentId || {}).every((id) => id === studentId));
    assert.ok(view.dol.recoveryAudit.every((entry) => auditEntryStudentIds(entry).length === 0));
  });
  // Class-wide controls survive: the class grant, the class-scoped audit, the dates.
  const view = studentAssignmentView(assignment, { studentId: NO_CONTROLS });
  assert.deepEqual(view.dol.attemptGrantsByClassId, assignment.dol.attemptGrantsByClassId);
  assert.equal(view.dol.recoveryAudit.length, 1);
  assert.equal(view.lateDueAt, assignment.lateDueAt);
  assert.equal(view.studentOverrides, undefined);
});

test('a teacher\'s view merges private records into studentOverrides only — never into the `dol` a teacher action writes back', () => {
  const assignment = legacyAssignment();
  const privateRecords = {
    [LEGACY_V6_DOL_OBJECT]: { dolExtraAttempts: 4, dolAttemptGrant: { extraAttempts: 4 } },
    S_NEW: { lateDueAt: '2026-10-30T23:59:59.000Z', extension: { dateKey: '2026-10-30', grantedAt: 9e12 } },
  };
  const view = teacherAssignmentView(assignment, privateRecords);
  assert.deepEqual(view.dol, assignment.dol, 'teacher DOL actions spread `assignment.dol` back to Firestore; it must be exactly the shared copy');
  assert.equal(view.studentOverrides[LEGACY_V6_DOL_OBJECT].dolExtraAttempts, 4);
  assert.equal(view.studentOverrides.S_NEW.lateDueAt, '2026-10-30T23:59:59.000Z');
  // Every teacher reader that indexes studentOverrides[sid] sees the merge…
  assert.equal(resolveTeacherGrantedExtraAttempts({ assignment: view, activityRole: 'dol', classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT }), 5);
  assert.equal(getAssignmentDate(view, 'late', 'S_NEW').toISOString(), '2026-10-30T23:59:59.000Z');
  // …and so does attendance reconciliation, which must not grant twice.
  const reconciliation = resolveStudentExtension({ assignment: view, studentId: 'S_NEW', marks: [], classPeriod: 'Period 1' });
  assert.deepEqual(reconciliation.existing, { dateKey: '2026-10-30', grantedAt: 9e12 });
  // Not reading private storage changes nothing about the shared copy.
  assert.deepEqual(teacherAssignmentView(assignment).studentOverrides[LEGACY_V3_STUB], assignment.studentOverrides[LEGACY_V3_STUB]);
});

/* ---------------------------------------------------------------- writers */

const STORAGE_MIRROR = resolveOverrideStorageMode(null);
const STORAGE_RETIRED = resolveOverrideStorageMode({ sharedRetired: true });

test('the storage switch: absent or false mirrors the shared copy; true retires it', () => {
  assert.deepEqual({ ...STORAGE_MIRROR }, { sharedRetired: false, mirrorShared: true });
  assert.deepEqual({ ...STORAGE_RETIRED }, { sharedRetired: true, mirrorShared: false });
  assert.deepEqual({ ...resolveOverrideStorageMode({ sharedRetired: 'yes' }) }, { sharedRetired: false, mirrorShared: true }, 'only a real boolean true retires it');
});

test('7. a teacher grants an extension, a reopen, an excusal and an attempt — mirrored while the shared copy is read', () => {
  const assignment = legacyAssignment();
  const actor = { email: TEACHER, uid: 'uid-t', role: 'teacher' };
  const extension = planStudentOverrideChange({
    assignmentId: 'A1', assignment, studentId: NO_CONTROLS, existingPrivate: null,
    change: { kind: OVERRIDE_CHANGE.ATTENDANCE_EXTENSION, lateDueAt: '2026-10-10T04:59:59.999Z', dateKey: '2026-10-09', grantedAtMs: 1759000000000 },
    authorization: authorization(NO_CONTROLS), actor, nowMs: 1759000000000, storageMode: STORAGE_MIRROR,
  });
  assert.equal(extension.record.lateDueAt, '2026-10-10T04:59:59.999Z');
  assert.deepEqual(extension.record.extension, { dateKey: '2026-10-09', grantedAt: 1759000000000 });
  assert.deepEqual(extension.sharedWrites, [
    { op: 'set', path: ['studentOverrides', NO_CONTROLS, 'lateDueAt'], value: '2026-10-10T04:59:59.999Z' },
    { op: 'set', path: ['studentOverrides', NO_CONTROLS, 'extension'], value: { dateKey: '2026-10-09', grantedAt: 1759000000000 } },
  ], 'exactly the two fields the callable has always written, while the previous release reads them');
  assert.equal(extension.event.actorEmail, TEACHER, 'who granted it is in the staff history…');
  assert.equal(JSON.stringify(extension.record).includes(TEACHER.split('@')[0]) && !extension.record.authorizedTeacherEmails.includes(TEACHER), false);
  assert.equal('actorEmail' in extension.record, false, '…not on the record the student reads');

  const reopen = planStudentOverrideChange({
    assignmentId: 'A1', assignment, studentId: NO_CONTROLS, existingPrivate: extension.record,
    change: { kind: OVERRIDE_CHANGE.REOPENED, value: true }, authorization: authorization(NO_CONTROLS), actor, nowMs: 1759000001000, storageMode: STORAGE_MIRROR,
  });
  assert.equal(reopen.record.reopened, true);
  assert.equal(reopen.record.lateDueAt, '2026-10-10T04:59:59.999Z', 'a later change never drops an earlier control');
  assert.equal(reopen.record.revision, 2);
  assert.equal(reopen.eventId, overrideEventId('A1', 2));

  const attempt = planStudentOverrideChange({
    assignmentId: 'A1', assignment, studentId: LEGACY_V6_DOL_OBJECT, existingPrivate: null,
    change: { kind: OVERRIDE_CHANGE.DOL_ATTEMPTS, increment: 1 }, authorization: authorization(LEGACY_V6_DOL_OBJECT), actor, nowMs: 1759000002000, storageMode: STORAGE_MIRROR,
  });
  assert.equal(attempt.record.dolExtraAttempts, 3, 'the grant still only on the shared copy is the base — it is never lost');
  // Never an account on the record the student reads (not an email, not a
  // uid): a role. The account is in the staff-only history entry.
  assert.equal(attempt.record.dolAttemptGrant.changedBy, 'teacher', 'the student-readable grant names a role, never the granting account');
  assert.equal(attempt.record.updatedBy, 'teacher');
  assert.equal(JSON.stringify(attempt.record).includes('uid-t'), false, 'no actor uid anywhere on the student-readable record');
  assert.equal(attempt.event.actorUid, 'uid-t', 'who granted it is in the staff history');
  assert.equal(attempt.event.actorEmail, TEACHER);
  assert.deepEqual(attempt.sharedWrites.map((write) => write.path.join('.')), [`dol.attemptGrantsByStudentId.${LEGACY_V6_DOL_OBJECT}`]);

  const excuse = planStudentOverrideChange({
    assignmentId: 'A1', assignment, studentId: LEGACY_V5_ARRAYS, existingPrivate: null,
    change: { kind: OVERRIDE_CHANGE.EXCUSED, value: false }, authorization: authorization(LEGACY_V5_ARRAYS), actor, nowMs: 1759000003000, storageMode: STORAGE_MIRROR,
  });
  assert.equal(excuse.record.excused, false);
  assert.deepEqual(excuse.sharedWrites, [{ op: 'arrayRemove', path: ['excusedStudentIds'], value: LEGACY_V5_ARRAYS }],
    'un-excusing removes every shared form of the flag, or the merge would bring it back');
  const after = applyWrites(assignment, excuse.sharedWrites);
  assert.equal(resolveStudentOverride({ assignment: after, studentId: LEGACY_V5_ARRAYS, privateOverride: excuse.record }).excused, false);
});

test('once the shared copy is retired, a change deletes the student\'s shared entries instead of mirroring them', () => {
  const assignment = legacyAssignment();
  const plan = planStudentOverrideChange({
    assignmentId: 'A1', assignment, studentId: LEGACY_V8_EVERYTHING, existingPrivate: null,
    change: { kind: OVERRIDE_CHANGE.DOL_ATTEMPTS, increment: 1 }, authorization: authorization(LEGACY_V8_EVERYTHING),
    actor: { uid: 'uid-t', email: TEACHER }, nowMs: 1759000000000, storageMode: STORAGE_RETIRED,
  });
  assert.deepEqual(plan.sharedWrites, [
    { op: 'delete', path: ['studentOverrides', LEGACY_V8_EVERYTHING] },
    { op: 'delete', path: ['dol', 'attemptGrantsByStudentId', LEGACY_V8_EVERYTHING] },
    { op: 'arrayRemove', path: ['reopenedStudentIds'], value: LEGACY_V8_EVERYTHING },
  ]);
  // Every control that was only on the shared copy is in the record first.
  assert.equal(plan.record.lateDueAt, '2026-10-09T23:59:59.000Z');
  assert.equal(plan.record.excused, true);
  assert.equal(plan.record.reopened, true);
  assert.equal(plan.record.dolExtraAttempts, 2);
  const after = applyWrites(assignment, plan.sharedWrites);
  assert.equal(JSON.stringify(after).includes(LEGACY_V8_EVERYTHING), true, 'the audit entry stays until the strip archives it');
  assert.equal(after.studentOverrides[LEGACY_V8_EVERYTHING], undefined);
  // And a retired student with nothing shared costs no assignment write.
  assert.deepEqual(planSharedCopyWrites({ assignment: {}, studentId: 'X', override: plan.after, storageMode: STORAGE_RETIRED }), []);
});

test('the record is an allow-list: no support date, reason, email or unknown key is ever stored', () => {
  const record = buildStudentOverrideRecord({
    studentId: 'S1', assignmentId: 'A1', revision: 3, source: 'test', updatedBy: 'uid-t', authorization: authorization('S1'),
    override: {
      lateDueAt: '2026-10-10T04:59:59.999Z', extension: { dateKey: '2026-10-09', grantedAt: 1, sourceAbsenceDates: ['x'], grantedByEmail: TEACHER },
      excused: true, reopened: false, dolExtraAttempts: 2, dolAttemptGrant: { extraAttempts: 2, changedBy: 'uid-t' },
      supportDueAt: '2026-10-11T00:00:00.000Z', supportFinalAt: '2026-10-12T00:00:00.000Z', supportDeadline: { supportId: 'extra-time' },
      reason: 'absent', studentEmail: 'kid@example.test',
    },
  });
  assert.deepEqual(Object.keys(record).sort(), [
    'assignmentId', 'authorizedTeacherEmails', 'classId', 'dolAttemptGrant', 'dolExtraAttempts', 'excused', 'extension',
    'lateDueAt', 'originClassId', 'originTeacherEmail', 'reopened', 'revision', 'schemaVersion', 'source', 'studentId', 'updatedBy',
  ]);
  assert.deepEqual(record.extension, { dateKey: '2026-10-09', grantedAt: 1 });
});

test('a record id is unambiguous and the collection is a fixed name', () => {
  assert.equal(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION, 'studentAssignmentOverrides');
  assert.equal(studentAssignmentOverrideId('S1', 'A1'), '2:S1:A1');
  assert.notEqual(studentAssignmentOverrideId('a:b', 'c'), studentAssignmentOverrideId('a', 'b:c'));
  assert.equal(studentAssignmentOverrideId('', 'A1'), null);
  assert.equal(studentAssignmentOverrideId('S1', ' '), null);
  assert.equal(stableDigest({ b: 1, a: [2, { c: 3 }] }), stableDigest({ a: [2, { c: 3 }], b: 1 }));
});

/* ---------------------------------------------------------- strip and absorb */

test('the strip removes every per-student field and keeps every class-wide one', () => {
  const assignment = legacyAssignment();
  const stripped = applyWrites(assignment, planSharedAssignmentStrip(assignment));
  assert.equal(stripped.studentOverrides, undefined);
  assert.equal(stripped.excusedStudentIds, undefined);
  assert.equal(stripped.reopenedStudentIds, undefined);
  assert.equal(stripped.dol.attemptGrantsByStudentId, undefined);
  assert.deepEqual(stripped.dol.attemptGrantsByClassId, assignment.dol.attemptGrantsByClassId);
  assert.deepEqual(stripped.dol.recoveryAudit, [assignment.dol.recoveryAudit[1]]);
  assert.equal(stripped.lateDueAt, assignment.lateDueAt);
  assert.deepEqual(legacyStudentIds(stripped), []);
  assert.deepEqual(planSharedAssignmentStrip(stripped), [], 'stripping a clean document plans nothing');
});

test('the absorber runs only when a write changed per-student shared data', () => {
  const before = legacyAssignment();
  assert.equal(perStudentSharedDataChanged(before, { ...before, title: 'Renamed' }), false);
  assert.equal(perStudentSharedDataChanged(before, { ...before, dol: { ...before.dol, attemptGrantsByClassId: {} } }), false, 'a class grant is not per-student data');
  assert.equal(perStudentSharedDataChanged(before, { ...before, dol: { ...before.dol, attemptGrantsByStudentId: { X: 1 } } }), true);
  assert.equal(perStudentSharedDataChanged(before, { ...before, excusedStudentIds: [] }), true);
  assert.equal(perStudentSharedDataChanged(null, before), true);
});

/* --------------------------------------------------- 16. copies and deletion */

test('16. a copy carries no student\'s controls in any legacy form', () => {
  const copy = stripAssignmentInstanceState(legacyAssignment());
  assert.deepEqual(legacyStudentIds(copy), []);
  ['studentOverrides', 'excusedStudentIds', 'reopenedStudentIds', 'generationSeats'].forEach((field) => {
    assert.ok(PER_STUDENT_ASSIGNMENT_FIELDS.includes(field), `${field} is per-student`);
    assert.equal(copy[field], undefined, `${field} must not be copied`);
  });
  ALL_STUDENTS.forEach((studentId) => assert.equal(JSON.stringify(copy).includes(studentId), false, `${studentId} leaked into the copy`));
  assert.deepEqual(assignmentInstanceStatePaths(copy), []);
  assert.ok(assignmentInstanceStatePaths(legacyAssignment()).includes('excusedStudentIds'));
  // Private records are keyed by the source assignment's id: a copy, with a
  // new id, has none.
  assert.notEqual(studentAssignmentOverrideId(LEGACY_V3_STUB, 'A1'), studentAssignmentOverrideId(LEGACY_V3_STUB, 'A1-copy'));
});

test('deleting a student scrubs them from the verbatim archive too', () => {
  const { archive } = buildAssignmentOverrideArchive({ assignmentId: 'A1', assignment: legacyAssignment() });
  const scrubbed = scrubStudentFromArchive(archive, LEGACY_V6_DOL_OBJECT, 'deleted-student:abc');
  assert.equal(JSON.stringify(scrubbed).includes(LEGACY_V6_DOL_OBJECT), false);
  assert.ok(JSON.stringify(scrubbed).includes(LEGACY_V8_EVERYTHING), 'everyone else\'s part stays');
  assert.ok(scrubbed.content.recoveryAuditStudentEntries[0].id.includes('deleted-student:abc'));
  assert.deepEqual(scrubbed.scrubbedFor, ['deleted-student:abc']);
});

test('overrideEntryFor is the shared entry shape existing readers index', () => {
  assert.equal(overrideEntryFor(null), null);
  assert.equal(overrideEntryFor({ excused: false, reopened: false, dolExtraAttempts: 0 }), null);
  assert.deepEqual(overrideEntryFor({ lateDueAt: 'x', excused: true, dolExtraAttempts: 2, dolAttemptGrant: { extraAttempts: 2 } }), {
    lateDueAt: 'x', excused: true, dolExtraAttempts: 2, dolAttemptGrant: { extraAttempts: 2 },
  });
});

/* ------------------------------------------- deletion and re-authorization wiring */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const requireCjs = createRequire(import.meta.url);

test('permanent deletion removes a student\'s private controls (by query), history (with the roster row) and archived part', () => {
  // The callable deletes the student's Auth account too, so it cannot run
  // against the Firestore-only emulator; its three new steps are pinned here.
  const { STUDENT_QUERY_COLLECTIONS } = requireCjs('../../functions/lib/admin.js');
  assert.ok(STUDENT_QUERY_COLLECTIONS.includes(STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION), 'deleted by studentId query with the other per-student collections');
  const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const removal = executableSource(region(index, 'async function removeStudentFromAssignmentDocuments(', 'async function recursiveDeleteQuery(', 'removeStudentFromAssignmentDocuments'));
  assert.match(removal, /\.select\("studentOverrides", "dol", "excusedStudentIds", "reopenedStudentIds"\)/, 'reads the list forms too');
  assert.match(removal, /plan\.arrayRemovals\.forEach\(\(field\) => fieldsAndValues\.push\(new FieldPath\(field\), FieldValue\.arrayRemove\(studentId\)\)\)/);
  assert.match(removal, /\.where\("studentIds", "array-contains", studentId\)/, 'finds every archive naming them');
  assert.match(removal, /overrides\.scrubStudentFromArchive\(archiveDoc\.data\(\) \|\| \{\}, studentId, `deleted-student:\$\{receipt\}`\)/);
  // The history lives under grades/{sid}, which the deletion removes recursively.
  const deletion = executableSource(region(index, 'exports.permanentlyDeleteStudent', '// --- OAuth connect flow', 'permanentlyDeleteStudent'));
  assert.match(deletion, /await recursiveDeleteDocument\(db, rosterRef, deleted, "gradesWithSubcollections"\)/);
  // ORDER: the shared entries go before the roster row and the private
  // records. The absorber copies whatever a shared assignment still names into
  // private storage, so with the entries removed last, an absorber run in
  // between would recreate a record (and history) for a deleted student.
  const removedShared = deletion.indexOf('await removeStudentFromAssignmentDocuments(db, studentId, receipt, deleted)');
  const removedRoster = deletion.indexOf('await recursiveDeleteDocument(db, rosterRef, deleted, "gradesWithSubcollections")');
  const removedPrivate = deletion.indexOf('for (const collectionName of adminPolicy.STUDENT_QUERY_COLLECTIONS)');
  assert.ok(removedShared > 0 && removedRoster > 0 && removedPrivate > 0, 'all three steps are present');
  assert.ok(removedShared < removedRoster && removedShared < removedPrivate, 'shared entries are removed before the roster row and the private records');
});

test('a class move re-authorizes the private records and their history for the new teacher', () => {
  const index = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const children = executableSource(region(index, 'const AUTHORIZED_CHILD_COLLECTIONS = Object.freeze([', ']);', 'AUTHORIZED_CHILD_COLLECTIONS'));
  assert.match(children, /grades\/\$\{studentId\}\/assignmentOverrideEvents/);
  const reauthorize = executableSource(region(index, 'async function reauthorizeStudentRecords(', '// Class Points accounts and transactions', 'reauthorizeStudentRecords'));
  assert.match(reauthorize, /for \(const collectionName of \[[^\]]*"studentAssignmentOverrides"[^\]]*\]\)/);
});

test('staff keep a pre-#415 extension\'s reasons when it is the grant that resolved; a student\'s view never does', () => {
  const assignment = legacyAssignment();
  const staff = teacherAssignmentView(assignment).studentOverrides[LEGACY_V2_FULL_EXTENSION];
  assert.deepEqual(staff.extension, assignment.studentOverrides[LEGACY_V2_FULL_EXTENSION].extension, 'the case review fallback still shows meetings and dates');
  const own = studentAssignmentView(assignment, { studentId: LEGACY_V2_FULL_EXTENSION }).studentOverrides[LEGACY_V2_FULL_EXTENSION];
  assert.deepEqual(own.extension, { dateKey: '2026-10-02', grantedAt: 1758000000000 }, 'the student\'s own view carries the stub only');
  // A newer private grant is not decorated with an older grant's reasons.
  const newer = teacherAssignmentView(assignment, { [LEGACY_V2_FULL_EXTENSION]: { lateDueAt: '2026-10-20T23:59:59.000Z', extension: { dateKey: '2026-10-20', grantedAt: 1759999999999 } } });
  assert.deepEqual(newer.studentOverrides[LEGACY_V2_FULL_EXTENSION].extension, { dateKey: '2026-10-20', grantedAt: 1759999999999 });
});

test('Practice Pass eligibility reads the student\'s private extension, and redemption reads it with the server\'s authority', async () => {
  const { evaluatePracticePassEligibility } = await import('../../functions/shared/classPointRewards.mjs');
  const assignment = { id: 'A1', dueAt: '2026-09-18T23:59:59.000Z', lateDueAt: '2026-09-25T23:59:59.000Z', sections: [] };
  const common = {
    assignment, assignedToClass: true, isTestCycleAssignment: false, practiceIndices: [0], hasCreditBearingAttempt: false,
    alreadyRedeemed: false, balance: 100, nowValue: Date.parse('2026-09-28T15:00:00.000Z'), studentId: 'S1',
  };
  assert.equal(evaluatePracticePassEligibility({ ...common, privateOverride: null }).eligible, false, 'past the class cutoff');
  assert.equal(evaluatePracticePassEligibility({ ...common, privateOverride: { lateDueAt: '2026-10-02T23:59:59.000Z' } }).eligible, true, 'inside their own');
  const store = executableSource(readFileSync(new URL('../../functions/shared/rewardActionStore.mjs', import.meta.url), 'utf8'));
  assert.match(store, /\.doc\(studentAssignmentOverrideId\(student, assignmentKey\)\)/, 'the record of the AUTHENTICATED student');
  assert.match(store, /privateOverride: overrideSnap\.exists \? overrideSnap\.data\(\) : null,/);
});

test('a backfill that took several pages reads as one report: counts add up, failures collect, the last page says where it stopped', async () => {
  const { combineOverrideMigrationReports } = await import('../../functions/shared/studentAssignmentOverrides.mjs');
  const page = (extra) => ({
    mode: 'backfill', dryRun: false, migrationRunId: null, assignmentIdPrefix: null, sharedRetired: false,
    assignmentsScanned: 100, recordsCreated: 3, recordsUpdated: 1, recordsUnchanged: 7, auditCopiesCreated: 2, failures: [], ...extra,
  });
  const combined = combineOverrideMigrationReports([
    page({ startAfter: null, nextCursor: 'a-100', done: false }),
    page({ startAfter: 'a-100', nextCursor: 'a-200', done: false, failures: [{ assignmentId: 'a-150', reason: 'contention' }] }),
    page({ startAfter: 'a-200', nextCursor: null, done: true, assignmentsScanned: 12, recordsCreated: 0 }),
  ]);
  assert.equal(combined.pages, 3);
  assert.equal(combined.assignmentsScanned, 212);
  assert.equal(combined.recordsCreated, 6);
  assert.equal(combined.recordsUpdated, 3);
  assert.equal(combined.recordsUnchanged, 21);
  assert.equal(combined.auditCopiesCreated, 6);
  assert.deepEqual(combined.failures, [{ assignmentId: 'a-150', reason: 'contention' }], 'a failure on any page is reported');
  assert.equal(combined.startAfter, null, 'where the pass began');
  assert.equal(combined.nextCursor, null);
  assert.equal(combined.done, true, 'done only when the LAST page is');
  assert.equal(combined.dryRun, false);
  assert.equal(combineOverrideMigrationReports([page({ nextCursor: 'a-100', done: false })]).done, false);
  assert.equal(combineOverrideMigrationReports([]), null);
});

test('the two teacher list shapes the rules admit are backed by declared composite indexes', () => {
  // tests/rules/studentAssignmentOverrideRules.test.mjs proves a teacher may
  // list by `authorizedTeacherEmails` alone, or narrowed to one class or one
  // assignment; the narrowed shapes need a composite index to run at all.
  const { indexes } = JSON.parse(readFileSync(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'));
  const shape = (index) => index.fields.map((field) => `${field.fieldPath}:${field.arrayConfig || field.order}`).join(',');
  const declared = indexes.filter((index) => index.collectionGroup === STUDENT_ASSIGNMENT_OVERRIDES_COLLECTION && index.queryScope === 'COLLECTION').map(shape);
  assert.ok(declared.includes('authorizedTeacherEmails:CONTAINS,classId:ASCENDING'), 'one class\'s records');
  assert.ok(declared.includes('authorizedTeacherEmails:CONTAINS,assignmentId:ASCENDING'), 'one assignment\'s records');
});
