import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, normalizeClassInput, resolveStudentCourseContext } from '../../functions/shared/classModel.mjs';

test('class model supports Grade 6, Grade 7, Grade 8, Algebra I and Algebra II', () => {
  assert.deepEqual(COURSES.map((entry) => entry.id), ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2']);
  for (const course of ['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2']) {
    assert.equal(normalizeClassInput({ name: course, course }).course, course);
  }
});

test('student Path course context prefers class entity over the period fallback', () => {
  const student = { id: 'S1', classId: 'C7', classPeriod: 'Period 3' };
  const context = resolveStudentCourseContext({
    student,
    classesById: { C7: { classId: 'C7', name: 'Grade 7 Math', course: 'grade7', courseLevel: 'standard', period: 'Period 3' } },
    courseProfiles: { 'Period 3': { course: 'algebra2', courseLevel: 'honors' } },
  });
  assert.equal(context.courseId, 'grade7');
  assert.equal(context.source, 'class');
});
