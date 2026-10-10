import test from 'node:test';
import assert from 'node:assert/strict';
import { BUCKET, buildStudentDashboardModel, resolveNextAction } from '../../src/studentDashboardModel.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState, getIncludedQuestionIndices,
  prerequisiteAccess, questionIsIncluded,
} from '../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../src/attemptPolicy.js';
import { matchesSmartView } from '../../src/assignmentSmartViews.js';

// A redeemed Practice Pass must remove Practice from what the DASHBOARD
// considers required — completion, resume, and "what should I do now" must
// all agree with the Grade Center (studentGradeCenterModel.js, covered by
// tests/platform/classPointRewards.test.mjs's grading-integration cases)
// that a waived Practice question is excused, not outstanding.

const NOW = Date.parse('2026-10-26T15:00:00Z');
const inHours = (hours) => new Date(NOW + hours * 3600e3).toISOString();

const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
};

/*
 * DOL[0] + Practice[1,2]. Deliberately NOT classwork/warmup roles:
 * getStoredAssignmentTypeProjection classifies any bundle containing a
 * classwork or warmup section as "notesClasswork", whose OWN dashboard
 * completion rule is `classworkGradesByAssignment[id]?.score === 100` — a
 * server-computed projection that already excludes Practice entirely and
 * is unaffected by a Practice Pass either way (out of scope here). A
 * DOL+Practice bundle instead takes the GENERIC per-question completion
 * path this test exercises, matching e.g. SAMPLE_PRACTICE_WITH_DOL.json.
 */
const mixedAssignment = (id, overrides = {}) => ({
  schemaVersion: 5,
  id,
  title: id,
  assignedClassIds: ['class-1'],
  dueAt: inHours(-4),
  lateDueAt: inHours(24 * 7),
  sections: [
    {
      id: 'dol', role: 'dol',
      questions: [
        { type: 'algebra', prompt: 'DOL', equationLatex: 'x=1', activityRole: 'dol' },
      ],
    },
    {
      id: 'practice', role: 'practice',
      questions: [
        { type: 'algebra', prompt: 'Practice 1', equationLatex: 'x=3', activityRole: 'practice' },
        { type: 'algebra', prompt: 'Practice 2', equationLatex: 'x=4', activityRole: 'practice' },
      ],
    },
  ],
  ...overrides,
});

const finishedClasswork = () => ({
  0: { status: 'correct', totalAttempts: 1 },
});

const model = (overrides = {}) => buildStudentDashboardModel({
  classId: 'class-1',
  classPeriod: 'Period 1',
  nowValue: NOW,
  providers: PROVIDERS,
  ...overrides,
});

const redemption = (assignmentId) => ({
  [assignmentId]: { rewardCode: 'practicePass', assignmentId, status: 'redeemed' },
});

test('DOL done, Practice unfinished, no Practice Pass: still in progress, never complete', () => {
  const assignment = mixedAssignment('a1');
  const result = model({
    assignments: [assignment],
    tracker: { a1: finishedClasswork() },
  });
  const entry = result.allEntries.find((item) => item.assignment.id === 'a1');
  assert.notEqual(entry.bucket, BUCKET.COMPLETED);
  assert.equal(entry.questionsTotal, 3);
  assert.equal(entry.questionsDone, 1);
});

test('DOL done, Practice waived by a redeemed Practice Pass: assignment becomes complete', () => {
  const assignment = mixedAssignment('a1');
  const result = model({
    assignments: [assignment],
    tracker: { a1: finishedClasswork() },
    practicePassRedemptionsByAssignment: redemption('a1'),
  });
  const entry = result.allEntries.find((item) => item.assignment.id === 'a1');
  assert.equal(entry.bucket, BUCKET.COMPLETED);
  // Practice is removed from the denominator entirely -- not counted as done.
  assert.equal(entry.questionsTotal, 1);
  assert.equal(entry.questionsDone, 1);
});

test('a Practice Pass never manufactures completion for DOL still outstanding', () => {
  const assignment = mixedAssignment('a1');
  const result = model({
    assignments: [assignment],
    tracker: {}, // DOL still unattempted
    practicePassRedemptionsByAssignment: redemption('a1'),
  });
  const entry = result.allEntries.find((item) => item.assignment.id === 'a1');
  assert.notEqual(entry.bucket, BUCKET.COMPLETED);
  assert.equal(entry.questionsTotal, 1);
  assert.equal(entry.questionsDone, 0);
});

test('resume never targets an assignment whose only unfinished work is waived Practice', () => {
  const assignment = mixedAssignment('a1');
  const result = model({
    assignments: [assignment],
    tracker: { a1: finishedClasswork() },
    practicePassRedemptionsByAssignment: redemption('a1'),
    resumeAction: null,
  });
  assert.equal(result.resumeAssignment, null);
});

