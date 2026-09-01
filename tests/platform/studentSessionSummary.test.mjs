import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildMergedSessionSummary,
  countLiveQuestionStates,
  sessionKeyFor,
  sessionSummaryIdFor,
} = require('../../functions/lib/studentSessionSummary.js');

test('question-state summary counts only outcomes and never needs response content', () => {
  assert.deepEqual(countLiveQuestionStates('ccxax..'), {
    answered: 5,
    correct: 2,
    incorrect: 3,
    attempted: 1,
    accuracy: 40,
  });
});

test('session identity is stable for repeated presence deletions in one assignment session', () => {
  const input = { studentId: 'S1', assignmentId: 'A1', startedAt: 1000 };
  assert.equal(sessionKeyFor(input), 'S1|A1|1000');
  assert.equal(sessionSummaryIdFor(input), sessionSummaryIdFor(input));
  assert.equal(sessionSummaryIdFor({ ...input, startedAt: 1001 }) === sessionSummaryIdFor(input), false);
});

test('archived summary preserves compact objective counts and authorization context', () => {
  const summary = buildMergedSessionSummary({
    studentId: 'S1',
    observedAt: 5_000,
    gradeData: {
      displayName: 'Student One',
      classId: 'class-a',
      classPeriod: 'Period 1',
      assignedTeacherEmail: 'Teacher.A@School.org',
    },
    live: {
      studentId: 'S1',
      name: 'Student One',
      assignmentId: 'A1',
      assignmentTitle: 'Lesson 1',
      activityRole: 'practice',
      startedAt: 1_000,
      updatedAt: 5_000,
      questionStates: 'ccx..',
      sessionActiveSeconds: 220,
      focusLossCount: 3,
      rapidCorrectCount: 2,
      rapidDeepCorrectCount: 1,
      timedIndependentCorrectCount: 3,
      response: 'should never be copied',
      activeUrl: 'https://example.com/should-never-be-copied',
    },
  });

  assert.equal(summary.studentId, 'S1');
  assert.equal(summary.assignmentId, 'A1');
  assert.equal(summary.answered, 3);
  assert.equal(summary.correct, 2);
  assert.equal(summary.accuracy, 67);
  assert.equal(summary.activeSeconds, 220);
  assert.equal(summary.focusLossCount, 3);
  assert.equal(summary.originClassId, 'class-a');
  assert.equal(summary.originTeacherEmail, 'teacher.a@school.org');
  assert.deepEqual(summary.authorizedTeacherEmails, ['teacher.a@school.org']);

  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /should never be copied/);
  assert.doesNotMatch(serialized, /example\.com/);
  assert.equal('response' in summary, false);
  assert.equal('activeUrl' in summary, false);
});

test('repeat lifecycle deletions merge monotonically instead of becoming false extra sessions', () => {
  const first = buildMergedSessionSummary({
    studentId: 'S1',
    observedAt: 4_000,
    gradeData: {
      classId: 'class-a',
      classPeriod: 'Period 1',
      assignedTeacherEmail: 'teacher.a@school.org',
    },
    live: {
      assignmentId: 'A1',
      startedAt: 1_000,
      questionStates: 'cc...',
      sessionActiveSeconds: 120,
      focusLossCount: 1,
      rapidCorrectCount: 1,
      rapidDeepCorrectCount: 0,
      timedIndependentCorrectCount: 2,
    },
  });

  const second = buildMergedSessionSummary({
    studentId: 'S1',
    observedAt: 8_000,
    gradeData: {
      classId: 'class-a',
      classPeriod: 'Period 1',
      assignedTeacherEmail: 'teacher.a@school.org',
    },
    previous: first,
    live: {
      assignmentId: 'A1',
      startedAt: 1_000,
      questionStates: 'ccxc.',
      sessionActiveSeconds: 300,
      focusLossCount: 4,
      rapidCorrectCount: 2,
      rapidDeepCorrectCount: 1,
      timedIndependentCorrectCount: 4,
    },
  });

  assert.equal(first.sessionKey, second.sessionKey);
  assert.equal(second.endedAt, 8_000);
  assert.equal(second.activeSeconds, 300);
  assert.equal(second.focusLossCount, 4);
  assert.equal(second.answered, 4);
  assert.equal(second.correct, 3);
  assert.equal(second.rapidCorrectCount, 2);
});

test('reauthorized previous history keeps its origin teacher while adding the current teacher', () => {
  const previous = {
    originClassId: 'class-a',
    originTeacherEmail: 'teacher.a@school.org',
    authorizedTeacherEmails: ['teacher.a@school.org'],
    classId: 'class-b',
  };
  const next = buildMergedSessionSummary({
    studentId: 'S1',
    previous,
    observedAt: 8_000,
    gradeData: {
      classId: 'class-b',
      classPeriod: 'Period 2',
      assignedTeacherEmail: 'teacher.b@school.org',
    },
    live: {
      assignmentId: 'A1',
      startedAt: 1_000,
      questionStates: 'c',
    },
  });
  assert.equal(next.originClassId, 'class-a');
  assert.equal(next.originTeacherEmail, 'teacher.a@school.org');
  assert.deepEqual(next.authorizedTeacherEmails, [
    'teacher.a@school.org',
    'teacher.b@school.org',
  ]);
});

test('invalid incomplete presence snapshots are not archived', () => {
  assert.equal(buildMergedSessionSummary({ studentId: 'S1', live: {} }), null);
  assert.equal(sessionSummaryIdFor({ studentId: 'S1', assignmentId: '', startedAt: 100 }), null);
});
