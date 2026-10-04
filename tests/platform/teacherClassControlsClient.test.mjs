// A TEACHER'S SCREENS READ THEIR STUDENTS' CONTROLS THROUGH ONE CLASS-SCOPED LISTENER.
//
// The client follow-up to PR #432 (docs/architecture/student-assignment-overrides.md §9):
//
//   * ONE query for the classes on screen — never one per student, lesson or
//     section, never the school: `authorizedTeacherEmails array-contains me`
//     and `classId ==|in` (a root administrator: the class constraint alone);
//   * the scope follows the class the teacher works in, plus any class a
//     visible surface shows, plus — on the cross-class tabs — the classes they
//     teach; a class switch REPLACES the listener;
//   * the records merge into each lesson's `studentOverrides` only
//     (teacherAssignmentView): Grade Transfer's holds, the Grade Center's
//     excused/reopened, the DOL attempt budget all see them, and the
//     class-level questions — #428's Walkthrough eligibility — are untouched.
//
// Rules for the same queries: tests/rules/studentControlsClientRules.test.mjs.
// The real app: tests/browser/teacherWorkflow/privateControlsJourneys.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

import {
  EMPTY_TEACHER_CONTROLS,
  MAX_TEACHER_CONTROLS_CLASSES,
  TEACHER_CONTROLS_STATUS,
  controlsByAssignment,
  controlsForScope,
  decodeTeacherControlsScope,
  projectTeacherAssignments,
  subscribeTeacherClassControls,
  teacherClassControlsQuery,
  teacherControlsClassIds,
  teacherControlsScopeKey,
} from '../../src/platform/teacher/teacherClassControls.js';
import {
  legacyStudentIds,
  overrideAuthorizationContext,
  planSharedAssignmentStrip,
  planStudentAbsorption,
} from '../../functions/shared/studentAssignmentOverrides.mjs';
import { walkthroughEligibility, studentAssignmentAvailability } from '../../src/platform/assignments/assignmentAvailability.js';
import { getAssignmentLifecycle } from '../../src/assignmentLifecycle.js';
import { resolveStudentFinalDeadlineFromAssignment } from '../../src/platform/gradeTransfer/studentDeadlineResolver.js';
import { assignmentIsExcusedForStudent, assignmentIsReopenedForStudent } from '../../src/platform/student/studentGradeCenterModel.js';
import { resolveTeacherGrantedExtraAttempts } from '../../functions/shared/attemptPolicy.mjs';
import {
  ALL_STUDENTS,
  CLASS_ID,
  LEGACY_V4_FLAGS,
  LEGACY_V6_DOL_OBJECT,
  LEGACY_V8_EVERYTHING,
  TEACHER,
  legacyAssignment,
} from '../fixtures/studentAssignmentOverrideLegacyFixtures.mjs';

const db = getFirestore(initializeApp({ projectId: 'demo-teacher-controls-unit', apiKey: 'unit' }, 'teacher-controls-unit'));

const describeQuery = (built) => ({
  path: built._query.path.segments.join('/'),
  filters: built._query.filters.map((filter) => ({
    field: filter.field.segments.join('.'),
    op: filter.op,
    value: filter.value.stringValue ?? filter.value.arrayValue?.values?.map((entry) => entry.stringValue),
  })),
});

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
    if (plan.record) records[studentId] = plan.record;
  });
  const stripped = JSON.parse(JSON.stringify(assignment));
  planSharedAssignmentStrip(assignment).forEach(({ op, path, value }) => {
    const parent = path.slice(0, -1).reduce((node, key) => node[key], stripped);
    if (op === 'delete') delete parent[path[path.length - 1]];
    else parent[path[path.length - 1]] = value;
  });
  return { legacy: assignment, stripped, records };
};

const readyFor = (records, classIds = [CLASS_ID]) => {
  const scopeKey = teacherControlsScopeKey({ email: TEACHER, classIds });
  return { scopeKey, status: TEACHER_CONTROLS_STATUS.READY, classIds, ...controlsByAssignment(Object.values(records), classIds) };
};

/* --------------------------------------------------------- the one query */

