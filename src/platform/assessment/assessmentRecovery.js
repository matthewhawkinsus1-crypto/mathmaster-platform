/*
 * ASSESSMENT RECOVERY — REOPENING A DOL AND GRANTING ATTEMPTS, WITH A RECORD.
 *
 * Teachers recover from real classroom conditions: a device that died mid-DOL,
 * an absent student, a bad item, an interruption. #347 gave them class-scoped
 * controls (a fresh recovery window after the cutoff, +1 attempt for a class).
 * This model makes those controls reusable and accountable:
 *
 *   - every action is built here as a patch to `assignment.dol` plus an
 *     append-only audit entry (`dol.recoveryAudit`): who, which scope, the
 *     state before, the state after, when, and an optional reason;
 *   - a grant can target a class or selected students; per-student grants live
 *     in `dol.attemptGrantsByStudentId` and ADD to the class grant through the
 *     one resolver the browser and the server both call
 *     (`resolveTeacherGrantedExtraAttempts` in functions/shared/attemptPolicy.mjs);
 *   - nothing here touches a question record: prior attempts, scores and
 *     responses are evidence and stay exactly as they were. Recovery only
 *     changes what the policy allows next.
 *
 * The same shape serves any timed or attempt-limited section (quiz, test,
 * review, retest, warm-up) — `section` names which one; today the platform
 * enforces it for the DOL.
 *
 * Pure: builds patches, writes nothing. The assignment document is readable by
 * every signed-in user, so the audit stores teacher ids, never emails.
 */

import { resolveDolInstructionDateKey } from '../../../functions/shared/sectionDeadline.mjs';

export const RECOVERY_AUDIT_LIMIT = 500;
export const MAX_TEACHER_GRANTED_ATTEMPTS = 20;

export const ASSESSMENT_RECOVERY_ACTIONS = Object.freeze({
  REOPEN_WINDOW: 'reopenWindow',
  UNLOCK_EARLY: 'unlockEarly',
  GRANT_ATTEMPTS: 'grantAttempts',
  CLOSE_WINDOW: 'closeWindow',
  EXTEND_WINDOW: 'extendWindow',
  MOVE_DATE: 'moveDate',
  RETURN_TO_SCHEDULE: 'returnToSchedule',
});

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const grantCount = (grant) => {
  const value = isObject(grant) ? grant.extraAttempts : grant;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
};
const iso = (value) => new Date(value).toISOString();

/** Append-only: an entry is never edited or removed, only the oldest aged out past the cap. */
export const appendRecoveryAudit = (dol = {}, entries = []) => {
  const existing = Array.isArray(dol?.recoveryAudit) ? dol.recoveryAudit : [];
  return [...existing, ...entries].slice(-RECOVERY_AUDIT_LIMIT);
};

const auditEntry = ({ action, section = 'dol', scope, previous, next, teacherId, reason, at }) => ({
  id: `${action}:${scope.type}:${scope.classId || (scope.studentIds || []).join('+')}:${at}`,
  action,
  section,
  scope,
  previous: previous ?? null,
  next: next ?? null,
  teacherId: clean(teacherId) || 'teacher',
  reason: clean(reason) || null,
  at,
});

/**
 * One more (or `increment` more) attempt on every DOL question — for a class,
 * or for selected students only.
 */
export const buildDolAttemptGrant = ({
  assignment = {},
  scope = {},
  increment = 1,
  teacherId = null,
  reason = null,
  now = Date.now(),
} = {}) => {
  const at = iso(now);
  const dol = { ...assignment?.dol, enabled: true };
  const step = Math.max(1, Math.floor(Number(increment) || 1));
  const audit = [];

  if (scope.type === 'class') {
    const classId = clean(scope.classId);
    if (!classId) throw new Error('Choose the class to grant an attempt to.');
    const previous = grantCount(assignment?.dol?.attemptGrantsByClassId?.[classId]);
    const next = Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, previous + step);
    dol.attemptGrantsByClassId = {
      ...assignment?.dol?.attemptGrantsByClassId,
      [classId]: { extraAttempts: next, changedAt: at, changedBy: clean(teacherId) || 'teacher', reason: clean(reason) || 'teacher-dol-recovery' },
    };
    audit.push(auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.GRANT_ATTEMPTS, scope: { type: 'class', classId }, previous: { extraAttempts: previous }, next: { extraAttempts: next }, teacherId, reason, at }));
  } else if (scope.type === 'students') {
    const studentIds = [...new Set((scope.studentIds || []).map(clean).filter(Boolean))];
    if (!studentIds.length) throw new Error('Choose at least one student to grant an attempt to.');
    const byStudent = { ...assignment?.dol?.attemptGrantsByStudentId };
    const previous = {};
    const next = {};
    studentIds.forEach((studentId) => {
      previous[studentId] = grantCount(byStudent[studentId]);
      next[studentId] = Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, previous[studentId] + step);
      byStudent[studentId] = { extraAttempts: next[studentId], changedAt: at, changedBy: clean(teacherId) || 'teacher', reason: clean(reason) || 'teacher-dol-recovery' };
    });
    dol.attemptGrantsByStudentId = byStudent;
    audit.push(auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.GRANT_ATTEMPTS, scope: { type: 'students', studentIds, classId: clean(scope.classId) || null }, previous: { extraAttemptsByStudent: previous }, next: { extraAttemptsByStudent: next }, teacherId, reason, at }));
  } else {
    throw new Error('A grant needs a class or a list of students.');
  }

  dol.recoveryAudit = appendRecoveryAudit(assignment?.dol, audit);
  return { dol, audit };
};

