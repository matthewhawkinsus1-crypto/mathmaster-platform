// ONE CLASS CONTEXT, AND ONE MEMBERSHIP RULE.
//
// The teacher workspace had nine independent class selectors and no shared
// notion of "the class I am working in". Three of those screens carried their
// own copy of the membership rule, and the copies were not the same — one
// matched a student on period even when the student had a real classId, which
// puts a recently-moved child on two rosters at once.
//
// These tests pin the rule that replaced them. They are deliberately about
// AMBIGUITY: two classes sharing a period, a student moved mid-year, a school
// that has not created class records yet. Those are the cases where a period
// label and a class identity disagree, and they are the entire reason the
// platform addresses classes by id.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveStudentCourseContext, studentsInClass, unplaceableStudents,
} from '../../functions/shared/classModel.mjs';
import {
  readinessFromLearningProfile, resolveAdaptiveRigorFromProfile,
} from '../../src/platform/rigor/courseRigor.js';

// Two classes, same period label, different courses. This is the shape that
// breaks every period-keyed lookup in the repository.
const CLASSES = [
  { classId: 'c-alg1', name: 'Algebra I — 3rd', period: 'Period 3', course: 'algebra1', courseLevel: 'standard', teacherOfRecord: 'a@x.edu' },
  { classId: 'c-alg2', name: 'Algebra II Honors — 3rd', period: 'Period 3', course: 'algebra2', courseLevel: 'honors', teacherOfRecord: 'a@x.edu' },
  { classId: 'c-alg1-5', name: 'Algebra I — 5th', period: 'Period 5', course: 'algebra1', courseLevel: 'standard', teacherOfRecord: 'b@x.edu' },
];

const STUDENTS = [
  { id: 's1', classId: 'c-alg1', classPeriod: 'Period 3' },
  { id: 's2', classId: 'c-alg2', classPeriod: 'Period 3' },
  // Moved to 5th period; their period label was never updated.
  { id: 's3', classId: 'c-alg1-5', classPeriod: 'Period 3' },
  // Predates the class migration. No classId at all.
  { id: 's4', classId: null, classPeriod: 'Period 3' },
  { id: 's5', classId: null, classPeriod: 'Period 5' },
];

// --- membership ----------------------------------------------------------------

test('two classes sharing a period are two rosters, not one', () => {
  const alg1 = studentsInClass({ students: STUDENTS, classes: CLASSES, classId: 'c-alg1' }).map((s) => s.id);
  const alg2 = studentsInClass({ students: STUDENTS, classes: CLASSES, classId: 'c-alg2' }).map((s) => s.id);
  assert.deepEqual(alg1, ['s1']);
  assert.deepEqual(alg2, ['s2']);
});

test('an unmigrated student in an ambiguous period lands in neither roster, and is named', () => {
  // "Period 3" names two different rooms here, so it cannot place s4. Putting
  // them in both rosters would count, grade and report one child twice with no
  // way for any screen to tell which is real.
  const everyRoster = CLASSES.flatMap((entry) => (
    studentsInClass({ students: STUDENTS, classes: CLASSES, classId: entry.classId }).map((s) => s.id)
  ));
  assert.ok(!everyRoster.includes('s4'), 'not in both');
  // But not silently gone, either.
  assert.deepEqual(unplaceableStudents({ students: STUDENTS, classes: CLASSES }).map((s) => s.id), ['s4']);
  assert.ok(studentsInClass({ students: STUDENTS, classes: CLASSES }).some((s) => s.id === 's4'), 'still in all-classes');
});

test('a student who was moved follows their class, not their stale period label', () => {
  // s3 still says "Period 3" but belongs to the 5th-period class. The old rule
  // returned them for BOTH, which is one child on two rosters.
  const period3 = studentsInClass({ students: STUDENTS, classes: CLASSES, classId: 'c-alg1' }).map((s) => s.id);
  const period5 = studentsInClass({ students: STUDENTS, classes: CLASSES, classId: 'c-alg1-5' }).map((s) => s.id);
  assert.ok(!period3.includes('s3'), 'the stale label must not win');
  assert.ok(period5.includes('s3'), 'the class they are actually in must');
});

