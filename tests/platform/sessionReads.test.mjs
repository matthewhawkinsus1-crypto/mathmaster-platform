// WHAT A SESSION COSTS IN FIRESTORE READS, AND THE READS IT NO LONGER MAKES.
//
// tests/browser/teacherWorkflow/sessionReadsProbe.mjs measures a student's
// school day and a teacher's, phase by phase, on the harness built as
// production is, and holds them to budgets. CI cannot run a browser here, so
// this pins what those numbers stand on:
//
//   - the school the probe asks for (`&fullClass=1`): a class of 30 and 20
//     lessons, its student part-way through yesterday's lesson; and nothing of
//     it without the parameter;
//   - each read the probe showed nobody needed, gone, by the behaviour that
//     removed it:
//       the live monitor's Spotlight listeners follow the class's roster, not
//       every presence flush (each flush opened one new query per 8 students);
//       the teacher's per-student presence listeners follow WHO is on the
//       roster, not each new array naming them (leaving Grades re-opened them all).

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { FULL_CLASS, buildTeacherWorkflowFixture } from '../browser/teacherWorkflow/fixture.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
const APP = executableSource(read('src/App.jsx'));
const MONITOR = executableSource(read('src/components/teacher/LiveClassMonitor.jsx'));

class Timestamp {
  constructor(ms) { this.ms = ms; }
  static fromMillis(ms) { return new Timestamp(ms); }
  static now() { return new Timestamp(Date.now()); }
  toMillis() { return this.ms; }
}
const NOW = Date.UTC(2026, 10, 11, 17, 0);
const school = (search) => buildTeacherWorkflowFixture({ now: NOW, Timestamp, params: new URLSearchParams(search) });
const gradeIds = (fixture) => Object.keys(fixture).filter((key) => /^grades\/[^/]+$/.test(key)).map((key) => key.split('/')[1]);
const lessonsFor = (fixture, classId) => Object.entries(fixture)
  .filter(([key, data]) => /^assignments\/[^/]+$/.test(key) && (data.assignedClassIds || []).includes(classId))
  .map(([key, data]) => ({ id: key.split('/')[1], ...data }));

// The effect around an anchor, and its dependency list.
const effectAround = (source, anchor, label) => {
  const match = anchor.exec(source);
  assert.ok(match, `could not find ${label}`);
  const start = source.lastIndexOf('useEffect(', match.index);
  const deps = /\n {2}\}, \[([\s\S]*?)\]\);/.exec(source.slice(match.index));
  assert.ok(start !== -1 && deps, `could not find the effect and dependency list of ${label}`);
  return {
    start,
    body: source.slice(start, match.index + deps.index),
    deps: deps[1].split(',').map((dep) => dep.trim()).filter(Boolean),
  };
};

test('the probe\'s school: a class of 30, 20 lessons, and none of it without &fullClass=1', () => {
  const full = school('fullClass=1');
  const p3 = gradeIds(full).filter((id) => full[`grades/${id}`].classId === 'c-alg2-p3');
  assert.equal(p3.length, 30);
  assert.deepEqual(p3.filter((id) => FULL_CLASS.addedIds.includes(id)), [...FULL_CLASS.addedIds]);
  const lessons = lessonsFor(full, 'c-alg2-p3');
  assert.equal(lessons.length, 20);
  const added = lessons.filter((lesson) => FULL_CLASS.lessonIds.includes(lesson.id));
  assert.equal(added.length, 16);
  added.forEach((lesson) => assert.ok(Date.parse(lesson.lateDueAt) < NOW, `${lesson.id} is closed`));
  // Every student of the class has graded work on every earlier lesson.
  p3.forEach((id) => FULL_CLASS.lessonIds.forEach((lessonId) => {
    assert.ok(Object.keys(full[`grades/${id}`].gradesByAssignment[lessonId] || {}).length > 0, `${id} on ${lessonId}`);
  }));
  // The probe's student: today's Warm-Up done, yesterday's lesson part-done.
  const student = full[`grades/${FULL_CLASS.student}`].gradesByAssignment;
  assert.deepEqual(Object.keys(student['a-today']), ['0']);
  assert.ok(Object.keys(student['a-yesterday']).length < 6);
  // Most of the class at work on today's lesson.
  const working = FULL_CLASS.addedIds.filter((id) => full[`presence/${id}`]?.assignmentId === 'a-today');
  assert.equal(working.length, 18);
  assert.equal(FULL_CLASS.working, 18);

  const base = school('');
  assert.equal(gradeIds(base).filter((id) => base[`grades/${id}`].classId === 'c-alg2-p3').length, 8);
  assert.equal(lessonsFor(base, 'c-alg2-p3').length, 4);
  assert.deepEqual(Object.keys(base).filter((key) => FULL_CLASS.addedIds.some((id) => key.endsWith(`/${id}`)) || FULL_CLASS.lessonIds.some((id) => key.endsWith(`/${id}`))), []);
  assert.deepEqual(Object.keys(school('fullClass=0')), Object.keys(base));
});

test('the live monitor\'s Spotlight listeners follow the class\'s roster, not every presence flush', () => {
  const effect = effectAround(MONITOR, /activeTeacherSpotlightQueries\(db, \{/, 'the Spotlight listeners');
  assert.deepEqual(effect.deps, ['teacherEmail', 'activeClassId', 'spotlightStudentIds']);
  // The ids are a memo of the roster's ids AS A STRING: a new `students`
  // array of the same students gives the same string, so the same array.
  assert.match(MONITOR, /const spotlightStudentIds = useMemo\(\(\) => JSON\.parse\(spotlightRosterKey\), \[spotlightRosterKey\]\);/);
  const key = region(MONITOR, 'const spotlightRosterKey = useMemo(', '[students, classes, activeClassId]);', 'the Spotlight roster key');
  assert.match(key, /JSON\.stringify\(\[\.\.\.new Set\(\s*studentsInClass\(\{ students, classes, classId: activeClassId \}\)/);
});

test('the teacher\'s presence listeners follow who is on the roster, not each new array of the same students', () => {
  const effect = effectAround(APP, /onSnapshot\(\s*doc\(db, 'presence', studentId\)/, 'the presence listeners');
  // What they may depend on: who is signed in, whether a presence screen is
  // open, the roster's ids as a value, and Preview. Not the array, and not
  // which of the two presence screens it is.
  assert.deepEqual(effect.deps, ['user?.role', 'teacherPresenceScreen', 'presenceRosterKey', 'teacherPreviewRuntimeActive']);
  assert.match(effect.body, /const rosterIds = JSON\.parse\(presenceRosterKey\);/);
  assert.match(effect.body, /const unsubs = rosterIds\.map\(\(studentId\) => onSnapshot\(/);
  const key = region(APP, 'const presenceRosterKey = useMemo(', ');\n', 'the roster key');
  assert.match(key, /JSON\.stringify\(\[\.\.\.new Set\(\s*\(Array\.isArray\(allStudents\) \? allStudents : \[\]\)\s*\.map\(\(student\) => String\(student\?\.id \|\| ''\)\.trim\(\)\)/);
  assert.match(APP, /const teacherPresenceScreen = \['home', 'classesWorkspace'\]\.includes\(teacherTab\);/);
});
