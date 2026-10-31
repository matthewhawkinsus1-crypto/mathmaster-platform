/*
 * A STUDENT BEING PERMANENTLY DELETED IS NEVER PAID OR REPORTED AGAIN (SI07).
 *
 * permanentlyDeleteStudent erases a student in many steps (Class Points, Live
 * Challenge, assignments, the roster row, everything else). A Live Challenge
 * match finishing meanwhile runs its effects — the teacher's report, Warm-Up
 * credit, mastery evidence, rewards — from a match result it may have read a
 * moment before the deletion scrubbed it, and so could write the student back
 * after their records were erased.
 *
 * So the deletion's FIRST write marks the student's roster row, and every
 * effect that writes about a student reads that row in the same transaction:
 * a row that is gone, or carries this mark, gets nothing. A transaction that
 * read the row before the mark landed runs again (Firestore serializes it
 * against the mark) and sees it. The row, with its mark, is deleted last.
 *
 * Pure: Cloud Functions only; no Firestore here.
 */

/** The roster-row field the deletion sets first (a server timestamp). */
export const STUDENT_DELETION_MARK = 'permanentDeletionStartedAt';

/**
 * May a match's effects still write about this student? `gradeSnapshot` is
 * their grades/{studentId} snapshot (or `{ exists, data }` read the same way).
 */
export const rosterRowAcceptsEffects = (gradeSnapshot) => {
  if (!gradeSnapshot?.exists) return false;
  const data = typeof gradeSnapshot.data === 'function' ? gradeSnapshot.data() : gradeSnapshot.data;
  return !(data && typeof data === 'object' && data[STUDENT_DELETION_MARK]);
};
