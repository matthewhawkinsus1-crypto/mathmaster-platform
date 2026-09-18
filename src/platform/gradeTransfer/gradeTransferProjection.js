import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { canonicalPresentedAssignmentGrade } from '../grading/canonicalGradeProjection.js';
import { resolveStudentFinalDeadlineFromAssignment } from './studentDeadlineResolver.js';
import { authorizedGradeTransferClasses, gradeTransferRoster } from './gradeTransferScope.js';
import { buildTransferUnit } from './gradeTransferModel.js';

const snapshotTime = (value) => typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value || 0).getTime();
const newestFirst = (left, right) => snapshotTime(right.createdAt) - snapshotTime(left.createdAt);

/** One projection shared by Grade Transfer and the Action Center. */
export const projectGradeTransferUnits = ({
  classes = [], assignments = [], students = [], teacherEmail = '', isRootAdmin = false,
  snapshots = [], practicePasses = new Set(), resolveStudentFinalDeadline = resolveStudentFinalDeadlineFromAssignment,
} = {}) => {
  const authorizedClasses = authorizedGradeTransferClasses({ classes, teacherEmail, isRootAdmin });
  const units = authorizedClasses.flatMap((classRecord) => assignments
    .filter((assignment) => assignmentIsForStudent(assignment, { classId: classRecord.classId, classPeriod: classRecord.period }))
    .map((assignment) => {
      const eligible = gradeTransferRoster({ students, classes: authorizedClasses, classId: classRecord.classId });
      const history = snapshots.filter((item) => item.classId === classRecord.classId && item.assignmentId === assignment.id).sort(newestFirst);
      return buildTransferUnit({
        classRecord, assignment, students: eligible,
        projectCanonicalGrade: canonicalPresentedAssignmentGrade,
        hasAuthoritativePracticePass: ({ student }) => practicePasses.has(`${student.id}__${classRecord.classId}__${assignment.id}`),
        resolveStudentFinalDeadline,
        confirmedSnapshots: history.filter((item) => item.uploadConfirmedAt), latestExport: history[0],
      });
    }));
  return { authorizedClasses, authorizedClassIds: authorizedClasses.map((entry) => entry.classId), units };
};

export { newestFirst };
