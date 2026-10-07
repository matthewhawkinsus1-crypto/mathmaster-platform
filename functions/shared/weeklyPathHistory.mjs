/*
 * PAST WEEKS, THEIR GRADES, AND THE "WEEKS HIT" STREAK — ONE DEFINITION.
 *
 * The weekly panel shows THIS week. On Monday last week's goal, the grade it
 * earned and whether it was hit vanished from the student's screen, although
 * the grade had just gone to their teacher's gradebook.
 *
 * Every number here comes from the functions the Classroom publisher uses:
 * completions from weeklyPathCompletion.mjs (only a session the server marked
 * completed, inside the week's window) and the grade from gradeWeeklyGoal, over
 * the FROZEN weekly goal (weeklyPathGoalSnapshots/{studentId}__{weekKey}). The
 * grade a student reads for a past week is therefore the grade the gradebook
 * received — a second formula here is how the two would start to disagree.
 *
 * A grade is given only for a CLOSED week. Mid-week the Path panel owns "grade
 * so far", with its own wording about what finishing is worth; repeating a
 * provisional number here would put two numbers for one week on two tabs.
 *
 * THE STREAK. Consecutive weeks whose goal was HIT — every assigned session
 * done by the due date, which is exactly the grade's full completion credit.
 * The week still in progress never breaks it: it joins the streak the moment
 * it is hit and is otherwise not counted yet. A closed week that was not hit
 * ends it, and that includes a week with no goal at all (the Path was never
 * opened, so nothing was assigned and nothing was graded): a streak claims
 * "in a row", and a week nobody worked is not one of them.
 *
 * Pure: no Firestore. Shared by the getMyWeeklyPathHistory callable, the
 * Teacher Path Simulator (the same builder over its synthetic sessions) and any
 * reward reader that needs "hit N weeks in a row".
 */

import { gradeWeeklyGoal, weekKeyFor } from './weeklyPathGrade.mjs';
import { collectWeeklyPathSessions, weeklyCompletionWindow } from './weeklyPathCompletion.mjs';

