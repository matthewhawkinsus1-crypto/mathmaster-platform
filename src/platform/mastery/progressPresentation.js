// MY PROGRESS, IN WORDS A STUDENT CAN READ.
//
// The numbers are not computed here. Growth comes from compareMasteryGrowth
// over the weekly mastery snapshots (functions/shared/masteryHistory.mjs); the
// past weeks, their grades and the streak come from the server's
// getMyWeeklyPathHistory, which grades with the Classroom publisher's own
// functions (functions/shared/weeklyPathHistory.mjs). This module only turns
// those facts into labels, so the screen cannot invent a number of its own.
//
// Vocabulary: "Mastered" is only ever the shared rule's verdict, carried in the
// snapshot. Nothing here decides it.

import { compareMasteryGrowth } from '../../../functions/shared/masteryHistory.mjs';
import { studentLabelForTeks } from '../path/skillLabels.js';

const dateLabel = (weekKey) => {
  const parsed = Date.parse(`${weekKey}T00:00:00Z`);
  return Number.isFinite(parsed)
    ? new Date(parsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : '';
};

/** "Week of Oct 5" — the week's Monday, which is what its key names. */
export const weekOfLabel = (weekKey) => `Week of ${dateLabel(weekKey)}`;

const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const changeTile = ({ key, label, now, previous, change, unit = '', note = null }) => ({
  key,
  label,
  now: now === null || now === undefined ? '—' : `${now}${unit}`,
  previous: previous === null || previous === undefined ? '—' : `${previous}${unit}`,
  change: change === null || change === undefined ? null : change,
  changeLabel: change === null || change === undefined
    ? null
    : change > 0 ? `+${change}${unit}` : change < 0 ? `−${Math.abs(change)}${unit}` : 'No change',
  direction: !change ? 'flat' : change > 0 ? 'up' : 'down',
  note,
});

/**
 * This week against four weeks ago, ready to render.
 *
 * state: 'empty'    — no snapshot yet (nothing has been recorded)
 *        'starting' — only this week on record: current numbers, no comparison
 *        'ready'    — a comparison, with the baseline it was made against
 */
export const describeGrowthForStudent = ({ history = null, now = Date.now(), weeksBack = 4 } = {}) => {
  const growth = compareMasteryGrowth({ history, now, weeksBack });
  if (!growth.available) {
    if (growth.reason === 'no_history') {
      return {
        state: 'empty',
        title: 'Your progress over time',
        message: 'Your progress starts with your next answer. Each week MathMaster keeps a snapshot of your skills, so you can see how far you have come.',
      };
    }
    const current = growth.current || {};
    return {
      state: 'starting',
      title: 'Your progress so far',
      message: 'Check back next week to see how this week compares.',
      tiles: [
        changeTile({ key: 'mastered', label: 'Skills mastered', now: current.mastered ?? 0, previous: null, change: null }),
        changeTile({ key: 'average', label: 'Average score', now: current.averageScore, previous: null, change: null, unit: '%' }),
        changeTile({ key: 'practised', label: 'Skills practised', now: current.scored ?? 0, previous: null, change: null }),
      ],
    };
  }

  const baselineLabel = growth.baselineKind === 'weeksAgo'
    ? `${growth.weeksBack} weeks ago`
    : weekOfLabel(growth.baselineWeekKey);
  return {
    state: 'ready',
    title: growth.baselineKind === 'weeksAgo'
      ? `This week vs ${growth.weeksBack} weeks ago`
      : `This week vs the week of ${dateLabel(growth.baselineWeekKey)}`,
    baselineLabel,
    noRecentPractice: growth.noRecentPractice,
    // Only possible against a weeks-ago baseline: the newest snapshot is that old.
    message: growth.noRecentPractice
      ? `No practice has been recorded in the last ${growth.weeksBack} weeks. Your next session picks up from here.`
      : null,
    tiles: [
      changeTile({
        key: 'mastered', label: 'Skills mastered',
        now: growth.mastered.after, previous: growth.mastered.before, change: growth.mastered.change,
      }),
      changeTile({
        key: 'average', label: 'Average score',
        now: growth.sameSkills.after, previous: growth.sameSkills.before, change: growth.sameSkills.change, unit: '%',
        // Like for like, and saying so: a skill started since then begins low
        // and would otherwise read as going backwards.
        note: growth.sameSkills.count
          ? `On the ${plural(growth.sameSkills.count, 'skill')} you had started by then`
          : null,
      }),
      changeTile({
        key: 'practised', label: 'Skills practised',
        now: growth.current.scored, previous: growth.baseline.scored, change: growth.current.scored - growth.baseline.scored,
      }),
    ],
    movers: growth.movers.map((entry) => ({
      ...entry,
      label: studentLabelForTeks(entry.code),
      direction: entry.change > 0 ? 'up' : 'down',
      changeLabel: entry.change > 0 ? `+${entry.change}` : `−${Math.abs(entry.change)}`,
    })),
    newlyMastered: growth.newlyMastered.map((code) => ({ code, label: studentLabelForTeks(code) })),
    newSkills: growth.newSkills.map((code) => ({ code, label: studentLabelForTeks(code) })),
  };
};

const weekStatus = (week) => {
  if (!week.hasGoal) return { key: 'noGoal', label: week.current ? 'Not set yet' : 'No goal' };
  if (week.hit) return { key: 'hit', label: 'Goal hit' };
  if (!week.closed) return { key: 'open', label: 'In progress' };
  return { key: 'missed', label: 'Not finished' };
};

const weekProgress = (week) => {
  if (!week.hasGoal) {
    return week.current ? 'Open your Path to set this week’s goal.' : 'No weekly goal was set this week.';
  }
  if (!week.closed) return `${week.completed} of ${week.required} done so far`;
  const late = Number(week.lateCompletions) || 0;
  return `${week.completedOnTime} of ${week.required} done by the deadline${late ? ` · ${late} finished late` : ''}`;
};

/**
 * Past weeks and the streak, ready to render. Weeks before the first goal on
 * record are left out — a new student should not open a list of empty weeks —
 * but this week always shows.
 */
export const describeWeeklyHistoryForStudent = (history = null) => {
  const weeks = Array.isArray(history?.weeks) ? history.weeks : [];
  const lastGoalIndex = weeks.reduce((last, week, index) => (week?.hasGoal ? index : last), -1);
  const rows = weeks
    .filter((week, index) => week?.current || index <= lastGoalIndex)
    .map((week) => ({
      weekKey: week.weekKey,
      current: Boolean(week.current),
      label: week.current ? 'This week' : weekOfLabel(week.weekKey),
      status: weekStatus(week),
      progress: weekProgress(week),
      // Only a closed week has a grade: the number its gradebook received.
      grade: week.closed && week.score !== null && week.score !== undefined ? `${week.score}` : null,
      passing: week.passing ?? null,
    }));

  const streak = history?.streak || { weeks: 0, includesOpenWeek: false, atLeast: false };
  const count = Number(streak.weeks) || 0;
  return {
    rows,
    streak: {
      count,
      value: streak.atLeast ? `${count}+` : `${count}`,
      label: count === 1 ? 'week in a row' : 'weeks in a row',
      detail: count === 0
        ? 'Finish every session in a week’s goal by Sunday night to start a streak.'
        : streak.includesOpenWeek
          ? 'Including this week. Keep it going next week.'
          : 'Finish this week’s goal to make it one more.',
    },
    weeksHit: Number(history?.weeksHit) || 0,
    weeksWithGoal: Number(history?.weeksWithGoal) || 0,
    truncated: history?.truncated === true,
  };
};
