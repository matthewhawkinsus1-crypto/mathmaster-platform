// A search that returns everything containing "a" is not a search.
//
// The ranking IS the feature, and most of these tests are about the order
// results come back in rather than about whether they come back at all.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESULT_KIND, scoreMatch, searchTeacherWorkspace,
} from '../../src/platform/teacher/teacherSearch.js';

const STUDENTS = [
  { id: '1042', displayName: 'Rivera, Ana', classPeriod: 'Period 3' },
  { id: '1043', displayName: 'Rivas, Marco', classPeriod: 'Period 3' },
  { id: '1044', displayName: 'Okafor, Chidi', classPeriod: 'Period 5' },
  { id: '2201', displayName: 'Nguyen, Anaïs', classPeriod: 'Period 1' },
];

const CLASSES = [
  { classId: 'c-1', name: 'Algebra I — 3rd', period: 'Period 3' },
  { classId: 'c-2', name: 'Algebra II Honors', period: 'Period 5' },
  { classId: 'c-old', name: 'Retired section', period: 'Period 7', status: 'archived' },
];

const ASSIGNMENTS = [
  { id: 'a-1', title: 'Systems of Equations — Practice', assignedClassPeriods: ['Period 3'] },
  { id: 'a-2', title: 'Anatomy of a Parabola', assignedClassPeriods: ['Period 5'] },
];

const STANDARDS = [
  { code: 'A.5C', description: 'Solve systems of two linear equations' },
  { code: 'A.2A', description: 'Determine the domain and range of a linear function' },
];

const search = (query, extra = {}) => searchTeacherWorkspace({
  query, students: STUDENTS, classes: CLASSES, assignments: ASSIGNMENTS, standards: STANDARDS, ...extra,
});

// --- ranking -------------------------------------------------------------------

test('a student ID typed in full outranks every name match', () => {
  // Nobody types "1042" by accident. It is the teacher saying exactly what they
  // meant, and it must not be scored as a fuzzy hit that happened to do well.
  const [first] = search('1042');
  assert.equal(first.kind, RESULT_KIND.STUDENT);
  assert.equal(first.id, '1042');
});

test('a TEKS code typed in full goes straight to the standard', () => {
  const [first] = search('A.5C');
  assert.equal(first.kind, RESULT_KIND.STANDARD);
  assert.equal(first.title, 'A.5C');
});

test('typing a surname finds the student, in stored order', () => {
  const [first] = search('rivera');
  assert.equal(first.title, 'Rivera, Ana');
});

test('typing a first name finds them too, though the roster stores surname first', () => {
  // Rosters store "Rivera, Ana"; teachers think "Ana Rivera". A search that only
  // matched the stored order would fail on the most natural thing to type.
  const results = search('ana');
  assert.ok(results.some((entry) => entry.title === 'Rivera, Ana'));
});

test('a prefix beats a match buried in the middle of a title', () => {
  // "ana" starts "Anatomy of a Parabola" and sits inside several names. The
  // start-of-word matches must come first.
  const results = search('ana');
  const anatomy = results.findIndex((entry) => entry.title === 'Anatomy of a Parabola');
  const buried = results.findIndex((entry) => entry.kind === RESULT_KIND.STANDARD);
  if (anatomy !== -1 && buried !== -1) assert.ok(anatomy < buried);
});

test('students outrank standards when the score ties', () => {
  // A teacher typing into a box beside their class is far more often looking
  // for a child than for a standard whose description shares some letters.
  const results = searchTeacherWorkspace({
    query: 'linear', students: [{ id: '9', displayName: 'Linear, Sam' }], standards: STANDARDS,
  });
  assert.equal(results[0].kind, RESULT_KIND.STUDENT);
});

// --- restraint -----------------------------------------------------------------

test('one letter searches nothing', () => {
  // Otherwise the first keystroke shows a list of everything, which teaches a
  // teacher that the box is noise.
  assert.deepEqual(search('a'), []);
  assert.deepEqual(search(''), []);
  assert.deepEqual(search('   '), []);
});

test('results are capped, because a long list is one a teacher reads instead of typing', () => {
  const many = Array.from({ length: 40 }, (unused, index) => ({
    id: `x${index}`, displayName: `Anderson, Student ${index}`,
  }));
  assert.equal(searchTeacherWorkspace({ query: 'anderson', students: many }).length, 8);
  assert.equal(searchTeacherWorkspace({ query: 'anderson', students: many, limit: 3 }).length, 3);
});

test('archived classes are not offered', () => {
  const results = search('retired');
  assert.ok(!results.some((entry) => entry.kind === RESULT_KIND.CLASS));
});

test('a query matching nothing returns nothing rather than a best guess', () => {
  assert.deepEqual(search('zzzzqqq'), []);
});

// --- what a result carries -----------------------------------------------------

test('every result carries what a caller needs to act, without re-looking it up', () => {
  ['rivera', 'algebra', 'systems', 'A.2A'].forEach((query) => {
    search(query).forEach((entry) => {
      assert.ok(entry.kind && entry.id && entry.title);
      assert.ok(entry.payload && Object.keys(entry.payload).length > 0, `${entry.title} has no payload`);
    });
  });
});

test('a class result carries the period as well as the id', () => {
  // Both, because the workspace class context holds both — the id is
  // authoritative and the period is what legacy student records still use.
  const result = search('algebra i').find((entry) => entry.kind === RESULT_KIND.CLASS);
  assert.equal(result.payload.classId, 'c-1');
  assert.equal(result.payload.classPeriod, 'Period 3');
});

// --- the scorer itself ---------------------------------------------------------

test('scoreMatch orders identifier, prefix, word prefix and substring', () => {
  const exact = scoreMatch('a.5c', 'something else', ['A.5C']);
  const prefix = scoreMatch('riv', 'Rivera, Ana');
  const wordPrefix = scoreMatch('ana', 'Rivera, Ana');
  const contains = scoreMatch('ver', 'Rivera, Ana');
  assert.ok(exact > prefix, 'an identifier beats a prefix');
  assert.ok(prefix > wordPrefix, 'a prefix beats a later word');
  assert.ok(wordPrefix > contains, 'a word start beats a fragment');
  assert.equal(scoreMatch('zzz', 'Rivera, Ana'), 0);
});
