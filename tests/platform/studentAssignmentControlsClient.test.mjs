// A STUDENT'S DEVICE HOLDS ITS OWN CONTROLS AND NOBODY ELSE'S.
//
// The client follow-up to PR #432 (docs/architecture/student-assignment-overrides.md §9):
//
//   * every shared lesson is reduced to ONE student's view at the moment it
//     leaves Firestore's snapshot (studentAssignmentScope.js) — during the
//     mirror a legacy document still carries every classmate's extension,
//     excusal, reopen, DOL grant and recovery-log entry, and none of it may
//     reach a student-side object;
//   * the student's private controls arrive through exactly ONE listener
//     (`studentId ==` themselves) and are merged by #432's resolver, through
//     the same projection every student screen reads
//     (studentAssignmentControls.js projectStudentAssignments);
//   * the controls are identity-scoped: the next student on a shared
//     Chromebook, a render before teardown, a cached snapshot — none of them
//     can hand student A's controls to student B.
//
// Rules for the same queries: tests/rules/studentControlsClientRules.test.mjs.
// The real app in a browser: tests/browser/teacherWorkflow/privateControlsJourneys.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

import {
  EMPTY_STUDENT_CONTROLS,
  STUDENT_CONTROLS_STATUS,
  controlsForStudent,
  ownControlRecord,
  ownControlsByAssignment,
  privateOverrideFor,
  projectStudentAssignments,
  studentAssignmentControlsQuery,
  subscribeStudentAssignmentControls,
} from '../../src/platform/assignments/studentAssignmentControls.js';
import {
  studentScopedAssignment,
  subscribeStudentClassAssignments,
} from '../../src/platform/assignments/studentAssignmentScope.js';
import {
  legacyStudentIds,
  overrideAuthorizationContext,
  planSharedAssignmentStrip,
  planStudentAbsorption,
} from '../../functions/shared/studentAssignmentOverrides.mjs';
import { getAssignmentDate, getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { resolveTeacherGrantedExtraAttempts } from '../../functions/shared/attemptPolicy.mjs';
import { summarizeStudentRecovery } from '../../src/platform/assessment/assessmentRecovery.js';
import { assignmentIsExcusedForStudent, assignmentIsReopenedForStudent } from '../../src/platform/student/studentGradeCenterModel.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import {
  ALL_STUDENTS,
  CLASS_ID,
  LEGACY_V3_STUB,
  LEGACY_V6_DOL_OBJECT,
  LEGACY_V8_EVERYTHING,
  NO_CONTROLS,
  TEACHER,
  legacyAssignment,
} from '../fixtures/studentAssignmentOverrideLegacyFixtures.mjs';

// A client Firestore that never connects: queries are built, never sent.
const db = getFirestore(initializeApp({ projectId: 'demo-student-controls-unit', apiKey: 'unit' }, 'student-controls-unit'));

/** A built query as { path, filters }, from the SDK's own representation. */
const describeQuery = (built) => ({
  path: built._query.path.segments.join('/'),
  filters: built._query.filters.map((filter) => ({
    field: filter.field.segments.join('.'),
    op: filter.op,
    value: filter.value.stringValue ?? filter.value.arrayValue?.values?.map((entry) => entry.stringValue),
  })),
});

/** Every per-student shape a classmate's data could take inside an object. */
const classmateLeak = (value, ownId) => {
  const text = JSON.stringify(value);
  return ALL_STUDENTS.filter((id) => id !== ownId).filter((id) => text.includes(id));
};

/** The migration's own planner for every student, then the strip: the retired world. */
const retiredWorld = () => {
  const assignment = legacyAssignment();
  const records = {};
  legacyStudentIds(assignment).forEach((studentId) => {
    const plan = planStudentAbsorption({
      assignmentId: assignment.id,
      assignment,
      studentId,
      existingPrivate: null,
      authorization: overrideAuthorizationContext({ studentId, student: { classId: CLASS_ID, assignedTeacherEmail: TEACHER } }),
    });
    if (plan.record) records[studentId] = { ...plan.record, studentId, assignmentId: assignment.id };
  });
  const stripped = JSON.parse(JSON.stringify(assignment));
  planSharedAssignmentStrip(assignment).forEach(({ op, path, value }) => {
    const parent = path.slice(0, -1).reduce((node, key) => node[key], stripped);
    if (op === 'delete') delete parent[path[path.length - 1]];
    else parent[path[path.length - 1]] = value;
  });
  return { legacy: assignment, stripped, records };
};

