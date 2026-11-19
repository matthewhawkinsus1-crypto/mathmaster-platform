/*
 * A TEACHER'S PRINTABLE WORKSHEET FOR AN ASSIGNMENT.
 *
 * Moved verbatim from App.jsx, which calls this where the code was and passes what it reads by name. It runs no effects.
 */
import { useState } from 'react';
import { getStoredAssignmentQuestions } from '../../platform/contract/storedAssignmentV5.js';
import { compareStudentsByName, formatStudentLabel, formatStudentName } from '../../platform/studentName';
import { PRINT_OUTPUT_MODES } from '../../platform/resources/printOutputModes.js';
import { buildTeacherAssignmentWorksheetModel, downloadAssignmentWorksheetPdf } from '../../platform/resources/pdfLoaders.js';

export function useTeacherWorksheetExport({
  toastError, toastInfo, toastSuccess, user, allStudents, requireTeacherKit, setTeacherWorksheetDialog,
  teacherMasteryProfilesByStudentId, teacherLearningProfiles,
}) {
  const [teacherWorksheetBusy, setTeacherWorksheetBusy] = useState(false);

  const teacherWorksheetStudentsFor = (assignment) => (
    requireTeacherKit().eligibleStudentsForTeacherWorksheet(assignment, allStudents)
      .slice()
      .sort(compareStudentsByName)
  );

  const exportTeacherAssignmentWorksheetPdf = async (assignment, student = null, outputMode = PRINT_OUTPUT_MODES.STUDENT) => {
    if (user?.role !== 'teacher' || !getStoredAssignmentQuestions(assignment).length) return;
    setTeacherWorksheetBusy(true);
    try {
      const masteryProfile = student ? teacherMasteryProfilesByStudentId?.[student.id] || null : null;
      // No name on file prints a blank name line, never a placeholder or id.
      const selectedStudent = student
        ? { ...student, displayName: formatStudentName(student, { fallbackToNeutral: false }) }
        : null;
      const selectedStudentProfile = selectedStudent
        ? {
            ...(selectedStudent.profile || {}),
            courseLevel: selectedStudent.profile?.courseLevel || selectedStudent.courseLevel || null,
            adaptiveInstruction: masteryProfile?.adaptiveInstruction
              || selectedStudent.profile?.adaptiveInstruction,
          }
        : null;
      const model = await buildTeacherAssignmentWorksheetModel({
        assignment,
        student: selectedStudent,
        learningProfile: selectedStudent ? teacherLearningProfiles?.[selectedStudent.id] || null : null,
        studentProfile: selectedStudentProfile,
        outputMode,
      });
      const result = await downloadAssignmentWorksheetPdf({ model });
      const outputLabel = outputMode === PRINT_OUTPUT_MODES.TEACHER
        ? 'Teacher copy'
        : outputMode === PRINT_OUTPUT_MODES.ANSWER_KEY ? 'Answer key' : 'Student worksheet';
      toastSuccess(
        `${outputLabel} ready`,
        selectedStudent
          ? `${formatStudentLabel(student)} · ${result.pageCount} page${result.pageCount === 1 ? '' : 's'} exported.`
          : `${result.pageCount} page${result.pageCount === 1 ? '' : 's'} exported from the shared assignment version.`,
      );
      setTeacherWorksheetDialog(null);
    } catch (error) {
      console.error('Could not export teacher assignment PDF:', error);
      toastError('Could not export PDF', error?.message || 'MathMaster could not build the printable assignment.');
    } finally {
      setTeacherWorksheetBusy(false);
    }
  };

  const beginTeacherWorksheetExport = async (assignment) => {
    if (!getStoredAssignmentQuestions(assignment).length) {
      toastInfo('Nothing to export', 'This assignment does not currently contain printable questions.');
      return;
    }
    const requiresStudent = requireTeacherKit().assignmentNeedsStudentForWorksheet(assignment);
    const students = teacherWorksheetStudentsFor(assignment);
    if (requiresStudent && !students.length) {
      toastInfo(
        'Student version needed',
        'This assignment uses personalized or adaptive sections, but no roster student is available for its current audience. Assign it to a class or add a student first.',
      );
      return;
    }
    setTeacherWorksheetDialog({ assignmentId: assignment.id, requiresStudent });
  };
  return {
    teacherWorksheetBusy, teacherWorksheetStudentsFor, exportTeacherAssignmentWorksheetPdf,
    beginTeacherWorksheetExport,
  };
}
