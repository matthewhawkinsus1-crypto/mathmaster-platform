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
 * for them — their OWN dates: an extra-time accommodation
 * (withStudentSupportDates) and a private extension or reopen (the
 * override records of EVERY assigned class, read at release time,
 * feedbackReleaseControls.js) — and at least one of their required
 * teacher-release items (quiz/test) is not finished: correct, or out of
 * tries. Someone who has not started is still working. A student with no
 * records loaded counts as still working.
 *
 * WHAT COULD NOT BE CHECKED IS SAID, NEVER ASSUMED FINISHED. A class this
 * teacher does not teach (any teacher can assign to any class) has no roster
 * here; extension records that could not be read leave every class
 * unverified. Those are named; "every assigned student has finished" is said
 * only when every assigned class was checked.
 */
import {
  assignmentIsForStudent,
  getAssignmentLifecycle,
  studentRequiredQuestions,
} from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { getEffectiveActivityPolicy, resolveQuestionActivityRole } from '../../platform/policies/activityPolicies.js';
import { questionIsTerminal } from '../../platform/student/studentWorkState.js';
import { resolveStudentOverride, teacherAssignmentView } from '../../../functions/shared/studentAssignmentOverrides.mjs';
import { withStudentSupportDates } from '../../../functions/shared/supportDeadline.mjs';
import { formatStudentName } from '../../platform/studentName.js';

const releasePolicyIndices = (assignment) => {
  const questions = getStoredAssignmentQuestions(assignment);
  return questions
    .map((question, index) => ({ index, role: resolveQuestionActivityRole({ question, assignment }) }))
    .filter(({ role }) => getEffectiveActivityPolicy(role)?.feedback === 'teacherRelease')
    .map(({ index, role }) => ({ index, role, question: questions[index] }));
};

export const studentStillWorking = ({ assignment: sharedAssignment, student, nowValue = Date.now() }) => {
  if (!sharedAssignment || !student) return false;
  // The assignment as THIS student has it: their extra-time dates applied.
  const assignment = withStudentSupportDates(sharedAssignment, student.id, student.profile || null);
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

const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Everything the release confirm needs.
 *
 *   privateRecords  student id -> override record for EVERY assigned class,
 *                   read at release time; null when that read failed
 *   students        the teacher's roster (their own classes only)
 *   classes         the teacher's classes
 */
export const releaseHoldReport = ({ assignment, privateRecords = null, students = [], classes = [], nowValue = Date.now() }) => {
  const withControls = privateRecords ? teacherAssignmentView(assignment, privateRecords) : assignment;
  const assignedClassIds = [...new Set(list(assignment?.assignedClassIds).map((id) => String(id || '').trim()).filter(Boolean))];
  const myClassIds = new Set(list(classes).map((entry) => entry.classId).filter(Boolean));
  const unchecked = [];
  assignedClassIds.filter((classId) => !myClassIds.has(classId)).forEach((classId) => {
    unchecked.push({ classId, label: classId, reason: 'not one of your classes, so its students could not be checked' });
  });
  if (!privateRecords) {
    assignedClassIds.filter((classId) => myClassIds.has(classId)).forEach((classId) => {
      const record = list(classes).find((entry) => entry.classId === classId);
      unchecked.push({ classId, label: record?.name || classId, reason: 'extensions and extra time could not be read' });
    });
  }
  const stillWorking = studentsStillWorkingByClass({ assignment: withControls, students, classes, nowValue });
  return { stillWorking, unchecked };
};

/** The confirm's text: what releasing does, who has not finished by class, and what could not be checked. */
export const describeFeedbackRelease = ({ title = 'this assignment', stillWorking = [], unchecked = [] }) => {
  const total = stillWorking.reduce((sum, group) => sum + group.students.length, 0);
  const uncheckedLines = list(unchecked).map((entry) => `${entry.label}: ${entry.reason}`);
  if (!total && !uncheckedLines.length) {
    return {
      title: `Release feedback for “${title}”?`,
      message: 'Every assigned student has finished. Students will immediately see Quiz/Test correctness, worked solutions and recorded grades. This cannot make already-viewed feedback private again.',
      confirmLabel: 'Release Feedback',
      stillWorkingCount: 0,
    };
  }
  if (!total) {
    return {
      title: `Not every class could be checked for “${title}”`,
      message: [
        'Releasing shows worked solutions to every student who has finished — in every class this is assigned to.',
        '',
        'Not checked:',
        ...uncheckedLines,
        '',
        'Release only if you know those students have finished. This cannot make already-viewed feedback private again.',
      ].join('\n'),
      confirmLabel: 'Release anyway',
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
      ...(uncheckedLines.length ? ['', 'Not checked:', ...uncheckedLines] : []),
      '',
      'Release only if you are sure. This cannot make already-viewed feedback private again.',
    ].join('\n'),
    confirmLabel: 'Release anyway',
    stillWorkingCount: total,
  };
};
