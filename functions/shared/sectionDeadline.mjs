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
import { withStudentSupportDates } from './supportDeadline.mjs';

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

/**
 * The instructional date a section belongs to.
 *
 * A lesson can stay open for completion all week, but its bell-ringer and its
 * exit ticket belong to ONE class meeting. A real class id is more specific
 * than a bell-period label: two MathMaster classes may share Period 3, and a
 * reused lesson must not inherit the original class's date.
 */
const sectionInstructionDateKey = ({ assignment, section, classId, classPeriod, timeZone }) => {
  const config = assignment?.[section] || {};
  const classSpecific = classId ? config.instructionDatesByClassId?.[classId] : null;
  const periodSpecific = classPeriod ? config.instructionDatesByClassPeriod?.[classPeriod] : null;
  const explicit = classSpecific || periodSpecific || config.instructionDate || config.date || assignment?.assignmentDate || null;
  if (explicit) {
    const value = String(explicit);
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = parseInstant(explicit, { timeZone });
    if (parsed !== null) return zonedDateKey(parsed, timeZone);
  }
  const releaseAt = parseInstant(assignment?.releaseAt || assignment?.releaseDate, { timeZone });
  if (releaseAt !== null) return zonedDateKey(releaseAt, timeZone);
  const dueAt = parseInstant(assignment?.dueAt || assignment?.dueDate, { endOfDay: true, timeZone });
  return dueAt === null ? null : zonedDateKey(dueAt, timeZone);
};

export const resolveWarmupInstructionDateKey = ({ assignment, classId = null, classPeriod = null, timeZone = null } = {}) => (
  sectionInstructionDateKey({ assignment, section: 'warmup', classId, classPeriod, timeZone })
);

export const resolveDolInstructionDateKey = ({ assignment, classId = null, classPeriod = null, timeZone = null } = {}) => (
  sectionInstructionDateKey({ assignment, section: 'dol', classId, classPeriod, timeZone })
);

/**
 * The assignment's own final grading cutoff: the late window when there is
 * one, extended by a per-student attendance extension when `studentId` names
 * one (`assignment.studentOverrides[studentId].lateDueAt`), and by the
 * student's individualized extra-time deadline when `studentProfile` (the
 * student's pinned `grades/{id}.profile`) carries one — see
 * supportDeadline.mjs. The latest of them wins; none can shorten another.
 *
 * MIRRORS src/assignmentLifecycle.js's `getAssignmentDate(assignment, 'late',
 * studentId)` EXACTLY — same fallback order, same field names. Cloud
 * Functions deploy only `functions/` (see AGENTS.md), so this cannot import
 * that client module; it is re-derived here instead, on purpose, so both
 * sides can only ever answer "when does this student's credit eligibility
 * actually end" the same way. If that resolver's fallback chain changes,
 * change it here too.
 */
export const assignmentFinalCloseAt = (assignment, timeZone = null, studentId = null, studentProfile = null) => {
  const effective = studentId && studentProfile
    ? withStudentSupportDates(assignment, studentId, studentProfile)
    : assignment;
  const override = studentId ? effective?.studentOverrides?.[studentId] : null;
  const candidates = [
    parseInstant(
      assignment?.lateDueAt || assignment?.lateDueDate || assignment?.dueAt || assignment?.dueDate,
      { endOfDay: true, timeZone },
    ),
    parseInstant(override?.lateDueAt || override?.dueAt, { endOfDay: true, timeZone }),
    // An ISO instant written by withStudentSupportDates, never a date key.
    parseInstant(override?.supportFinalAt, { timeZone }),
  ].filter((value) => value !== null);
  return candidates.length ? Math.max(...candidates) : null;
};

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
 * The `warmup` object a teacher's live Close / Reopen / Timer writes for one
 * class. Pure: the caller supplies the clock, the date key and the end of the
 * class period, and writes the result to the assignment.
 *
 * Only the Warm-Up's own controls change: no question, no section, no student
 * record and no draft. `timerClosesAtMs` is the close the teacher was shown
 * when they confirmed a timer (default: `nowMs` + `timerMinutes`, never past
 * the end of the period).
 *
 * WHY THERE IS NO WINDOW "GENERATION". A reopen is a new `closesAt` (and lifts
 * a manual close); it does not start a new numbered window that only begins at
 * `setAt`. Every reader resolves the current window at the current time — the
 * student gate, the deadline finalizer (which reschedules a checkpoint whose
 * close moved later) — and ingestion judges a submission by the section state
 * the device recorded at capture, so a timer or a checkpoint from the earlier
 * window cannot act on the reopened one. Gating the new window on `setAt`
 * would instead hide a reopen from every Chromebook whose clock runs behind
 * the teacher's (tests/platform/warmupReopenDraftRecovery.test.mjs).
 */
