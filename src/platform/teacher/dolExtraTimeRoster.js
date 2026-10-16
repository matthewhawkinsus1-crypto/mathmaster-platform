/*
 * WHO IN THIS CLASS STILL HAS EXTRA TIME ON TODAY'S EXIT TICKET (DOL).
 *
 * Decision D7: a student's extended-time accommodation stretches THEIR DOL
 * window (functions/shared/sectionDeadline.mjs dolExtendedTimeMultiplier). The
 * teacher's live view times the class's DOL; without this it would show the
 * DOL as over while a student is still working, and a teacher could not tell
 * whether "Close now" would cut anyone's extra minutes.
 *
 * Each student's window comes from the same getDOLState the student's device
 * runs, with the support profile the teacher's roster row already carries, so
 * the teacher sees the close the student sees and the server enforces.
 *
 * Pure: no Firestore, no React.
 */
import { getDOLState } from '../../assignmentLifecycle.js';
import { dolExtendedTimeMultiplier } from '../../../functions/shared/sectionDeadline.mjs';

const OPEN_FOR_CLASS = new Set(['active', 'ended']);

/**
 * The students whose own DOL window is open now and runs past the class's,
 * for one assignment and one class — or null when there are none.
 *
 * @returns {null | {
 *   classEndsAt: Date, endsAt: Date, millisecondsRemaining: number,
 *   students: Array<{ studentId: string, name: string, endsAt: Date }>,
 * }}
 */
export const dolExtraTimeForClass = ({
  assignment,
  schedule,
  classContext,
  roster = [],
  nowValue = Date.now(),
} = {}) => {
  if (!assignment || !classContext) return null;
  const context = { classId: classContext.classId || null, classPeriod: classContext.classPeriod || null };
  const nowMs = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const classState = getDOLState({ assignment, schedule, ...context, nowValue: nowMs, studentProfile: null });
  if (!classState.enabled || !OPEN_FOR_CLASS.has(classState.status)) return null;

  const students = (Array.isArray(roster) ? roster : [])
    // Only a student with an extended-time entitlement can have a later close;
    // everyone else is the class's window by definition.
    .filter((student) => dolExtendedTimeMultiplier(student?.profile || null, { nowValue: nowMs }) > 1)
    .map((student) => {
      const state = getDOLState({ assignment, schedule, ...context, nowValue: nowMs, studentProfile: student.profile });
      if (state.status !== 'active') return null;
      return {
        studentId: String(student.id || student.studentId || ''),
        name: String(student.displayName || student.name || student.id || student.studentId || ''),
        endsAt: state.endsAt,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.endsAt.getTime() - right.endsAt.getTime());
  if (!students.length) return null;
  const endsAt = students[students.length - 1].endsAt;
  return {
    classEndsAt: classState.endsAt,
    endsAt,
    millisecondsRemaining: Math.max(0, endsAt.getTime() - nowMs),
    students,
  };
};
