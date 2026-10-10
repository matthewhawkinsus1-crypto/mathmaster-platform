// One student's week, built by the REAL dashboard and Grade Center models, for
// the Assignments Center "Today" tests and the result-page Up next tests (and
// the browser harness tests/browser/studentResultUpNext.mjs, which mounts the
// same fixture so the screens are measured on numbers the product produces).
//
// Every case the one "Today" rule distinguishes is here once:
//   actionable      started, next unfinished question is index 1
//   past-due        late, not started — still open and still counts
//   due-today       open, not started
//   locked-practice Classwork done, Practice locked by the teacher (waiting)
//   waiting-dol     Classwork done, DOL opens later today (waiting)
//   recovery        Classwork done, DOL closed with a Recovery ready now
//   upcoming-later  open, not started, due next week
//   closed          past the final deadline, partly done
//   excused         excused for this student
//   finished        every question done
//
// The array is deliberately NOT in due-date order so a sort is what puts it
// in order.

import { buildStudentDashboardModel, resolveUpNext } from '../../../src/studentDashboardModel.js';
import { buildStudentGradeCenter, findGradeCenterEntry } from '../../../src/platform/student/studentGradeCenterModel.js';
import {
  assignmentIsForStudent, getAssignmentLifecycle, getDOLState, getWarmupState, getIncludedQuestionIndices,
  getSectionAccessState, prerequisiteAccess, questionIsIncluded,
} from '../../../src/assignmentLifecycle.js';
import { normalizeQuestionRecord } from '../../../src/attemptPolicy.js';
import { matchesSmartView } from '../../../src/assignmentSmartViews.js';

export const CLASS_ID = 'class-1';
export const STUDENT_ID = 's1';
export const NOW = Date.parse('2026-10-26T15:00:00Z');
export const inHours = (hours) => new Date(NOW + hours * 3600e3).toISOString();
// The DOL of 'waiting-dol' opens later the same school day.
export const DOL_OPENS_AT = new Date(NOW + 5.25 * 3600e3);

const q = (prompt, role) => ({ type: 'algebra', prompt, equationLatex: 'x=1', activityRole: role });
const classwork = (n = 1) => ({ id: 'classwork', role: 'classwork', questions: Array.from({ length: n }, (_, i) => q(`CW${i + 1}`, 'classwork')) });
const practice = (n = 2) => ({ id: 'practice', role: 'practice', questions: Array.from({ length: n }, (_, i) => q(`P${i + 1}`, 'practice')) });
const dol = () => ({ id: 'dol', role: 'dol', questions: [q('D1', 'dol')] });

const lesson = (id, title, overrides = {}) => ({
  schemaVersion: 5,
  id,
  title,
  assignedClassIds: [CLASS_ID],
  dueAt: inHours(4),
  lateDueAt: inHours(24 * 7),
  sections: [classwork(), practice()],
  ...overrides,
});

export const ASSIGNMENTS = [
  lesson('upcoming-later', 'Quadratics Investigation', { dueAt: inHours(24 * 6), lateDueAt: inHours(24 * 9) }),
  lesson('finished', 'Exponent Rules', { dueAt: inHours(-24 * 2), lateDueAt: inHours(24 * 3), sections: [practice()] }),
  lesson('waiting-dol', 'Slope from Two Points', { dueAt: inHours(24 * 3), lateDueAt: inHours(24 * 8), sections: [classwork(), dol()] }),
  lesson('actionable', 'Systems of Equations', { sections: [classwork(2), practice()] }),
  lesson('closed', 'Functions & Domain/Range', { dueAt: inHours(-24 * 20), lateDueAt: inHours(-24 * 14) }),
  lesson('locked-practice', 'Solving Inequalities', {
    dueAt: inHours(24 * 2), lateDueAt: inHours(24 * 7),
    sectionAccess: { practice: { defaultState: 'closed' } },
  }),
  lesson('excused', 'Unit 2 Review', {
    dueAt: inHours(-24), lateDueAt: inHours(24 * 5),
    studentOverrides: { [STUDENT_ID]: { excused: true } },
  }),
  lesson('recovery', 'Graphing Lines', { dueAt: inHours(24 * 4), lateDueAt: inHours(24 * 8), sections: [classwork(), dol()] }),
  lesson('past-due', 'Linear Functions', { dueAt: inHours(-24), lateDueAt: inHours(24 * 5) }),
  lesson('due-today', 'Order of Operations', { dueAt: inHours(6), lateDueAt: inHours(24 * 5) }),
];

const correct = { status: 'correct', attemptCount: 1, totalAttempts: 1 };
const expired = { status: 'expired', attemptCount: 3, totalAttempts: 3, bestPartialCredit: 50 };

export const TRACKER = {
  actionable: { 0: correct },
  'locked-practice': { 0: correct },
  'waiting-dol': { 0: correct },
  recovery: { 0: correct },
  closed: { 0: correct, 1: expired },
  finished: { 0: correct, 1: expired },
};

// The DOL window is the only provider wrapped: a real class schedule is a lot
// of fixture for one fact ("the DOL opens at 2:15 PM today"), and App injects
// these same providers, so the dashboard sees exactly this shape in production.
const dolStateFor = (context) => {
  if (context?.assignment?.id === 'waiting-dol') return { enabled: true, status: 'waiting', opensAt: DOL_OPENS_AT, questionIndices: [1] };
  if (context?.assignment?.id === 'recovery') return { enabled: true, status: 'ended', questionIndices: [1] };
  return getDOLState(context);
};
// What buildStudentRecoverySummary would say for the student: the closed DOL
// of 'recovery' can be raised with a Recovery right now.
export const RECOVERY_STATES = { recovery: { dol: 'unlocked' } };

export const PROVIDERS = {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  prerequisiteAccess,
  calculateGrade: () => 0,
  getDOLState: dolStateFor,
  getWarmupState,
  getIncludedQuestionIndices,
  normalizeQuestionRecord,
  questionIsIncluded,
  assignmentHasHeldTeacherFeedback: () => false,
  matchesSmartView,
  getSectionAccessState,
};

export const buildScreens = ({ nowValue = NOW, assignments = ASSIGNMENTS, tracker = TRACKER } = {}) => {
  const dashboard = buildStudentDashboardModel({
    assignments, classId: CLASS_ID, classPeriod: 'Period 1', nowValue,
    tracker, studentId: STUDENT_ID, providers: PROVIDERS, recoveryStateByAssignment: RECOVERY_STATES,
  });
  const gradeCenter = buildStudentGradeCenter({
    assignments, classId: CLASS_ID, classPeriod: 'Period 1', studentId: STUDENT_ID,
    nowValue, tracker,
  });
  const todayEntryOf = (id) => dashboard.allEntries.find((entry) => entry.assignment.id === id) || null;
  const gradeEntryOf = (id) => findGradeCenterEntry(gradeCenter, id);
  const upNextAfter = (id) => resolveUpNext({ dashboard, assignmentId: id });
  return { dashboard, gradeCenter, todayEntryOf, gradeEntryOf, upNextAfter };
};
