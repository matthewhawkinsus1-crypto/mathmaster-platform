/*
 * WHO HAS NOT FINISHED A QUIZ OR TEST, BEFORE ITS FEEDBACK IS RELEASED.
 *
 * "Release Feedback to Students" is one flag for the whole assignment, in
 * every class it is assigned to. Since worked solutions show on every closed
 * quiz/test item once it is released (QuestionEngine's per-item gate:
 * closed AND released), releasing after period 1 shows period 1 the
 * solutions while period 3 has not taken it yet — answers one shared screen
 * away. The release therefore names everyone still working, grouped by class,
 * and needs an explicit confirm (the same rule as a Test Cycle's release,
 * #461).
 *
 * "Still working": assigned to them (their class), not excused, not closed
 * for them (their own deadline, extensions included), and at least one of
 * their required teacher-release items (quiz/test) is not finished — correct,
 * or out of tries. Someone who has not started is still working. Read from
 * what the teacher's Gradebook already loads (each student's
 * gradesByAssignment); a student with no records loaded counts as still
 * working, so the warning errs toward naming too many, never too few.
 */
import {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  studentRequiredQuestions,
} from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { getEffectiveActivityPolicy, resolveQuestionActivityRole } from '../../platform/policies/activityPolicies.js';
import { questionIsTerminal } from '../../platform/student/studentWorkState.js';
import { resolveStudentOverride } from '../../../functions/shared/studentAssignmentOverrides.mjs';
import { formatStudentName } from '../../platform/studentName.js';

const releasePolicyIndices = (assignment) => {
  const questions = getStoredAssignmentQuestions(assignment);
  return questions
    .map((question, index) => ({ index, role: resolveQuestionActivityRole({ question, assignment }) }))
    .filter(({ role }) => getEffectiveActivityPolicy(role)?.feedback === 'teacherRelease')
    .map(({ index, role }) => ({ index, role, question: questions[index] }));
};

export const studentStillWorking = ({ assignment, student, nowValue = Date.now() }) => {
  if (!assignment || !student) return false;
  if (!assignmentIsForStudent(assignment, { classId: student.classId || null, classPeriod: student.classPeriod })) return false;
  if (resolveStudentOverride({ assignment, studentId: student.id })?.excused === true) return false;
  const lifecycle = getAssignmentLifecycle(assignment, nowValue, { studentId: student.id });
  if (lifecycle.isClosed || lifecycle.isPracticeOnly) return false;
  const tracker = student.gradesByAssignment?.[assignment.id] || null;
  const required = new Set(studentRequiredQuestions({ assignment, profile: student.profile || null, tracker, nowValue }).indices);
  const items = releasePolicyIndices(assignment).filter(({ index }) => required.has(index));
  if (!items.length) return false;
  return items.some(({ index, role, question }) => !questionIsTerminal({
    record: tracker?.[index],
    role,
    question,
    assignment,
    classId: student.classId || null,
    studentId: student.id,
  }));
};

/**
 * The students still working, grouped by class in the classes' order:
 * [{ classId, label, students: [{ id, name }] }].
 */
export const studentsStillWorkingByClass = ({ assignment, students = [], classes = [], nowValue = Date.now() }) => {
  const groups = new Map();
  const labelFor = (student) => {
    const record = classes.find((entry) => entry.classId && entry.classId === student.classId)
      || classes.find((entry) => entry.period && entry.period === student.classPeriod)
      || null;
    return {
      key: record?.classId || student.classId || student.classPeriod || 'unassigned',
      label: record?.name || (student.classPeriod ? `Period ${student.classPeriod}` : 'No class'),
      order: record ? classes.indexOf(record) : classes.length,
    };
  };
  for (const student of students) {
    if (!studentStillWorking({ assignment, student, nowValue })) continue;
    const { key, label, order } = labelFor(student);
    if (!groups.has(key)) groups.set(key, { classId: key, label, order, students: [] });
    groups.get(key).students.push({ id: student.id, name: formatStudentName(student) });
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map(({ order, ...group }) => ({ ...group, students: group.students.sort((a, b) => a.name.localeCompare(b.name)) }));
};

const NAMES_PER_CLASS = 12;

/** The confirm's text: what releasing does, and who has not finished, by class. */
export const describeFeedbackRelease = ({ title = 'this assignment', stillWorking = [] }) => {
  const total = stillWorking.reduce((sum, group) => sum + group.students.length, 0);
  if (!total) {
    return {
      title: `Release feedback for “${title}”?`,
      message: 'Every assigned student has finished. Students will immediately see Quiz/Test correctness, worked solutions and recorded grades. This cannot make already-viewed feedback private again.',
      confirmLabel: 'Release Feedback',
      stillWorkingCount: 0,
    };
  }
  const lines = stillWorking.map((group) => {
    // Names read "Last, First" (the gradebook's order), so a semicolon separates them.
    const shown = group.students.slice(0, NAMES_PER_CLASS).map((student) => student.name).join('; ');
    const more = group.students.length > NAMES_PER_CLASS ? `; and ${group.students.length - NAMES_PER_CLASS} more` : '';
    return `${group.label} (${group.students.length}): ${shown}${more}`;
  });
  return {
    title: `${total} student${total === 1 ? ' has' : 's have'} not finished “${title}”`,
    message: [
      'Releasing now shows worked solutions to every student who has finished — in every class this is assigned to. Students who have not taken it yet could be shown the solutions by a classmate.',
      '',
      'Still working:',
      ...lines,
      '',
      'Release only if you are sure. This cannot make already-viewed feedback private again.',
    ].join('\n'),
    confirmLabel: 'Release anyway',
    stillWorkingCount: total,
  };
};