const ready = (ownerId, records) => ({
  ownerId,
  status: STUDENT_CONTROLS_STATUS.READY,
  fromCache: false,
  byAssignmentId: ownControlsByAssignment(Object.values(records).filter((record) => record.studentId === ownerId), ownerId),
});

const TIMES = [
  '2026-09-17T15:00:00.000Z', '2026-09-22T15:00:00.000Z', '2026-09-28T15:00:00.000Z',
  '2026-10-03T15:00:00.000Z', '2026-10-07T15:00:00.000Z', '2026-10-12T15:00:00.000Z',
].map((iso) => Date.parse(iso));

/* --------------------------------------------------- the one listener */

test('17. the device makes exactly one controls query: its own student id, nothing else', () => {
  assert.deepEqual(describeQuery(studentAssignmentControlsQuery(db, 'S_A')), {
    path: 'studentAssignmentOverrides',
    filters: [{ field: 'studentId', op: '==', value: 'S_A' }],
  });
  const opened = [];
  const listen = (built, next, error) => {
    opened.push({ query: describeQuery(built), next, error });
    return () => { opened.splice(opened.findIndex((entry) => entry.next === next), 1); };
  };
  const unsubscribe = subscribeStudentAssignmentControls({ db, studentId: 'S_A', onChange: () => {}, listen });
  assert.equal(opened.length, 1, 'one listener per device');
  assert.deepEqual(opened[0].query.filters, [{ field: 'studentId', op: '==', value: 'S_A' }]);
  unsubscribe();
  assert.equal(opened.length, 0, 'torn down with its unsubscribe');
  // No student, no listener — a signed-out device or a teacher session.
  assert.equal(typeof subscribeStudentAssignmentControls({ db, studentId: '', onChange: () => {}, listen }), 'function');
  assert.equal(opened.length, 0);
});

test('a snapshot becomes one map, assignment id → this student\'s record, and nothing for anyone else', () => {
  const { records } = retiredWorld();
  const docs = Object.values(records).map((record) => ({ data: () => record }));
  const own = ownControlsByAssignment(docs, LEGACY_V8_EVERYTHING);
  assert.deepEqual(Object.keys(own), ['A1']);
  assert.equal(own.A1.excused, true);
  assert.equal(own.A1.dolExtraAttempts, 1);
  // A document for someone else is dropped even if a cache handed it over.
  assert.deepEqual(ownControlsByAssignment(docs, 'S_NOBODY'), {});
  // What the student's JavaScript holds is the controls, and when a grant was
  // made: no account, no reason, no authorization list, no provenance.
  const record = ownControlRecord({
    ...records[LEGACY_V6_DOL_OBJECT],
    dolAttemptGrant: { extraAttempts: 2, changedAt: '2026-09-16T15:05:00.000Z', changedBy: 'uid-t', reason: 'teacher-dol-recovery' },
    updatedBy: 'uid-t',
  });
  assert.deepEqual(Object.keys(record).sort(), ['dolAttemptGrant', 'dolExtraAttempts', 'excused', 'extension', 'lateDueAt', 'reopened']);
  assert.deepEqual(record.dolAttemptGrant, { extraAttempts: 2, changedAt: '2026-09-16T15:05:00.000Z' });
  const text = JSON.stringify(record);
  ['uid-t', 'teacher-dol-recovery', TEACHER, 'authorizedTeacherEmails', 'originTeacherEmail', 'migration', 'revision'].forEach((needle) => {
    assert.equal(text.includes(needle), false, `${needle} must not reach the student's object`);
  });
});

/* ------------------------------------- 10. peer data stripped before use */