/**
 * A fresh DOL window for one class after its normal cutoff (the #347 teacher
 * recovery), or an early unlock before it. A recovery window closes after the
 * DOL's own duration unless the teacher chose a close time.
 */
export const buildDolWindowOpening = ({
  assignment = {},
  classId,
  classPeriod = null,
  recovery = false,
  durationMinutes = null,
  closesAt = null,
  dateKey,
  teacherId = null,
  reason = null,
  now = Date.now(),
} = {}) => {
  const id = clean(classId);
  if (!id) throw new Error('Choose the class whose DOL should open.');
  if (!clean(dateKey)) throw new Error('A DOL opening needs its instructional date.');
  const at = iso(now);
  const dol = { ...assignment?.dol, enabled: true };
  Object.assign(dol, preserveScheduledDolDate({ assignment, classId: id, classPeriod, now }));
  dol.instructionDatesByClassId = { ...assignment?.dol?.instructionDatesByClassId, [id]: dateKey };

  let entry;
  if (recovery) {
    const minutes = Math.max(1, Number(durationMinutes ?? assignment?.dol?.minutesBeforeEnd ?? 10));
    const requestedClose = closesAt ? new Date(closesAt).getTime() : null;
    if (requestedClose !== null && !(Number.isFinite(requestedClose) && requestedClose > now)) {
      throw new Error('The new close time must be in the future.');
    }
    const close = requestedClose ?? now + minutes * 60_000;
    const previous = assignment?.dol?.recoveryByClassId?.[id] || null;
    entry = { dateKey, openedAt: at, closesAt: iso(close), openedBy: clean(teacherId) || 'teacher', reason: clean(reason) || 'teacher-recovery' };
    dol.recoveryByClassId = { ...assignment?.dol?.recoveryByClassId, [id]: entry };
    dol.recoveryAudit = appendRecoveryAudit(assignment?.dol, [auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.REOPEN_WINDOW, scope: { type: 'class', classId: id }, previous, next: entry, teacherId, reason, at })]);
  } else {
    const previous = assignment?.dol?.earlyUnlocksByClassId?.[id] || null;
    entry = { dateKey, unlockedAt: at, unlockedBy: clean(teacherId) || 'teacher' };
    dol.earlyUnlocksByClassId = { ...assignment?.dol?.earlyUnlocksByClassId, [id]: entry };
    dol.recoveryAudit = appendRecoveryAudit(assignment?.dol, [auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.UNLOCK_EARLY, scope: { type: 'class', classId: id }, previous, next: entry, teacherId, reason, at })]);
  }
  return { dol, entry };
};

/*
 * THE SCHEDULE A TEACHER OVERRIDES IS KEPT, NOT OVERWRITTEN.
 *
 * "Open DOL Today" and "Move to another day" both write this class's
 * `instructionDatesByClassId` entry. Before the FIRST such override, the
 * class's own entry (or its absence) and the date it resolved to are saved in
 * `scheduledInstructionDatesByClassId[classId]`, so the teacher can always see
 * "originally scheduled for …" and return to it. Later overrides never replace
 * the saved original; returning to the schedule removes it.
 */
