/*
 * WHEN A SECTION ACTUALLY CLOSES.
 *
 * ONE definition, because there are two readers. The browser uses it to show a
 * timer and to hint the scheduler; a Cloud Function uses it to decide whether a
 * checkpointed response was finished in time. If those two ever disagreed, a
 * student could gain or lose credit depending on which one ran.
 *
 * NOTHING A BROWSER SENDS IS AN INPUT HERE. The finalizer passes the
 * authoritative assignment, the student's authoritative class, the class
 * schedule and the clock; the checkpoint's own `candidateFinalizeAt` is a
 * query hint and is never consulted by these functions.
 */
import { parseInstant, zonedDateKey } from './instructionalCalendar.mjs';
import { resolvePeriodWindow } from './classSchedule.mjs';

/** The school's wall clock. Warm-Up and DOL windows are defined in it. */
export const SCHOOL_TIME_ZONE = 'America/Chicago';

export const MANUALLY_CONTROLLABLE_SECTION_ROLES = Object.freeze(['classwork', 'practice']);

const scopedOverride = ({ byClassId, classId }) => {
  const overrides = byClassId && typeof byClassId === 'object' ? byClassId : {};
  return classId ? overrides[classId] || null : null;
};

const overrideInstant = (record, key, timeZone) => {
  const value = record && typeof record === 'object' ? record[key] : record;
  return parseInstant(value, { timeZone });
};

const overrideDateKey = (record) => (record && typeof record === 'object' ? record.dateKey || null : null);

/** The assignment's own final grading cutoff: the late window when there is one. */
export const assignmentFinalCloseAt = (assignment, timeZone = null) => parseInstant(
  assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
  { endOfDay: true, timeZone },
);

/**
 * A teacher's live Warm-Up controls for one class.
 *
 * `closedByClassId` is a manual close and wins outright. `autoCloseByClassId`
 * is a timer or a reopen; it may end before OR after the normal ten-minute
 * cutoff, but never after the class period.
 */
export const resolveWarmupClose = ({ assignment, window, classId = null, todayKey = null } = {}) => {
  const closeMinutesAfterStart = Math.max(1, Number(assignment?.warmup?.closeMinutesAfterStart ?? 10));
  const minutesBeforeStart = Math.max(0, Number(assignment?.warmup?.minutesBeforeStart ?? 7));
  if (!window) {
    return {
      opensAtMs: null,
      defaultCloseAtMs: null,
      effectiveCloseAtMs: null,
      manualCloseAtMs: null,
      teacherTimerScheduled: false,
      minutesBeforeStart,
      closeMinutesAfterStart,
    };
  }
  const opensAtMs = window.startMs - minutesBeforeStart * 60_000;
  const defaultCloseAtMs = Math.min(window.endMs, window.startMs + closeMinutesAfterStart * 60_000);

  const closedRecord = scopedOverride({ byClassId: assignment?.warmup?.closedByClassId, classId });
  const closedAtMs = overrideInstant(closedRecord, 'closedAt', null);
  const closedDateKey = overrideDateKey(closedRecord);
  const closedToday = Boolean(closedAtMs && (!closedDateKey || !todayKey || closedDateKey === todayKey));

  const autoCloseRecord = scopedOverride({ byClassId: assignment?.warmup?.autoCloseByClassId, classId });
  const autoCloseAtMs = overrideInstant(autoCloseRecord, 'closesAt', null);
  const autoCloseDateKey = overrideDateKey(autoCloseRecord);
  const autoCloseToday = Boolean(autoCloseAtMs && (!autoCloseDateKey || !todayKey || autoCloseDateKey === todayKey));

  const effectiveCloseAtMs = autoCloseToday
    ? Math.min(window.endMs, autoCloseAtMs)
    : defaultCloseAtMs;

  return {
    opensAtMs,
    defaultCloseAtMs,
    effectiveCloseAtMs,
    manualCloseAtMs: closedToday ? closedAtMs : null,
    teacherTimerScheduled: autoCloseToday,
    minutesBeforeStart,
    closeMinutesAfterStart,
  };
};

/**
 * The DOL working window for one class.
 *
 * `minutesBeforeEnd` remains the authored working-time duration;
 * `closeMinutesBeforeEnd` shifts that whole timer earlier without shortening
 * it, so students get a real pack-up window.
 */
