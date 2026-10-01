// Completion and work pattern: recorded facts only, four kinds of time kept
// apart, and "no open record" never turned into "never opened".

import test from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_GAP_MINUTES, analyzeAssignmentCompletion, ledgerSessions, summarizeCompletion } from '../../src/platform/caseReview/completionAnalysis.js';
import { QUESTION_OUTCOME } from '../../src/platform/caseReview/attemptAnalysis.js';

const MIN = 60000;
const DAY = 86400000;
const T0 = Date.parse('2026-09-14T14:00:00Z'); // 9:00 a.m. in Chicago
const minuteOf = (ms) => Math.floor(ms / MIN);
const baseRow = (extra = {}) => ({
  assignmentId: 'a1', title: 'Lesson 1 (synthetic)', status: 'completed', statusLabel: 'Completed', completedLate: false,
  releaseAtMs: T0 - DAY, effectiveDueAtMs: T0 + DAY, effectiveFinalAtMs: T0 + 3 * DAY, attendanceFinalAtMs: null,
  engagement: { activeMinutes: null, provenance: 'not-recorded', source: 'none', note: 'Work is recorded but active time is not.' },
  ...extra,
});
const question = (outcome, extra = {}) => ({ outcome, lastAttemptAtMs: T0, lastAttemptTimeProvenance: 'direct-record', ...extra });

test('server-timed minutes form work sessions; a gap over the limit starts a new one', () => {
  assert.equal(SESSION_GAP_MINUTES, 20);
  const start = minuteOf(T0);
  const sessions = ledgerSessions([{ minutes: [start, start + 1, start + 2, start + 30, start + 31] }, { minutes: [start + 2] }]);
  assert.deepEqual(sessions.map((session) => session.activeMinutes), [3, 2]);
  assert.equal(sessions[0].startMs, start * MIN);
});

test('missing historical engagement stays Not recorded, never zero', () => {
  const result = analyzeAssignmentCompletion({ row: baseRow(), questions: [question(QUESTION_OUTCOME.CORRECT_FIRST)] });
  assert.equal(result.time.activeMinutes, null);
  assert.equal(result.time.activeProvenance, 'not-recorded');
  assert.equal(result.time.practiceModeTime, 'not-recorded');
  const summary = summarizeCompletion([result]);
  assert.equal(summary.timeNotRecorded, 1);
  assert.equal(summary.activeMinutesServer, 0, 'a sum of recorded minutes, labelled as such');
});

test('no open record is stated as a missing record, not as "never opened"', () => {
  const result = analyzeAssignmentCompletion({ row: baseRow({ status: 'missing', statusLabel: 'Missing' }), questions: [question(QUESTION_OUTCOME.NOT_ATTEMPTED, { lastAttemptAtMs: null })] });
  assert.equal(result.opened.recorded, false);
  assert.equal(result.opened.provenance, 'not-recorded');
  assert.match(result.opened.note, /not evidence it was never opened/);
  assert.equal(result.started, false);
  assert.equal(result.missing, true);
});

test('an attempt event proves the assignment was opened, at its own time', () => {
  const result = analyzeAssignmentCompletion({
    row: baseRow(),
    questions: [question(QUESTION_OUTCOME.CORRECT_FIRST)],
    attemptEvents: [{ occurredAt: T0 - 30 * MIN, performance: { status: 'correct' } }],
  });
  assert.equal(result.opened.recorded, true);
  assert.equal(result.opened.firstAtMs, T0 - 30 * MIN);
  assert.equal(result.opened.via, 'attempt-event');
  assert.equal(result.completedAt.atMs, T0);
  assert.match(result.completedAt.note, /no separate turn-in record/);
});

test('late work: attempts after the student\'s own due date, answers refused after the final cutoff', () => {
  const result = analyzeAssignmentCompletion({
    row: baseRow({ completedLate: true }),
    questions: [question(QUESTION_OUTCOME.CORRECTED_AFTER_RETRY)],
    attemptEvents: [
      { occurredAt: T0, performance: { status: 'attempted' } },
      { occurredAt: T0 + 2 * DAY, performance: { status: 'correct' } },
    ],
    receipts: { notCountedAfterClose: 2 },
  });
  assert.equal(result.late, true);
  assert.equal(result.afterDeadline.attemptsAfterDue, 1);
  assert.equal(result.afterDeadline.notCountedAfterClose, 2);
  assert.equal(result.resumed, true, 'work on two school days');
  assert.deepEqual(result.workDays, ['2026-09-14', '2026-09-16']);
});

test('an attendance extension and a Recovery are recorded as reopenings with their own times', () => {
  const result = analyzeAssignmentCompletion({
    row: baseRow({ attendanceFinalAtMs: T0 + 5 * DAY }),
    studentOverride: { lateDueAt: '2026-09-19', extension: { grantedAt: T0 + DAY, meetingsGranted: 2, grantedByEmail: 't@example.test' } },
    recovery: { dol: { status: 'completed', startedAt: '2026-09-17T15:00:00Z', completedAt: '2026-09-17T15:20:00Z', recordedScoreAtCompletion: 80 } },
  });
  assert.equal(result.reopened.attendanceExtension.grantedAtMs, T0 + DAY);
  assert.equal(result.reopened.attendanceExtension.meetingsGranted, 2);
  assert.deepEqual(result.reopened.recoveries.map((entry) => [entry.section, entry.status, entry.recordedScore]), [['dol', 'completed', 80]]);
  assert.equal(summarizeCompletion([result]).reopened, 1);
});

test('Practice Mode: recorded activity with a device-clock caveat; not loaded is said, not zeroed', () => {
  const practiced = analyzeAssignmentCompletion({ row: baseRow(), practice: { questionsPracticed: 3, attempts: 5, correct: 2, lastPracticeAtMs: T0 + 4 * DAY } });
  assert.deepEqual([practiced.practiceMode.questionsPracticed, practiced.practiceMode.correct], [3, 2]);
  assert.equal(practiced.practiceMode.provenance, 'legacy-limited');
  assert.equal(analyzeAssignmentCompletion({ row: baseRow() }).practiceMode.loaded, false);
  assert.equal(analyzeAssignmentCompletion({ row: baseRow(), practice: null }).practiceMode.recorded, false);
});
