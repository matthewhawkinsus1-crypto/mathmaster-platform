import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStudentsByName,
  formatStudentName,
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
