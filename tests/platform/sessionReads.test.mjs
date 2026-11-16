// WHAT A SESSION COSTS IN FIRESTORE READS.
//
// tests/browser/teacherWorkflow/sessionReadsProbe.mjs measures a student's
// school day and a teacher's, phase by phase, on the harness built as
// production is, and holds them to budgets. CI cannot run a browser here, so
// this pins what those numbers stand on:
//
//   - the school the probe asks for (`&fullClass=1`): a class of 30 and 20
//     lessons, its student part-way through yesterday's lesson; and nothing of
//     it without the parameter.

import assert from 'node:assert/strict';
import test from 'node:test';

import { FULL_CLASS, buildTeacherWorkflowFixture } from '../browser/teacherWorkflow/fixture.js';

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
