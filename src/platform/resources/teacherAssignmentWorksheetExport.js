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
import { buildStudentFamilyContext } from '../generation/familyDelivery.js';
import { formatStudentLabel } from '../studentName.js';
import { studentOmittedIndices } from '../../../functions/shared/reducedWorkload.mjs';

const activityTitleForRole = (role) => ({
  warmup: 'Warm-Up',
  classwork: 'Classwork',
  dol: 'DOL',
  practice: 'Practice',
  quiz: 'Quiz',
  test: 'Unit Test',
}[role] || 'Activity');

// A personalized worksheet is one student's version, so it has to say whose:
// the resolved name ("First Last", googleName and legacy fields included), or
// "Name unavailable · ID 101410" — the id labelled as an id, never printed as
// though it were the student's name.
const displayNameFor = (student) => {
  if (!student) return '';
  return formatStudentLabel(student, { lastFirst: false });
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
  // This student's own items: a reduced-item-count accommodation omits some
  // (functions/shared/reducedWorkload.mjs), and the printed copy matches what
  // the student sees on screen. Empty for everyone else.
  const omitted = student?.id
    ? studentOmittedIndices({ assignment: runtimeAssignment, profile: resolvedProfile, tracker: assignmentTracker })
    : new Set();

  for (const entry of projectCurrentAssignmentContent(runtimeAssignment).entries) {
    const index = entry.storageIndex;
    const question = questions[index];
    if (!question) continue;
    if (omitted.has(index)) continue;

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
      // A family-backed question prints the instance this student was shown:
      // their canonical pin when they have answered, else their seat. This
      // device's own pins are never read — they belong to whoever uses it.
      buildStudentFamilyContext({
        assignment: runtimeAssignment,
        question,
        storageIndex: index,
        studentId: student?.id || null,
        classId: student?.classId || null,
        sectionMode: sectionVariantMode,
        record: assignmentTracker?.[index],
        store: null,
      }),
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
