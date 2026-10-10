/*
 * PATH GROWTH EVENTS — WHAT MY MATH PATH TELLS THE REWARDS SYSTEM.
 *
 * Rewards (job E: growth, effort and mastery rewards) need to know when
 * something worth rewarding happened on a student's Path. The Path grants
 * nothing itself. This module only READS the Path's own records and says,
 * deterministically, which events they contain. Pure: no Firestore, no
 * network, no clock (every time comes from the records or the caller), so
 * Cloud Functions and the browser import the same file.
 *
 * ---------------------------------------------------------------- EVENTS
 *
 * weeklyGoalHit — the student finished every session of a FROZEN weekly goal.
 *
 *   Inputs: the frozen goal (a weeklyPathGoalSnapshots document, which the
 *   server writes with assignmentState "assigned") and that week's
 *   completions (weeklyPathCompletion.mjs: completionFromPathSession /
 *   collectWeeklyPathSessions — only sessions the server marked "completed").
 *   Counted by evaluateWeeklyGoalProgress (weeklyPathGrade.mjs), the same
 *   slot matcher and the same required count the weekly grade uses. So a
 *   reward can never celebrate a week the gradebook calls unfinished, nor
 *   miss one it calls finished. Proposed or simulated weeks are never events.
 *
 *     { type: 'weeklyGoalHit', eventKey, studentId, classId, weekKey,
 *       completedAt, onTime, required, completedOnTime }
 *
 *   completedAt is when the goal was hit: the time of the required-th matched
 *   completion (null if those completions carry no usable time). onTime means
 *   the goal was hit by goal.dueAt, by the grade's own rule (completedOnTime
 *   reached required).
 *
 * skillMastered — a skill became Mastered under the ONE Mastered rule
 * (masteryRule.mjs classifyMasteryStatus).
 *
 *   Inputs: two successive mastery snapshots, `before` and `after`, each a
 *   map keyed by TEKS (the studentMasteryProfiles `profiles` shape). A value
 *   may be a stored mastery profile (re-classified with the rule, never read
 *   from its stored label) or a status string ('Mastered', 'Secure', ...);
 *   pass `statusOf` for any other shape. Or a history: snapshots oldest
 *   first, each { at, skills }.
 *
 *     { type: 'skillMastered', eventKey, studentId, classId, teksCode, at }
 *
 * ----------------------------------------------------------- IDEMPOTENCY
 *
 * Every event carries `eventKey`, a deterministic plain-text key:
 *
 *   weeklyGoalHit:<studentId>:<weekKey>     one per student per week
 *   skillMastered:<studentId>:<TEKS>        one per student per skill, ever
 *
 * Reading the same records twice — a retried trigger, a nightly re-scan, two
 * overlapping jobs — yields the same keys, so a grant written
 * create-if-absent under its key is written once. A skill that slips below
 * Mastered and comes back keeps its key on purpose: mastering a skill is
 * rewarded once, and paying for the round trip would pay a student to let a
 * skill decay. Week keys are the Monday-start keys the weekly goal uses.
 *
 * The key is not itself a Firestore document id (it holds ':' and '.'). Use it
 * as the award's source id — rewardAwardIdentity({ sourceType: 'pathGrowth',
 * sourceId: event.eventKey, studentId, ruleId }) — and hash that, as
 * rewardGrants already does (buildRewardGrantId).
 *
 * ------------------------------------------------- HOW REWARDS CALL THIS
 *
 * - Skill mastered, live: updateMyMathPathMasteryFromEvidence holds the
 *   stored profiles and the profiles it is about to write in one transaction:
 *     skillMasteredEvents({ studentId, classId, before: storedProfiles,
 *       after: nextProfiles, at: Date.now() })
 * - Weekly goal hit, live: after a weekly Path session completes, read the
 *   student's frozen goal for that week and its completions, then
 *     weeklyGoalHitEvent({ studentId, goal, completions })
 *   (or weeklyGoalHitEvents over loadWeeklyPathClassWeek's
 *   { goalsByStudentId, completionsByStudentId } once the week closes).
 * - Catch-up and backfill: skillMasteredEventsFromHistory over the weekly
 *   mastery history, oldest first (assumeEmptyBaseline: true counts skills
 *   already Mastered in the first snapshot, dated at that snapshot).
 *
 * docs/handoffs/PATH_GROWTH_EVENTS_FOR_REWARDS.md has the same contract, with
 * worked examples.
 */