export const resolveDolWindow = ({ assignment, window, classId = null, todayKey = null } = {}) => {
  const durationMinutes = Math.max(1, Number(assignment?.dol?.minutesBeforeEnd || 10));
  const closeMinutesBeforeEnd = Math.max(0, Number(assignment?.dol?.closeMinutesBeforeEnd ?? 5));
  if (!window) {
    return { opensAtMs: null, endsAtMs: null, regularOpensAtMs: null, regularEndsAtMs: null, earlyUnlocked: false, durationMinutes, closeMinutesBeforeEnd };
  }
  const regularEndsAtMs = Math.max(window.startMs, window.endMs - closeMinutesBeforeEnd * 60_000);
  const regularOpensAtMs = Math.max(window.startMs, regularEndsAtMs - durationMinutes * 60_000);

  const unlock = scopedOverride({ byClassId: assignment?.dol?.earlyUnlocksByClassId, classId });
  const unlockAtMs = overrideInstant(unlock, 'unlockedAt', null);
  const unlockDateKey = overrideDateKey(unlock);
  const unlockToday = Boolean(unlockAtMs && (!unlockDateKey || !todayKey || unlockDateKey === todayKey));
  const earlyUnlocked = unlockToday && unlockAtMs < regularOpensAtMs;

  if (!earlyUnlocked) {
    return { opensAtMs: regularOpensAtMs, endsAtMs: regularEndsAtMs, regularOpensAtMs, regularEndsAtMs, earlyUnlocked: false, durationMinutes, closeMinutesBeforeEnd };
  }
  const opensAtMs = Math.max(window.startMs, unlockAtMs);
  // Early release starts the same DOL timer immediately, but the DOL can never
  // extend into the final technology-return window.
  const endsAtMs = Math.min(regularEndsAtMs, opensAtMs + durationMinutes * 60_000);
  return { opensAtMs, endsAtMs, regularOpensAtMs, regularEndsAtMs, earlyUnlocked: true, durationMinutes, closeMinutesBeforeEnd };
};

/** When a teacher manually closed Classwork/Practice for one class, if they did. */
export const manualSectionCloseAt = ({ assignment, activityRole, classId = null } = {}) => {
  const role = String(activityRole || '').trim().toLowerCase();
  if (!MANUALLY_CONTROLLABLE_SECTION_ROLES.includes(role)) return null;
  const override = scopedOverride({ byClassId: assignment?.sectionAccess?.[role]?.overridesByClassId, classId });
  if (String(override?.state || '').toLowerCase() !== 'closed') return null;
  return overrideInstant(override, 'changedAt', null);
};

/**
 * THE AUTHORITATIVE CLOSE for one student's section of one assignment.
 *
 * Returns the instant after which this section stops accepting graded work,
 * and why. `null` means MathMaster cannot currently prove a close, which the
 * finalizer treats as "hold", never as "closed".
 */
export const resolveAuthoritativeClose = ({
  assignment,
  activityRole,
  schedule,
  classId = null,
  classPeriod = null,
  nowValue = Date.now(),
  timeZone = SCHOOL_TIME_ZONE,
} = {}) => {
  const role = String(activityRole || '').trim().toLowerCase();
  const finalCloseAtMs = assignmentFinalCloseAt(assignment, timeZone);
  const todayKey = zonedDateKey(nowValue, timeZone);

  if (role === 'warmup' || role === 'dol') {
    const window = resolvePeriodWindow({ schedule, classPeriod, nowValue, timeZone });
    if (role === 'warmup') {
      const warmup = resolveWarmupClose({ assignment, window, classId, todayKey });
      // A manual close ends the section now, whatever the timer said.
      if (warmup.manualCloseAtMs) {
        return { closesAtMs: warmup.manualCloseAtMs, reason: 'manual-section-close', teacherTimerScheduled: warmup.teacherTimerScheduled };
      }
      if (warmup.effectiveCloseAtMs) {
        return { closesAtMs: warmup.effectiveCloseAtMs, reason: 'warmup-close', teacherTimerScheduled: warmup.teacherTimerScheduled };
      }
      // No class window today (no A/B designation, no enabled period). The
      // assignment's own cutoff is the only close MathMaster can prove.
      return { closesAtMs: finalCloseAtMs, reason: 'assignment-final-deadline', teacherTimerScheduled: false };
    }
    const dol = resolveDolWindow({ assignment, window, classId, todayKey });
    if (dol.endsAtMs) return { closesAtMs: dol.endsAtMs, reason: 'dol-close', earlyUnlocked: dol.earlyUnlocked };
    return { closesAtMs: finalCloseAtMs, reason: 'assignment-final-deadline', earlyUnlocked: false };
  }

  const manualCloseAtMs = manualSectionCloseAt({ assignment, activityRole: role, classId });
  if (manualCloseAtMs) return { closesAtMs: manualCloseAtMs, reason: 'manual-section-close' };
  return { closesAtMs: finalCloseAtMs, reason: 'assignment-final-deadline' };
};