export const preserveScheduledDolDate = ({ assignment = {}, classId, classPeriod = null, now = Date.now() } = {}) => {
  const id = clean(classId);
  const saved = assignment?.dol?.scheduledInstructionDatesByClassId || {};
  if (!id || saved[id]) return {};
  const rawEntry = assignment?.dol?.instructionDatesByClassId?.[id];
  return {
    scheduledInstructionDatesByClassId: {
      ...saved,
      [id]: {
        classDateKey: rawEntry ? clean(rawEntry) : null,
        resolvedDateKey: resolveDolInstructionDateKey({ assignment, classId: id, classPeriod }) || null,
        savedAt: iso(now),
      },
    },
  };
};

/** The date this class's DOL was scheduled for before any teacher override, if one happened. */
export const scheduledDolDateFor = (assignment = {}, classId = null) => {
  const entry = classId ? assignment?.dol?.scheduledInstructionDatesByClassId?.[clean(classId)] : null;
  return entry ? { classDateKey: entry.classDateKey ?? null, resolvedDateKey: entry.resolvedDateKey ?? null } : null;
};

/**
 * "Close now" for one class. Written only while the DOL is open, so it ends the
 * window exactly like the bell-time cutoff would (the shared resolver applies
 * it; a later reopen supersedes it).
 */
export const buildDolClose = ({ assignment = {}, classId, dateKey, teacherId = null, reason = null, now = Date.now() } = {}) => {
  const id = clean(classId);
  if (!id) throw new Error('Choose the class whose DOL should close.');
  if (!clean(dateKey)) throw new Error('A DOL close needs its instructional date.');
  const at = iso(now);
  const previous = assignment?.dol?.closedByClassId?.[id] || null;
  const entry = { dateKey, closedAt: at, closedBy: clean(teacherId) || 'teacher', reason: clean(reason) || 'teacher-close' };
  const dol = { ...assignment?.dol, enabled: true, closedByClassId: { ...assignment?.dol?.closedByClassId, [id]: entry } };
  dol.recoveryAudit = appendRecoveryAudit(assignment?.dol, [auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.CLOSE_WINDOW, scope: { type: 'class', classId: id }, previous, next: entry, teacherId, reason, at })]);
  return { dol, entry };
};

/**
 * "+5 min" on an open DOL. Stored as a teacher window from now until the new
 * close — the same audited record the server already honors for a reopen — so
 * students keep working and their work stays creditable. Never past `capAtMs`
 * (the end of the class period).
 */
export const buildDolExtension = ({
  assignment = {}, classId, dateKey, currentEndsAtMs, minutes = 5, capAtMs = null, teacherId = null, reason = null, now = Date.now(),
} = {}) => {
  const id = clean(classId);
  if (!id) throw new Error('Choose the class whose DOL should get more time.');
  if (!clean(dateKey)) throw new Error('A DOL extension needs its instructional date.');
  const step = Math.max(1, Math.min(60, Math.round(Number(minutes) || 5)));
  const base = Math.max(Number(currentEndsAtMs) || now, now);
  const cap = Number.isFinite(Number(capAtMs)) && capAtMs !== null ? Number(capAtMs) : null;
  const close = cap === null ? base + step * 60_000 : Math.min(cap, base + step * 60_000);
  if (!(close > now)) throw new Error('This class period has no time left to extend the DOL.');
  const at = iso(now);
  const previous = assignment?.dol?.recoveryByClassId?.[id] || null;
  const entry = { dateKey, openedAt: at, closesAt: iso(close), openedBy: clean(teacherId) || 'teacher', reason: clean(reason) || 'teacher-extend', extendedMinutes: step };
  const dol = { ...assignment?.dol, enabled: true, recoveryByClassId: { ...assignment?.dol?.recoveryByClassId, [id]: entry } };
  dol.recoveryAudit = appendRecoveryAudit(assignment?.dol, [auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.EXTEND_WINDOW, scope: { type: 'class', classId: id }, previous, next: entry, teacherId, reason, at })]);
  return { dol, entry };
};

/**
 * "Not today — move this class's DOL to another day." A date change never
 * closes or finalizes anything: the DOL simply is not today's checkpoint any
 * more. The original schedule is preserved on the first override.
 */
