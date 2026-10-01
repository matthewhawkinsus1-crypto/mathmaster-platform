import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STUDENT_NAME_UNAVAILABLE,
  STUDENT_SELF_NEUTRAL_LABEL,
  compareStudentsByName,
  formatStudentLabel,
  formatStudentName,
  resolveRosterStudentName,
  resolveStudentDisplayName,
  splitLegacyDisplayName,
  studentNameParts,
  studentSearchText,
} from '../../src/platform/studentName.js';

// Every name in this file is invented for the test.

test('structured first and last names render TEAMS-style', () => {
  assert.equal(formatStudentName({ firstName: 'Quinn', lastName: 'Samplewood', id: '67' }), 'Samplewood, Quinn');
});

test('legacy displayName remains compatible', () => {
  assert.deepEqual(splitLegacyDisplayName('Quinn Samplewood'), { firstName: 'Quinn', lastName: 'Samplewood' });
  assert.deepEqual(studentNameParts({ displayName: 'Quinn Samplewood' }), { firstName: 'Quinn', lastName: 'Samplewood' });
  assert.equal(formatStudentName({ displayName: 'Quinn Samplewood', id: '67' }), 'Samplewood, Quinn');
  // A stored "Last, First" reads as last-then-first, not as a first name "Samplewood,".
  assert.deepEqual(splitLegacyDisplayName('Samplewood, Quinn'), { firstName: 'Quinn', lastName: 'Samplewood' });
});

test('natural instructional names and the explicit unresolved state are canonical', () => {
  assert.equal(
    formatStudentName({ firstName: 'Quinn', lastName: 'Samplewood' }, { lastFirst: false }),
    'Quinn Samplewood',
  );
  assert.equal(formatStudentName({ studentName: 'Ana Fixturez' }, { lastFirst: false }), 'Ana Fixturez');
  // The unresolved label changed from the neutral 'Student' to an explicit
  // state a teacher can act on: a missing name must look missing.
  assert.equal(formatStudentName({ id: 'long-internal-uid-123' }), STUDENT_NAME_UNAVAILABLE);
  assert.equal(STUDENT_NAME_UNAVAILABLE, 'Name unavailable');
  // There is no "fall back to the id" any more: the option is ignored, so a
  // caller can never present an id as a name.
  assert.equal(formatStudentName({ id: 'support-id' }, { fallbackToId: true }), STUDENT_NAME_UNAVAILABLE);
  assert.equal(formatStudentName({ id: '101410' }, { fallbackToId: true, fallbackToNeutral: false }), '');
});

test('a stored id, email or placeholder is never a name', () => {
  assert.equal(formatStudentName({ id: '101410', displayName: '101410' }), STUDENT_NAME_UNAVAILABLE);
  assert.equal(formatStudentName({ studentId: '101410', studentName: 'Student 101410' }), STUDENT_NAME_UNAVAILABLE);
  assert.equal(formatStudentName({ id: 'S123', displayName: 's123' }), STUDENT_NAME_UNAVAILABLE);
  assert.equal(formatStudentName({ id: '7', displayName: 'kid@example.test' }), STUDENT_NAME_UNAVAILABLE);
  assert.equal(formatStudentName({ id: '7', displayName: 'Student' }), STUDENT_NAME_UNAVAILABLE);
  // A real name further down the precedence still wins over a bad stored one.
  assert.equal(
    formatStudentName({ id: '101410', displayName: '101410', googleName: 'Rowan Exampleton' }, { lastFirst: false }),
    'Rowan Exampleton',
  );
});

test('one-line labels show the id only as a labelled id', () => {
  assert.equal(formatStudentLabel({ id: '101410' }), 'Name unavailable · ID 101410');
  assert.equal(formatStudentLabel({ id: '101410', firstName: 'Rowan', lastName: 'Exampleton' }), 'Exampleton, Rowan');
  assert.equal(
    formatStudentLabel({ id: '101410', firstName: 'Rowan', lastName: 'Exampleton' }, { lastFirst: false, includeId: true }),
    'Rowan Exampleton · ID 101410',
  );
  assert.equal(formatStudentLabel('101410'), 'Name unavailable · ID 101410');
});