test('18. one query per teacher view: their authorization and the classes on screen — never the school', () => {
  assert.deepEqual(describeQuery(teacherClassControlsQuery(db, { email: 'Teacher.A@Example.test', classIds: ['class-a'] })), {
    path: 'studentAssignmentOverrides',
    filters: [
      { field: 'authorizedTeacherEmails', op: 'array-contains', value: 'teacher.a@example.test' },
      { field: 'classId', op: '==', value: 'class-a' },
    ],
  });
  assert.deepEqual(describeQuery(teacherClassControlsQuery(db, { email: 'teacher.a@example.test', classIds: ['class-a', 'class-b'] })).filters[1],
    { field: 'classId', op: 'in', value: ['class-a', 'class-b'] });
  // A root administrator reads through the rules' root clause: the classes alone.
  assert.deepEqual(describeQuery(teacherClassControlsQuery(db, { email: 'root@example.test', isRootAdmin: true, classIds: ['class-a', 'class-c'] })).filters,
    [{ field: 'classId', op: 'in', value: ['class-a', 'class-c'] }]);
  // No class or no teacher identity: no query at all, never an unscoped one.
  assert.throws(() => teacherClassControlsQuery(db, { email: TEACHER, classIds: [] }));
  assert.throws(() => teacherClassControlsQuery(db, { email: '', classIds: ['class-a'] }));
  assert.equal(teacherControlsScopeKey({ email: TEACHER, classIds: [] }), '', 'no class on screen, no listener');
  assert.equal(teacherControlsScopeKey({ email: '', classIds: ['class-a'] }), '');
});

test('the scope is the classes on screen: the working class first, surfaces next, taught classes only on cross-class tabs', () => {
  assert.deepEqual(teacherControlsClassIds({ activeClassId: 'p3', surfaceClassIds: [null, 'p3', 'lab'], crossClassTab: false, taughtClassIds: ['p1', 'p2'] }), ['p3', 'lab']);
  assert.deepEqual(teacherControlsClassIds({ activeClassId: 'p3', crossClassTab: true, taughtClassIds: ['p1', 'p3', 'p2'] }), ['p3', 'p1', 'p2']);
  assert.deepEqual(teacherControlsClassIds({ activeClassId: null, surfaceClassIds: [] }), []);
  const many = Array.from({ length: 45 }, (_, index) => `c${index}`);
  assert.equal(teacherControlsClassIds({ activeClassId: 'c44', crossClassTab: true, taughtClassIds: many }).length, MAX_TEACHER_CONTROLS_CLASSES);
  assert.equal(teacherControlsClassIds({ activeClassId: 'c44', crossClassTab: true, taughtClassIds: many })[0], 'c44', 'the working class is never the one cut');
  // A key per (viewer, classes); the same classes in a different order are a different listener only if the order changes the first class.
  const key = teacherControlsScopeKey({ email: TEACHER, classIds: ['p3', 'lab'] });
  assert.deepEqual(decodeTeacherControlsScope(key), { email: TEACHER, isRootAdmin: false, classIds: ['p3', 'lab'] });
  assert.equal(teacherControlsScopeKey({ email: TEACHER.toUpperCase(), classIds: ['p3', 'lab'] }), key, 'the email is compared lower-case, as the rules do');
  assert.notEqual(teacherControlsScopeKey({ email: TEACHER, classIds: ['lab'] }), key);
});

test('14. a class switch replaces the listener: the old one is closed before the new one opens, never two', () => {
  const open = new Set();
  const opened = [];
  const listen = (built) => {
    const entry = describeQuery(built);
    open.add(entry);
    opened.push(entry);
    return () => open.delete(entry);
  };
  // The hook's effect: subscribe for a key; on a key change, unsubscribe, then subscribe again.
  let unsubscribe = subscribeTeacherClassControls({ db, scopeKey: teacherControlsScopeKey({ email: TEACHER, classIds: ['p3'] }), onChange: () => {}, listen });
  assert.equal(open.size, 1);
  ['lab', 'p1', 'p3', 'lab'].forEach((classId) => {
    unsubscribe();
    unsubscribe = subscribeTeacherClassControls({ db, scopeKey: teacherControlsScopeKey({ email: TEACHER, classIds: [classId] }), onChange: () => {}, listen });
    assert.equal(open.size, 1, `exactly one open after switching to ${classId}`);
  });
  assert.equal(opened.length, 5, 'one subscription per class visited, none per student');
  assert.deepEqual(opened.map((entry) => entry.filters[1].value), ['p3', 'lab', 'p1', 'p3', 'lab']);
  unsubscribe();
  assert.equal(open.size, 0, 'sign-out (no key) leaves none');
  assert.equal(typeof subscribeTeacherClassControls({ db, scopeKey: '', onChange: () => {}, listen }), 'function');
  assert.equal(open.size, 0);
});

test('controls held for one scope are never returned for another (another viewer, another class)', () => {
  const { records } = retiredWorld();
  const held = readyFor(records);
  assert.equal(controlsForScope(held, held.scopeKey), held);
  assert.equal(controlsForScope(held, teacherControlsScopeKey({ email: 'other@example.test', classIds: [CLASS_ID] })), EMPTY_TEACHER_CONTROLS);
  assert.equal(controlsForScope(held, ''), EMPTY_TEACHER_CONTROLS);
  // Records outside the scope's classes are dropped even if a snapshot carried them.
  const strayClass = controlsByAssignment([{ ...records[LEGACY_V4_FLAGS], classId: 'other-class' }], [CLASS_ID]);
  assert.deepEqual(strayClass, { byAssignment: {}, recordCount: 0 });
});

