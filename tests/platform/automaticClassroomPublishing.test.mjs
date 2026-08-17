import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classroomPostingMode,
  mappedCourseIdsForAssignment,
  shouldAutoPublishClassroomPackage,
} from '../../src/platform/classroom/automaticClassroomPublishing.js';

const base = {
  id: 'a1',
  assignedClassPeriods: ['Period 1'],
  classroomPackage: {
    enabled: true,
    assignmentPost: { publishMode: 'whenAssigned' },
    resourcesPost: { postingMode: 'separateMaterial' },
  },
};

test('assigned V5 classroom package auto-publishes by default', () => {
  assert.equal(shouldAutoPublishClassroomPackage(base), true);
});

test('library-only assignment does not auto-publish', () => {
  assert.equal(shouldAutoPublishClassroomPackage({ ...base, assignedClassPeriods: [] }), false);
});

test('draft and scheduled packages are not silently published', () => {
  assert.equal(shouldAutoPublishClassroomPackage({
    ...base,
    classroomPackage: { ...base.classroomPackage, assignmentPost: { publishMode: 'draft' } },
  }), false);
  assert.equal(shouldAutoPublishClassroomPackage({
    ...base,
    classroomPackage: { ...base.classroomPackage, assignmentPost: { publishMode: 'scheduled' } },
  }), false);
});

test('mapping is selected only for assigned class periods', () => {
  assert.deepEqual(
    mappedCourseIdsForAssignment(base, [
      { courseId: 'g1', classPeriod: 'Period 1' },
      { courseId: 'g2', classPeriod: 'Period 2' },
      { courseId: 'g1', classPeriod: 'Period 1' },
    ]),
    ['g1'],
  );
});

test('resource mode defaults to separate material', () => {
  assert.equal(classroomPostingMode(base), 'separateMaterial');
  assert.equal(classroomPostingMode({
    ...base,
    classroomPackage: {
      ...base.classroomPackage,
      resourcesPost: { postingMode: 'attachToAssignment' },
    },
  }), 'attachToAssignment');
});
