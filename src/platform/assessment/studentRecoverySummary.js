/*
 * WHAT A STUDENT IS TOLD ABOUT A TEACHER'S DOL RECOVERY.
 *
 * Its own module because it is the one part of ./assessmentRecovery.js a
 * student's screen runs: App reads it for the signed-in student, while the
 * builders (reopen, grant, close, extend, move) are teacher actions that load
 * with the teacher kit (src/app/teacher/teacherKit.js). Importing it from
 * there put every builder in every student's first load
 * (scripts/check-first-load-budget.mjs). assessmentRecovery.js re-exports it.
 */
import { resolveStudentDolExtraAttempts } from '../../../functions/shared/studentAssignmentOverrides.mjs';

export const MAX_TEACHER_GRANTED_ATTEMPTS = 20;

/**
 * What a student should be told: is their DOL reopened (and until when), and
 * how many extra attempts have they been given.
 */
export const summarizeStudentRecovery = ({ assignment = {}, classId = null, studentId = null, now = Date.now(), privateOverride = undefined } = {}) => {
  // The class grant from the assignment; the student's own from their private
  // controls (functions/shared/studentAssignmentOverrides.mjs) — the same
  // resolver ingestion and the deadline finalizer count attempts with.
  const attempts = resolveStudentDolExtraAttempts({ assignment, classId, studentId, privateOverride });
  const classExtraAttempts = attempts.classGrant;
  const studentExtraAttempts = attempts.studentGrant;
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
