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
import { resolveStudentDeadlines, resolveStudentOverride } from './studentAssignmentOverrides.mjs';
import { resolveSupportEntitlements } from './supportEntitlements.mjs';
import { planSupportEntry, resolveEffectiveSupportPlan } from './supportProfileModel.mjs';

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
 * one, extended by the student's individual extension (their private
 * override — studentAssignmentOverrides.mjs — merged with any copy still on
 * the shared document), and by the student's individualized extra-time
 * deadline when `studentProfile` (the student's pinned `grades/{id}.profile`)
 * carries one — see supportDeadline.mjs. The latest of them wins; none can
 * shorten another.
 *
 * `privateOverride` is the student's record from
 * `studentAssignmentOverrides`, read by the CALLER with its own authority
 * (inside the same transaction as the assignment, for ingestion and the
 * finalizer). Leave it undefined only where private storage was not read;
 * the shared document is then the whole answer, as before the migration.
 *
 * The precedence itself is resolveStudentDeadlines — the one definition the
 * browser's lifecycle (src/assignmentLifecycle.js getAssignmentDate) also
 * reads, so "when does this student's credit eligibility actually end" has
 * one answer on both sides.
 */
export const assignmentFinalCloseAt = (assignment, timeZone = null, studentId = null, studentProfile = null, { privateOverride = undefined } = {}) => {
  const withSupport = studentId && studentProfile
    ? withStudentSupportDates(assignment, studentId, studentProfile)
    : assignment;
  const override = studentId ? resolveStudentOverride({ assignment: withSupport, studentId, privateOverride }) : null;
  return resolveStudentDeadlines({ assignment, override, timeZone }).finalCloseAtMs;
};

/*
 * EXTRA TIME ON THE EXIT TICKET (DOL) — decision D7 (2026-10-16).
 *
 * The DOL is graded, so a student's extended-time accommodation stretches
 * THEIR exit-ticket window. The Warm-Up stays class-timed.
 *
 * WHICH STUDENTS. Exactly the ones a secure exam gives extended time to: the
 * multiplier comes from the one entitlement resolver (supportEntitlements.mjs
 * resolveSupportEntitlements, which functions/index.js
 * secureExamTimeMultiplierFromProfile also reads) on the student's pinned
 * `grades/{id}.profile`. So, as implemented there:
 *   - a district (structured) profile's `extendedTimeMultiplier`, clamped 1–4;
 *   - the teacher's "extra time" box, or inclusion status, means 1.5;
 *   - an EXPIRED profile keeps applying (supportProfileModel.mjs); an
 *     inactive one does not;
 *   - an unreadable profile grants nothing extra and never throws.
 * One narrowing the secure exam does not need: a versioned plan whose
 * "extra time" entry is limited to activities that do not include the DOL
 * ("Activities Extra time applies to" in the profile editor) does not stretch
 * the DOL.
 *
 * HOW MUCH. The same arithmetic as a secure exam's time limit
 * (functions/lib/secureExamNavigation.js accommodatedTimeLimitSeconds): the
 * DOL's authored working time × the multiplier, rounded UP to a whole minute.
 * The difference is added to the end of whichever class window is in force —
 * the regular one, an early unlock, a teacher's reopen or "+5 min" — so extra
 * time never shortens anything and a teacher who gives the class more time
 * gives this student the same more. A teacher's "Close now" still ends the
 * window for everyone (applyTeacherDolClose): it is an explicit decision, and
 * the teacher's live view shows who still had extra time before they press it.
 *
 * A student without the accommodation gets the class window to the
 * millisecond: multiplier 1 adds nothing.
 */
export const MAX_EXTENDED_TIME_MULTIPLIER = 4;
const DOL_SUPPORT_ROLE = 'dol';
const EXTRA_TIME_SUPPORT_ID = 'extra-time';

export const dolExtendedTimeMultiplier = (studentProfile = null, { nowValue = Date.now(), timeZone = SCHOOL_TIME_ZONE } = {}) => {
  if (!studentProfile || typeof studentProfile !== 'object' || Array.isArray(studentProfile)) return 1;
  try {
    const multiplier = Number(resolveSupportEntitlements(studentProfile, { nowValue }).extendedTimeMultiplier);
    if (!Number.isFinite(multiplier) || multiplier <= 1) return 1;
    const plan = resolveEffectiveSupportPlan(studentProfile, { nowValue, timeZone });
    const entry = plan?.source === 'plan' ? planSupportEntry(plan, EXTRA_TIME_SUPPORT_ID) : null;
    const roles = Array.isArray(entry?.appliesTo) ? entry.appliesTo.map((role) => String(role).trim().toLowerCase()) : [];
    if (roles.length && !roles.includes(DOL_SUPPORT_ROLE)) return 1;
    return Math.min(MAX_EXTENDED_TIME_MULTIPLIER, multiplier);
  } catch {
    return 1;
  }
};

/*
 * THE STUDENT'S DEVICE READS THE SAME PROFILE, INJECTED IN MEMORY.
 *
 * The student's own projection (src/platform/assignments/
 * studentAssignmentControls.js projectStudentAssignments) attaches their
 * pinned profile to each assignment it hands the screens, under this key, the
 * way withStudentSupportDates attaches their individualized due dates. Every
 * getDOLState call on the student's device then resolves THEIR window — the
 * timer, the lock, Home, the client close — without each caller passing it.
 * In memory only: students cannot write assignments, and a teacher's copy
 * never carries it, so a teacher's class controls stay on the class window.
 */
export const STUDENT_TIMING_PROFILE_KEY = 'studentTimingProfile';

export const withStudentTimingProfile = (assignment, profile) => (
  assignment && profile && typeof profile === 'object' && !Array.isArray(profile)
    ? { ...assignment, [STUDENT_TIMING_PROFILE_KEY]: profile }
    : assignment
);

export const studentTimingProfileOf = (assignment) => {
  const profile = assignment?.[STUDENT_TIMING_PROFILE_KEY];
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : null;
};

/** A secure exam's accommodated time limit, in seconds (same rule, kept in parity by test). */
export const accommodatedSeconds = (seconds, multiplier) => {
  const base = Number(seconds);
  if (!Number.isFinite(base) || base <= 0) return null;
  const factor = Number(multiplier);
  const safe = Number.isFinite(factor) ? Math.max(1, Math.min(MAX_EXTENDED_TIME_MULTIPLIER, factor)) : 1;
  return Math.ceil((base * safe) / 60) * 60;
};

/** The extra milliseconds a multiplier adds to a DOL of `durationMinutes` working time. */
export const dolExtraTimeMs = ({ durationMinutes, multiplier = 1 } = {}) => {
  if (!(Number(multiplier) > 1)) return 0;
  const baseSeconds = Math.max(1, Number(durationMinutes) || 10) * 60;
  return Math.max(0, (accommodatedSeconds(baseSeconds, multiplier) - baseSeconds) * 1000);
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
export const resolveDolWindow = ({ assignment, window, classId = null, todayKey = null, timeMultiplier = 1 } = {}) => {
  const resolved = resolveDolWindowBeforeTeacherClose({ assignment, window, classId, todayKey });
  const classWindow = applyTeacherDolClose({ resolved, assignment, classId, todayKey });
  // One student's extra time (header above): added to the class's close, then
  // subject to a teacher close like any window — "Close now" during the class
  // window, or inside the student's extra minutes, ends theirs there too.
  const extraMs = resolved.endsAtMs === null
    ? 0
    : dolExtraTimeMs({ durationMinutes: resolved.durationMinutes, multiplier: timeMultiplier });
  const own = extraMs > 0
    ? applyTeacherDolClose({ resolved: { ...resolved, endsAtMs: resolved.endsAtMs + extraMs }, assignment, classId, todayKey })
    : classWindow;
  const { teacherActionAtMs: _teacherActionAtMs, ...withClose } = own;
  const extendedTimeMs = extraMs > 0 ? Math.max(0, own.endsAtMs - classWindow.endsAtMs) : 0;
  return {
    ...withClose,
    // The class's own close, for the teacher's view and for "extra time" copy.
    // Equal to endsAtMs for every student without extra time.
    classEndsAtMs: classWindow.endsAtMs,
    extendedTime: extendedTimeMs > 0,
    extendedTimeMs,
    extendedTimeMultiplier: extendedTimeMs > 0 ? Math.min(MAX_EXTENDED_TIME_MULTIPLIER, Number(timeMultiplier)) : 1,
  };
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
  // The student's pinned grades/{id}.profile: their extra time stretches a
  // teacher's reopen window exactly as it stretches the regular one.
  studentProfile = null,
} = {}) => {
  if (!classId) return false;
  const recovery = scopedOverride({ byClassId: assignment?.dol?.recoveryByClassId, classId });
  const openedAtMs = overrideInstant(recovery, 'openedAt', timeZone);
  const classClosesAtMs = overrideInstant(recovery, 'closesAt', timeZone);
  if (openedAtMs === null || classClosesAtMs === null || classClosesAtMs <= openedAtMs) return false;
  const occurrenceMs = parseInstant(at, { timeZone });
  const closesAtMs = classClosesAtMs + dolExtraTimeMs({
    durationMinutes: assignment?.dol?.minutesBeforeEnd || 10,
    multiplier: dolExtendedTimeMultiplier(studentProfile, { nowValue: occurrenceMs ?? Date.now(), timeZone }),
  });
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
  // The student's pinned grades/{id}.profile. Extra time moves the
  // assignment's own final cutoff (supportDeadline.mjs) and, by decision D7,
  // this student's DOL window (dolExtendedTimeMultiplier). The Warm-Up stays
  // class-timed.
  studentProfile = null,
  // The student's private override record (studentAssignmentOverrides),
  // read by the caller with its own authority. Same rule as extra time: it
  // moves only the assignment's own final cutoff.
  privateOverride = undefined,
} = {}) => {
  const role = String(activityRole || '').trim().toLowerCase();
  const finalCloseAtMs = assignmentFinalCloseAt(assignment, timeZone, studentId, studentProfile, { privateOverride });
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
    const timeMultiplier = dolExtendedTimeMultiplier(studentProfile, { nowValue, timeZone });
    const dol = resolveDolWindow({ assignment, window, classId, todayKey, timeMultiplier });
    if (dol.endsAtMs) {
      return {
        closesAtMs: dol.endsAtMs,
        reason: dol.teacherClosed ? 'teacher-dol-close' : dol.teacherRecovery ? 'teacher-dol-recovery-close' : 'dol-close',
        earlyUnlocked: dol.earlyUnlocked,
        teacherRecovery: dol.teacherRecovery === true,
        teacherClosed: dol.teacherClosed === true,
        // This student's own extra time on top of the class's close (D7).
        extendedTime: dol.extendedTime === true,
        classClosesAtMs: dol.classEndsAtMs,
      };
    }
    return { closesAtMs: finalCloseAtMs, reason: 'assignment-final-deadline', earlyUnlocked: false, teacherRecovery: false };
  }

  const manualCloseAtMs = manualSectionCloseAt({ assignment, activityRole: role, classId });
  if (manualCloseAtMs) return { closesAtMs: manualCloseAtMs, reason: 'manual-section-close' };
  return { closesAtMs: finalCloseAtMs, reason: 'assignment-final-deadline' };
};
