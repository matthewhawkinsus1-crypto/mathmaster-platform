import { classIdsForTeacher, studentsInClass } from '../../../functions/shared/classModel.mjs';

/** Classes this actor may turn into operational SIS transfer units. */
export const authorizedGradeTransferClasses = ({ classes = [], teacherEmail = '', isRootAdmin = false } = {}) => {
  const active = (classes || []).filter((entry) => entry?.status !== 'archived' && entry?.classId);
  if (isRootAdmin) return active;
  const allowed = new Set(classIdsForTeacher(active, teacherEmail));
  return active.filter((entry) => allowed.has(entry.classId));
};

/**
 * Grade transfer fails closed on membership. studentsInClass remains the one
 * roster resolver, while the final classId check intentionally disables its
 * legacy period-only compatibility branch for this SIS-writing workflow.
 */
export const gradeTransferRoster = ({ students = [], classes = [], classId }) => (
  studentsInClass({ students, classes, classId })
    .filter((student) => Boolean(student?.classId) && student.classId === classId)
);
