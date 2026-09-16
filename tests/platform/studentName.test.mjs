import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStudentsByName,
  formatStudentName,
  resolveRosterStudentName,
  splitLegacyDisplayName,
  studentNameParts,
  studentSearchText,
} from '../../src/platform/studentName.js';

test('structured first and last names render TEAMS-style', () => {
  assert.equal(formatStudentName({ firstName: 'Matthew', lastName: 'Hawkins', id: '67' }), 'Hawkins, Matthew');
});

test('legacy displayName remains compatible', () => {
  assert.deepEqual(splitLegacyDisplayName('Matthew Hawkins'), { firstName: 'Matthew', lastName: 'Hawkins' });
  assert.deepEqual(studentNameParts({ displayName: 'Matthew Hawkins' }), { firstName: 'Matthew', lastName: 'Hawkins' });
  assert.equal(formatStudentName({ displayName: 'Matthew Hawkins', id: '67' }), 'Hawkins, Matthew');
});

test('natural instructional names and neutral unresolved identities are canonical', () => {
  assert.equal(
    formatStudentName({ firstName: 'Matthew', lastName: 'Hawkins' }, { lastFirst: false }),
    'Matthew Hawkins',
  );
  assert.equal(formatStudentName({ studentName: 'Ana Rivera' }, { lastFirst: false }), 'Ana Rivera');
  assert.equal(formatStudentName({ id: 'long-internal-uid-123' }), 'Student');
  assert.equal(formatStudentName({ id: 'support-id' }, { fallbackToId: true }), 'support-id');
});

test('students sort by last name, then first name, then ID', () => {
  const students = [
    { id: '30', firstName: 'Zoey', lastName: 'Adams' },
    { id: '20', firstName: 'Matthew', lastName: 'Hawkins' },
    { id: '10', firstName: 'Aaron', lastName: 'Hawkins' },
  ];
  assert.deepEqual(students.sort(compareStudentsByName).map((student) => student.id), ['30', '10', '20']);
});

test('search includes structured and legacy names', () => {
  const text = studentSearchText({ id: '67', firstName: 'Matthew', lastName: 'Hawkins', classPeriod: 'Period 1' });
  assert.match(text, /matthew/);
  assert.match(text, /hawkins/);
  assert.match(text, /period 1/);
});

test('persisted student ids resolve through the current roster before historical or neutral names', () => {
  const students = [{ id: 'S123', firstName: 'Jordan', lastName: 'Smith' }];
  assert.equal(resolveRosterStudentName({ studentId: 'S123', students }), 'Jordan Smith');
  assert.equal(resolveRosterStudentName({ studentId: 'S123', students, historicalName: 'Old Name' }), 'Jordan Smith');
  assert.equal(resolveRosterStudentName({ studentId: 'gone', students, historicalName: 'Avery Jones' }), 'Avery Jones');
  assert.equal(resolveRosterStudentName({ studentId: 'long-unknown-uid', students }), 'Student');
  assert.equal(resolveRosterStudentName({ studentId: 'long-unknown-uid', students, historicalName: 'long-unknown-uid' }), 'Student');
});
