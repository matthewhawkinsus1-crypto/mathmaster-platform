// The teacher-workflow harness's student identity edge cases
// (tests/browser/teacherWorkflow/fixture.js), which studentNameJourneys.mjs
// drives through the real app. CI cannot run the browser journeys, so this
// pins what they depend on: the five invented edge students exist in the Lab
// section with live presence, the shared roster projection resolves each one
// the way the journeys expect, and adding them moved no existing student (the
// other journeys address students by serial id and by position in Period 3).

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IDENTITY_EDGE_IDS, IDENTITY_EDGE_STUDENTS, IDENTITY_NAME_TO_ADD, TEACHER_EMAIL, buildTeacherWorkflowFixture,
} from '../browser/teacherWorkflow/fixture.js';
import {
  TEACHER_ROSTER_SELECT_FIELDS, buildTeacherRosterSummaryRow, compareStudentIdentities, validateStudentNameInput,
} from '../../functions/shared/studentIdentity.mjs';

class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromMillis(ms) { return new Timestamp(ms); }
  static now() { return new Timestamp(Date.now()); }
  toMillis() { return this.ms; }
}
const NOW = Date.UTC(2026, 9, 1, 15, 30);
const fixture = buildTeacherWorkflowFixture({ now: NOW, Timestamp });
const rosterIds = Object.keys(fixture).filter((key) => /^grades\/[^/]+$/.test(key)).map((key) => key.split('/')[1]);
const project = (id) => buildTeacherRosterSummaryRow(id, Object.fromEntries(
  TEACHER_ROSTER_SELECT_FIELDS.filter((field) => fixture[`grades/${id}`][field] !== undefined).map((field) => [field, fixture[`grades/${id}`][field]]),
));

test('the edge students are in the in-session Lab section, working, with nothing graded', () => {
  assert.deepEqual(IDENTITY_EDGE_IDS, ['910090', '910091', '910092', '910093', '910094']);
  IDENTITY_EDGE_IDS.forEach((id) => {
    const record = fixture[`grades/${id}`];
    assert.equal(record.classId, 'c-lab-p3', id);
    assert.equal(record.assignedTeacherEmail, TEACHER_EMAIL, id);
    assert.equal(record.status, 'active', id);
    assert.deepEqual(record.gradesByAssignment, {}, id);
    assert.equal(fixture[`presence/${id}`]?.assignmentId, 'a-today', `${id} is a Live Class tile`);
    assert.equal(fixture[`presence/${id}`]?.name, undefined, `${id}: presence carries no name; the tile must use the roster`);
  });
});

test('the shared roster projection resolves each edge case the way the journeys expect', () => {
  const google = project('910090');
  assert.equal(google.displayName, 'Rowan Exampleton');
  assert.equal(google.nameSource, 'googleName');
  assert.equal(google.nameMissing, false);
  ['910091', '910092'].forEach((id) => {
    const row = project(id);
    assert.equal(row.nameMissing, true, id);
    assert.equal(row.displayName, null, `${id}: the id is never a name`);
  });
  const twins = ['910093', '910094'].map(project);
  assert.deepEqual(twins.map((row) => row.displayName), ['Juniper Samplewood', 'Juniper Samplewood']);
  assert.deepEqual(twins.map((row) => row.studentId), ['910093', '910094'], 'same name, two students');
  const ordered = IDENTITY_EDGE_IDS.map(project).sort(compareStudentIdentities).map((row) => row.studentId);
  assert.deepEqual(ordered.slice(-2), ['910091', '910092'], 'students with no name sort last');
  assert.equal(validateStudentNameInput(IDENTITY_NAME_TO_ADD, { studentId: '910091' }).ok, true, 'the name N4 adds is valid');
  assert.equal(validateStudentNameInput({ ...IDENTITY_NAME_TO_ADD, firstName: '910091' }, { studentId: '910091' }).ok, false, 'N4 relies on an id being refused');
});

test('adding the edge students moved no existing student', () => {
  const serial = rosterIds.filter((id) => !IDENTITY_EDGE_IDS.includes(id));
  assert.equal(serial.length, 23);
  assert.ok(serial.includes('wren.sample'));
  // Serials 910001-910023; the first Period 5 student (serial 19) is the non-numeric key.
  assert.deepEqual(serial.filter((id) => id !== 'wren.sample'), Array.from({ length: 23 }, (_, index) => String(910001 + index)).filter((id) => id !== '910019'));
  // Period 3's p3[] order (the support, case review and presence fixtures index it).
  const p3 = rosterIds.filter((id) => fixture[`grades/${id}`].classId === 'c-alg2-p3');
  assert.deepEqual(p3, ['910001', '910002', '910003', '910004', '910005', '910006', '910007', '910008']);
  assert.equal(rosterIds.filter((id) => fixture[`grades/${id}`].classId === 'c-lab-p3').length, 4 + IDENTITY_EDGE_STUDENTS.length);
  assert.deepEqual(rosterIds.slice(-5), IDENTITY_EDGE_IDS, 'pushed after every serial student');
});
