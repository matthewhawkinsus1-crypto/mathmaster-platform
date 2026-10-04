// A STUDENT'S EXTRA DOL ATTEMPT IS GRANTED BY THE SERVER; THE BROWSER WRITES ONLY CLASS FIELDS.
//
// The client follow-up to PR #432 removes the last browser write of a
// per-student control (docs/architecture/student-assignment-overrides.md §9.3):
//
//   * "+1 DOL attempt" for selected students is a request to
//     setStudentAssignmentControls — grouped by each student's own class, at
//     most 60 per call, one request in flight per set of students
//     (src/platform/assessment/dolAttemptGrantClient.js);
//   * every class-level DOL action writes only the `dol` fields it changed, as
//     dotted paths — so neither it nor a stale tab can carry
//     `dol.attemptGrantsByStudentId` back to the shared assignment;
//   * App.jsx contains no write of the whole `dol` map and no per-student grant.
//
// The server side at 1/5/30/60 students, duplicate requests, concurrent
// teachers, the cap and an unauthorized teacher run against Firestore in
// tests/integration/studentAssignmentOverrides.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAX_STUDENTS_PER_CONTROLS_CALL,
  classDolFieldPatch,
  controlsRequestKey,
  createControlsRequestGate,
  planStudentDolGrant,
  runStudentControlsCalls,
} from '../../src/platform/assessment/dolAttemptGrantClient.js';
import {
  buildDolAttemptGrant,
  buildDolClose,
  buildDolDateMove,
  buildDolExtension,
  buildDolScheduleRestore,
  buildDolWindowOpening,
} from '../../src/platform/assessment/assessmentRecovery.js';
import { MAX_STUDENTS_PER_CHANGE } from '../../functions/shared/studentAssignmentOverrideStore.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { CLASS_ID, LEGACY_V6_DOL_OBJECT, legacyAssignment } from '../fixtures/studentAssignmentOverrideLegacyFixtures.mjs';

const DELETE = Symbol('deleteField');
const students = (count, classId = 'class-a', prefix = 's') => Array.from({ length: count }, (_, index) => ({ id: `${prefix}${index + 1}`, classId }));

/** Apply a dotted `dol.x` patch to a stored document the way Firestore does. */
const applyPatch = (stored, patch) => {
  const next = JSON.parse(JSON.stringify(stored));
  Object.entries(patch).forEach(([path, value]) => {
    const segments = path.split('.');
    const parent = segments.slice(0, -1).reduce((node, key) => { node[key] = node[key] || {}; return node[key]; }, next);
    if (value === DELETE) delete parent[segments[segments.length - 1]];
    else parent[segments[segments.length - 1]] = JSON.parse(JSON.stringify(value));
  });
  return next;
};

/* ------------------------------------------------- planning the requests */

test('one request per class, at most 60 students each: 1, 5, 30, 60 and 61 students', () => {
  assert.equal(MAX_STUDENTS_PER_CONTROLS_CALL, MAX_STUDENTS_PER_CHANGE, 'the client splits exactly where the server refuses');
  [1, 5, 30, 60].forEach((count) => {
    const { calls, unplaced } = planStudentDolGrant({ assignmentId: 'A1', students: students(count) });
    assert.equal(calls.length, 1, `${count} students: one call`);
    assert.equal(calls[0].studentIds.length, count);
    assert.deepEqual(calls[0].change, { kind: 'dolAttempts', increment: 1, reason: 'teacher-dol-recovery' });
    assert.deepEqual(unplaced, []);
  });
  const { calls } = planStudentDolGrant({ assignmentId: 'A1', students: students(61) });
  assert.deepEqual(calls.map((call) => call.studentIds.length), [60, 1]);
  assert.equal(new Set(calls.flatMap((call) => call.studentIds)).size, 61, 'every student exactly once');
});

test('students are grouped by their OWN class; one with none falls back to the working class, or is not sent', () => {
  const { calls, unplaced } = planStudentDolGrant({
    assignmentId: 'A1',
    students: [...students(2, 'p3'), ...students(2, 'lab', 'l'), { id: 'x1', classId: null }, { id: 's1', classId: 'p3' }],
    fallbackClassId: 'p3',
  });
  assert.deepEqual(calls.map((call) => [call.classId, call.studentIds]), [['lab', ['l1', 'l2']], ['p3', ['s1', 's2', 'x1']]]);
  assert.deepEqual(unplaced, []);
  assert.deepEqual(planStudentDolGrant({ assignmentId: 'A1', students: [{ id: 'x1' }] }).unplaced, ['x1']);
});