test('10. a legacy shared lesson is reduced to this student\'s view the moment it leaves the snapshot', () => {
  const legacy = legacyAssignment();
  ALL_STUDENTS.forEach((studentId) => {
    const view = studentScopedAssignment('A1', legacy, studentId);
    assert.deepEqual(classmateLeak(view, studentId), [], `${studentId}'s object names a classmate`);
    assert.equal(view.excusedStudentIds, undefined);
    assert.equal(view.reopenedStudentIds, undefined);
    assert.ok(Object.keys(view.studentOverrides || {}).every((id) => id === studentId));
    assert.ok(Object.keys(view.dol?.attemptGrantsByStudentId || {}).every((id) => id === studentId));
    assert.ok((view.dol?.recoveryAudit || []).every((entry) => entry?.scope?.type !== 'students'), 'no student-scoped recovery log entry');
  });
  // Without a student id nothing per-student is kept at all.
  const failClosed = studentScopedAssignment('A1', legacy, null);
  assert.equal(failClosed.studentOverrides, undefined);
  assert.equal(failClosed.dol.attemptGrantsByStudentId, undefined);
  // Class-wide controls survive — the class grant, the class-scoped log, the
  // dates — without the name of the teacher who acted.
  const view = studentScopedAssignment('A1', legacy, NO_CONTROLS);
  const { changedBy: _actor, ...classGrant } = legacy.dol.attemptGrantsByClassId[CLASS_ID];
  assert.deepEqual(view.dol.attemptGrantsByClassId, { [CLASS_ID]: classGrant });
  assert.equal(view.dol.recoveryAudit.length, 1);
  assert.equal(view.dol.recoveryAudit[0].action, legacy.dol.recoveryAudit.find((entry) => entry.scope?.type === 'class').action);
  assert.equal(view.lateDueAt, legacy.lateDueAt);
});

test('10. the live class listener hands the app peer-free lessons, never the documents as sent', () => {
  const legacy = legacyAssignment();
  const received = [];
  let deliver;
  subscribeStudentClassAssignments({
    db,
    studentId: LEGACY_V3_STUB,
    classId: CLASS_ID,
    onChange: (lessons) => received.push(lessons),
    listen: (_query, next) => { deliver = next; return () => {}; },
  });
  deliver({ docs: [{ id: 'A1', data: () => legacy }] });
  assert.equal(received.length, 1);
  assert.deepEqual(classmateLeak(received[0], LEGACY_V3_STUB), []);
  assert.deepEqual(Object.keys(received[0][0].studentOverrides), [LEGACY_V3_STUB], 'their own shared entry stays until private storage answers');
});

test('the student\'s own grant carries no granting-teacher metadata, even from an old shared copy', () => {
  const legacy = legacyAssignment();
  const [projected] = projectStudentAssignments({ assignments: [studentScopedAssignment('A1', legacy, LEGACY_V6_DOL_OBJECT)], studentId: LEGACY_V6_DOL_OBJECT });
  const grant = projected.dol.attemptGrantsByStudentId[LEGACY_V6_DOL_OBJECT];
  assert.deepEqual(grant, { extraAttempts: 2, changedAt: '2026-09-16T15:05:00.000Z' });
  assert.deepEqual(projected.studentOverrides[LEGACY_V6_DOL_OBJECT].dolAttemptGrant, grant);
  // Nothing on the student's device names a teacher: not their own grant, not
  // the class's grant, not the class-scoped recovery log — and no
  // student-scoped log entry at all.
  assert.equal(JSON.stringify(projected).includes('uid-t'), false, 'no teacher id anywhere in the student\'s copy');
  assert.deepEqual((projected.dol.recoveryAudit || []).filter((entry) => entry?.scope?.type === 'students'), []);
  ['changedBy', 'openedBy', 'unlockedBy', 'closedBy', 'teacherId'].forEach((key) => {
    assert.equal(JSON.stringify(projected.dol).includes(`"${key}"`), false, `no ${key} in the student's dol`);
  });
  // …while every class-wide fact the student's screens read is intact.
  assert.equal(projected.dol.attemptGrantsByClassId[CLASS_ID].extraAttempts, legacy.dol.attemptGrantsByClassId[CLASS_ID].extraAttempts);
  assert.equal(
    resolveTeacherGrantedExtraAttempts({ assignment: projected, activityRole: 'dol', classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT }),
    resolveTeacherGrantedExtraAttempts({ assignment: legacy, activityRole: 'dol', classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT }),
  );
  // The teacher's own copy keeps who acted (the projection is the student's only).
  assert.equal(JSON.stringify(legacy.dol).includes('uid-t'), true);
});

