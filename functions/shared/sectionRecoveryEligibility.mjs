/*
 * WHO SEES A RECOVERY, AND WHEN.
 *
 * The original Warm-Up or DOL is the expected path. Recovery must never look
 * like an easier alternative while the original is still available, so it is
 * invisible until the original opportunity has CLOSED, and it unlocks only on
 * recent independent Practice mastery. The order of the checks below is the
 * policy, and each answer carries a reason a teacher can read:
 *
 *   hidden        not offered (yet) — the original is still open or upcoming,
 *                 the section does not exist, or the Warm-Up was a Live
 *                 Challenge (no normal Warm-Up was expected, so nothing is
 *                 missing and nothing is generated)
 *   unavailable   the policy turned it off, or the section's questions cannot
 *                 be regenerated (static content). Never shown to the student
 *                 as a promise; surfaced to the teacher and Pre-Flight.
 *   notNeeded     the original already scored at or above what a recovery
 *                 could record
 *   locked        offered; Practice mastery not yet shown
 *   unlocked      mastery shown; the student may start
 *   inProgress    started, not submitted
 *   completed     the one automatic opportunity has been used
 *   closed        started but not submitted before the Recovery end date —
 *                 the assignment's final submission date for this student.
 *                 After that date a Recovery never started is simply hidden.
 *
 * Pure: no Firestore. `nowValue` is a parameter.
 */

import {
  RECOVERY_SECTIONS,
  RECOVERY_TYPE,
  normalizeRecoveryPolicy,
  recoveryCapFor,
} from './recoveryPolicy.mjs';
import { warmupIsNotAssignmentDelivered } from './warmupDelivery.mjs';
import {
  SCHOOL_TIME_ZONE,
  assignmentFinalCloseAt,
  dolTeacherRecoveryActiveAt,
  resolveAuthoritativeClose,
  resolveDolInstructionDateKey,
  resolveWarmupInstructionDateKey,
} from './sectionDeadline.mjs';
import { zonedDateKey } from './instructionalCalendar.mjs';

export const ORIGINAL_OPPORTUNITY = Object.freeze({
  UPCOMING: 'upcoming',
  OPEN: 'open',
  CLOSED: 'closed',
  UNSCHEDULED: 'unscheduled',
});

export const RECOVERY_STATE = Object.freeze({
  HIDDEN: 'hidden',
  UNAVAILABLE: 'unavailable',
  NOT_NEEDED: 'notNeeded',
  LOCKED: 'locked',
  UNLOCKED: 'unlocked',
  IN_PROGRESS: 'inProgress',
  COMPLETED: 'completed',
  // Started, but not submitted before the assignment's final submission date
  // (the Recovery end date). The original score stands.
  CLOSED: 'closed',
});

const STUDENT_VISIBLE = new Set([
  RECOVERY_STATE.LOCKED,
  RECOVERY_STATE.UNLOCKED,
  RECOVERY_STATE.IN_PROGRESS,
  RECOVERY_STATE.COMPLETED,
  RECOVERY_STATE.CLOSED,
]);

/**
 * Has this student's original Warm-Up or DOL opportunity ended?
 *
 * Built only from the shared deadline rules the server finalizer already
 * enforces, so the browser and the server agree on when the original closed.
 * A teacher's DOL reopen window keeps the original open — Recovery waits
 * behind it rather than competing with it.
 */
