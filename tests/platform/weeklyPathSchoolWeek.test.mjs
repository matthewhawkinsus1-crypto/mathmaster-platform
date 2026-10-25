import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { shiftWeekKey, weekKeyFor } from '../../functions/shared/weeklyPathGrade.mjs';
import { collectWeeklyPathSessions } from '../../functions/shared/weeklyPathCompletion.mjs';
import { buildWeeklyPathHistory, recentWeeklyPathWeekKeys } from '../../functions/shared/weeklyPathHistory.mjs';
import { masteryHistoryWeekKey } from '../../functions/shared/masteryHistory.mjs';
import { buildWeeklyGoal, evaluateWeeklyGoalProgress, gradeWeeklyGoal } from '../../src/platform/path/weeklyPathGoal.js';
import { executableSource } from './helpers/sourceContract.mjs';

/*
 * THE WEEK TURNS OVER WHERE THE STUDENTS ARE (MP06).
 *
 * A week key used to be read in UTC, which turns over at 7pm Central on Sunday
 * (6pm in standard time). From then on a student was shown next week's goal
 * while this week still had hours to run, and the work they did was filed under
 * next week. The key is now read in the school's time zone (WEEK_TIME_ZONE, the
 * zone the deadline is already built in).
 *
 * Nothing stored was migrated. The key keeps its form (a Monday's date), so every
 * stored key is still a valid key and is read as it was; what moved is the one
 * window, a few hours on Sunday evening, in which a moment gets a different key.
 * The tests below hold both halves of that: the new boundary, and that nothing
 * else moved and nothing already filed is lost.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (iso) => Date.parse(iso);
const dateOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// The rule this replaced, written out only to show what did NOT change: the
// week of a moment read on the UTC calendar.
const utcWeekKey = (ms) => {
  const date = new Date(ms);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return dateOf(midnight - ((new Date(midnight).getUTCDay() + 6) % 7) * DAY);
};

test('the week turns over at midnight Monday where the students are, not at 7pm Sunday', () => {
  // Daylight time (UTC-5): Monday 2026-10-12 begins at 05:00Z.
  assert.equal(weekKeyFor(at('2026-10-12T00:00:00Z')), '2026-10-05', 'Sunday 7pm: the old rule started next week here');
  assert.equal(weekKeyFor(at('2026-10-12T04:59:59.999Z')), '2026-10-05', 'Sunday 11:59:59pm is still this week');
  assert.equal(weekKeyFor(at('2026-10-12T05:00:00Z')), '2026-10-12', 'midnight Monday starts the next one');
  // Standard time (UTC-6): Monday 2026-11-09 begins at 06:00Z.
  assert.equal(weekKeyFor(at('2026-11-09T00:00:00Z')), '2026-11-02');
  assert.equal(weekKeyFor(at('2026-11-09T05:59:59.999Z')), '2026-11-02');
  assert.equal(weekKeyFor(at('2026-11-09T06:00:00Z')), '2026-11-09');
  // Across the two nights the clocks change.
  assert.equal(weekKeyFor(at('2026-11-01T06:59:59Z')), '2026-10-26', 'the Sunday morning daylight time ends is still the week of Oct 26');
  assert.equal(weekKeyFor(at('2026-11-02T05:59:59Z')), '2026-10-26', 'and so is its evening, an hour later on the clock');
  assert.equal(weekKeyFor(at('2026-03-09T04:59:59Z')), '2026-03-02', 'the Sunday night daylight time began');
  assert.equal(weekKeyFor(at('2026-03-09T05:00:00Z')), '2026-03-09');
});

test('everywhere else the key is exactly what it always was: only the Sunday-evening window moved', () => {
  let moved = 0;
  for (let ms = at('2026-08-03T00:00:00Z'); ms < at('2027-08-02T00:00:00Z'); ms += HOUR) {
    const key = weekKeyFor(ms);
    const before = utcWeekKey(ms);
    if (key === before) continue;
    moved += 1;
    const moment = new Date(ms);
    assert.equal(key, shiftWeekKey(before, -1), `${moment.toISOString()}: the week still running, not the next one`);
    assert.equal(moment.getUTCDay(), 1, `${moment.toISOString()}: only on Monday by the UTC clock`);
    assert.ok(moment.getUTCHours() < 6, `${moment.toISOString()}: and only before midnight in Texas`);
  }
  // 33 Mondays in daylight time (5 hours each) and 19 in standard time (6 hours).
  assert.equal(moved, 33 * 5 + 19 * 6, 'every Sunday evening, and nothing else, in the year from August 2026');
});

test('a week can start on another day, in the same zone', () => {
  // Sunday-start weeks: Wednesday 2026-10-14 is in the week beginning Sunday 2026-10-11.
  assert.equal(weekKeyFor(at('2026-10-14T15:00:00Z'), 0), '2026-10-11');
  // and the boundary is Sunday midnight in Texas, not Saturday evening.
  assert.equal(weekKeyFor(at('2026-10-11T04:59:59Z'), 0), '2026-10-04', 'Saturday 11:59pm');
  assert.equal(weekKeyFor(at('2026-10-11T05:00:00Z'), 0), '2026-10-11');
});

test('a runtime with no time-zone data keeps the previous (UTC) reading instead of failing', () => {
  const moment = at('2026-10-12T00:00:00Z');
  assert.equal(weekKeyFor(moment, 1, { timeZone: 'Not/A_Zone' }), utcWeekKey(moment));
  assert.equal(weekKeyFor(moment, 1, { timeZone: 'UTC' }), '2026-10-12');
});

test('stepping from one week key to another is date arithmetic, not a clock', () => {
  // The trap: a key's own midnight, handed back as a moment, is Sunday evening
  // in Texas, one week early. That is why stepping has its own function.
  assert.equal(weekKeyFor(at('2026-10-12T00:00:00Z')), '2026-10-05');
  for (let weeks = -60; weeks <= 60; weeks += 1) {
    assert.equal(shiftWeekKey('2026-10-12', weeks), dateOf(at('2026-10-12T00:00:00Z') + weeks * 7 * DAY), `${weeks} weeks`);
  }
  assert.equal(shiftWeekKey('2026-10-12', 0), '2026-10-12');
  assert.equal(shiftWeekKey('2026-12-28', 1), '2027-01-04', 'across the new year');

  // The lists built from it are consecutive Mondays, whatever hour they are asked for.
  for (const iso of ['2026-10-12T00:00:00Z', '2026-10-12T05:00:00Z', '2026-11-09T05:59:00Z', '2027-03-15T05:30:00Z']) {
    const keys = recentWeeklyPathWeekKeys(at(iso));
    assert.equal(keys.length, 12);
    assert.equal(keys[0], weekKeyFor(at(iso)), `${iso}: newest is this week`);
    keys.forEach((key, index) => {
      assert.equal(new Date(`${key}T00:00:00Z`).getUTCDay(), 1, `${key} is a Monday`);
      if (index) assert.equal(at(`${keys[index - 1]}T00:00:00Z`) - at(`${key}T00:00:00Z`), 7 * DAY, `${key} is the week before ${keys[index - 1]}`);
    });
  }
});

test('no code steps a week key by handing its midnight back to weekKeyFor', () => {
  // The same trap, closed at every site that used to do it (history, rewards).
  for (const file of [
    'functions/shared/masteryHistory.mjs',
    'functions/shared/weeklyPathHistory.mjs',
    'functions/shared/growthRewardRules.mjs',
    'functions/lib/growthRewards.js',
    'src/platform/mastery/practiceHistoryPresentation.js',
    'src/platform/path/weeklyPathGoal.js',
    'src/App.jsx',
  ]) {
    const source = executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    assert.doesNotMatch(source, /weekKeyFor\(\s*(?:Date\.parse|weekStartMs)\b/, `${file} steps a week with weekKeyFor(an instant built from a key)`);
  }
});

// A one-session week, as the planner would propose it.
const plan = { sessions: [{ skillId: 'teks:A.5A', teksCode: 'A.5A', purpose: 'currentLearning' }] };
const finishedSlot = (goal, completedAt, extra = {}) => ({
  status: 'completed',
  sessionId: extra.sessionId || 'session',
  completedAt,
  weekKey: extra.weekKey || goal.weekKey,
  weeklySlotKey: goal.sessions[0].weeklySlotKey,
  accuracy: 1,
});

test('what a student does on Sunday evening belongs to the week that is still running', () => {
  const sunday8pm = at('2026-10-12T01:00:00Z'); // 8pm CDT; by the UTC clock it is already Monday
  const goal = buildWeeklyGoal({ plan, now: sunday8pm });
  assert.equal(goal.weekKey, '2026-10-05', 'the goal on screen is this week\'s, not next week\'s');
  assert.equal(goal.dueAt, at('2026-10-12T04:59:59.999Z'), 'due at the end of Sunday where the students are');
  assert.ok(goal.dueAt > sunday8pm, 'the week still has hours to run');

  const done = evaluateWeeklyGoalProgress({ goal, completions: [finishedSlot(goal, sunday8pm)], now: sunday8pm + HOUR });
  assert.equal(done.completedOnTime, 1, 'a session finished at 8pm Sunday is on time for the week');

  const monday = buildWeeklyGoal({ plan, now: at('2026-10-12T05:00:00Z') });
  assert.equal(monday.weekKey, '2026-10-12', 'midnight Monday is next week\'s');
  assert.equal(monday.dueAt, at('2026-10-19T04:59:59.999Z'));
});

test('work filed under the next week before this change is still found and graded there, and not counted twice', () => {
  const sunday8pm = at('2026-10-12T01:00:00Z');
  const thisWeek = buildWeeklyGoal({ plan, now: sunday8pm });
  const nextWeek = { ...buildWeeklyGoal({ plan, now: at('2026-10-14T15:00:00Z') }) };
  assert.equal(nextWeek.weekKey, '2026-10-12');
  // The same frozen slot in both weeks, as a standing recommendation produces.
  nextWeek.sessions = thisWeek.sessions;
  const slotKey = thisWeek.sessions[0].weeklySlotKey;

  // Two sessions finished at the same moment on Sunday evening: one stored
  // before this change (filed under the next week), one after (this week).
  const filedByOldRule = { id: 'old', data: { status: 'completed', completedAt: sunday8pm, weekKey: '2026-10-12', weeklySlotKey: slotKey } };
  const filedByNewRule = { id: 'new', data: { status: 'completed', completedAt: sunday8pm, weekKey: '2026-10-05', weeklySlotKey: slotKey } };
  const sessions = [filedByOldRule, filedByNewRule];

  const counted = (goal) => gradeWeeklyGoal({
    goal: { ...goal, assignmentState: 'assigned' },
    completions: collectWeeklyPathSessions({ sessions, weekKey: goal.weekKey }).completions,
    now: at('2026-10-20T15:00:00Z'),
  }).progress.matchedCompletions.map((entry) => entry.sessionId);

  assert.deepEqual(counted(nextWeek), ['old'], 'the old filing still grades in the week it was filed under');
  assert.deepEqual(counted(thisWeek), ['new'], 'a session counts in the week it carries, once');
});

test('the history, the snapshot and the week list agree on Sunday evening', () => {
  const sunday8pm = at('2026-10-12T01:00:00Z');
  const history = buildWeeklyPathHistory({ now: sunday8pm, goalsByWeekKey: {}, sessions: [] });
  assert.equal(history.currentWeekKey, '2026-10-05');
  assert.equal(history.weeks[0].weekKey, '2026-10-05');
  assert.equal(history.weeks[0].current, true, 'the week in progress is this one');
  // The mastery snapshot a trigger writes at that moment is filed under it too.
  assert.equal(masteryHistoryWeekKey({ weeks: {}, occurredAt: sunday8pm, now: sunday8pm + HOUR }), '2026-10-05');
  assert.equal(masteryHistoryWeekKey({ weeks: {}, occurredAt: at('2026-10-12T05:00:00Z'), now: at('2026-10-12T06:00:00Z') }), '2026-10-12');
});