test('class-wide DOL windows reach the student with their dates and without the teacher who opened, unlocked or closed them', () => {
  const lesson = {
    id: 'A9', title: 'Windows', assignedClassIds: [CLASS_ID],
    dol: {
      enabled: true,
      recoveryByClassId: { [CLASS_ID]: { dateKey: '2026-10-05', openedAt: '2026-10-05T15:00:00.000Z', closesAt: '2026-10-05T15:10:00.000Z', openedBy: 'uid-t', reason: 'teacher-recovery' } },
      earlyUnlocksByClassId: { [CLASS_ID]: { dateKey: '2026-10-06', unlockedAt: '2026-10-06T14:00:00.000Z', unlockedBy: 'uid-t' } },
      closedByClassId: { [CLASS_ID]: { dateKey: '2026-10-07', closedAt: '2026-10-07T15:00:00.000Z', closedBy: 'uid-t', reason: 'teacher-close' } },
      recoveryAudit: [{ id: 'reopenWindow:class:x', action: 'reopenWindow', section: 'dol', scope: { type: 'class', classId: CLASS_ID }, previous: null, next: { dateKey: '2026-10-05', openedBy: 'uid-t' }, teacherId: 'uid-t', at: '2026-10-05T15:00:00.000Z' }],
    },
  };
  const [projected] = projectStudentAssignments({ assignments: [studentScopedAssignment('A9', lesson, NO_CONTROLS)], studentId: NO_CONTROLS });
  assert.equal(JSON.stringify(projected).includes('uid-t'), false);
  assert.deepEqual(projected.dol.recoveryByClassId[CLASS_ID], { dateKey: '2026-10-05', openedAt: '2026-10-05T15:00:00.000Z', closesAt: '2026-10-05T15:10:00.000Z', reason: 'teacher-recovery' });
  assert.deepEqual(projected.dol.earlyUnlocksByClassId[CLASS_ID], { dateKey: '2026-10-06', unlockedAt: '2026-10-06T14:00:00.000Z' });
  assert.deepEqual(projected.dol.closedByClassId[CLASS_ID], { dateKey: '2026-10-07', closedAt: '2026-10-07T15:00:00.000Z', reason: 'teacher-close' });
  assert.deepEqual(projected.dol.recoveryAudit.map((entry) => [entry.action, entry.next.dateKey, entry.at]), [['reopenWindow', '2026-10-05', '2026-10-05T15:00:00.000Z']]);
  assert.equal(lesson.dol.recoveryByClassId[CLASS_ID].openedBy, 'uid-t', 'the document as Firestore sent it is not mutated');
});

/* --------------------------- 1–4. the student's own controls, merged */

