/*
 * GROWTH OVER TIME — ONE COMPACT MASTERY SNAPSHOT PER WEEK.
 *
 * studentMasteryProfiles/{studentId} says where a student is NOW. Every mastery
 * update overwrites it, so nothing remembered where they were a month ago and
 * "how far have I come" had no honest answer: the only record of the past was
 * the Practice History log, which holds the most recent answers and no more.
 *
 * studentMasteryHistory/{studentId} keeps the missing half — for each week, the
 * estimate and status of every skill as of the last update that week. The
 * mastery trigger (functions/index.js updateMyMathPathMasteryFromEvidence)
 * writes it in the SAME transaction as the profile, from the SAME profiles map,
 * so the history can never describe a state the profile never had.
 *
 * SHAPE, deliberately small (about twenty bytes per skill per week):
 *
 *   weeks: {
 *     '2026-10-05': { skills: { 'A.5A': [82, 3], 'A.2C': [null, 0] }, updatedAt },
 *   }
 *
 * Each skill is [estimate 0–100 or null, status code]. The status is
 * re-derived from the profile's facts with the one Mastered rule
 * (masteryRule.mjs), so the history can only say "Mastered" when the rule does.
 *
 * WHICH WEEK. weekKeyFor(occurredAt) — Monday-start, the key the weekly Path
 * goal and its grade use — except that a snapshot never moves BACKWARD. The
 * profile it copies already includes every newer answer, so filing it under an
 * older week (a delayed event, a retried trigger) would rewrite that week with
 * knowledge it did not have yet. Late evidence lands in the newest week on
 * record instead, and an occurredAt in the future is read as now.
 *
 * BOUNDED. At most sixty weeks, oldest dropped first, and a byte budget far
 * below Firestore's 1 MiB document limit. This document is written inside the
 * mastery transaction: one that outgrew the limit would stop the student's
 * mastery from updating at all.
 *
 * Pure: no Firestore. The readers at the bottom (as-of, series, the growth
 * comparison) are shared by the student's My Progress view and by any reward
 * reader that needs "grew since four weeks ago".
 */

import { weekKeyFor } from './weeklyPathGrade.mjs';
import { MASTERY_STATUS, classifyMasteryStatus, masteryFactsFromProfile } from './masteryRule.mjs';

export const MASTERY_HISTORY_COLLECTION = 'studentMasteryHistory';
export const MASTERY_HISTORY_SCHEMA_VERSION = 1;
export const MASTERY_HISTORY_MAX_WEEKS = 60;
// Half of Firestore's document limit, for the weeks map alone. A real student
// stays far under it (sixty skills for sixty weeks is about 80 KB); the budget
// exists so no student, however unusual, can make the mastery write fail.
export const MASTERY_HISTORY_MAX_BYTES = 512 * 1024;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Status ↔ the small integer stored per skill. */
export const MASTERY_STATUS_CODE = Object.freeze({
  [MASTERY_STATUS.NOT_ENOUGH_EVIDENCE]: 0,
  [MASTERY_STATUS.NEEDS_ATTENTION]: 1,
  [MASTERY_STATUS.DEVELOPING]: 2,
  [MASTERY_STATUS.SECURE]: 3,
  [MASTERY_STATUS.MASTERED]: 4,
});

const STATUS_BY_CODE = Object.freeze(Object.fromEntries(
  Object.entries(MASTERY_STATUS_CODE).map(([status, code]) => [code, status]),
));

export const masteryStatusFromCode = (code) => (
  code === null || code === undefined || code === ''
    ? MASTERY_STATUS.NOT_ENOUGH_EVIDENCE
    : STATUS_BY_CODE[Number(code)] || MASTERY_STATUS.NOT_ENOUGH_EVIDENCE
);