export const applyWarmupTeacherControl = ({
  assignment,
  classId,
  action,
  nowMs,
  dateKey,
  windowEndMs,
  timerMinutes = 5,
  timerClosesAtMs = null,
  teacherIdentity = 'teacher',
} = {}) => {
  const changedAt = new Date(nowMs).toISOString();
  const warmup = {
    ...assignment?.warmup,
    enabled: true,
    minutesBeforeStart: Math.max(0, Number(assignment?.warmup?.minutesBeforeStart ?? 7)),
    closeMinutesAfterStart: Math.max(1, Number(assignment?.warmup?.closeMinutesAfterStart ?? 10)),
  };
  const closedByClassId = { ...assignment?.warmup?.closedByClassId };
  const autoCloseByClassId = { ...assignment?.warmup?.autoCloseByClassId };
  const instructionDatesByClassId = { ...assignment?.warmup?.instructionDatesByClassId };

  if (action === 'close') {
    closedByClassId[classId] = { dateKey, closedAt: changedAt, closedBy: teacherIdentity };
    delete autoCloseByClassId[classId];
  } else if (action === 'reopen') {
    instructionDatesByClassId[classId] = dateKey;
    delete closedByClassId[classId];
    autoCloseByClassId[classId] = {
      dateKey,
      closesAt: new Date(windowEndMs).toISOString(),
      setAt: changedAt,
      setBy: teacherIdentity,
      reason: 'manual-reopen-until-class-end',
    };
  } else {
    instructionDatesByClassId[classId] = dateKey;
    delete closedByClassId[classId];
    autoCloseByClassId[classId] = {
      dateKey,
      closesAt: new Date(Number.isFinite(timerClosesAtMs)
        ? timerClosesAtMs
        : Math.min(windowEndMs, nowMs + Math.max(1, Number(timerMinutes) || 5) * 60_000)).toISOString(),
      setAt: changedAt,
      setBy: teacherIdentity,
    };
  }
  warmup.instructionDatesByClassId = instructionDatesByClassId;
  warmup.closedByClassId = closedByClassId;
  warmup.autoCloseByClassId = autoCloseByClassId;
  return { warmup, changedAt };
};

/*
 * A TEACHER MAY CLOSE AN OPEN DOL EARLY FOR ONE CLASS — AND THE LATEST TEACHER
 * ACTION WINS.
 *
 * `dol.closedByClassId[classId] = { dateKey, closedAt, closedBy }` ends that
 * day's window at `closedAt`. It applies to whichever window is in force
 * (regular, early unlock, or a recovery/extension window) as long as the close
 * is the NEWER decision: a reopen or unlock made after the close supersedes it,
 * exactly the way a warm-up reopen supersedes a warm-up close.
 *
 * The teacher UI only writes a close while the DOL is open, so a close always
 * behaves like the normal end of the DOL — never like a pre-emptive lock that
 * would finalize untouched work. Absent the field, every window resolves
 * exactly as before.
 */
const applyTeacherDolClose = ({ resolved, assignment, classId, todayKey }) => {
  const closed = scopedOverride({ byClassId: assignment?.dol?.closedByClassId, classId });
  const closedAtMs = overrideInstant(closed, 'closedAt', null);
  const closedDateKey = overrideDateKey(closed);
  const closedToday = Boolean(closedAtMs && (!closedDateKey || !todayKey || closedDateKey === todayKey));
  if (!closedToday || resolved.endsAtMs === null) return { ...resolved, teacherClosed: false, teacherClosedAtMs: null };
  if (resolved.teacherActionAtMs !== null && closedAtMs < resolved.teacherActionAtMs) {
    return { ...resolved, teacherClosed: false, teacherClosedAtMs: null };
  }
  const endsAtMs = Math.min(resolved.endsAtMs, closedAtMs);
  return {
    ...resolved,
    opensAtMs: Math.min(resolved.opensAtMs, endsAtMs),
    endsAtMs,
    teacherClosed: closedAtMs < resolved.endsAtMs,
    teacherClosedAtMs: closedAtMs < resolved.endsAtMs ? closedAtMs : null,
  };
};