test('1–4. extension, excused, reopened and DOL attempts reach the student through their private record alone', () => {
  const { legacy, stripped, records } = retiredWorld();
  ALL_STUDENTS.forEach((studentId) => {
    // Retired world: the shared copy carries nothing per-student; the device
    // has the student's own listener result.
    const [projected] = projectStudentAssignments({
      assignments: [studentScopedAssignment('A1', stripped, studentId)],
      studentId,
      controls: ready(studentId, records),
    });
    TIMES.forEach((now) => {
      assert.equal(
        getAssignmentLifecycle(projected, now, { studentId }).status,
        getAssignmentLifecycle(legacy, now, { studentId }).status,
        `${studentId} at ${new Date(now).toISOString()}: lifecycle`,
      );
    });
    assert.equal(getAssignmentDate(projected, 'late', studentId)?.getTime(), getAssignmentDate(legacy, 'late', studentId)?.getTime(), `${studentId}: final cutoff`);
    assert.equal(assignmentIsExcusedForStudent(projected, studentId), assignmentIsExcusedForStudent(legacy, studentId), `${studentId}: excused`);
    assert.equal(assignmentIsReopenedForStudent(projected, studentId), assignmentIsReopenedForStudent(legacy, studentId), `${studentId}: reopened`);
    assert.equal(
      resolveTeacherGrantedExtraAttempts({ assignment: projected, activityRole: 'dol', classId: CLASS_ID, studentId }),
      resolveTeacherGrantedExtraAttempts({ assignment: legacy, activityRole: 'dol', classId: CLASS_ID, studentId }),
      `${studentId}: DOL attempts`,
    );
    assert.deepEqual(classmateLeak(projected, studentId), []);
  });
});

test('5. a class DOL grant and the student\'s own grant combine, capped together', () => {
  const { stripped, records } = retiredWorld();
  const [projected] = projectStudentAssignments({
    assignments: [studentScopedAssignment('A1', stripped, LEGACY_V6_DOL_OBJECT)],
    studentId: LEGACY_V6_DOL_OBJECT,
    controls: ready(LEGACY_V6_DOL_OBJECT, records),
  });
  const summary = summarizeStudentRecovery({ assignment: projected, classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT });
  assert.deepEqual([summary.classExtraAttempts, summary.studentExtraAttempts, summary.extraAttempts], [1, 2, 3]);
  // The cap holds whichever side carries the attempts.
  const capped = { ...records[LEGACY_V6_DOL_OBJECT], dolExtraAttempts: 20 };
  const [atCap] = projectStudentAssignments({
    assignments: [studentScopedAssignment('A1', stripped, LEGACY_V6_DOL_OBJECT)],
    studentId: LEGACY_V6_DOL_OBJECT,
    controls: ready(LEGACY_V6_DOL_OBJECT, { [LEGACY_V6_DOL_OBJECT]: capped }),
  });
  assert.equal(resolveTeacherGrantedExtraAttempts({ assignment: atCap, activityRole: 'dol', classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT }), 20);
});

test('during the mirror the device answers from both places, and loses nothing either holds', () => {
  const { legacy, records } = retiredWorld();
  // Mirror: the shared copy still says everything; the private record agrees.
  ALL_STUDENTS.forEach((studentId) => {
    const [projected] = projectStudentAssignments({
      assignments: [studentScopedAssignment('A1', legacy, studentId)],
      studentId,
      controls: ready(studentId, records),
    });
    assert.equal(getAssignmentLifecycle(projected, TIMES[3], { studentId }).status, getAssignmentLifecycle(legacy, TIMES[3], { studentId }).status);
    assert.deepEqual(classmateLeak(projected, studentId), []);
  });
  // A newer private grant than the mirror shows (a previous-release tab wrote
  // an older map back): the larger grant stands.
  const newer = { ...records[LEGACY_V6_DOL_OBJECT], dolExtraAttempts: 4 };
  const [projected] = projectStudentAssignments({
    assignments: [studentScopedAssignment('A1', legacy, LEGACY_V6_DOL_OBJECT)],
    studentId: LEGACY_V6_DOL_OBJECT,
    controls: ready(LEGACY_V6_DOL_OBJECT, { [LEGACY_V6_DOL_OBJECT]: newer }),
  });
  assert.equal(resolveTeacherGrantedExtraAttempts({ assignment: projected, activityRole: 'dol', classId: CLASS_ID, studentId: LEGACY_V6_DOL_OBJECT }), 5);
});

