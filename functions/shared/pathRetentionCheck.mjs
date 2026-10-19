/*
 * A RETENTION CHECK — WHAT ONE IS, IN THE ONE PLACE BOTH SIDES READ IT.
 *
 * "Is this still with you?" is asked as a short `retentionProbe` session, and
 * only a retentionProbe moves the student's retention schedule
 * (submitPathResponse). Before this module, every way a student could reach a
 * retention check except the Overview banner launched ordinary five-question
 * practice instead: the weekly Retention slot, the Overview focus button and
 * the Path map. The practice counted, the schedule never moved, and the same
 * skill came back as "due" the following week — a Retention slot could never
 * clear itself.
 *
 * So the rules a retention check lives by are here, and the secure server
 * (startMyMathPathSession, submitPathResponse), the student app and the
 * Teacher Path Simulator runtime all read them:
 *
 *   - which session a weekly slot launches (the SLOT decides, not the browser);
 *   - which open session a weekly launch may resume;
 *   - what a finished check concludes, and when the next one is due.
 *
 * Pure: no Firestore, no clock of its own.
 */

import { MASTERY_STATUS, classifyMasteryStatus, masteryFactsFromProfile } from './masteryRule.mjs';

export const RETENTION_PROBE = 'retentionProbe';
export const PRACTICE_SESSION = 'practice';

// Two questions, both on the student's own, is the whole check. Asking more
// turns "a quick check that this stayed with you" into a unit of practice.
export const RETENTION_PROBE_QUESTIONS = 2;

// The weekly planner's purpose for a retention slot (PURPOSE.RETENTION in
// src/platform/path/recommendationV2.js — a test keeps the two equal).
export const RETENTION_PURPOSE = 'retention';

/** The launch every retention entry point uses. */
export const RETENTION_CHECK_LAUNCH = Object.freeze({
  sessionKind: RETENTION_PROBE,
  requiredQuestions: RETENTION_PROBE_QUESTIONS,
});

export const isRetentionPurpose = (purpose) => String(purpose ?? '').trim() === RETENTION_PURPOSE;

/**
 * The session a weekly slot launches.
 *
 * THE SLOT DECIDES. A Retention slot is a retention check whatever the browser
 * asked for — a browser a release behind still asks for practice, and serving
 * it practice is exactly the bug: five questions, slot filled, schedule
 * untouched, the same check due again next week.
 *
 * The other direction is refused rather than corrected. A retention check is
 * two questions and writes the retention schedule, so smuggling one onto a
 * Current-learning slot would fill a five-question commitment with two
 * questions AND could mark a skill retained that was never mastered. No
 * MathMaster screen asks for that; a request that does is not a student
 * clicking a card.
 */
export const resolveWeeklySlotSessionKind = ({ slotPurpose = null, requestedSessionKind = PRACTICE_SESSION } = {}) => {
  if (isRetentionPurpose(slotPurpose)) {
    return { ok: true, sessionKind: RETENTION_PROBE, requiredQuestions: RETENTION_PROBE_QUESTIONS };
  }
  if (requestedSessionKind === RETENTION_PROBE) {
    return {
      ok: false,
      sessionKind: null,
      reason: 'retention-check-needs-retention-slot',
      message: 'A retention check can only fill a Retention check slot. Start this weekly session from its own card on My Math Path.',
    };
  }
  return { ok: true, sessionKind: PRACTICE_SESSION, requiredQuestions: null };
};

/**
 * Whether an open session found under a launch's lock may be resumed for it.
 *
 * An open-practice lock is shared by every session on one TEKS, so a different
 * kind there is a genuinely different activity and the student is asked to
 * finish the first one. A weekly lock carries the slot key: the open session
 * under it IS that slot's session, and its kind can only differ when it was
 * opened before Retention slots launched retention checks. Refusing it would
 * leave the student a Resume button that can never work, so the slot's own
 * session is resumed and finishes the slot as it was started.
 */
export const canResumeOpenSession = ({ existingSessionKind = null, sessionKind = PRACTICE_SESSION, weeklySlotKey = null } = {}) => (
  (existingSessionKind || PRACTICE_SESSION) === (sessionKind || PRACTICE_SESSION)
  || Boolean(String(weeklySlotKey || '').trim())
);