test('an unmigrated student in an UNambiguous period is placed by it', () => {
  // Only one active class holds Period 5, so the period is still a real answer
  // and s5 appears there. The fallback narrows; it does not disappear.
  const rows = studentsInClass({ students: STUDENTS, classes: CLASSES, classId: 'c-alg1-5' }).map((s) => s.id);
  assert.ok(rows.includes('s5'));
  assert.deepEqual(unplaceableStudents({ students: STUDENTS, classes: CLASSES }).map((s) => s.id), ['s4'], 's5 is placeable');
});

test('no class selected means every student, not none', () => {
  assert.equal(studentsInClass({ students: STUDENTS, classes: CLASSES }).length, STUDENTS.length);
  assert.equal(studentsInClass({ students: STUDENTS, classes: CLASSES, classId: null }).length, STUDENTS.length);
});

test('a school with no class records can still filter by period', () => {
  // The legacy path. It must keep working, because a district mid-migration has
  // students and periods but no classes yet.
  const rows = studentsInClass({ students: STUDENTS, classes: [], classPeriod: 'Period 5' }).map((s) => s.id);
  assert.deepEqual(rows, ['s5']);
});

// --- course context ------------------------------------------------------------

test('two students in the same period get their own class’s course', () => {
  const classesById = Object.fromEntries(CLASSES.map((entry) => [entry.classId, entry]));
  const a = resolveStudentCourseContext({ student: STUDENTS[0], classesById });
  const b = resolveStudentCourseContext({ student: STUDENTS[1], classesById });
  assert.equal(a.courseId, 'algebra1');
  assert.equal(b.courseId, 'algebra2');
  assert.equal(b.courseLevel, 'honors');
  // The exact defect: a period-keyed lookup answers with whichever class was
  // written last, so one of these two students learns against the wrong course.
  assert.notEqual(a.courseId, b.courseId);
});

test('an unmigrated student falls back to the period profile and says so', () => {
  const context = resolveStudentCourseContext({
    student: STUDENTS[3],
    classesById: {},
    courseProfiles: { 'Period 3': { course: 'algebra2', courseLevel: 'honors' } },
  });
  assert.equal(context.courseId, 'algebra2');
  assert.equal(context.source, 'periodFallback', 'a screen has to be able to tell an admin this student needs a real class');
});

// --- one verdict per student ---------------------------------------------------

const profileWithBand = (band) => ({ instructionalBand: band });

test('the adaptive posture is translated from the profile, never recomputed', () => {
  assert.equal(readinessFromLearningProfile(profileWithBand('above')).readiness, 'advanced');
  assert.equal(readinessFromLearningProfile(profileWithBand('on')).readiness, 'onTrack');
  assert.equal(readinessFromLearningProfile(profileWithBand('below')).readiness, 'developing');
});

test('an unestablished baseline is never reported as "on track"', () => {
  // The profile deliberately refuses to judge a student it has not seen enough
  // of. Translating that silence into "on track" would put an assertion on a
  // teacher's screen that the evidence does not support.
  const unestablished = readinessFromLearningProfile(profileWithBand('establishingBaseline'));
  assert.equal(unestablished.established, false);
  const posture = resolveAdaptiveRigorFromProfile({ courseLevel: 'standard', profile: profileWithBand('establishingBaseline') });
  assert.equal(posture.label, 'Establishing baseline');
  assert.equal(posture.established, false);
});

test('a missing profile is treated as no evidence, not as a passing student', () => {
  assert.equal(resolveAdaptiveRigorFromProfile({ profile: null }).established, false);
  assert.equal(resolveAdaptiveRigorFromProfile({}).label, 'Establishing baseline');
});

test('Honors enrollment is a class fact and survives a weak profile', () => {
  // "Do not equate Honors enrollment with automatic mastery" cuts both ways: a
  // struggling Honors student stays on the Honors target with support, rather
  // than being quietly moved off it.
  const struggling = resolveAdaptiveRigorFromProfile({ courseLevel: 'honors', profile: profileWithBand('below') });
  assert.equal(struggling.mode, 'honorsRepair');
  assert.match(struggling.label, /Honors/);
});

test('a strong student in a standard class gets enrichment without being relabelled Honors', () => {
  const strong = resolveAdaptiveRigorFromProfile({ courseLevel: 'standard', profile: profileWithBand('above') });
  assert.equal(strong.mode, 'individualEnrichment');
  assert.doesNotMatch(strong.label, /Honors/);
});