export const buildDolDateMove = ({
  assignment = {}, classId, classPeriod = null, toDateKey, todayKey = null, teacherId = null, reason = null, now = Date.now(),
} = {}) => {
  const id = clean(classId);
  const target = clean(toDateKey);
  if (!id) throw new Error('Choose the class whose DOL should move.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) throw new Error('Choose the day the DOL should move to.');
  const at = iso(now);
  const dol = { ...assignment?.dol, enabled: true, ...preserveScheduledDolDate({ assignment, classId: id, classPeriod, now }) };
  const previous = resolveDolInstructionDateKey({ assignment, classId: id, classPeriod }) || null;
  dol.instructionDatesByClassId = { ...assignment?.dol?.instructionDatesByClassId, [id]: target };
  // A same-day unlock must not follow the DOL to its new day.
  if (todayKey && target !== todayKey && assignment?.dol?.earlyUnlocksByClassId?.[id]?.dateKey === todayKey) {
    const unlocks = { ...assignment.dol.earlyUnlocksByClassId };
    delete unlocks[id];
    dol.earlyUnlocksByClassId = unlocks;
  }
  dol.recoveryAudit = appendRecoveryAudit(assignment?.dol, [auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.MOVE_DATE, scope: { type: 'class', classId: id }, previous: { dateKey: previous }, next: { dateKey: target }, teacherId, reason, at })]);
  return { dol, entry: { dateKey: target } };
};

/**
 * "Back to the scheduled date." Restores the class's saved original entry (or
 * its absence) and drops a same-day early unlock. Offered only before the DOL
 * has opened today, so no student work is involved. Recovery windows and closes
 * are left in place: they are audited history, and inert on other days.
 */
export const buildDolScheduleRestore = ({ assignment = {}, classId, todayKey = null, teacherId = null, reason = null, now = Date.now() } = {}) => {
  const id = clean(classId);
  const saved = assignment?.dol?.scheduledInstructionDatesByClassId?.[id];
  if (!id || !saved) throw new Error('This DOL is already on its scheduled date.');
  const at = iso(now);
  const dol = { ...assignment?.dol, enabled: true };
  const dates = { ...assignment?.dol?.instructionDatesByClassId };
  const moved = dates[id] || null;
  if (saved.classDateKey) dates[id] = saved.classDateKey;
  else delete dates[id];
  dol.instructionDatesByClassId = dates;
  const savedDates = { ...assignment.dol.scheduledInstructionDatesByClassId };
  delete savedDates[id];
  dol.scheduledInstructionDatesByClassId = savedDates;
  if (todayKey && assignment?.dol?.earlyUnlocksByClassId?.[id]?.dateKey === todayKey) {
    const unlocks = { ...assignment.dol.earlyUnlocksByClassId };
    delete unlocks[id];
    dol.earlyUnlocksByClassId = unlocks;
  }
  dol.recoveryAudit = appendRecoveryAudit(assignment?.dol, [auditEntry({ action: ASSESSMENT_RECOVERY_ACTIONS.RETURN_TO_SCHEDULE, scope: { type: 'class', classId: id }, previous: { dateKey: moved }, next: { dateKey: saved.resolvedDateKey || saved.classDateKey || null }, teacherId, reason, at })]);
  return { dol, entry: { dateKey: saved.resolvedDateKey || saved.classDateKey || null } };
};

/**
 * What a student should be told: is their DOL reopened (and until when), and
 * how many extra attempts have they been given.
 */
export const summarizeStudentRecovery = ({ assignment = {}, classId = null, studentId = null, now = Date.now() } = {}) => {
  const classExtraAttempts = classId ? grantCount(assignment?.dol?.attemptGrantsByClassId?.[classId]) : 0;
  const studentExtraAttempts = studentId ? grantCount(assignment?.dol?.attemptGrantsByStudentId?.[studentId]) : 0;
  const recovery = classId ? assignment?.dol?.recoveryByClassId?.[classId] : null;
  const opened = recovery?.openedAt ? new Date(recovery.openedAt).getTime() : NaN;
  const closes = recovery?.closesAt ? new Date(recovery.closesAt).getTime() : NaN;
  const reopenedOpen = Number.isFinite(opened) && Number.isFinite(closes) && now >= opened && now <= closes;
  return {
    reopened: reopenedOpen ? { openedAt: recovery.openedAt, closesAt: recovery.closesAt } : null,
    extraAttempts: Math.min(MAX_TEACHER_GRANTED_ATTEMPTS, classExtraAttempts + studentExtraAttempts),
    classExtraAttempts,
    studentExtraAttempts,
  };
};

/** The recovery history for a teacher, newest first, optionally for one student. */
export const recoveryHistory = (assignment = {}, { studentId = null, classId = null } = {}) => (
  (Array.isArray(assignment?.dol?.recoveryAudit) ? assignment.dol.recoveryAudit : [])
    .filter((entry) => {
      if (studentId && entry?.scope?.type === 'students') return (entry.scope.studentIds || []).includes(studentId);
      if (classId) return entry?.scope?.classId === classId;
      return true;
    })
    .slice()
    .reverse()
);

export default buildDolAttemptGrant;