export const WEEKLY_PATH_HISTORY_WEEKS = 12;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isWeekKey = (value) => {
  const text = String(value ?? '');
  return WEEK_KEY.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00Z`));
};

const shiftWeekKey = (weekKey, weeks) => weekKeyFor(Date.parse(`${weekKey}T00:00:00Z`) + weeks * WEEK_MS);

/** This week and the ones before it, newest first. Deterministic: no scan. */
export const recentWeeklyPathWeekKeys = (now = Date.now(), count = WEEKLY_PATH_HISTORY_WEEKS) => {
  const current = weekKeyFor(now);
  const total = Math.max(1, Math.min(52, Math.round(Number(count) || WEEKLY_PATH_HISTORY_WEEKS)));
  return Array.from({ length: total }, (_, index) => shiftWeekKey(current, -index));
};

/** One time range covering every listed week's completion window, or null. */
export const weeklyPathHistoryWindow = (weekKeys = []) => {
  const windows = (Array.isArray(weekKeys) ? weekKeys : []).map(weeklyCompletionWindow).filter(Boolean);
  if (!windows.length) return null;
  return {
    start: Math.min(...windows.map((window) => window.start)),
    end: Math.max(...windows.map((window) => window.end)),
  };
};

const hasWeeklyGoal = (goal) => Boolean(goal && Array.isArray(goal.sessions) && goal.sessions.length);

/**
 * One week as the student's history shows it.
 *
 * `completions` must be the week's completions as the publisher collects them
 * (collectWeeklyPathSessions for that weekKey). `hit` is full on-time
 * completion; `grade`/`score` are the published grade and appear only once the
 * week is closed.
 */
export const summarizeWeeklyPathWeek = ({
  weekKey,
  goal = null,
  completions = [],
  now = Date.now(),
  currentWeekKey = weekKeyFor(now),
} = {}) => {
  const key = String(weekKey || '');
  const current = key === currentWeekKey;
  if (!hasWeeklyGoal(goal)) {
    return {
      weekKey: key,
      current,
      hasGoal: false,
      // Nothing was assigned. Once the week is over it is a week not hit.
      closed: key < currentWeekKey,
      hit: false,
      required: 0,
      completed: 0,
      completedOnTime: 0,
      lateCompletions: 0,
      grade: null,
      score: null,
      passing: null,
      dueAt: null,
    };
  }

  const graded = gradeWeeklyGoal({ goal, completions, now });
  const dueAt = Number(goal.dueAt) || null;
  // Closed exactly when the grade is final. A goal frozen without a due date
  // never freezes its grade, so it closes with its calendar week instead.
  const closed = graded.frozen || (!dueAt && key < currentWeekKey);
  return {
    weekKey: key,
    current,
    hasGoal: true,
    closed,
    hit: graded.components.completionRatio >= 1,
    required: graded.progress.required,
    completed: graded.progress.completed,
    completedOnTime: graded.progress.completedOnTime,
    lateCompletions: graded.progress.lateCompletions,
    grade: closed ? graded.grade : null,
    // The published grade itself, as the gradebook shows it.
    score: closed ? graded.grade : null,
    passing: closed ? graded.passing : null,
    dueAt,
  };
};

/**
 * Consecutive weeks hit, counting back from the newest. An open week that is
 * not hit yet is skipped; the first closed week that was not hit ends the
 * count. `atLeast` means no end was found inside the weeks given, so the real
 * streak may be longer than the window.
 */
export const weeklyPathStreak = (weeks = []) => {
  const newestFirst = (Array.isArray(weeks) ? weeks : [])
    .filter((week) => isWeekKey(week?.weekKey))
    .sort((a, b) => b.weekKey.localeCompare(a.weekKey));
  let count = 0;
  let includesOpenWeek = false;
  let endedBy = null;
  for (const week of newestFirst) {
    if (week.hit) {
      count += 1;
      if (!week.closed) includesOpenWeek = true;
      continue;
    }
    if (!week.closed) continue;
    endedBy = week.weekKey;
    break;
  }
  return { weeks: count, includesOpenWeek, atLeast: count > 0 && endedBy === null, endedBy };
};

/**
 * The whole history: one row per week (newest first), the streak and totals.
 *
 * `goalsByWeekKey` holds the frozen goals; `sessions` are pathSessions
 * documents as [{ id, data }] covering weeklyPathHistoryWindow(weekKeys).
 */
export const buildWeeklyPathHistory = ({
  weekKeys = null,
  goalsByWeekKey = {},
  sessions = [],
  now = Date.now(),
  displayTeks = null,
  truncated = false,
} = {}) => {
  const currentWeekKey = weekKeyFor(now);
  const requested = Array.isArray(weekKeys) && weekKeys.length ? weekKeys : recentWeeklyPathWeekKeys(now);
  const keys = [...new Set(requested.filter(isWeekKey))]
    .filter((key) => key <= currentWeekKey)
    .sort((a, b) => b.localeCompare(a));
  const weeks = keys.map((weekKey) => {
    const goal = goalsByWeekKey?.[weekKey] || null;
    const completions = hasWeeklyGoal(goal)
      ? collectWeeklyPathSessions({ sessions, weekKey, displayTeks }).completions
      : [];
    return summarizeWeeklyPathWeek({ weekKey, goal, completions, now, currentWeekKey });
  });
  return {
    currentWeekKey,
    weeks,
    streak: weeklyPathStreak(weeks),
    weeksHit: weeks.filter((week) => week.hit).length,
    weeksWithGoal: weeks.filter((week) => week.hasGoal).length,
    // A partial read of the student's sessions would grade a week too low; the
    // screen has to be able to say so rather than present it as fact.
    truncated: Boolean(truncated),
  };
};
