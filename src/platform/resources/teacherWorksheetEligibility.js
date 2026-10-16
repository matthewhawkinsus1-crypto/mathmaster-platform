import { assignmentIsForStudent, getSectionVariantMode } from '../../assignmentLifecycle.js';
import { prepareAssignmentForRuntime } from '../contract/storedAssignmentV5.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';

/*
 * WHO A TEACHER'S WORKSHEET CAN BE FOR, decided before any PDF is built.
 *
 * App needs these the moment the export dialog opens; the worksheet builder
 * (teacherAssignmentWorksheetExport.js) loads with the PDF (pdfLoaders.js).
 */

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