test('student display name hydration prefers roster, then a real session name, then neutral fallback', () => {
  assert.equal(resolveStudentDisplayName({
    rosterStudent: { id: 'S123', firstName: 'Jordan', lastName: 'Fixture' },
    sessionDisplayName: 'Different Google Name',
  }), 'Jordan Fixture');
  assert.equal(resolveStudentDisplayName({
    rosterStudent: { id: 'S123' },
    sessionDisplayName: 'Jordan Fixture',
  }), 'Jordan Fixture');
  assert.equal(resolveStudentDisplayName({
    rosterStudent: { id: 'S123' },
    sessionDisplayName: '',
  }), STUDENT_SELF_NEUTRAL_LABEL);
  assert.equal(resolveStudentDisplayName({
    rosterStudent: { id: 'long-internal-student-id' },
  }), 'Student');
  // A passcode session's Firebase displayName is the student id: not a name.
  assert.equal(resolveStudentDisplayName({
    rosterStudent: {},
    studentId: '101410',
    sessionDisplayName: '101410',
  }), STUDENT_SELF_NEUTRAL_LABEL);
  assert.equal(
    formatStudentName({ id: 'long-internal-student-id' }, { fallbackToNeutral: false }),
    '',
    'callers may explicitly defer the neutral fallback while trying another human-name source',
  );
  assert.equal(formatStudentName({ id: 'long-internal-student-id' }, { neutralLabel: 'Student' }), 'Student');
});

test('students sort by last name, then first name, then ID; missing names last', () => {
  const students = [
    { id: '40' },
    { id: '30', firstName: 'Zoey', lastName: 'Adamsample' },
    { id: '20', firstName: 'Quinn', lastName: 'Samplewood' },
    { id: '10', firstName: 'Aaron', lastName: 'Samplewood' },
  ];
  assert.deepEqual(students.sort(compareStudentsByName).map((student) => student.id), ['30', '10', '20', '40']);
});

test('search includes structured and legacy names and ids', () => {
  const text = studentSearchText({ id: '67', firstName: 'Quinn', lastName: 'Samplewood', classPeriod: 'Period 1' });
  assert.match(text, /quinn/);
  assert.match(text, /samplewood/);
  assert.match(text, /samplewood, quinn/);
  assert.match(text, /\b67\b/);
  assert.match(text, /period 1/);
  assert.match(studentSearchText({ id: '68', googleName: 'Rowan Exampleton' }), /rowan exampleton/);
});

test('persisted student ids resolve through the current roster before historical or unavailable names', () => {
  const students = [{ id: 'S123', firstName: 'Jordan', lastName: 'Fixture' }];
  assert.equal(resolveRosterStudentName({ studentId: 'S123', students }), 'Jordan Fixture');
  assert.equal(resolveRosterStudentName({ studentId: 'S123', students, historicalName: 'Old Name' }), 'Jordan Fixture');
  assert.equal(resolveRosterStudentName({ studentId: 'gone', students, historicalName: 'Avery Fixturely' }), 'Avery Fixturely');
  assert.equal(resolveRosterStudentName({ studentId: 'long-unknown-uid', students }), STUDENT_NAME_UNAVAILABLE);
  assert.equal(resolveRosterStudentName({ studentId: 'long-unknown-uid', students, historicalName: 'long-unknown-uid' }), STUDENT_NAME_UNAVAILABLE);
  // A roster row that has no name no longer hides a real stored name.
  assert.equal(
    resolveRosterStudentName({ studentId: '900', students: [{ id: '900' }], historicalName: 'Avery Fixturely' }),
    'Avery Fixturely',
  );
  // ...and a roster row whose stored name is its own id is not a name either.
  assert.equal(
    resolveRosterStudentName({ studentId: '900', students: [{ id: '900', displayName: '900' }] }),
    STUDENT_NAME_UNAVAILABLE,
  );
  // An explicit identity index is used as-is (O(1), no roster scan).
  const index = new Map([['S123', { id: 'S123', firstName: 'Indexed', lastName: 'Fixture' }]]);
  assert.equal(resolveRosterStudentName({ studentId: 'S123', students: [], index }), 'Indexed Fixture');
});

test('a structured first or last name is a real name even when it is a common word', () => {
  // The placeholder list rejects stored WHOLE-name copies such as 'Student';
  // a single part is a person's real name, and any word can be a surname.
  assert.equal(formatStudentName({ id: '5', firstName: 'Shell', lastName: 'Student' }, { lastFirst: false }), 'Shell Student');
  assert.equal(formatStudentName({ id: '6', displayName: 'Student' }), STUDENT_NAME_UNAVAILABLE);
  // An id in a part is still never a name.
  assert.equal(formatStudentName({ id: '101410', firstName: '101410', lastName: 'Student' }, { lastFirst: false }), 'Student');
});
