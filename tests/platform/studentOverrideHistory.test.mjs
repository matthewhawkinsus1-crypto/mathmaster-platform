// A STUDENT'S GRANT HISTORY: STAFF READ IT FROM THE PRIVATE HISTORY, ONCE, ON REQUEST.
//
// The per-student DOL grants used to be read from the shared assignment's
// `dol.recoveryAudit`, which every classmate received. A grant made through
// setStudentAssignmentControls is recorded only in the staff-only history
// under the student (grades/{sid}/assignmentOverrideEvents), and at the strip
// each student's share of the old shared log is copied there too
// (functions/shared/studentAssignmentOverrides.mjs). The teacher's screen reads
// it with one bounded query (src/platform/teacher/studentOverrideHistory.js);
// the rules refuse it to the student (tests/rules/studentControlsClientRules.test.mjs).

import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

import {
  describeOverrideChange,
  describeOverrideHistory,
  fetchStudentOverrideHistory,
  overrideHistoryQuery,
} from '../../src/platform/teacher/studentOverrideHistory.js';
import {
  OVERRIDE_CHANGE,
  overrideAuthorizationContext,
  planStudentAbsorption,
  planStudentOverrideChange,
  resolveOverrideStorageMode,
} from '../../functions/shared/studentAssignmentOverrides.mjs';
import { CLASS_ID, LEGACY_V6_DOL_OBJECT, TEACHER, legacyAssignment } from '../fixtures/studentAssignmentOverrideLegacyFixtures.mjs';

const db = getFirestore(initializeApp({ projectId: 'demo-override-history-unit', apiKey: 'unit' }, 'override-history-unit'));
const describeQuery = (built) => ({
  path: built._query.path.segments.join('/'),
  filters: built._query.filters.map((filter) => ({ field: filter.field.segments.join('.'), op: filter.op, value: filter.value.stringValue })),
});

test('one bounded query over one student\'s history: the teacher by authorization, the root admin by assignment', () => {
  assert.deepEqual(describeQuery(overrideHistoryQuery(db, { studentId: 'S1', assignmentId: 'A1', email: 'Teacher.A@Example.test' })), {
    path: 'grades/S1/assignmentOverrideEvents',
    filters: [{ field: 'authorizedTeacherEmails', op: 'array-contains', value: 'teacher.a@example.test' }],
  });
  assert.deepEqual(describeQuery(overrideHistoryQuery(db, { studentId: 'S1', assignmentId: 'A1', isRootAdmin: true })).filters,
    [{ field: 'assignmentId', op: '==', value: 'A1' }]);
  assert.throws(() => overrideHistoryQuery(db, { studentId: '', assignmentId: 'A1', email: TEACHER }));
  assert.throws(() => overrideHistoryQuery(db, { studentId: 'S1', assignmentId: 'A1', email: '' }));
});

test('what a teacher sees: each change, newest first, who acted and what moved — for this assignment only', async () => {
  const authorization = overrideAuthorizationContext({ studentId: LEGACY_V6_DOL_OBJECT, student: { classId: CLASS_ID, assignedTeacherEmail: TEACHER } });
  const assignment = legacyAssignment();
  const migrated = planStudentAbsorption({ assignmentId: 'A1', assignment, studentId: LEGACY_V6_DOL_OBJECT, existingPrivate: null, authorization });
  const granted = planStudentOverrideChange({
    assignmentId: 'A1', assignment, studentId: LEGACY_V6_DOL_OBJECT, existingPrivate: migrated.record,
    change: { kind: OVERRIDE_CHANGE.DOL_ATTEMPTS, increment: 1 }, authorization,
    actor: { email: TEACHER, uid: 'uid-t', role: 'teacher' }, nowMs: Date.parse('2026-09-18T15:00:00.000Z'),
    storageMode: resolveOverrideStorageMode(null),
  });
  const events = [
    { id: migrated.eventId, ...migrated.event, at: '2026-09-17T15:00:00.000Z' },
    { id: granted.eventId, ...granted.event, at: '2026-09-18T15:00:00.000Z' },
    ...migrated.auditCopies.map((copy) => ({ id: copy.eventId, ...copy.event, at: null })),
    { id: 'other', kind: 'excused', assignmentId: 'A2', at: '2026-09-19T15:00:00.000Z' },
  ];
  const history = describeOverrideHistory(events, { assignmentId: 'A1' });
  assert.deepEqual(history.map((entry) => entry.label), ['Extra DOL attempt', 'Copied from the shared assignment', 'DOL recovery log (before private records)']);
  assert.equal(history[0].actor, TEACHER, 'staff see who granted it');
  assert.equal(history[0].summary, 'DOL attempts of their own: 2 → 3');
  assert.match(history[2].summary, /recorded grant: 2 extra/, 'the student\'s own share of the old shared log');
  assert.equal(JSON.stringify(history).includes('S_V8'), false, 'a classmate named in the old shared entry is not in this student\'s copy');
  // Read through the injected reader, once.
  let reads = 0;
  const fetched = await fetchStudentOverrideHistory({
    db, studentId: LEGACY_V6_DOL_OBJECT, assignmentId: 'A1', email: TEACHER,
    read: async () => { reads += 1; return { docs: events.map((event) => ({ id: event.id, data: () => event })) }; },
  });
  assert.equal(reads, 1);
  assert.equal(fetched.length, 3);
  assert.equal(describeOverrideChange({ before: { excused: false }, after: { excused: true } }), 'Excused');
  assert.equal(describeOverrideChange({ before: { reopened: true }, after: { reopened: false } }), 'Reopen removed');
});