import { MASTERY_STATUS, classifyMasteryStatus, masteryFactsFromProfile } from './masteryRule.mjs';
import { evaluateWeeklyGoalProgress } from './weeklyPathGrade.mjs';
import { toDisplayCode } from './teksUtils.mjs';

export const PATH_GROWTH_EVENT = Object.freeze({
  WEEKLY_GOAL_HIT: 'weeklyGoalHit',
  SKILL_MASTERED: 'skillMastered',
});

const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(Object.values(MASTERY_STATUS));

const clean = (value) => String(value ?? '').trim();
const isMap = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

const timeOf = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return timeOf(value.toMillis());
  if (value instanceof Date) return timeOf(value.getTime());
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

// "A.5A" for any spelling of it: "a.5a", "texas:A.5A", "teks:A.5A".
const teksOf = (code) => {
  const display = toDisplayCode(clean(code));
  const bare = display.includes(':') ? display.slice(display.lastIndexOf(':') + 1) : display;
  return clean(bare).toUpperCase();
};

/**
 * The idempotency key for one event, or null when a part is missing.
 */
export const pathGrowthEventKey = ({ type, studentId, weekKey = null, teksCode = null } = {}) => {
  const student = clean(studentId);
  if (!student) return null;
  if (type === PATH_GROWTH_EVENT.WEEKLY_GOAL_HIT) {
    const week = clean(weekKey);
    return WEEK_KEY.test(week) ? `${type}:${student}:${week}` : null;
  }
  if (type === PATH_GROWTH_EVENT.SKILL_MASTERED) {
    const code = teksOf(teksCode);
    return code ? `${type}:${student}:${code}` : null;
  }
  return null;
};

/* ------------------------------------------------------- weeklyGoalHit */

/**
 * The weeklyGoalHit event for one frozen goal, or null when the week is not
 * finished (or is not a frozen, assigned week at all).
 */
export const weeklyGoalHitEvent = ({ studentId = null, goal = null, completions = [] } = {}) => {
  if (!isMap(goal) || goal.assignmentState !== 'assigned') return null;
  const student = clean(studentId || goal.studentId);
  const weekKey = clean(goal.weekKey);
  const eventKey = pathGrowthEventKey({ type: PATH_GROWTH_EVENT.WEEKLY_GOAL_HIT, studentId: student, weekKey });
  if (!eventKey) return null;

  // `now` only feeds daysLeft/overdue, which this does not read; a fixed value
  // keeps the reader free of the clock.
  const progress = evaluateWeeklyGoalProgress({ goal, completions: list(completions), now: 0 });
  if (!progress.required || !progress.complete) return null;

  const ordered = list(progress.matchedCompletions)
    .map((entry) => timeOf(entry?.completedAt) ?? Infinity)
    .sort((a, b) => a - b);
  const hitAt = ordered[progress.required - 1];

  return Object.freeze({
    type: PATH_GROWTH_EVENT.WEEKLY_GOAL_HIT,
    eventKey,
    studentId: student,
    classId: clean(goal.classId) || null,
    weekKey,
    completedAt: Number.isFinite(hitAt) ? hitAt : null,
    onTime: progress.completedOnTime >= progress.required,
    required: progress.required,
    completedOnTime: progress.completedOnTime,
  });
};

/**
 * Every weeklyGoalHit event in one class-week, ordered by eventKey. Takes the
 * { goalsByStudentId, completionsByStudentId } the weekly loaders return.
 */
export const weeklyGoalHitEvents = ({ goalsByStudentId = {}, completionsByStudentId = {} } = {}) => (
  Object.entries(isMap(goalsByStudentId) ? goalsByStudentId : {})
    .map(([studentId, goal]) => weeklyGoalHitEvent({
      studentId,
      goal,
      completions: isMap(completionsByStudentId) ? completionsByStudentId[studentId] : [],
    }))
    .filter(Boolean)
    .sort((a, b) => a.eventKey.localeCompare(b.eventKey))
);