test('a refused group is reported with its students and reason; the others are still granted', async () => {
  const { calls } = planStudentDolGrant({ assignmentId: 'A1', students: [...students(2, 'p3'), ...students(1, 'other', 'o')] });
  const outcome = await runStudentControlsCalls({
    calls,
    call: async (request) => {
      if (request.classId === 'other') throw Object.assign(new Error('Only the class\'s teacher of record can grant an extra DOL attempt.'), { code: 'functions/permission-denied' });
      return { students: request.studentIds.map((studentId) => ({ studentId, dolExtraAttempts: 1 })) };
    },
  });
  assert.deepEqual(outcome.students.map((row) => row.studentId), ['s1', 's2']);
  assert.deepEqual(outcome.failures, [{ classId: 'other', studentIds: ['o1'], code: 'permission-denied', message: 'Only the class\'s teacher of record can grant an extra DOL attempt.' }]);
});

test('duplicate click: a second identical request while the first is in flight grants nothing more', async () => {
  const gate = createControlsRequestGate();
  let calls = 0;
  let release;
  const start = () => new Promise((resolve) => { calls += 1; release = resolve; });
  const key = controlsRequestKey({ assignmentId: 'A1', studentIds: ['s2', 's1'], kind: 'dolAttempts' });
  assert.equal(key, controlsRequestKey({ assignmentId: 'A1', studentIds: ['s1', 's2', 's1'], kind: 'dolAttempts' }), 'the same students in any order are the same request');
  const first = gate.run(key, start);
  const second = gate.run(key, start);
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.promise, first.promise);
  assert.equal(gate.pending(key), true);
  await Promise.resolve();
  release('done');
  assert.equal(await first.promise, 'done');
  assert.equal(calls, 1, 'one grant for a double click');
  assert.equal(gate.pending(key), false);
  // Once it has settled, a new click is a new grant.
  const third = gate.run(key, async () => { calls += 1; });
  await third.promise;
  assert.equal(calls, 2);
});

/* ------------------------------------ class actions write class fields only */

test('every class-level DOL action writes only the fields it changed — never a student\'s grant', () => {
  const assignment = legacyAssignment();
  const now = Date.parse('2026-09-16T15:40:00.000Z');
  const built = {
    open: buildDolWindowOpening({ assignment, classId: CLASS_ID, classPeriod: 'Period 1', recovery: true, durationMinutes: 10, dateKey: '2026-09-16', teacherId: 'uid-t', now }),
    classGrant: buildDolAttemptGrant({ assignment, scope: { type: 'class', classId: CLASS_ID }, teacherId: 'uid-t', now }),
    close: buildDolClose({ assignment, classId: CLASS_ID, dateKey: '2026-09-16', teacherId: 'uid-t', now }),
    extend: buildDolExtension({ assignment, classId: CLASS_ID, dateKey: '2026-09-16', currentEndsAtMs: now + 60_000, minutes: 5, capAtMs: null, teacherId: 'uid-t', now }),
    move: buildDolDateMove({ assignment, classId: CLASS_ID, classPeriod: 'Period 1', toDateKey: '2026-09-18', todayKey: '2026-09-16', teacherId: 'uid-t', now }),
  };
  built.restore = buildDolScheduleRestore({ assignment: { ...assignment, dol: built.move.dol }, classId: CLASS_ID, todayKey: '2026-09-16', teacherId: 'uid-t', now });
  Object.entries(built).forEach(([action, { dol }]) => {
    const base = action === 'restore' ? built.move.dol : assignment.dol;
    const patch = classDolFieldPatch(base, dol, { deleteValue: DELETE });
    assert.ok(Object.keys(patch).length > 0, `${action} writes something`);
    assert.ok(Object.keys(patch).every((field) => field.startsWith('dol.')), `${action}: dotted dol fields only`);
    assert.equal(Object.keys(patch).some((field) => field.startsWith('dol.attemptGrantsByStudentId')), false, `${action} never writes a student's grant`);
    // Applied to the stored lesson, the class state is exactly what the action built.
    const stored = { ...assignment, dol: base };
    const after = applyPatch(stored, patch);
    const { attemptGrantsByStudentId: _ignored, ...builtClass } = dol;
    const { attemptGrantsByStudentId: kept, ...afterClass } = after.dol;
    assert.deepEqual(afterClass, JSON.parse(JSON.stringify(builtClass)), `${action}: the class change lands whole`);
    assert.deepEqual(kept, base.attemptGrantsByStudentId, `${action}: students' grants untouched`);
  });
  // A student-scoped grant through this path is refused outright.
  const studentsGrant = buildDolAttemptGrant({ assignment, scope: { type: 'students', studentIds: ['S_X'] }, now });
  assert.throws(() => classDolFieldPatch(assignment.dol, studentsGrant.dol, { deleteValue: DELETE }), /setStudentAssignmentControls/);
});

