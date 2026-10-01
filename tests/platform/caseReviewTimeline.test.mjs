// The case timeline: academic events beside PR #401's support timeline,
// grouped by school day (never one row per attempt), each with provenance.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCaseTimeline } from '../../src/platform/caseReview/caseTimeline.js';

const HOUR = 3600000;
const DAY = 86400000;
const T0 = Date.parse('2026-09-14T14:00:00Z');
const row = {
  assignmentId: 'a1', title: 'Lesson 1 (synthetic)', releaseAtMs: T0 - DAY, classDueAtMs: T0 + DAY,
  individualizedDue: { dueAtMs: T0 + 2 * DAY }, completedLate: true,
};
const event = (atMs, questionIndex, attemptNumber, isCorrect) => ({
  occurredAt: atMs, source: { assignmentId: 'a1', questionIndex, activityRole: 'classwork' }, performance: { attemptNumber, isCorrect, status: isCorrect ? 'correct' : 'attempted' },
});
const questions = [
  { storageIndex: 0, sectionLabel: 'Classwork', sectionNumber: 1, lastAttemptAtMs: T0, outcomeLabel: 'Correct on the first attempt' },
  { storageIndex: 1, sectionLabel: 'Classwork', sectionNumber: 2, lastAttemptAtMs: T0 + 2 * DAY, outcomeLabel: 'Corrected on a later attempt' },
];

test('answers are grouped per assignment per school day, with the attempts in the expansion', () => {
  const timeline = buildCaseTimeline({
    assignments: [{
      row,
      questions,
      events: [event(T0, 0, 1, true), event(T0 + HOUR / 4, 1, 1, false), event(T0 + 2 * DAY, 1, 2, true)],
      completion: { completedAt: { atMs: T0 + 2 * DAY, provenance: 'derived' }, sessions: { ledger: [{ startMs: T0, endMs: T0 + HOUR / 2, activeMinutes: 22 }] }, reopened: { attendanceExtension: { grantedAtMs: T0 + DAY, finalAtMs: T0 + 5 * DAY, meetingsGranted: 2 }, recoveries: [] } },
      gradeImpact: { items: [{ key: 'classwork', label: 'Classwork', exportStatus: { exportedAtMs: T0 + 3 * DAY, exportedGrade: 90 } }] },
    }],
    supportTimeline: [{ atMs: T0 + HOUR, kind: 'support', label: 'Read aloud — used', provenance: 'recorded' }],
    overrideAudits: [{ at: T0 + 4 * DAY, assignmentId: 'a1', questionIndex: 1, previousScore: 0, newScore: 100, reason: 'Equivalent answer accepted by teacher', actorEmail: 't@example.test' }],
  });
  const kinds = timeline.entries.map((item) => item.kind);
  assert.deepEqual(kinds, ['assigned', 'work-day', 'work-session', 'support', 'due', 'attendance-extension', 'individual-due', 'work-day', 'completed', 'grade-export', 'grade-change']);
  const firstDay = timeline.entries.find((item) => item.kind === 'work-day');
  assert.match(firstDay.label, /2 answers recorded \(1 correct\)/);
  assert.equal(firstDay.details.length, 2);
  assert.equal(firstDay.provenance, 'direct-record');
  assert.equal(timeline.entries.find((item) => item.kind === 'support').provenance, 'direct-record', 'PR #401 "recorded" maps to a direct record');
  assert.equal(timeline.entries.find((item) => item.kind === 'grade-change').provenance, 'staff-documented');
  assert.equal(timeline.entries.find((item) => item.kind === 'individual-due').provenance, 'derived');
});

test('without attempt events, only the last answer per question is dated — and the entry says so', () => {
  const timeline = buildCaseTimeline({ assignments: [{ row, questions, events: [] }] });
  const workDays = timeline.entries.filter((item) => item.kind === 'work-day');
  assert.equal(workDays.length, 2);
  assert.match(workDays[0].detail, /only the time of its last answer/);
  assert.equal(workDays[0].provenance, 'derived');
});

test('the selected window bounds the timeline', () => {
  const timeline = buildCaseTimeline({ assignments: [{ row, questions, events: [] }], fromMs: T0 + DAY / 2, toMs: T0 + 3 * DAY });
  assert.ok(timeline.entries.every((item) => item.atMs >= T0 + DAY / 2 && item.atMs <= T0 + 3 * DAY));
  assert.ok(!timeline.entries.some((item) => item.kind === 'assigned'));
});
