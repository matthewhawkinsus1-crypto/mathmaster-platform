import test from 'node:test';
import assert from 'node:assert/strict';
import { getSkillGraph } from '../../src/platform/path/skillGraph.js';
import { buildStudentPathOptions, resolvePacingProvider } from '../../src/platform/path/studentPathOptions.js';
import { defaultCourseProfiles, normalizeCourseProfiles } from '../../src/platform/rigor/courseRigor.js';

const PERIODS = ['Period 1', 'Period 2'];

// The resolution PacingControls performs: the course comes from the class, and
// only falls back when the class has none.
const courseForClass = (courseProfiles, classId, fallback = 'algebra1') => (
  courseProfiles?.[classId]?.course || fallback
);

test('a class with a course gets that course, not the fallback', () => {
  const profiles = {
    ...defaultCourseProfiles(PERIODS),
    'Period 2': { classPeriod: 'Period 2', course: 'algebra2', courseLabel: 'Algebra II Honors' },
  };
  assert.equal(courseForClass(profiles, 'Period 1'), 'algebra1');
  assert.equal(courseForClass(profiles, 'Period 2'), 'algebra2');
});

test('a class with no course set falls back rather than breaking', () => {
  assert.equal(courseForClass({}, 'Period 3'), 'algebra1');
  assert.equal(courseForClass(null, 'Period 3'), 'algebra1');
});

test('each course loads its own skill graph', () => {
  const one = getSkillGraph('algebra1').map((skill) => skill.skillId);
  const two = getSkillGraph('algebra2').map((skill) => skill.skillId);
  assert.ok(one.length > 20 && two.length > 20);
  assert.equal(one.some((id) => two.includes(id)), false, 'the two courses must not share skill ids');
});

test('each course resolves its own calendar, not a shared one', () => {
  const pacing = { windowIndex: 2, windowCount: 6, accelerationRadius: 1 };
  const nowValue = Date.parse('2026-10-26T15:00:00Z');
  const one = resolvePacingProvider({ courseId: 'algebra1', skills: getSkillGraph('algebra1'), pacing, nowValue });
  const two = resolvePacingProvider({ courseId: 'algebra2', skills: getSkillGraph('algebra2'), pacing, nowValue });
  assert.equal(one.isProvisional, false, 'Algebra I has a real district calendar');
  assert.equal(two.isProvisional, false, 'Algebra II Honors has a real district calendar');
  assert.notEqual(one.loaded, two.loaded, 'and they are different calendars');
});

test('an Algebra II class previews Algebra II skills', () => {
  const options = buildStudentPathOptions({
    student: { id: 'preview', gradesByAssignment: {} },
    assignments: [],
    courseId: 'algebra2',
    pacing: { windowIndex: 2, windowCount: 6, accelerationRadius: 1 },
    nowValue: Date.parse('2026-10-26T15:00:00Z'),
  });
  assert.ok(options, 'pacing was supplied, so there must be a preview');
  const shown = ['required', 'remediation', 'priority', 'recommended', 'available', 'extension', 'future', 'locked', 'mastered']
    .flatMap((key) => options[key]);
  assert.ok(shown.length > 20);
  assert.ok(
    shown.every((row) => /A2\./.test(row.skillId) || /^teks:[678]\./.test(row.skillId)),
    'an Algebra II preview must not be full of Algebra I standards',
  );
});

test('honors and standard sections of one course share its graph', () => {
  const profiles = normalizeCourseProfiles({
    'Period 1': { course: 'algebra2', courseLabel: 'Algebra II' },
    'Period 2': { course: 'algebra2', courseLabel: 'Algebra II Honors' },
  }, PERIODS);
  assert.equal(courseForClass(profiles, 'Period 1'), courseForClass(profiles, 'Period 2'));
});