test('a stale tab\'s class action cannot take a student\'s newer grant away', () => {
  const stale = legacyAssignment(); // this tab: LEGACY_V6 has 2 extra attempts
  const server = legacyAssignment();
  // Since this tab last heard, the callable granted LEGACY_V6 two more and mirrored it.
  server.dol.attemptGrantsByStudentId[LEGACY_V6_DOL_OBJECT] = { extraAttempts: 4, changedAt: '2026-09-17T15:00:00.000Z', changedBy: 'teacher', reason: 'teacher-dol-recovery' };
  const { dol } = buildDolClose({ assignment: stale, classId: CLASS_ID, dateKey: '2026-09-16', teacherId: 'uid-t', now: Date.parse('2026-09-16T15:45:00.000Z') });
  const after = applyPatch(server, classDolFieldPatch(stale.dol, dol, { deleteValue: DELETE }));
  assert.equal(after.dol.attemptGrantsByStudentId[LEGACY_V6_DOL_OBJECT].extraAttempts, 4, 'the server\'s grant survives the stale tab\'s write');
  // The old whole-map write would have put 2 back:
  assert.equal({ ...server, dol }.dol.attemptGrantsByStudentId[LEGACY_V6_DOL_OBJECT].extraAttempts, 2);
});

test('a removed field is deleted, and only with the deleteField sentinel', () => {
  assert.deepEqual(classDolFieldPatch({ enabled: true, earlyUnlocks: { p1: true } }, { enabled: true }, { deleteValue: DELETE }), { 'dol.earlyUnlocks': DELETE });
  assert.throws(() => classDolFieldPatch({ enabled: true, earlyUnlocks: {} }, { enabled: true }), /deleteValue/);
  assert.deepEqual(classDolFieldPatch({ enabled: true }, { enabled: true }), {}, 'no change, no write');
  assert.deepEqual(classDolFieldPatch(undefined, { enabled: true, instructionDate: '2026-09-18' }), { 'dol.enabled': true, 'dol.instructionDate': '2026-09-18' });
});

/* --------------------------------------------- App.jsx: the wiring itself */

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
const code = executableSource(app);

test('App: the per-student grant goes to the callable, and is imported next to where it is used', () => {
  assert.match(app, /import \{ setStudentAssignmentControls \} from '\.\/services\/studentAssignmentControlsService\.js';/);
  assert.match(app, /import \{[^}]*\bplanStudentDolGrant\b[^}]*\brunStudentControlsCalls\b[^}]*\} from '\.\/platform\/assessment\/dolAttemptGrantClient\.js';/);
  const handler = executableSource(region(app, 'const handleGrantDOLAttemptForStudents = async', 'const handleDolControlForClass', 'per-student DOL grant'));
  assert.match(handler, /studentControlsGateRef\.current\.pending\(requestKey\)/, 'a click while the first is in flight is ignored');
  assert.match(handler, /studentControlsGateRef\.current\.run\(requestKey,/);
  assert.match(handler, /runStudentControlsCalls\(\{ call: setStudentAssignmentControls, calls \}\)/);
  assert.doesNotMatch(handler, /updateDoc\(|buildDolAttemptGrant\(|attemptGrantsByStudentId/);
});

test('App: no browser write carries the whole `dol` map or a student\'s grant', () => {
  // Every assignment write that touches DOL goes through classDolFieldPatch.
  assert.doesNotMatch(code, /updateDoc\([^;]*\{\s*dol\s*[,:}]/, 'no `{ dol }` / `{ dol: … }` whole-map update');
  assert.doesNotMatch(code, /updateDoc\(doc\(db, 'assignments', [^)]*\), patch\);/, 'a patch carrying `dol` is never written whole');
  assert.doesNotMatch(code, /attemptGrantsByStudentId/, 'the browser never names a student\'s grant map');
  const patched = code.match(/classDolFieldPatch\(/g) || [];
  assert.equal(patched.length, 5, 'opening, the class grant, close/extend/move/restore, the setup editor and the date editor');
});
