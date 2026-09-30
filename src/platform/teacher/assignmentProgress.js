/*
 * ONE ASSIGNMENT, ONE CLASS: WHO HAS DONE WHAT.
 *
 * Two honest pictures, never blended:
 *
 *   live   from presence heartbeats — who is working on THIS assignment right
 *          now, who is stuck, who is on something else, who is not signed in.
 *          Always available; it is what a teacher needs in the next 30 seconds.
 *
 *   grades from the canonical grade projection (the same numbers the
 *          gradebook, the student Grade Center and Grade Export use). Only
 *          available where full grade records are loaded; screens that run in
 *          the lightweight live roster say so rather than showing zeros.
 *
 * Nothing here computes a new grade. "Below 70%" uses the gradebook's own
 * green/black threshold; "not started" is the grade split's own shape.
 */
import { assignmentGradeOverrideFor, canonicalPresentedAssignmentGrade, projectTeacherOverridesForDisplay } from '../grading/canonicalGradeProjection.js';
import { GRADE_SHAPE, splitGrade } from './gradeEvidence.js';
import { classifyLiveStudent, LIVE_ACTIVITY, LIVE_FLAGS } from '../../livePresence.js';

export const PROGRESS_STATE = Object.freeze({
  NOT_STARTED: 'notStarted',
  IN_PROGRESS: 'inProgress',
  COMPLETE: 'complete',
});

export const PASSING_DISPLAY_THRESHOLD = 70;

/** One student's standing on one assignment, from their full grade record. */
export const studentAssignmentProgress = ({ student, assignment }) => {
  const override = assignmentGradeOverrideFor(student, assignment?.id);
  const tracker = projectTeacherOverridesForDisplay(
    student?.gradesByAssignment || {},
    student?.teacherGradeOverridesByAssignment || {},
  )?.[assignment?.id] || null;
  const split = splitGrade({ tracker, assignment });
  const score = canonicalPresentedAssignmentGrade({ student, assignment });
  let state = PROGRESS_STATE.IN_PROGRESS;
  if (override || split.shape === GRADE_SHAPE.COMPLETE || split.shape === GRADE_SHAPE.EXCUSED) state = PROGRESS_STATE.COMPLETE;
  else if (!tracker || split.shape === GRADE_SHAPE.NOT_STARTED) state = PROGRESS_STATE.NOT_STARTED;
  return {
    state,
    score: score === undefined ? null : score,
    attempted: split.attempted || 0,
    total: split.total || 0,
    teacherOverride: Boolean(override),
  };
};

const byName = (left, right) => String(left.name).localeCompare(String(right.name), undefined, { sensitivity: 'base' });

/**
 * Grade progress for a roster. Returns null when the roster rows are not full
 * grade records (the lightweight live roster carries no grades), so callers can
 * say "open Grades for scores" instead of reporting a class of zeros.
 */
export const classGradeProgress = ({ assignment, roster = [], hasGradeRecords = true, nameOf = (student) => student?.displayName || student?.id }) => {
  if (!assignment || !hasGradeRecords) return null;
  const rows = roster.map((student) => ({ student, id: student.id, name: nameOf(student), ...studentAssignmentProgress({ student, assignment }) }));
  const scored = rows.filter((row) => row.score !== null && row.state !== PROGRESS_STATE.NOT_STARTED);
  const pick = (predicate) => rows.filter(predicate).sort(byName);
  return {
    total: rows.length,
    notStarted: pick((row) => row.state === PROGRESS_STATE.NOT_STARTED),
    inProgress: pick((row) => row.state === PROGRESS_STATE.IN_PROGRESS),
    complete: pick((row) => row.state === PROGRESS_STATE.COMPLETE),
    belowThreshold: pick((row) => row.score !== null && row.state !== PROGRESS_STATE.NOT_STARTED && row.score < PASSING_DISPLAY_THRESHOLD),
    average: scored.length ? Math.round(scored.reduce((sum, row) => sum + Number(row.score || 0), 0) / scored.length) : null,
    rows,
  };
};

/** Live picture for one assignment in one class, from presence. */
export const classLiveProgress = ({ assignment, roster = [], presenceById = {}, nowValue = Date.now(), nameOf = (student) => student?.displayName || student?.id }) => {
  const now = nowValue instanceof Date ? nowValue.getTime() : Number(nowValue);
  const rows = roster.map((student) => {
    const live = presenceById?.[student.id] || null;
    const classified = classifyLiveStudent({ ...student, liveStatus: live }, { nowValue: now });
    const online = Boolean(classified.isOnline && live?.assignmentId);
    const here = online && String(live.assignmentId) === String(assignment?.id);
    return {
      id: student.id,
      name: nameOf(student),
      here,
      elsewhere: online && !here,
      stuck: here && classified.flags.includes(LIVE_FLAGS.STUCK),
      activity: classified.activityState,
      question: here ? Number(live.sectionQuestionIndex ?? live.questionIndex ?? 0) + 1 : null,
      role: here ? String(live.activityRole || '') : null,
      headline: classified.headline,
    };
  });
  const pick = (predicate) => rows.filter(predicate).sort(byName);
  return {
    total: rows.length,
    workingHere: pick((row) => row.here && row.activity !== LIVE_ACTIVITY.AWAY),
    stuck: pick((row) => row.stuck),
    away: pick((row) => row.here && row.activity === LIVE_ACTIVITY.AWAY),
    elsewhere: pick((row) => row.elsewhere),
    notConnected: pick((row) => !row.here && !row.elsewhere),
    rows,
  };
};
