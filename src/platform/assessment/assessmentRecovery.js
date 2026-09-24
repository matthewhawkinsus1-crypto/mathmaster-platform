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

export const RECOVERY_AUDIT_LIMIT = 500;
export const MAX_TEACHER_GRANTED_ATTEMPTS = 20;

export const ASSESSMENT_RECOVERY_ACTIONS = Object.freeze({
  REOPEN_WINDOW: 'reopenWindow',
  UNLOCK_EARLY: 'unlockEarly',
  GRANT_ATTEMPTS: 'grantAttempts',
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