/**
 * The DOL working window for one class.
 *
 * `minutesBeforeEnd` remains the authored working-time duration;
 * `closeMinutesBeforeEnd` shifts that whole timer earlier without shortening
 * it, so students get a real pack-up window. A teacher close (above) is
 * applied last, to whichever window is in force.
 */
export const resolveDolWindow = ({ assignment, window, classId = null, todayKey = null } = {}) => {
  const resolved = resolveDolWindowBeforeTeacherClose({ assignment, window, classId, todayKey });
  const { teacherActionAtMs: _teacherActionAtMs, ...withClose } = applyTeacherDolClose({ resolved, assignment, classId, todayKey });
  return withClose;
};

const resolveDolWindowBeforeTeacherClose = ({ assignment, window, classId = null, todayKey = null } = {}) => {
  const durationMinutes = Math.max(1, Number(assignment?.dol?.minutesBeforeEnd || 10));
  const closeMinutesBeforeEnd = Math.max(0, Number(assignment?.dol?.closeMinutesBeforeEnd ?? 5));
  if (!window) {
    return {
      opensAtMs: null, endsAtMs: null, regularOpensAtMs: null, regularEndsAtMs: null,
      earlyUnlocked: false, teacherRecovery: false, durationMinutes, closeMinutesBeforeEnd,
      teacherActionAtMs: null,
    };
  }
  const regularEndsAtMs = Math.max(window.startMs, window.endMs - closeMinutesBeforeEnd * 60_000);
  const regularOpensAtMs = Math.max(window.startMs, regularEndsAtMs - durationMinutes * 60_000);

  /*
   * A TEACHER MAY EXPLICITLY REOPEN A DOL AFTER ITS NORMAL CUTOFF.
   *
   * This is recovery authority, not a silent change to the original timer.
   * The record is class-scoped, date-stamped, names who opened it, and carries
   * an explicit close. Both the browser and Cloud Functions read this same
   * record, so a student never sees an open DOL that the server would reject.
   *
   * Unlike an EARLY unlock, a recovery window is deliberately allowed to cross
   * the normal pack-up cutoff: the teacher is making an explicit exception for
   * a bad item, device problem, interruption, or other classroom circumstance.
   */
  const recovery = scopedOverride({ byClassId: assignment?.dol?.recoveryByClassId, classId });
  const recoveryOpenedAtMs = overrideInstant(recovery, 'openedAt', null);
  const recoveryClosesAtMs = overrideInstant(recovery, 'closesAt', null);
  const recoveryDateKey = overrideDateKey(recovery);
  const recoveryToday = Boolean(
    recoveryOpenedAtMs
    && recoveryClosesAtMs
    && recoveryClosesAtMs > recoveryOpenedAtMs
    && (!recoveryDateKey || !todayKey || recoveryDateKey === todayKey)
  );
  if (recoveryToday) {
    return {
      opensAtMs: recoveryOpenedAtMs,
      endsAtMs: recoveryClosesAtMs,
      regularOpensAtMs,
      regularEndsAtMs,
      earlyUnlocked: false,
      teacherRecovery: true,
      durationMinutes,
      closeMinutesBeforeEnd,
      teacherActionAtMs: recoveryOpenedAtMs,
    };
  }

  const unlock = scopedOverride({ byClassId: assignment?.dol?.earlyUnlocksByClassId, classId });
  const unlockAtMs = overrideInstant(unlock, 'unlockedAt', null);
  const unlockDateKey = overrideDateKey(unlock);
  const unlockToday = Boolean(unlockAtMs && (!unlockDateKey || !todayKey || unlockDateKey === todayKey));
  const earlyUnlocked = unlockToday && unlockAtMs < regularOpensAtMs;

  if (!earlyUnlocked) {
    return {
      opensAtMs: regularOpensAtMs,
      endsAtMs: regularEndsAtMs,
      regularOpensAtMs,
      regularEndsAtMs,
      earlyUnlocked: false,
      teacherRecovery: false,
      durationMinutes,
      closeMinutesBeforeEnd,
      // An unlock pressed during the regular window is still the teacher's
      // latest decision; it must outrank an earlier close the same day.
      teacherActionAtMs: unlockToday ? unlockAtMs : null,
    };
  }
  const opensAtMs = Math.max(window.startMs, unlockAtMs);
  // Early release starts the same DOL timer immediately, but the DOL can never
  // extend into the final technology-return window.
  const endsAtMs = Math.min(regularEndsAtMs, opensAtMs + durationMinutes * 60_000);
  return {
    opensAtMs, endsAtMs, regularOpensAtMs, regularEndsAtMs,
    earlyUnlocked: true, teacherRecovery: false, durationMinutes, closeMinutesBeforeEnd,
    teacherActionAtMs: unlockAtMs,
  };
};

