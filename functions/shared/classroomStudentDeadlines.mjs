/*
 * WHEN GOOGLE CLASSROOM MAY CALL ONE STUDENT'S GRADE "DUE" OR "FINAL" (H-116).
 *
 * The Classroom checkpoint scheduler (functions/index.js
 * queueClassroomGradeCheckpoints) wakes the whole roster at the CLASS's due
 * time and final cutoff, and the grade trigger (syncGradeToClassroom) used to
 * return a "final-deadline" grade for every one of them — including a student
 * whose own deadline is later (an attendance extension, or an extra-time
 * accommodation's individualized due date). That student saw a returned,
 * possibly incomplete grade in Classroom while MathMaster was still accepting
 * their work.
 *
 * Two rules, both here so they are tested without Firestore:
 *   1. A student's OWN due and final cutoff: their private extension
 *      (studentAssignmentOverrides.mjs) and their extra-time dates
 *      (supportDeadline.mjs) — the same sources ingestion and the checkpoint
 *      finalizer read. The trigger never lets a class-wide signal call them
 *      due or final before these (lib/classroomGradeRuntime.js).
 *   2. Because nothing else would wake the trigger at a later, per-student
 *      time, a trigger that sets the class's wake-up aside records the
 *      student's own time, and the scheduler wakes them when it arrives
 *      (arrivedStudentCheckpoints).
 *
 * Dates are read exactly as the scheduler and the trigger have always read
 * them (`instantMs` is functions/index.js `toDate`), so a student with no
 * individual deadline is timed exactly as before.
 */
import { withStudentSupportDates } from './supportDeadline.mjs';
import { resolveStudentOverride } from './studentAssignmentOverrides.mjs';

/** functions/index.js toDate, as milliseconds. */
export const instantMs = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
};

const latest = (...values) => {
  const present = values.filter((value) => Number.isFinite(value));
  return present.length ? Math.max(...present) : null;
};

/**
 * This student's individual due time and final cutoff, or null for each that
 * is not individual. `studentProfile` is their pinned grades/{id}.profile;
 * `privateOverride` their studentAssignmentOverrides record (null = read and
 * empty, undefined = not read: the shared copy is then the whole answer).
 */
export const studentClassroomDeadlines = ({
  assignment = null,
  studentId = null,
  studentProfile = null,
  privateOverride = undefined,
} = {}) => {
  const id = String(studentId || '').trim();
  if (!assignment || !id) return { dueAtMs: null, finalAtMs: null };
  const withSupport = studentProfile ? withStudentSupportDates(assignment, id, studentProfile) : assignment;
  const override = resolveStudentOverride({ assignment: withSupport, studentId: id, privateOverride });
  return {
    dueAtMs: instantMs(override?.supportDueAt),
    finalAtMs: latest(instantMs(override?.lateDueAt), instantMs(override?.supportFinalAt)),
  };
};

/**
 * Which recorded per-student checkpoints have arrived. A final that has
 * arrived supersedes that student's pending due checkpoint (it is retired
 * with it, never sent after it).
 */
export const arrivedStudentCheckpoints = ({ pendingDue = {}, pendingFinal = {}, nowMs = Date.now() } = {}) => {
  const arrived = (pending) => Object.entries(pending && typeof pending === 'object' ? pending : {})
    .filter(([, at]) => instantMs(at) !== null && instantMs(at) <= nowMs)
    .map(([studentId]) => studentId)
    .sort();
  const final = arrived(pendingFinal);
  const finalSet = new Set(final);
  const due = arrived(pendingDue).filter((studentId) => !finalSet.has(studentId));
  const retiredDue = Object.keys(pendingDue || {}).filter((studentId) => finalSet.has(studentId) || due.includes(studentId)).sort();
  return { final, due, retiredDue };
};