export const resolveOriginalOpportunity = ({
  assignment = null,
  section = 'dol',
  schedule = null,
  classId = null,
  classPeriod = null,
  studentId = null,
  nowValue = Date.now(),
  timeZone = SCHOOL_TIME_ZONE,
  // The student's pinned grades/{id}.profile. Individualized extra time moves
  // only the assignment's own final cutoff (supportDeadline.mjs) — never a
  // Warm-Up/DOL class window — and it moves it here exactly as it does for the
  // deadline finalizer.
  studentProfile = null,
  // The student's private override (studentAssignmentOverrides), read by the
  // caller with its own authority: their individual extension moves the
  // Recovery end date exactly as it moves every other final cutoff.
  privateOverride = undefined,
} = {}) => {
  const now = Number(nowValue instanceof Date ? nowValue.getTime() : nowValue);
  // The instructional day travels with EVERY answer, closed ones included:
  // it is the day the excused-absence hook reads, and an assignment closed by
  // its final deadline still had an original day the student may have missed.
  const instructionDateKey = (section === 'warmup'
    ? resolveWarmupInstructionDateKey({ assignment, classId, classPeriod, timeZone })
    : resolveDolInstructionDateKey({ assignment, classId, classPeriod, timeZone })) || null;
  // THE RECOVERY END DATE is the assignment's final submission date for this
  // student — their attendance extension or individualized extra time
  // included — the same cutoff after which no work earns credit. Every answer
  // carries it, so the panel can say "open until" and the server can refuse
  // anything after it. No final date means no end date.
  const finalCloseAtMs = assignmentFinalCloseAt(assignment, timeZone, studentId, studentProfile, { privateOverride });
  const recoveryWindow = {
    instructionDateKey,
    recoveryEndsAtMs: finalCloseAtMs,
    recoveryWindowEnded: finalCloseAtMs !== null && now > finalCloseAtMs,
  };
  if (recoveryWindow.recoveryWindowEnded) {
    return { status: ORIGINAL_OPPORTUNITY.CLOSED, reason: 'assignment-final-deadline', closedAtMs: finalCloseAtMs, ...recoveryWindow };
  }
  if (!instructionDateKey) return { status: ORIGINAL_OPPORTUNITY.UNSCHEDULED, reason: 'no-instruction-date', ...recoveryWindow };
  const todayKey = zonedDateKey(now, timeZone);
  if (instructionDateKey > todayKey) {
    return { status: ORIGINAL_OPPORTUNITY.UPCOMING, reason: 'instruction-day-ahead', ...recoveryWindow };
  }
  if (instructionDateKey < todayKey) {
    if (section === 'dol' && dolTeacherRecoveryActiveAt({ assignment, classId, at: now, timeZone })) {
      return { status: ORIGINAL_OPPORTUNITY.OPEN, reason: 'teacher-dol-reopen-window', ...recoveryWindow };
    }
    return { status: ORIGINAL_OPPORTUNITY.CLOSED, reason: 'instruction-day-passed', ...recoveryWindow };
  }
  const close = resolveAuthoritativeClose({
    assignment,
    activityRole: section,
    schedule,
    classId,
    classPeriod,
    nowValue: now,
    timeZone,
    studentId,
    studentProfile,
    privateOverride,
  });
  if (close.closesAtMs !== null && close.closesAtMs !== undefined && now >= close.closesAtMs) {
    return { status: ORIGINAL_OPPORTUNITY.CLOSED, reason: close.reason, closedAtMs: close.closesAtMs, ...recoveryWindow };
  }
  return { status: ORIGINAL_OPPORTUNITY.OPEN, reason: close.reason || 'section-open', closesAtMs: close.closesAtMs ?? null, ...recoveryWindow };
};

const result = (state, reason, extra = {}) => ({
  state,
  reason,
  studentVisible: STUDENT_VISIBLE.has(state),
  ...extra,
});

/**
 * The Recovery state for one student, one section.
 *
 *   original     { score, attempted, total } — the live section split
 *   opportunity  resolveOriginalOpportunity(...)
 *   warmupDelivery  resolveWarmupDelivery(...) (Warm-Up only)
 *   attendance   { excused } — the absence hook (recoveryAttendance); the
 *                server decides it, the browser may not know
 *   readiness    assessSectionRecoveryReadiness(...)
 *   mastery      evaluateRecentPracticeMastery(...)
 *   record       the stored recovery record, if any
 */