test('the student\'s individualized extra time still applies, after their own view', () => {
  const { stripped } = retiredWorld();
  const profile = buildSupportProjection({
    revisions: [{
      revisionId: 'r1', revision: 1, status: 'active', effectiveStart: '2026-01-01',
      accommodations: [{ id: 'extra-time', params: { dueDateExtension: { mode: 'school-days', value: 2 } } }],
    }],
  });
  const [projected] = projectStudentAssignments({
    assignments: [studentScopedAssignment('A1', stripped, NO_CONTROLS)],
    studentId: NO_CONTROLS,
    profile,
  });
  assert.ok(projected.studentOverrides?.[NO_CONTROLS]?.supportDueAt, 'withStudentSupportDates ran on the student\'s projection');
  assert.ok(getAssignmentDate(projected, 'due', NO_CONTROLS) > getAssignmentDate(stripped, 'due', NO_CONTROLS));
});

/* --------------------------- 11 / 12. account switch and cached startup */

test('11. account switch A → B: B\'s projection holds none of A\'s controls, even while A\'s are still in state', () => {
  const { stripped, records } = retiredWorld();
  const studentA = LEGACY_V8_EVERYTHING;
  const studentB = NO_CONTROLS;
  const aControls = ready(studentA, records);
  // The render after the account changed, before A's listener is torn down:
  // the hook's state still belongs to A.
  assert.equal(controlsForStudent(aControls, studentB), EMPTY_STUDENT_CONTROLS);
  const [forB] = projectStudentAssignments({ assignments: [studentScopedAssignment('A1', stripped, studentB)], studentId: studentB, controls: aControls });
  assert.equal(forB.studentOverrides, undefined, 'B gets no controls at all from A\'s state');
  assert.equal(getAssignmentLifecycle(forB, TIMES[3], { studentId: studentB }).status, 'closed', 'B sees the class cutover, not A\'s extension');
  assert.deepEqual(classmateLeak(forB, studentB), []);
  assert.equal(JSON.stringify(forB).includes('2026-10-09'), false, 'A\'s extension date appears nowhere in B\'s lesson');
  // A projection for nobody (signed out) is empty.
  assert.deepEqual(projectStudentAssignments({ assignments: [stripped], studentId: null, controls: aControls }), []);
});

test('12. cached/offline startup for B: only B\'s records can match, and a stray A record is dropped', () => {
  const { stripped, records } = retiredWorld();
  const studentA = LEGACY_V8_EVERYTHING;
  const studentB = LEGACY_V3_STUB;
  // A misbehaving cache that served A's record inside B's first (fromCache) snapshot.
  const docs = [records[studentA], records[studentB]].map((record) => ({ data: () => record }));
  const byAssignmentId = ownControlsByAssignment(docs, studentB);
  const cached = { ownerId: studentB, status: STUDENT_CONTROLS_STATUS.READY, fromCache: true, byAssignmentId };
  const [forB] = projectStudentAssignments({ assignments: [studentScopedAssignment('A1', stripped, studentB)], studentId: studentB, controls: cached });
  assert.equal(forB.studentOverrides[studentB].lateDueAt, records[studentB].lateDueAt, 'B\'s own extension, from cache, before the server answers');
  assert.equal(forB.studentOverrides[studentB].excused, undefined, 'none of A\'s flags');
  assert.deepEqual(classmateLeak(forB, studentB), []);
});

test('before the controls arrive the student sees only their own shared entry — never a classmate\'s', () => {
  const legacy = legacyAssignment();
  const loading = { ownerId: LEGACY_V3_STUB, status: STUDENT_CONTROLS_STATUS.LOADING, byAssignmentId: {}, fromCache: false };
  assert.equal(privateOverrideFor(loading, 'A1'), undefined, 'not read yet: the shared copy answers');
  assert.equal(privateOverrideFor({ ...loading, status: STUDENT_CONTROLS_STATUS.READY }, 'A1'), null, 'read, no record');
  const [projected] = projectStudentAssignments({ assignments: [studentScopedAssignment('A1', legacy, LEGACY_V3_STUB)], studentId: LEGACY_V3_STUB, controls: loading });
  assert.equal(getAssignmentDate(projected, 'late', LEGACY_V3_STUB).toISOString(), '2026-10-05T23:59:59.000Z');
  assert.deepEqual(classmateLeak(projected, LEGACY_V3_STUB), []);
});