/**
 * Whether an academic occurrence happened inside an explicit teacher DOL
 * recovery window. Server grading uses this to distinguish a legitimate
 * reopened DOL from an ordinary post-cutoff submission.
 */
export const dolTeacherRecoveryActiveAt = ({
  assignment,
  classId = null,
  at = Date.now(),
  timeZone = SCHOOL_TIME_ZONE,
} = {}) => {
  if (!classId) return false;
  const recovery = scopedOverride({ byClassId: assignment?.dol?.recoveryByClassId, classId });
  const openedAtMs = overrideInstant(recovery, 'openedAt', timeZone);
  const closesAtMs = overrideInstant(recovery, 'closesAt', timeZone);
  if (openedAtMs === null || closesAtMs === null || closesAtMs <= openedAtMs) return false;
  const occurrenceMs = parseInstant(at, { timeZone });
  if (occurrenceMs === null || occurrenceMs < openedAtMs || occurrenceMs > closesAtMs) return false;
  const dateKey = overrideDateKey(recovery);
  return !dateKey || zonedDateKey(occurrenceMs, timeZone) === dateKey;
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
  studentId = null,
  // The student's pinned grades/{id}.profile. Only the assignment's own final
  // cutoff can move for extra time; Warm-Up / DOL class windows cannot.
  studentProfile = null,
} = {}) => {
  const role = String(activityRole || '').trim().toLowerCase();
  const finalCloseAtMs = assignmentFinalCloseAt(assignment, timeZone, studentId, studentProfile);
  const todayKey = zonedDateKey(nowValue, timeZone);

  if (role === 'warmup' || role === 'dol') {
    // A section's own window only governs on ITS instructional day. On any
    // other day the assignment's grading cutoff is the only close MathMaster
    // can prove — otherwise a checkpoint left from Monday would be measured
    // against Tuesday's bell.
    const instructionDateKey = role === 'warmup'
      ? resolveWarmupInstructionDateKey({ assignment, classId, classPeriod, timeZone })
      : resolveDolInstructionDateKey({ assignment, classId, classPeriod, timeZone });
    const window = instructionDateKey && instructionDateKey !== todayKey
      ? null
      : resolvePeriodWindow({ schedule, classPeriod, nowValue, timeZone });
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
    if (dol.endsAtMs) {
      return {
        closesAtMs: dol.endsAtMs,
        reason: dol.teacherClosed ? 'teacher-dol-close' : dol.teacherRecovery ? 'teacher-dol-recovery-close' : 'dol-close',
        earlyUnlocked: dol.earlyUnlocked,
        teacherRecovery: dol.teacherRecovery === true,
        teacherClosed: dol.teacherClosed === true,
      };
    }
    return { closesAtMs: finalCloseAtMs, reason: 'assignment-final-deadline', earlyUnlocked: false, teacherRecovery: false };
  }

  const manualCloseAtMs = manualSectionCloseAt({ assignment, activityRole: role, classId });
  if (manualCloseAtMs) return { closesAtMs: manualCloseAtMs, reason: 'manual-section-close' };
  return { closesAtMs: finalCloseAtMs, reason: 'assignment-final-deadline' };
};