/* ------------------------------------------ the teacher's merged view */

test('11 / 12. Grade Center flags, Grade Transfer holds and DOL budgets read the private record once retired', () => {
  const { legacy, stripped, records } = retiredWorld();
  const [view] = projectTeacherAssignments({ assignments: [stripped], controls: readyFor(records) });
  ALL_STUDENTS.forEach((studentId) => {
    assert.equal(assignmentIsExcusedForStudent(view, studentId), assignmentIsExcusedForStudent(legacy, studentId), `${studentId} excused`);
    assert.equal(assignmentIsReopenedForStudent(view, studentId), assignmentIsReopenedForStudent(legacy, studentId), `${studentId} reopened`);
    const held = resolveStudentFinalDeadlineFromAssignment({ student: { id: studentId }, assignment: view });
    const before = resolveStudentFinalDeadlineFromAssignment({ student: { id: studentId }, assignment: legacy });
    assert.equal(held.reopened, before.reopened, `${studentId}: Grade Transfer holds reopened work`);
    assert.equal(Date.parse(held.deadline || '') || null, Date.parse(before.deadline || '') || null, `${studentId}: Grade Transfer withholds until their own cutoff`);
    assert.equal(
      resolveTeacherGrantedExtraAttempts({ assignment: view, activityRole: 'dol', classId: CLASS_ID, studentId }),
      resolveTeacherGrantedExtraAttempts({ assignment: legacy, activityRole: 'dol', classId: CLASS_ID, studentId }),
    );
  });
  // Without the records (another class on screen) the stripped lesson says nothing per-student.
  const [unread] = projectTeacherAssignments({ assignments: [stripped], controls: EMPTY_TEACHER_CONTROLS });
  assert.equal(unread.studentOverrides, undefined);
});

test('the teacher\'s view changes `studentOverrides` only — never the `dol` a class action writes back', () => {
  const { legacy, records } = retiredWorld();
  const newer = { ...records[LEGACY_V6_DOL_OBJECT], dolExtraAttempts: 5 };
  const [view] = projectTeacherAssignments({ assignments: [legacy], controls: readyFor({ ...records, [LEGACY_V6_DOL_OBJECT]: newer }) });
  assert.deepEqual(view.dol, legacy.dol);
  assert.deepEqual(view.warmup, legacy.warmup);
  assert.equal(view.studentOverrides[LEGACY_V6_DOL_OBJECT].dolExtraAttempts, 5, 'the newer private grant is what the teacher sees');
  const { studentOverrides: _a, ...rest } = view;
  const { studentOverrides: _b, ...restLegacy } = legacy;
  assert.deepEqual(rest, restLegacy);
});

/* -------------------------- 13. #428 Walkthrough stays a class question */

test('13. Walkthrough eligibility is class-level: an individual extension never makes a closed lesson the class\'s live work', () => {
  const { legacy, stripped, records } = retiredWorld();
  // Every student's controls, including LEGACY_V8's extension to 2026-10-09
  // — long after the class's final cutoff (2026-09-25).
  const [view] = projectTeacherAssignments({ assignments: [stripped], controls: readyFor(records) });
  [
    '2026-09-15T15:00:00.000Z', '2026-09-17T15:00:00.000Z', '2026-09-22T15:00:00.000Z',
    '2026-09-28T15:00:00.000Z', '2026-10-05T15:00:00.000Z',
  ].map((iso) => Date.parse(iso)).forEach((nowValue) => {
    const raw = walkthroughEligibility({ assignment: legacy, classId: CLASS_ID, nowValue });
    const projected = walkthroughEligibility({ assignment: view, classId: CLASS_ID, nowValue });
    assert.equal(projected.eligible, raw.eligible, new Date(nowValue).toISOString());
    assert.equal(projected.reason, raw.reason);
    assert.equal(getAssignmentLifecycle(view, nowValue).status, getAssignmentLifecycle(legacy, nowValue).status, 'class lifecycle');
    assert.equal(studentAssignmentAvailability({ assignment: view, classId: CLASS_ID, nowValue }).practiceOnly, raw.availability.practiceOnly);
  });
  const afterClassCutoff = Date.parse('2026-10-05T15:00:00.000Z');
  assert.equal(walkthroughEligibility({ assignment: view, classId: CLASS_ID, nowValue: afterClassCutoff }).eligible, false, 'the class cannot Walk Through a closed lesson');
  // …while the extended student still has it open: individual availability stays individual.
  assert.notEqual(getAssignmentLifecycle(view, afterClassCutoff, { studentId: LEGACY_V8_EVERYTHING }).status, 'closed');
});