const DAY = 24 * 60 * 60 * 1000;

/** Days until the next check, after this many successful checks: 14, 30, then 60. */
export const retentionHorizonDays = (successfulCheckCount = 0) => {
  const count = Math.max(0, Number(successfulCheckCount) || 0);
  if (count === 0) return 14;
  if (count === 1) return 30;
  return 60;
};

export const nextRetentionCheckDueAt = (now, successfulCheckCount = 0) => (
  Number(now) + retentionHorizonDays(successfulCheckCount) * DAY
);

const millisOf = (value) => {
  if (value == null || value === '') return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Is a retention check due for this skill, by the SERVER's own records (its
 * mastery profile and stored retention schedule)? The rule the retention
 * scheduler applies on the student's screens
 * (src/platform/retention/retentionScheduler.js): only a skill the shared rule
 * calls Mastered; due when its stored schedule says so, or when its check date
 * — 14, 30, then 60 days after it was last shown — has passed.
 *
 * The freeze accepts a weekly Retention slot only for such a skill: a
 * Retention slot launches a two-question, one-attempt check, and a browser
 * that could name any skill one would trade a week's practice for easy checks.
 */
export const retentionCheckIsDue = ({ profile = null, schedule = null, now = Date.now() } = {}) => {
  if (!profile || typeof profile !== 'object') return false;
  if (classifyMasteryStatus(masteryFactsFromProfile(profile)) !== MASTERY_STATUS.MASTERED) return false;
  const status = String(schedule?.status || '');
  // A confirmed loss is relearning, not a check (the scheduler offers none).
  if (status === 'confirmedLoss' || profile?.signals?.retention === 'confirmedLoss') return false;
  if (['due', 'overdue', 'concern'].includes(status) || profile?.signals?.retention === 'concern') return true;
  const clock = Number(now);
  const nextDue = millisOf(schedule?.nextCheckDueAt);
  if (nextDue !== null) return nextDue <= clock;
  const lastShown = millisOf(schedule?.lastVerifiedAt) ?? millisOf(profile?.dimensions?.lastIndependentSuccessAt);
  if (lastShown === null) return false;
  return nextRetentionCheckDueAt(lastShown, schedule?.successfulCheckCount) <= clock;
};

/** Passed means every question of the check right, on the student's own. */
export const retentionCheckPassed = (summary = {}) => (
  Number(summary?.completedQuestions || 0) >= RETENTION_PROBE_QUESTIONS
  && Number(summary?.independentSuccesses || 0) >= RETENTION_PROBE_QUESTIONS
);

/**
 * What a finished retention check writes to the student's schedule.
 *
 * A pass moves the next check out (14 → 30 → 60 days) and clears any concern.
 * A miss marks the skill a concern and leaves the due date where it was, so
 * the check stays on the student's Path until it is passed.
 */
export const retentionCheckOutcome = ({ teksCode, summary = {}, currentSchedule = {}, now = Date.now() } = {}) => {
  const current = currentSchedule && typeof currentSchedule === 'object' ? currentSchedule : {};
  const passed = retentionCheckPassed(summary);
  const previousCount = Number(current.successfulCheckCount || 0);
  if (passed) {
    const successfulCheckCount = previousCount + 1;
    return {
      passed: true,
      outcome: 'passed',
      schedule: {
        ...current,
        teksCode,
        status: 'scheduled',
        lastVerifiedAt: now,
        successfulCheckCount,
        nextCheckDueAt: nextRetentionCheckDueAt(now, successfulCheckCount),
        daysOverdue: 0,
      },
    };
  }
  return {
    passed: false,
    outcome: 'failed',
    schedule: {
      ...current,
      teksCode,
      status: 'concern',
      lastFailedCheckAt: now,
    },
  };
};

export default {
  RETENTION_PROBE,
  RETENTION_PROBE_QUESTIONS,
  RETENTION_PURPOSE,
  RETENTION_CHECK_LAUNCH,
  resolveWeeklySlotSessionKind,
  canResumeOpenSession,
  retentionCheckOutcome,
};
