import { generateQuestion } from '../../problemGenerator.js';
import { normalizeQuestionRecord } from '../../attemptPolicy.js';
import {
  assignmentIsForStudent,
  getSectionVariantMode,
} from '../../assignmentLifecycle.js';
import {
  getStoredAssignmentQuestions,
  prepareAssignmentForRuntime,
} from '../contract/storedAssignmentV5.js';
import { resolveDeliveredQuestionMetadata } from '../assignments/assignmentAdaptation.js';
import { normalizeContextualQuestion } from '../context/wordProblemLayer.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { buildAssignmentWorksheetModel, PRINT_OUTPUT_MODES } from './assignmentWorksheetPdfModel.js';

const activityTitleForRole = (role) => ({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  dol: 'DOL',
  practice: 'Practice',
  quiz: 'Quiz',
  test: 'Unit Test',
}[role] || 'Activity');

const displayNameFor = (student) => {
  if (!student) return '';
  const direct = String(student.displayName || student.name || '').trim();
  if (direct) return direct;
  return [student.firstName, student.lastName].map((value) => String(value || '').trim()).filter(Boolean).join(' ')
    || String(student.id || '').trim();
};

const assignmentHasAudience = (assignment = {}) => (
  (Array.isArray(assignment.assignedClassIds) && assignment.assignedClassIds.length > 0)
  || (Array.isArray(assignment.assignedClassPeriods) && assignment.assignedClassPeriods.length > 0)
);

export const assignmentNeedsStudentForWorksheet = (assignment = {}) => {
  const runtimeAssignment = prepareAssignmentForRuntime(assignment, { source: 'teacherWorksheetAudience' }).assignment;
  return projectCurrentAssignmentContent(runtimeAssignment).entries.some((entry) => (
    getSectionVariantMode(runtimeAssignment, entry.logicalRole) !== 'shared'
  ));
};

export const eligibleStudentsForTeacherWorksheet = (assignment = {}, students = []) => {
  const roster = Array.isArray(students) ? students.filter(Boolean) : [];
  if (!assignmentHasAudience(assignment)) return roster;
  return roster.filter((student) => assignmentIsForStudent(assignment, {
    classId: student?.classId || null,
    classPeriod: student?.classPeriod || null,
  }));
};

export const buildTeacherAssignmentWorksheetModel = ({
  assignment = {},
  student = null,
  learningProfile = null,
  studentProfile = null,
  outputMode = PRINT_OUTPUT_MODES.STUDENT,
} = {}) => {
  const runtimeRepair = prepareAssignmentForRuntime(assignment, { source: 'teacherWorksheet' });
  const runtimeAssignment = runtimeRepair.assignment;
  const questions = getStoredAssignmentQuestions(runtimeAssignment);
  if (!questions.length) throw new Error('This assignment does not contain printable questions.');

  const needsStudent = assignmentNeedsStudentForWorksheet(runtimeAssignment);
  if (needsStudent && !student?.id) {
    const error = new Error('Choose a student to export the exact personalized worksheet version.');
    error.code = 'student-required';
    throw error;
  }

  const printableEntries = [];
  const resolvedProfile = studentProfile || student?.profile || null;
  const honors = String(
    resolvedProfile?.courseLevel
      || student?.courseLevel
      || student?.profile?.courseLevel
      || '',
  ).toLowerCase() === 'honors';
  const assignmentTracker = student?.gradesByAssignment?.[runtimeAssignment.id] || {};

  for (const entry of projectCurrentAssignmentContent(runtimeAssignment).entries) {
    const index = entry.storageIndex;
    const question = questions[index];
    if (!question) continue;

    const sectionRole = entry.logicalRole;
    const sectionVariantMode = getSectionVariantMode(runtimeAssignment, sectionRole);
    const generationStudentKey = sectionVariantMode === 'shared'
      ? `shared-version:${runtimeAssignment.id}:${sectionRole}`
      : student.id;
    const record = normalizeQuestionRecord(assignmentTracker?.[index]);
    const adaptation = resolveDeliveredQuestionMetadata({
      question,
      learningProfile,
      activityRole: sectionRole,
      variationMode: sectionVariantMode,
      honors,
    });
    const generationKey = `${runtimeAssignment.id}|${generationStudentKey}|${index}|variant:${record.variantIndex}`;
    const resolvedQuestion = normalizeContextualQuestion(generateQuestion(
      question,
      generationKey,
      resolvedProfile,
      adaptation,
    ));

    printableEntries.push({
      sourceIndex: index,
      available: true,
      sectionRole,
      sectionLabel: activityTitleForRole(sectionRole),
      question: resolvedQuestion,
    });
  }

  return buildAssignmentWorksheetModel({
    assignment: runtimeAssignment,
    student: student
      ? { displayName: displayNameFor(student), classPeriod: student.classPeriod || '' }
      : { displayName: '', classPeriod: '' },
    entries: printableEntries,
    outputMode,
  });
};
