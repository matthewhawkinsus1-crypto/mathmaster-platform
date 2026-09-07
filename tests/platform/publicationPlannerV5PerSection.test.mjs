import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUBLICATION_STRATEGIES,
  planClassroomPublication,
} from '../../src/platform/publishing/publicationPlanner.js';

const assignmentWithCoreSections = () => ({
  schemaVersion: 5,
  assignment: {
    id: 'absolute-value-equations',
    assignmentKey: 'absolute-value-equations',
    courseId: 'algebra2',
    title: 'Solving Absolute Value Equations',
  },
  sections: [
    { id: 'warmup', role: 'warmup', title: "X's Lie, Y's Tell the Truth", questions: [] },
    { id: 'classwork', role: 'classwork', title: 'Guided Solving', questions: [] },
    { id: 'practice', role: 'practice', title: 'Independent Practice', questions: [] },
    { id: 'dol', role: 'dol', title: 'Daily Check', questions: [] },
  ],
});

test('Assignment V5 split publishing creates one post for every authored core section without a lessonBundle', () => {
  const plan = planClassroomPublication({
    assignmentV5: assignmentWithCoreSections(),
    lessonBundle: null,
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
    includeWarmupInClassroom: false,
  });

  assert.equal(plan.plannedPosts.length, 4);
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.title),
    [
      'Warm-Up — Solving Absolute Value Equations',
      'Classwork — Solving Absolute Value Equations',
      'Practice — Solving Absolute Value Equations',
      'DOL — Solving Absolute Value Equations',
    ],
  );
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.description),
    [
      'Complete the Warm-Up in MathMaster.',
      'Complete the Classwork in MathMaster.',
      'Complete the Practice in MathMaster.',
      'Complete the DOL in MathMaster.',
    ],
  );
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.sourceActivityIds),
    [['warmup'], ['classwork'], ['practice'], ['dol']],
  );
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.maxPoints),
    [5, 100, 100, 100],
  );
});

test('split publishing gives quiz and test sections their own posts too', () => {
  const assignmentV5 = assignmentWithCoreSections();
  assignmentV5.sections.push(
    { id: 'quiz', role: 'quiz', title: 'Lesson Quiz', questions: [] },
    { id: 'test', role: 'test', title: 'Unit Test', questions: [] },
  );

  const plan = planClassroomPublication({
    assignmentV5,
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
  });

  assert.equal(plan.plannedPosts.length, 6);
  assert.deepEqual(
    plan.plannedPosts.map((post) => post.title),
    [
      'Warm-Up — Solving Absolute Value Equations',
      'Classwork — Solving Absolute Value Equations',
      'Practice — Solving Absolute Value Equations',
      'DOL — Solving Absolute Value Equations',
      'Quiz — Solving Absolute Value Equations',
      'Test — Solving Absolute Value Equations',
    ],
  );
});

test('split publishing preserves a separate homework due date only for Practice', () => {
  const plan = planClassroomPublication({
    assignmentV5: assignmentWithCoreSections(),
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
    homeworkDueDate: '2026-09-10T23:59',
  });

  const byRole = Object.fromEntries(plan.plannedPosts.map((post) => [post.activities[0].role, post]));
  assert.equal(byRole.warmup.dueDate, '2026-09-08T23:59');
  assert.equal(byRole.classwork.dueDate, '2026-09-08T23:59');
  assert.equal(byRole.practice.dueDate, '2026-09-10T23:59');
  assert.equal(byRole.dol.dueDate, '2026-09-08T23:59');
});

test('malformed null section entries are ignored instead of crashing publication planning', () => {
  const assignmentV5 = assignmentWithCoreSections();
  assignmentV5.sections = [null, assignmentV5.sections[1]];

  const plan = planClassroomPublication({
    assignmentV5,
    strategy: PUBLICATION_STRATEGIES.SPLIT,
    mainDueDate: '2026-09-08T23:59',
  });

  assert.equal(plan.plannedPosts.length, 1);
  assert.equal(plan.plannedPosts[0].title, 'Classwork — Solving Absolute Value Equations');
  assert.deepEqual(plan.plannedPosts[0].sourceActivityIds, ['classwork']);
});