test('resume still targets an assignment with genuinely unfinished, non-waived work', () => {
  const assignment = mixedAssignment('a1');
  const result = model({
    assignments: [assignment],
    tracker: { a1: { 0: { status: 'correct', totalAttempts: 1 } } },
  });
  assert.equal(result.resumeAssignment?.id, 'a1');
});

test('"what should I do now" does not send a student back into waived Practice', () => {
  const assignment = mixedAssignment('a1');
  const dashboard = model({
    assignments: [assignment],
    tracker: { a1: finishedClasswork() },
    practicePassRedemptionsByAssignment: redemption('a1'),
  });
  const next = resolveNextAction({ dashboard, weeklyProgress: { completed: 1, required: 1, remaining: 0 } });
  assert.notEqual(next.assignment?.id, 'a1');
  assert.notEqual(next.kind, 'inProgress');
  assert.notEqual(next.kind, 'resume');
});

test('an assignment whose only content was Practice becomes complete once fully waived', () => {
  const assignment = mixedAssignment('a1', {
    sections: [{
      id: 'practice', role: 'practice',
      questions: [
        { type: 'algebra', prompt: 'Practice 1', equationLatex: 'x=3', activityRole: 'practice' },
      ],
    }],
  });
  const result = model({
    assignments: [assignment],
    tracker: {},
    practicePassRedemptionsByAssignment: redemption('a1'),
  });
  const entry = result.allEntries.find((item) => item.assignment.id === 'a1');
  assert.equal(entry.bucket, BUCKET.COMPLETED);
});

/*
 * DECISION 4: A LESSON IS FINISHED WHEN EVERY SECTION IS DONE, AT ANY ACCURACY.
 *
 * This replaced the old pin that a bundle with a Classwork section was
 * "finished" the moment the server's classwork projection reached 100 —
 * which filed Lesson 6 (Practice 1/10, DOL 0/3) under Finished in QA round 2.
 * Classwork at 100 is one section done; Practice still asks for work unless a
 * Practice Pass excused it.
 */
test('a Classwork + Practice bundle is Finished only when both sections are done (decision 4)', () => {
  const assignment = mixedAssignment('a1', {
    sections: [
      { id: 'classwork', role: 'classwork', questions: [{ type: 'algebra', prompt: 'CW', equationLatex: 'x=1', activityRole: 'classwork' }] },
      { id: 'practice', role: 'practice', questions: [{ type: 'algebra', prompt: 'P', equationLatex: 'x=2', activityRole: 'practice' }] },
    ],
  });
  const entryOf = (overrides) => model({ assignments: [assignment], ...overrides })
    .allEntries.find((item) => item.assignment.id === 'a1');

  // The server's classwork projection alone no longer finishes the lesson.
  const classworkScoreOnly = entryOf({ tracker: {}, classworkGradesByAssignment: { a1: { score: 100 } } });
  assert.notEqual(classworkScoreOnly.bucket, BUCKET.COMPLETED);
  assert.equal(classworkScoreOnly.finished, false);

  // Classwork done, Practice untouched: still unfinished.
  const classworkDone = entryOf({ tracker: { a1: { 0: { status: 'correct', totalAttempts: 1 } } } });
  assert.equal(classworkDone.finished, false);
  assert.notEqual(classworkDone.bucket, BUCKET.COMPLETED);

  // At any accuracy: Classwork right, Practice out of tries.
  const bothDone = entryOf({ tracker: { a1: { 0: { status: 'correct', totalAttempts: 1 }, 1: { status: 'expired', totalAttempts: 3 } } } });
  assert.equal(bothDone.finished, true);
  assert.equal(bothDone.bucket, BUCKET.COMPLETED);

  // A Practice Pass excuses Practice, so Classwork done finishes the lesson.
  const withPass = entryOf({
    tracker: { a1: { 0: { status: 'correct', totalAttempts: 1 } } },
    practicePassRedemptionsByAssignment: redemption('a1'),
  });
  assert.equal(withPass.finished, true);
  assert.equal(withPass.bucket, BUCKET.COMPLETED);
});

test('an assignment without a redemption is unaffected — Practice remains required', () => {
  const assignment = mixedAssignment('a1');
  const withPass = model({
    assignments: [assignment],
    tracker: { a1: finishedClasswork() },
    practicePassRedemptionsByAssignment: redemption('a1'),
  }).allEntries.find((item) => item.assignment.id === 'a1');
  const withoutPass = model({
    assignments: [assignment],
    tracker: { a1: finishedClasswork() },
  }).allEntries.find((item) => item.assignment.id === 'a1');
  assert.equal(withPass.bucket, BUCKET.COMPLETED);
  assert.notEqual(withoutPass.bucket, BUCKET.COMPLETED);
});
