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

test('active section link starts at that section but does not section-scope the live workspace', () => {
  const target = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=practice'),
    nowValue: Date.parse('2026-09-01T10:00:00.000Z'),
  });

  // Canonical flattened order is w1, w2, c1, c2, p1, d1. c2 explicitly
  // overrides its containing classwork section to practice, so practice owns
  // indices 3 and 4; excluded w2 remains irrelevant to this section.
  assert.deepEqual(target.questionIndices, [3, 4]);
  assert.equal(target.questionIndex, 3);
  assert.equal(target.sectionKey, 'practice');
  assert.equal(target.originIsSectionLaunch, true);
  // App.jsx historically uses target.isSectionLaunch to decide whether to
  // section-filter the workspace. Active Classroom links are entrances into
  // the assignment, not prisons inside one section.
  assert.equal(target.isSectionLaunch, false);
  assert.equal(target.showFrozenReportFirst, false);
});

test('closed split-section launch shows frozen report first and keeps section-only practice intentional', () => {
  const target = classroomLaunchTarget({
    assignment,
    launch: parseClassroomLaunchSearch('?launch=lesson-1&classroomSection=dol'),
    nowValue: Date.parse('2026-09-03T12:00:00.000Z'),
  });

  assert.deepEqual(target.questionIndices, [5]);
  assert.equal(target.questionIndex, 5);
  assert.equal(target.originIsSectionLaunch, true);
  assert.equal(target.isSectionLaunch, true);
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