/* ------------------------------------------------------- skillMastered */

/**
 * The status one snapshot entry stands for. A stored profile is classified
 * with the Mastered rule from its facts; a status string is taken as given;
 * anything else is Not Enough Evidence.
 */
export const masteryStatusOf = (value) => {
  if (typeof value === 'string') return STATUSES.has(value) ? value : MASTERY_STATUS.NOT_ENOUGH_EVIDENCE;
  if (isMap(value)) return classifyMasteryStatus(masteryFactsFromProfile(value));
  return MASTERY_STATUS.NOT_ENOUGH_EVIDENCE;
};

const statusesByTeks = (snapshot, statusOf) => {
  const statuses = new Map();
  if (!isMap(snapshot)) return statuses;
  Object.keys(snapshot).sort().forEach((key) => {
    const code = teksOf(key);
    if (!code) return;
    const status = statusOf(snapshot[key]);
    // Two spellings of one skill: Mastered in either counts.
    if (!statuses.has(code) || status === MASTERY_STATUS.MASTERED) statuses.set(code, { status, value: snapshot[key] });
  });
  return statuses;
};

/**
 * skillMastered events between two successive snapshots: every skill that is
 * Mastered in `after` and was not Mastered in `before`, ordered by TEKS.
 * `at` is the moment of `after`; without it each event takes its profile's
 * own updatedAt, or null.
 */
export const skillMasteredEvents = ({
  studentId = null,
  classId = null,
  before = {},
  after = {},
  at = null,
  statusOf = masteryStatusOf,
} = {}) => {
  const student = clean(studentId);
  if (!student) return [];
  const previous = statusesByTeks(before, statusOf);
  const events = [];
  statusesByTeks(after, statusOf).forEach(({ status, value }, teksCode) => {
    if (status !== MASTERY_STATUS.MASTERED) return;
    if (previous.get(teksCode)?.status === MASTERY_STATUS.MASTERED) return;
    events.push(Object.freeze({
      type: PATH_GROWTH_EVENT.SKILL_MASTERED,
      eventKey: pathGrowthEventKey({ type: PATH_GROWTH_EVENT.SKILL_MASTERED, studentId: student, teksCode }),
      studentId: student,
      classId: clean(classId) || null,
      teksCode,
      at: timeOf(at) ?? timeOf(value?.updatedAt),
    }));
  });
  return events.sort((a, b) => a.teksCode.localeCompare(b.teksCode));
};

/**
 * skillMastered events across a history of snapshots, oldest first — each
 * { at, skills } (`profiles` or `statuses` are accepted for `skills`). Each
 * skill yields at most one event: its first move to Mastered.
 *
 * The first snapshot is the baseline and yields nothing, because a skill
 * already Mastered there was mastered at some unknown earlier time. Pass
 * assumeEmptyBaseline: true to count those too, dated at the first snapshot.
 */
export const skillMasteredEventsFromHistory = ({
  studentId = null,
  classId = null,
  history = [],
  statusOf = masteryStatusOf,
  assumeEmptyBaseline = false,
} = {}) => {
  const snapshots = list(history)
    .map((entry) => ({ at: entry?.at ?? null, skills: entry?.skills ?? entry?.profiles ?? entry?.statuses }))
    .filter((entry) => isMap(entry.skills));
  const emitted = new Set();
  const events = [];
  let previous = assumeEmptyBaseline ? {} : null;
  snapshots.forEach((snapshot) => {
    if (previous !== null) {
      skillMasteredEvents({ studentId, classId, before: previous, after: snapshot.skills, at: snapshot.at, statusOf })
        .forEach((event) => {
          if (emitted.has(event.eventKey)) return;
          emitted.add(event.eventKey);
          events.push(event);
        });
    }
    previous = snapshot.skills;
  });
  return events;
};

export default {
  PATH_GROWTH_EVENT,
  pathGrowthEventKey,
  weeklyGoalHitEvent,
  weeklyGoalHitEvents,
  masteryStatusOf,
  skillMasteredEvents,
  skillMasteredEventsFromHistory,
};