export const evaluateSectionRecoveryEligibility = ({
  section = 'dol',
  policy = null,
  original = { score: null, attempted: 0, total: 0 },
  opportunity = { status: ORIGINAL_OPPORTUNITY.UNSCHEDULED },
  warmupDelivery = null,
  attendance = { excused: false },
  readiness = { ready: false },
  mastery = null,
  record = null,
} = {}) => {
  const normalizedPolicy = policy?.version ? policy : normalizeRecoveryPolicy(policy || {});
  const sectionPolicy = normalizedPolicy[section];
  const type = attendance?.excused ? RECOVERY_TYPE.EXCUSED_MAKE_UP : RECOVERY_TYPE.RECOVERY;
  const cap = recoveryCapFor(normalizedPolicy, section, type);
  const base = { section, type, cap, mastery, endsAtMs: opportunity?.recoveryEndsAtMs ?? null };

  if (!RECOVERY_SECTIONS.includes(section)) return result(RECOVERY_STATE.HIDDEN, 'not-a-recovery-section', base);
  if (!Number(original?.total)) return result(RECOVERY_STATE.HIDDEN, 'no-section', base);
  // A Live Challenge Warm-Up asked for no normal Warm-Up answers. An empty
  // Warm-Up score here is not a missed Warm-Up, so nothing is generated.
  if (section === 'warmup' && warmupIsNotAssignmentDelivered(warmupDelivery)) {
    return result(RECOVERY_STATE.HIDDEN, 'warmup-delivered-by-live-challenge', base);
  }

  // A finished Recovery is reported whatever else changed.
  if (record?.status === 'completed') return result(RECOVERY_STATE.COMPLETED, 'recovery-completed', base);
  // The final submission date is the Recovery end date. One started and not
  // submitted is closed (the original stands); one never started simply
  // stops being offered.
  if (opportunity?.recoveryWindowEnded) {
    return record?.status === 'inProgress'
      ? result(RECOVERY_STATE.CLOSED, 'recovery-window-ended', base)
      : result(RECOVERY_STATE.HIDDEN, 'recovery-window-ended', base);
  }
  if (record?.status === 'inProgress') return result(RECOVERY_STATE.IN_PROGRESS, 'recovery-in-progress', base);

  if (!normalizedPolicy.enabled || !sectionPolicy?.enabled || normalizedPolicy.automaticOpportunities < 1) {
    return result(RECOVERY_STATE.UNAVAILABLE, 'policy-disabled', base);
  }
  const used = Math.max(0, Number(record?.opportunitiesUsed) || 0);
  if (used >= normalizedPolicy.automaticOpportunities) {
    return result(RECOVERY_STATE.COMPLETED, 'automatic-opportunities-used', base);
  }

  if (opportunity?.status === ORIGINAL_OPPORTUNITY.OPEN) return result(RECOVERY_STATE.HIDDEN, 'original-still-open', base);
  if (opportunity?.status !== ORIGINAL_OPPORTUNITY.CLOSED) return result(RECOVERY_STATE.HIDDEN, 'original-not-closed', base);

  if (!readiness?.ready) return result(RECOVERY_STATE.UNAVAILABLE, 'generation-unavailable', { ...base, readiness });

  const score = Number(original?.score);
  if (Number.isFinite(score) && score >= cap) return result(RECOVERY_STATE.NOT_NEEDED, 'original-at-or-above-cap', base);

  const masteryRequired = type === RECOVERY_TYPE.RECOVERY || normalizedPolicy.mastery.excusedRequiresMastery;
  if (record?.status === 'unlocked') return result(RECOVERY_STATE.UNLOCKED, 'mastery-recorded', base);
  if (!masteryRequired) return result(RECOVERY_STATE.UNLOCKED, 'excused-no-mastery-required', base);
  if (mastery?.met) return result(RECOVERY_STATE.UNLOCKED, 'mastery-met', base);
  return result(RECOVERY_STATE.LOCKED, mastery?.reason || 'more-practice-needed', base);
};
