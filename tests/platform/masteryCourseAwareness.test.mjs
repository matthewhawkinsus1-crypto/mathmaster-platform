import test from 'node:test';
import assert from 'node:assert/strict';
import {
  courseIdForTeks, getMasteryStrands, getStrandForTEKS, getWheelTeksForCourse,
  isMasteryCourse, masteryCourseLabel,
} from '../../src/platform/mastery/strandConfig.js';

test('each course gets its own strands', () => {
  const one = getMasteryStrands('algebra1');
  const two = getMasteryStrands('algebra2');
  assert.ok(one.length >= 4);
  assert.ok(two.length >= 4);
  assert.notDeepEqual(one.map((s) => s.id), two.map((s) => s.id));
});

test('an Algebra II wheel contains no Algebra I standards', () => {
  const codes = getWheelTeksForCourse('algebra2');
  assert.ok(codes.length > 20, `expected a full Algebra II wheel, got ${codes.length}`);
  assert.ok(codes.every((code) => code.startsWith('A2.')), 'every segment must be an Algebra II standard');
  assert.ok(!codes.includes('A.5A'));
});

test('an Algebra I wheel contains no Algebra II standards', () => {
  const codes = getWheelTeksForCourse('algebra1');
  assert.ok(codes.includes('A.5A'));
  assert.ok(codes.every((code) => !code.startsWith('A2.')));
});

test('process standards are not wheel segments', () => {
  // A student cannot "master A.1A" in a way a mastery estimate can report.
  assert.ok(!getWheelTeksForCourse('algebra1').includes('A.1A'));
  assert.ok(!getWheelTeksForCourse('algebra2').includes('A2.1A'));
});

test('honors sections share their course wheel', () => {
  assert.deepEqual(getWheelTeksForCourse('algebra2-honors'), getWheelTeksForCourse('algebra2'));
  assert.deepEqual(getWheelTeksForCourse('algebra1-honors'), getWheelTeksForCourse('algebra1'));
});

test('a course with no wheel is reported rather than guessed at', () => {
  assert.equal(isMasteryCourse('algebra1'), true);
  assert.equal(isMasteryCourse('algebra2'), true);
  assert.equal(isMasteryCourse('geometry'), false);
});

test('a code carries its own course', () => {
  assert.equal(courseIdForTeks('A.5A'), 'algebra1');
  assert.equal(courseIdForTeks('A2.7I'), 'algebra2');
  assert.equal(courseIdForTeks('texas:A2.2A'), 'algebra2');
});

test('a standard lands in its own course\'s strand', () => {
  assert.equal(getStrandForTEKS('texas:A.5A').id, 'equations_inequalities');
  const algebraTwo = getStrandForTEKS('A2.4A');
  assert.match(algebraTwo.id, /^algebra2_strand_/);
  assert.ok(algebraTwo.codes.every((code) => code.startsWith('A2.')));
});

test('the course label is what a student would recognise', () => {
  assert.equal(masteryCourseLabel('algebra1'), 'Algebra I');
  assert.equal(masteryCourseLabel('algebra2'), 'Algebra II');
  assert.equal(masteryCourseLabel('algebra2-honors'), 'Algebra II');
});

test('every strand carries a title and a colour', () => {
  ['algebra1', 'algebra2'].forEach((courseId) => {
    getMasteryStrands(courseId).forEach((strand) => {
      assert.ok(strand.title, `${courseId} strand ${strand.id} needs a title`);
      assert.match(strand.color, /^#[0-9a-f]{6}$/i);
      assert.ok(strand.codes.length, `${courseId} strand ${strand.id} must have standards`);
    });
  });
});