export const isWeekKey = (value) => {
  const text = String(value ?? '');
  return WEEK_KEY.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00Z`));
};

/** The week key `weeks` whole weeks after (negative: before) `weekKey`. */
export const shiftWeekKey = (weekKey, weeks) => (
  weekKeyFor(Date.parse(`${weekKey}T00:00:00Z`) + Math.round(Number(weeks) || 0) * WEEK_MS)
);

const toMillis = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const roundEstimate = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : null;
};

const weeksMap = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

const knownWeekKeys = (weeks) => Object.keys(weeksMap(weeks)).filter(isWeekKey).sort();

// ------------------------------------------------------------------- writer

/**
 * One week's snapshot of a `profiles` map (the studentMasteryProfiles shape):
 * { [teksCode]: [estimate, statusCode] } for every skill on record.
 */
export const masteryHistorySnapshot = (profiles = {}) => {
  const skills = {};
  if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) return skills;
  Object.keys(profiles).sort().forEach((key) => {
    const code = String(key).trim();
    const profile = profiles[key];
    if (!code || !profile || typeof profile !== 'object') return;
    const facts = masteryFactsFromProfile(profile);
    skills[code] = [roundEstimate(facts.estimate), MASTERY_STATUS_CODE[classifyMasteryStatus(facts)]];
  });
  return skills;
};

/**
 * The week a snapshot taken now belongs to: the week the evidence happened,
 * never earlier than the newest week already on record, never in the future.
 */
export const masteryHistoryWeekKey = ({ weeks = {}, occurredAt = null, now = Date.now() } = {}) => {
  const currentWeekKey = weekKeyFor(now);
  const at = toMillis(occurredAt);
  const eventWeekKey = at && at > 0 && at <= now ? weekKeyFor(at) : currentWeekKey;
  const newest = knownWeekKeys(weeks).filter((key) => key <= currentWeekKey).pop() || null;
  return newest && newest > eventWeekKey ? newest : eventWeekKey;
};

// Firestore's storage-size rules: a string is its UTF-8 bytes plus one, a
// number eight, null and booleans one, a map the sum of its keys and values.
const encoder = new TextEncoder();
const stringBytes = (text) => encoder.encode(String(text)).length + 1;
const valueBytes = (value) => {
  if (value === null || value === undefined || typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return stringBytes(value);
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + valueBytes(entry), 0);
  if (typeof value === 'object') {
    return Object.entries(value).reduce((sum, [key, entry]) => sum + stringBytes(key) + valueBytes(entry), 0);
  }
  return 8;
};

/** Approximate stored size of a weeks map, by Firestore's own accounting. */
export const masteryHistoryWeeksBytes = (weeks = {}) => stringBytes('weeks') + valueBytes(weeksMap(weeks));

/**
 * Keep the newest weeks: at most `maxWeeks`, and only as many as fit the byte
 * budget. The newest week is always kept. A week after the current one can
 * only come from a bad clock — it would pin every later snapshot to itself —
 * so it is dropped.
 */
export const pruneMasteryHistoryWeeks = (weeks = {}, {
  maxWeeks = MASTERY_HISTORY_MAX_WEEKS,
  maxBytes = MASTERY_HISTORY_MAX_BYTES,
  now = Date.now(),
} = {}) => {
  const source = weeksMap(weeks);
  const currentWeekKey = weekKeyFor(now);
  const limit = Math.max(1, Math.floor(Number(maxWeeks) || MASTERY_HISTORY_MAX_WEEKS));
  const newestFirst = knownWeekKeys(source).filter((key) => key <= currentWeekKey).reverse().slice(0, limit);
  const sizes = newestFirst.map((key) => stringBytes(key) + valueBytes(source[key]));
  let total = stringBytes('weeks') + sizes.reduce((sum, size) => sum + size, 0);
  let keep = newestFirst.length;
  while (keep > 1 && total > maxBytes) {
    keep -= 1;
    total -= sizes[keep];
  }
  return Object.fromEntries(newestFirst.slice(0, keep).reverse().map((key) => [key, source[key]]));
};

/**
 * The authorization context a document derived from one evidence event
 * inherits — the same fields, derived the same way, for the mastery profile
 * and its history — so neither is ever readable by anyone the evidence was not.
 * Idempotent: an already-derived context passes through unchanged.
 */
export const derivedMasteryAuthorization = (evidence = {}) => ({
  classId: evidence?.classId ?? null,
  originClassId: evidence?.originClassId ?? evidence?.classId ?? null,
  originTeacherEmail: evidence?.originTeacherEmail ?? null,
  authorizedTeacherEmails: Array.isArray(evidence?.authorizedTeacherEmails) ? evidence.authorizedTeacherEmails : [],
});

/**
 * The whole studentMasteryHistory document after one mastery update.
 *
 * `existing` is the current document (or null), `profiles` the profiles map
 * the same transaction is about to write. Written whole, not merged: the
 * pruned weeks map must replace the old one, and every field here is derived.
 */
export const buildMasteryHistoryDocument = ({
  existing = null,
  profiles = {},
  studentId = '',
  authorization = {},
  occurredAt = null,
  now = Date.now(),
  maxWeeks = MASTERY_HISTORY_MAX_WEEKS,
  maxBytes = MASTERY_HISTORY_MAX_BYTES,
} = {}) => {
  const previous = weeksMap(existing?.weeks);
  const weekKey = masteryHistoryWeekKey({ weeks: previous, occurredAt, now });
  const weeks = pruneMasteryHistoryWeeks(
    { ...previous, [weekKey]: { skills: masteryHistorySnapshot(profiles), updatedAt: now } },
    { maxWeeks, maxBytes, now },
  );
  return {
    schemaVersion: MASTERY_HISTORY_SCHEMA_VERSION,
    studentId: String(studentId || ''),
    ...derivedMasteryAuthorization(authorization),
    weeks,
    updatedAt: now,
  };
};

// ------------------------------------------------------------------ readers

const decodeSkills = (skills) => {
  const decoded = {};
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) return decoded;
  Object.entries(skills).forEach(([code, entry]) => {
    if (!code || !Array.isArray(entry)) return;
    decoded[code] = { estimate: roundEstimate(entry[0]), status: masteryStatusFromCode(entry[1]) };
  });
  return decoded;
};

/** Week keys on record, oldest first, optionally none after `through`. */
export const masteryHistoryWeekKeys = (history, { through = null } = {}) => (
  knownWeekKeys(history?.weeks).filter((key) => !through || key <= through)
);

/**
 * The skills as they stood at the end of `weekKey`: the newest snapshot at or
 * before it, decoded to { [code]: { estimate, status } }. Null before any.
 */
export const masterySkillsAsOf = (history, weekKey) => {
  const key = masteryHistoryWeekKeys(history, { through: weekKey }).pop();
  return key ? { weekKey: key, skills: decodeSkills(history.weeks[key]?.skills) } : null;
};

/** Counts for one decoded snapshot. */
export const summarizeMasterySkills = (skills = {}) => {
  const entries = Object.values(skills && typeof skills === 'object' ? skills : {});
  const scored = entries.filter((entry) => entry?.estimate !== null && entry?.estimate !== undefined);
  return {
    skills: entries.length,
    scored: scored.length,
    mastered: entries.filter((entry) => entry?.status === MASTERY_STATUS.MASTERED).length,
    averageScore: scored.length
      ? Math.round(scored.reduce((sum, entry) => sum + entry.estimate, 0) / scored.length)
      : null,
  };
};

/** One summary per recorded week, oldest first — a trend line or a reward reader. */
export const masteryHistorySeries = (history, { through = null } = {}) => (
  masteryHistoryWeekKeys(history, { through }).map((weekKey) => ({
    weekKey,
    ...summarizeMasterySkills(decodeSkills(history.weeks[weekKey]?.skills)),
  }))
);

const averageOf = (values) => (
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null
);

/**
 * THIS WEEK AGAINST FOUR WEEKS AGO.
 *
 * "Now" is the newest snapshot; "then" is the snapshot that stood at the end
 * of the week `weeksBack` weeks before the current one. A history younger than
 * that compares against its first week instead (`baselineKind: 'firstWeek'`),
 * and the screen must say "since" rather than "four weeks ago".
 *
 * The average is compared LIKE FOR LIKE — over the skills that had a score both
 * times — because a newly started skill begins low, and counting it would make
 * a student who took on more work look as if they had gone backwards.
 */
export const compareMasteryGrowth = ({ history = null, now = Date.now(), weeksBack = 4, moversLimit = 3 } = {}) => {
  const currentWeekKey = weekKeyFor(now);
  const back = Math.max(1, Math.round(Number(weeksBack) || 4));
  const base = { currentWeekKey, weeksBack: back };
  const keys = masteryHistoryWeekKeys(history, { through: currentWeekKey });
  if (!keys.length) return { ...base, available: false, reason: 'no_history' };

  const latestWeekKey = keys[keys.length - 1];
  const latest = decodeSkills(history.weeks[latestWeekKey]?.skills);
  const current = summarizeMasterySkills(latest);
  const targetWeekKey = shiftWeekKey(currentWeekKey, -back);
  const atTarget = keys.filter((key) => key <= targetWeekKey).pop() || null;
  const baselineWeekKey = atTarget || (keys[0] < latestWeekKey ? keys[0] : null);
  if (!baselineWeekKey) {
    return { ...base, available: false, reason: 'not_enough_history', latestWeekKey, current };
  }

  const before = decodeSkills(history.weeks[baselineWeekKey]?.skills);
  const baseline = summarizeMasterySkills(before);
  const scoredBothTimes = Object.keys(latest)
    .filter((code) => latest[code].estimate !== null && before[code] && before[code].estimate !== null)
    .sort();
  const movers = scoredBothTimes
    .map((code) => ({
      code,
      before: before[code].estimate,
      after: latest[code].estimate,
      change: latest[code].estimate - before[code].estimate,
    }))
    .filter((entry) => entry.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || b.change - a.change || a.code.localeCompare(b.code))
    .slice(0, Math.max(0, Math.round(Number(moversLimit) || 0)));
  const sameBefore = averageOf(scoredBothTimes.map((code) => before[code].estimate));
  const sameAfter = averageOf(scoredBothTimes.map((code) => latest[code].estimate));

  return {
    ...base,
    available: true,
    latestWeekKey,
    baselineWeekKey,
    baselineKind: atTarget ? 'weeksAgo' : 'firstWeek',
    weeksBetween: Math.round(
      (Date.parse(`${currentWeekKey}T00:00:00Z`) - Date.parse(`${baselineWeekKey}T00:00:00Z`)) / WEEK_MS,
    ),
    // Nothing recorded since the baseline: the two snapshots are the same one.
    noRecentPractice: latestWeekKey <= targetWeekKey,
    current,
    baseline,
    mastered: { before: baseline.mastered, after: current.mastered, change: current.mastered - baseline.mastered },
    sameSkills: {
      count: scoredBothTimes.length,
      before: sameBefore,
      after: sameAfter,
      change: sameBefore === null || sameAfter === null ? null : sameAfter - sameBefore,
    },
    movers,
    newlyMastered: Object.keys(latest)
      .filter((code) => latest[code].status === MASTERY_STATUS.MASTERED && before[code]?.status !== MASTERY_STATUS.MASTERED)
      .sort(),
    newSkills: Object.keys(latest)
      .filter((code) => latest[code].estimate !== null && (!before[code] || before[code].estimate === null))
      .sort((a, b) => latest[b].estimate - latest[a].estimate || a.localeCompare(b)),
  };
};
