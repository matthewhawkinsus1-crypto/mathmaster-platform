import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRADE_SHAPE,
  SECTION_GRADE_KEYS,
  splitGradesBySection,
} from '../../src/platform/teacher/gradeEvidence.js';

const assignment = {
  schemaVersion: 5,
  sections: [
    {
      id: 'warmup',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [
        { id: 'w1', questionWeight: 1 },
        { id: 'w2', questionWeight: 1 },
      ],
    },
    {
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [
        { id: 'c1', questionWeight: 2 },
      ],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [
        { id: 'p1', questionWeight: 1 },
        { id: 'p2', questionWeight: 1, teacherExcluded: true },
      ],
    },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [
        { id: 'd1', questionWeight: 1 },
      ],
    },
  ],
};

const tracker = {
  0: { status: 'correct', attemptCount: 1, totalAttempts: 1 },
  1: { status: 'unattempted' },
  2: { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 50 },
  3: { status: 'correct', attemptCount: 1, totalAttempts: 1 },
  4: { status: 'correct', attemptCount: 1, totalAttempts: 1 },
  5: { status: 'unattempted' },
};

test('section grade evidence exposes the four lesson sections in stable order', () => {
  assert.deepEqual(SECTION_GRADE_KEYS, ['warmup', 'classwork', 'practice', 'dol']);
});

test('section grade evidence calculates each section from only its own included questions', () => {
  const sections = splitGradesBySection({ tracker, assignment });

  assert.deepEqual(sections.warmup, {
    score: 50,
    attempted: 1,
    total: 2,
    unanswered: 1,
    creditOnAttempted: 100,
    shape: GRADE_SHAPE.INCOMPLETE,
  });
  assert.deepEqual(sections.classwork, {
    score: 50,
    attempted: 1,
    total: 1,
    unanswered: 0,
    creditOnAttempted: 50,
    shape: GRADE_SHAPE.COMPLETE,
  });
  assert.deepEqual(sections.practice, {
    score: 100,
    attempted: 1,
    total: 1,
    unanswered: 0,
    creditOnAttempted: 100,
    shape: GRADE_SHAPE.COMPLETE,
  });
  assert.deepEqual(sections.dol, {
    score: 0,
    attempted: 0,
    total: 1,
    unanswered: 1,
    creditOnAttempted: null,
    shape: GRADE_SHAPE.NOT_STARTED,
  });
});

test('a missing lesson section stays empty instead of borrowing another section grade', () => {
  const classworkOnly = {
    schemaVersion: 5,
    sections: [{
      id: 'classwork',
      role: 'classwork',
      title: 'Classwork',
      questions: [{ id: 'c1' }],
    }],
  };
  const sections = splitGradesBySection({
    tracker: { 0: { status: 'correct', attemptCount: 1, totalAttempts: 1 } },
    assignment: classworkOnly,
  });

  assert.equal(sections.classwork.score, 100);
  assert.deepEqual(sections.warmup, {
    score: null,
    attempted: 0,
    total: 0,
    unanswered: 0,
    creditOnAttempted: null,
    shape: GRADE_SHAPE.NOT_STARTED,
  });
  assert.equal(sections.practice.total, 0);
  assert.equal(sections.dol.total, 0);
});
