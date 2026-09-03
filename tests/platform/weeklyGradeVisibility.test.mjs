import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  GRADING_POLICY,
  describeWeeklyGradeForStudent,
  gradeWeeklyGoal,
} from '../../functions/shared/weeklyPathGrade.mjs';

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
    assert.equal(shown.score, Math.round(published.grade), `at ${count} sessions`);
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
  assert.match(shown.headline, /^Grade so far: \d+ out of 100$/);

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

test('where the grade goes is stated plainly, once', () => {
  // A student should never be surprised to find this in their gradebook.
  const goal = goalOf(4);
  const shown = describeWeeklyGradeForStudent({ goal, completions: completionsFor(goal, 2) });
  assert.match(shown.teacherNote, /goes to your teacher when the week closes on Sunday night\./);
});

test('the panel computes the grade rather than being handed a number', () => {
  // Passing completions and calling the shared function is what keeps one
  // implementation. A pre-computed prop would let a caller supply anything.
  const panel = codeOf('src/components/student/WeeklyPathGoalPanel.jsx');
  assert.match(panel, /import \{ describeWeeklyGradeForStudent \}/);
  assert.match(panel, /describeWeeklyGradeForStudent\(\{ goal, completions \}\)/);
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
