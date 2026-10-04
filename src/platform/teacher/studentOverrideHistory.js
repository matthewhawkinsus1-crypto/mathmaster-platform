import { collection, getDocs, query, where } from 'firebase/firestore';
import { ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION, OVERRIDE_EVENT_KIND } from '../../../functions/shared/studentAssignmentOverrides.mjs';

/*
 * WHO CHANGED ONE STUDENT'S CONTROLS ON ONE ASSIGNMENT — FOR STAFF ONLY.
 *
 * Every change to a student's private controls (an extension, an extra DOL
 * attempt, an excusal, a reopen), every migration step, and the student's own
 * share of the old shared DOL recovery log are kept as an immutable history
 * under the student: grades/{studentId}/assignmentOverrideEvents
 * (functions/shared/studentAssignmentOverrides.mjs). It names the teacher who
 * acted, so the rules let only their teacher of record (current or origin)
 * and the root administrator read it — never the student.
 *
 * Read on demand, once, when a teacher opens a student's grant history — one
 * bounded query over that student's history, no listener:
 *
 *   teacher     where('authorizedTeacherEmails', 'array-contains', me)
 *               (provable for the current AND the origin teacher; the
 *               assignment is chosen here)
 *   root admin  where('assignmentId', '==', assignmentId)
 *
 * The shared assignment's own `dol.recoveryAudit` stops carrying per-student
 * entries at the strip (they are archived, and each student's share is copied
 * into this history first), so this is where a student's grants are found.
 */

const clean = (value) => String(value ?? '').trim();

export const overrideHistoryQuery = (db, { studentId, assignmentId, email = '', isRootAdmin = false } = {}) => {
  const sid = clean(studentId);
  if (!sid) throw new Error('A student is required.');
  const events = collection(db, 'grades', sid, ASSIGNMENT_OVERRIDE_EVENTS_COLLECTION);
  if (isRootAdmin) return query(events, where('assignmentId', '==', clean(assignmentId)));
  const viewer = clean(email).toLowerCase();
  if (!viewer) throw new Error('A teacher email is required.');
  return query(events, where('authorizedTeacherEmails', 'array-contains', viewer));
};

const millis = (value) => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const KIND_LABELS = Object.freeze({
  [OVERRIDE_EVENT_KIND.ATTENDANCE_EXTENSION]: 'Attendance extension',
  [OVERRIDE_EVENT_KIND.DOL_ATTEMPTS]: 'Extra DOL attempt',
  [OVERRIDE_EVENT_KIND.EXCUSED]: 'Excused',
  [OVERRIDE_EVENT_KIND.REOPENED]: 'Reopened',
  [OVERRIDE_EVENT_KIND.MIGRATED]: 'Copied from the shared assignment',
  [OVERRIDE_EVENT_KIND.LEGACY_ABSORBED]: 'Older grant absorbed',
  [OVERRIDE_EVENT_KIND.LEGACY_AUDIT]: 'DOL recovery log (before private records)',
});

const flagChange = (before, after, flag) => {
  const was = before?.[flag] === true;
  const now = after?.[flag] === true;
  if (was === now) return null;
  return now ? `${flag === 'excused' ? 'Excused' : 'Reopened'}` : `${flag === 'excused' ? 'Excusal' : 'Reopen'} removed`;
};

/** One line saying what changed, from the before/after controls an event carries. */
export const describeOverrideChange = (event = {}) => {
  const { before = null, after = null } = event;
  const parts = [];
  if ((before?.dolExtraAttempts || 0) !== (after?.dolExtraAttempts || 0)) {
    parts.push(`DOL attempts of their own: ${before?.dolExtraAttempts || 0} → ${after?.dolExtraAttempts || 0}`);
  }
  if ((before?.lateDueAt || null) !== (after?.lateDueAt || null) && after?.lateDueAt) {
    parts.push(`final cutoff ${after.lateDueAt}`);
  }
  ['excused', 'reopened'].forEach((flag) => {
    const change = flagChange(before, after, flag);
    if (change) parts.push(change);
  });
  const legacyAudit = event?.legacy?.recoveryAuditEntry;
  if (legacyAudit) {
    const next = legacyAudit?.next?.extraAttemptsByStudent || {};
    const own = Object.values(next)[0];
    parts.push(`recorded grant${Number.isFinite(Number(own)) ? `: ${own} extra` : ''}`);
  }
  return parts.join(' · ') || 'No change to the controls';
};

/**
 * The events for one assignment, newest first, ready to list: what changed,
 * when, and who (staff may see the teacher; the student never reads this).
 */
export const describeOverrideHistory = (events = [], { assignmentId = null } = {}) => {
  const aid = clean(assignmentId);
  return (Array.isArray(events) ? events : [])
    .map((entry) => (typeof entry?.data === 'function' ? { id: entry.id, ...entry.data() } : entry))
    .filter((event) => event && (!aid || clean(event.assignmentId) === aid))
    .map((event) => ({
      id: clean(event.id),
      kind: clean(event.kind),
      label: KIND_LABELS[clean(event.kind)] || 'Change',
      atMs: millis(event.at) ?? millis(event?.legacy?.recoveryAuditEntry?.at),
      actor: clean(event.actorEmail) || (clean(event.actorRole) === 'system' ? 'MathMaster' : clean(event.actorRole) || clean(event.source) || 'MathMaster'),
      revision: Number(event.revision) || 0,
      summary: describeOverrideChange(event),
    }))
    .sort((left, right) => (right.atMs ?? 0) - (left.atMs ?? 0) || right.revision - left.revision || left.id.localeCompare(right.id));
};

/** One student's history on one assignment, read once. */
export const fetchStudentOverrideHistory = async ({ db, studentId, assignmentId, email = '', isRootAdmin = false, read = getDocs } = {}) => {
  const snapshot = await read(overrideHistoryQuery(db, { studentId, assignmentId, email, isRootAdmin }));
  return describeOverrideHistory(snapshot.docs, { assignmentId });
};
