import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  GRADING_POLICY,
  describeWeeklyGradeForStudent,
  gradeWeeklyGoal,
  weeklyDueDayName,
} from '../../functions/shared/weeklyPathGrade.mjs';
import { buildWeeklyGoal } from '../../src/platform/path/weeklyPathGoal.js';

const require = createRequire(import.meta.url);
const { weeklyPathPublishDecision } = require('../../functions/lib/weeklyPathClassroom.js');

const codeOf = (path) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const DUE = Date.now() + 24 * 60 * 60 * 1000;
const goalOf = (sessions = 4) => ({
  weekKey: '2026-W36',
  goalSessions: sessions,
  dueAt: DUE,
  sessions: Array.from({ length: sessions }, (_, index) => ({
    slot: index + 1,
    skillId: `s${index}`,
    teksCode: `A.${index}`,
    purpose: 'current_learning',
    weeklySlotKey: `k${index}`,
  })),
});
const completionsFor = (goal, count, accuracy = 0.9) => Array.from({ length: count }, (_, index) => ({
  status: 'completed',
  weekKey: goal.weekKey,
  weeklySlotKey: `k${index}`,
  teksCode: `A.${index}`,
  completedAt: DUE - 1000,
  accuracy,
}));

test('the number a student reads is the number that gets published', () => {
  // The whole point. A second implementation for the student view would drift,
  // and the day it drifted a student would read one score on their screen while
  // their family read another in the gradebook.
  const goal = goalOf(4);
  for (const count of [0, 1, 2, 3, 4]) {
    const completions = completionsFor(goal, count);
    const published = gradeWeeklyGoal({ goal, completions });
    const shown = describeWeeklyGradeForStudent({ goal, completions });
    // The number itself, not a rounding of it (Classroom shows 96.67, not 97).
    assert.equal(shown.score, published.grade, `at ${count} sessions`);
    assert.equal(shown.passing, published.passing);
  }
});

test('a mid-week grade is labelled as provisional, never as the grade', () => {
  // A student one session into a four-session week is genuinely low and will be
  // high on Friday. The publisher already refuses to send a grade before the
  // week ends for that reason; showing the same number unlabelled would tell a
  // student they are failing a week they have four days left to finish.
  const goal = goalOf(4);
  const shown = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 1) });
  assert.equal(shown.final, false);
  assert.equal(shown.label, 'Grade so far');
  assert.match(shown.headline, /^Grade so far: \d+(?:\.\d{1,2})? out of 100$/);

  // And it never appears without what finishing is worth.
  assert.ok(shown.nextStep);
  assert.match(shown.nextStep, /Finish 3 more sessions to earn at least 80\./);
});

test('the platform refuses to publish exactly while the label says so far', () => {
  // The two must agree: whenever the student is told the grade is provisional,
  // the publisher must also be refusing to send it.
  const goal = goalOf(4);
  const shown = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 2) });
  const decision = weeklyPathPublishDecision({
    enabled: true, linked: true, weekEnded: false, score: shown.score,
  });
  assert.equal(shown.final, false);
  assert.equal(decision.publish, false);
  assert.match(decision.reason, /not_over_yet/);
});

test('once the week closes the number stops being so far', () => {
  const goal = { ...goalOf(4), dueAt: Date.now() - 1000 };
  const shown = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 4) });
  assert.equal(shown.final, true);
  assert.equal(shown.label, "This week's grade");
  assert.equal(shown.nextStep, null);
  assert.match(shown.teacherNote, /has this grade/);
});

test('finishing everything is stated as a promise, because the policy makes it one', () => {
  // fullCompletionFloor is a floor: a student who completes every session
  // cannot score below it whatever the practice revealed. That is what makes it
  // safe to say out loud.
  const goal = goalOf(4);
  const weak = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 4, 0.1) });
  assert.ok(weak.score >= GRADING_POLICY.fullCompletionFloor, `floor not honoured: ${weak.score}`);
  assert.equal(weak.complete, true);

  const partial = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 1) });
  assert.match(partial.nextStep, new RegExp(`at least ${GRADING_POLICY.fullCompletionFloor}`));
});

test('a student who has done nothing is told what to do, not just given a zero', () => {
  const goal = goalOf(4);
  const shown = describeWeeklyGradeForStudent({ goal, completions: [] });
  assert.equal(shown.score, 0);
  assert.equal(shown.status, 'not_started');
  assert.match(shown.nextStep, /Finish 4 more sessions/);
});

test('the singular reads as English', () => {
  const goal = goalOf(4);
  const shown = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 3) });
  assert.match(shown.nextStep, /Finish 1 more session to earn/);
});

test('no goal means no grade card rather than a wrong one', () => {
  assert.equal(describeWeeklyGradeForStudent({ goal: null, completions: [] }), null);
  assert.equal(describeWeeklyGradeForStudent({ goal: { sessions: [] } }), null);
  assert.equal(describeWeeklyGradeForStudent(), null);
});

// Deadlines as dueAtFor builds them: 11:59pm in Chicago on the teacher's day.
const SUNDAY_CLOSE = Date.parse('2026-09-06T23:59:59.999-05:00');
const FRIDAY_CLOSE = Date.parse('2026-09-04T23:59:59.999-05:00');
// The same Friday deadline after daylight saving ends (UTC-6, not UTC-5).
const FRIDAY_CLOSE_STANDARD_TIME = Date.parse('2026-11-06T23:59:59.999-06:00');
const daysBefore = (at, days = 3) => at - days * 24 * 60 * 60 * 1000;

