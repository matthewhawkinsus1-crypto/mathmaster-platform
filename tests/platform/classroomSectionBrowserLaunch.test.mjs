import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classroomLaunchTarget,
  parseClassroomLaunchSearch,
} from '../../src/platform/classroom/classroomLaunchRoute.js';

const assignment = {
  id: 'lesson-1',
  schemaVersion: 5,
  dueAt: '2026-09-01T12:00:00.000Z',
  lateDueAt: '2026-09-02T12:00:00.000Z',
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      questions: [
        { id: 'w1' },
        { id: 'w2', teacherExcluded: true },
      ],
    },
    {
      id: 'classwork',
      role: 'classwork',
      questions: [
        { id: 'c1' },
        { id: 'c2', activityRole: 'practice' },
      ],
    },
    {
      id: 'practice',
      role: 'practice',
      questions: [{ id: 'p1' }],
    },
    {
      id: 'dol',
      role: 'dol',
      questions: [{ id: 'd1' }],
    },
  ],
};

test('browser launch parser preserves secure redirect section/publication/course identity', () => {
  assert.deepEqual(
    parseClassroomLaunchSearch('?launch=lesson-1&classroomCourse=course-7&classroomPublication=pub-9&classroomSection=practice'),
    {
      assignmentId: 'lesson-1',
      courseId: 'course-7',
      publicationId: 'pub-9',
      sectionKey: 'practice',
      isSectionLaunch: true,
    },
  );
});

test('legacy whole-assignment Classroom links stay compatible', () => {
  assert.deepEqual(parseClassroomLaunchSearch('?launch=lesson-1'), {
    assignmentId: 'lesson-1',
    courseId: null,
    publicationId: null,
    sectionKey: 'whole',
    isSectionLaunch: false,
  });
});

test('browser launch parser rejects unknown section identity instead of silently opening whole assignment', () => {
  assert.throws(
    () => parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=quiz'),
    /Unsupported Classroom section/i,
  );
});

test('section launch target uses only included questions with the effective activity role', () => {
  const target = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=practice'),
    nowValue: Date.parse('2026-09-01T10:00:00.000Z'),
  });

  // c2 explicitly overrides its containing classwork section to practice,
  // so it is the first practice question in canonical flattened order.
  assert.deepEqual(target.questionIndices, [2, 3]);
  assert.equal(target.questionIndex, 2);
  assert.equal(target.sectionKey, 'practice');
  assert.equal(target.showFrozenReportFirst, false);
});

test('closed split-section launch shows frozen report first instead of auto-starting practice', () => {
  const target = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=dol'),
    nowValue: Date.parse('2026-09-03T12:00:00.000Z'),
  });

  assert.deepEqual(target.questionIndices, [5]);
  assert.equal(target.questionIndex, 5);
  assert.equal(target.showFrozenReportFirst, true);
  assert.equal(target.practiceAvailable, true);
});

test('a split Classroom link fails closed when its section has no included questions', () => {
  const noWarmup = {
    ...assignment,
    sections: assignment.sections.map((section) => (
      section.role === 'warmup'
        ? { ...section, questions: section.questions.map((question) => ({ ...question, teacherExcluded: true })) }
        : section
    )),
  };

  assert.throws(
    () => classroomLaunchTarget({
      assignment: noWarmup,
      launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=warmup'),
      nowValue: Date.parse('2026-09-01T10:00:00.000Z'),
    }),
    /no included Warm-Up questions/i,
  );
});
