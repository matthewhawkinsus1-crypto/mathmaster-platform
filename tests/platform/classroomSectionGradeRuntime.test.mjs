import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  assignmentGradeProgress,
  resolveClassroomGradeStage,
  classroomGradeReleasePolicy,
} = require('../../functions/lib/classroomGradeRuntime.js');

test('a completed section becomes an immediately student-visible final-complete grade', () => {
  const progress = assignmentGradeProgress(
    {
      1: { status: 'correct', totalAttempts: 1 },
      2: { status: 'expired', totalAttempts: 3, bestPartialCredit: 50 },
    },
    [1, 2],
    [{}, {}, {}],
  );

  assert.equal(progress.complete, true);
  assert.equal(progress.attempted, 2);
  assert.equal(progress.total, 2);
  assert.equal(progress.grade, 75);

  const stage = resolveClassroomGradeStage({ assignment: {}, progress, nowValue: 1 });
  assert.equal(stage, 'final-complete');
  assert.deepEqual(
    classroomGradeReleasePolicy({ stage, assignment: {}, nowValue: 1 }),
    { studentVisible: true, assignToStudent: true, shouldReturn: true },
  );
});

test('a section with only early progress remains teacher-draft-only before its due date', () => {
  const progress = assignmentGradeProgress(
    { 0: { status: 'working', totalAttempts: 1 } },
    [0, 1, 2, 3],
    [{}, {}, {}, {}],
  );
  const stage = resolveClassroomGradeStage({ assignment: {}, progress, nowValue: 1 });
  assert.equal(stage, 'progress-25');
  assert.deepEqual(
    classroomGradeReleasePolicy({ stage, assignment: {}, nowValue: 1 }),
    { studentVisible: false, assignToStudent: false, shouldReturn: false },
  );
});

test('final cutoff produces a student-visible final grade even when the section is incomplete', () => {
  const assignment = {
    dueAt: '2026-09-01T12:00:00.000Z',
    lateDueAt: '2026-09-02T12:00:00.000Z',
  };
  const progress = assignmentGradeProgress({}, [0, 1], [{}, {}]);
  const nowValue = Date.parse('2026-09-03T12:00:00.000Z');
  const stage = resolveClassroomGradeStage({ assignment, progress, nowValue });
  assert.equal(stage, 'final-deadline');
  assert.equal(classroomGradeReleasePolicy({ stage, assignment, nowValue }).studentVisible, true);
});