test('where the grade goes is stated plainly, once', () => {
  // A student should never be surprised to find this in their gradebook.
  const goal = { ...goalOf(4), dueAt: SUNDAY_CLOSE };
  const shown = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 2), now: daysBefore(SUNDAY_CLOSE) });
  assert.equal(shown.teacherNote, 'This goes to your teacher when the week closes on Sunday night.');
});

test('the note names the day the teacher chose, not a fixed Sunday', () => {
  // Teachers set the due day. "Sunday night" told a class due on Friday that
  // they had two more days than they did.
  const goal = { ...goalOf(4), dueAt: FRIDAY_CLOSE };
  const shown = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 1), now: daysBefore(FRIDAY_CLOSE) });
  assert.equal(shown.teacherNote, 'This goes to your teacher when the week closes on Friday night.');
});

test('the day is read where the students are, not in UTC', () => {
  // 11:59pm Friday in Chicago is already Saturday morning in UTC, so a UTC
  // weekday would name the day after the deadline.
  assert.equal(new Date(FRIDAY_CLOSE).getUTCDay(), 6, 'the fixture must cross midnight UTC to mean anything');
  assert.equal(weeklyDueDayName({ dueAt: FRIDAY_CLOSE }), 'Friday');
  assert.equal(weeklyDueDayName({ dueAt: FRIDAY_CLOSE_STANDARD_TIME }), 'Friday', 'and after daylight saving ends');
  assert.equal(weeklyDueDayName({ dueAt: SUNDAY_CLOSE }), 'Sunday');
});

test('the day comes from the goal the student was given', () => {
  // The same deadline builder the student's goal uses, with a Friday due day.
  const now = Date.parse('2026-09-01T15:00:00Z'); // a Tuesday
  const goal = buildWeeklyGoal({
    plan: { sessions: [{ skillId: 's1', teksCode: 'A.5A', purpose: 'current_learning' }] },
    config: { dueDayOfWeek: 5 },
    studentId: 'S1',
    now,
  });
  const shown = describeWeeklyGradeForStudent({ goal, completions: [], now });
  assert.equal(shown.teacherNote, 'This goes to your teacher when the week closes on Friday night.');
});

test('without a usable deadline the note falls back to the configured day, then to no day at all', () => {
  assert.equal(weeklyDueDayName({ settings: { dueDayOfWeek: 3 } }), 'Wednesday');
  assert.equal(weeklyDueDayName({ dueAt: 'soon', settings: { dueDayOfWeek: 0 } }), 'Sunday');
  // A runtime without time-zone data must not fall back to the UTC weekday.
  assert.equal(weeklyDueDayName({ dueAt: FRIDAY_CLOSE, settings: { dueDayOfWeek: 5 } }, { timeZone: 'Not/A_Zone' }), 'Friday');
  assert.equal(weeklyDueDayName({ dueAt: FRIDAY_CLOSE }, { timeZone: 'Not/A_Zone' }), null);
  assert.equal(weeklyDueDayName({ settings: { dueDayOfWeek: 9 } }), null);
  assert.equal(weeklyDueDayName(null), null);

  const goal = { ...goalOf(4), dueAt: null };
  const shown = describeWeeklyGradeForStudent({ goal, completions: [] });
  assert.equal(shown.teacherNote, 'This goes to your teacher when the week closes.',
    'a day it does not know is not named');
});

test('the panel computes the grade rather than being handed a number', () => {
  // Passing completions and calling the shared function is what keeps one
  // implementation. A pre-computed prop would let a caller supply anything.
  const panel = codeOf('src/components/student/WeeklyPathGoalPanel.jsx');
  assert.match(panel, /import \{[^}]*\bdescribeWeeklyGradeForStudent\b[^}]*\} from '..\/..\/platform\/path\/weeklyPathGoal.js'/);
  // Computed from the goal (as the publisher grades it: publishedWeeklyGoal)
  // and the completions, never from a number handed in.
  assert.match(panel, /describeWeeklyGradeForStudent\(\{ goal: (?:publishedWeeklyGoal\(goal\)|goal), completions \}\)/);
  assert.doesNotMatch(panel, /grade\s*=\s*\w+\s*\*|Math\.round\(\s*completed\s*\/\s*required/);
});

test('both student surfaces show the same bar and the same grade', () => {
  // The panel is shared by Path and the dashboard so a student never sees two
  // different stories about their week.
  const panel = codeOf('src/components/student/WeeklyPathGoalPanel.jsx');
  assert.equal((panel.match(/<WeeklyGradeCard/g) || []).length, 2);
  assert.equal((panel.match(/<WeeklyProgressBar/g) || []).length, 2);

  for (const path of [
    'src/components/student/MyMathPathApp.jsx',
    'src/components/student/MyMathPathDashboard.jsx',
  ]) {
    assert.match(codeOf(path), /completions=\{weeklyCompletions\}/, path);
  }
});

test('the bar reports progress to assistive technology, not only to the eye', () => {
  const panel = codeOf('src/components/student/WeeklyPathGoalPanel.jsx');
  assert.match(panel, /role="progressbar"/);
  assert.match(panel, /aria-valuenow=\{done\}/);
  assert.match(panel, /aria-valuemax=\{total\}/);
});
