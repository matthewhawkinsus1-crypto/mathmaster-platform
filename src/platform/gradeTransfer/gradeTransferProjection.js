import { assignmentIsForStudent } from '../../assignmentLifecycle.js';
import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { projectCurrentAssignmentContent } from '../assignments/currentContentProjection.js';
import { canonicalPresentedAssignmentGrade, canonicalPresentedSectionGrade } from '../grading/canonicalGradeProjection.js';
import { SECTION_GRADE_KEYS } from '../teacher/gradeEvidence.js';
import { resolveStudentFinalDeadlineFromAssignment } from './studentDeadlineResolver.js';
import { authorizedGradeTransferClasses, gradeTransferRoster } from './gradeTransferScope.js';
import { buildTransferUnit, SECTION_TRANSFER_LABELS, TRANSFER_STATE } from './gradeTransferModel.js';

const snapshotTime = (value) => typeof value?.toMillis === 'function' ? value.toMillis() : new Date(value || 0).getTime();
const newestFirst = (left, right) => snapshotTime(right.createdAt) - snapshotTime(left.createdAt);

const lessonSectionKeys = (assignment) => {
  if (isTestCycleAssignment(assignment)) return [];
  const roles = new Set(
    projectCurrentAssignmentContent(assignment).entries
      .map((entry) => entry.logicalRole)
      .filter(Boolean),
  );

  // Only split a pure lesson assignment into Warm-Up/Classwork/Practice/DOL.
  // If a supported V5 assignment mixes in an assessment role (for example
  // quiz/test), keep the established whole-assignment export so no evidence
  // is silently dropped from the TEAMS package.
  if ([...roles].some((role) => !SECTION_GRADE_KEYS.includes(role))) return [];

  return SECTION_GRADE_KEYS.filter((key) => roles.has(key));
};

const dedupePeople = (rows = []) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.studentId || ''}|${row.reason || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const aggregateSectionState = (sectionUnits) => {
  const states = new Set(sectionUnits.map((unit) => unit.state));
  if (states.has(TRANSFER_STATE.ROSTER_ID_PROBLEM)) return TRANSFER_STATE.ROSTER_ID_PROBLEM;
  if (states.has(TRANSFER_STATE.REVIEW_REQUIRED)) return TRANSFER_STATE.REVIEW_REQUIRED;
  if (states.has(TRANSFER_STATE.UPDATE_REQUIRED)) return TRANSFER_STATE.UPDATE_REQUIRED;
  if (states.has(TRANSFER_STATE.EXPORTED)) return TRANSFER_STATE.EXPORTED;
  if (states.has(TRANSFER_STATE.READY_TO_EXPORT)) return TRANSFER_STATE.READY_TO_EXPORT;
  if (states.has(TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS)) return TRANSFER_STATE.WAITING_ON_EXTENDED_STUDENTS;
  if (sectionUnits.every((unit) => [TRANSFER_STATE.UPLOAD_CONFIRMED, TRANSFER_STATE.NO_TRANSFER_REQUIRED].includes(unit.state))) {
    return TRANSFER_STATE.UPLOAD_CONFIRMED;
  }
  return TRANSFER_STATE.WAITING_FOR_FINALIZATION;
};

const aggregateSectionUnits = (sectionUnits) => {
  const first = sectionUnits[0];
  const rows = sectionUnits.flatMap((unit) => unit.rows || []);
  const withheld = dedupePeople(sectionUnits.flatMap((unit) => unit.withheld || []));
  const problems = dedupePeople(sectionUnits.flatMap((unit) => unit.problems || []));
  const excused = dedupePeople(sectionUnits.flatMap((unit) => unit.excused || []));
  return {
    ...first,
    key: first.assignmentKey,
    sectionKey: '',
    sectionLabel: '',
    sectionUnits,
    sectionCount: sectionUnits.length,
    state: aggregateSectionState(sectionUnits),
    rows,
    withheld,
    problems,
    excused,
    exportKind: sectionUnits.some((unit) => unit.exportKind === 'delta') ? 'delta' : 'initial',
    finalizedCount: Math.max(0, ...sectionUnits.map((unit) => Number(unit.finalizedCount) || 0)),
    extensionCount: withheld.length,
    changedCount: sectionUnits.reduce((sum, unit) => sum + (Number(unit.changedCount) || 0), 0),
  };
};

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
      const sectionKeys = lessonSectionKeys(assignment);
      if (!sectionKeys.length) {
        const history = snapshots
          .filter((item) => item.classId === classRecord.classId && item.assignmentId === assignment.id && !item.sectionKey)
          .sort(newestFirst);
        return buildTransferUnit({
          classRecord,
          assignment,
          students: eligible,
          projectCanonicalGrade: canonicalPresentedAssignmentGrade,
          hasAuthoritativePracticePass: ({ student }) => practicePasses.has(`${student.id}__${classRecord.classId}__${assignment.id}`),
          resolveStudentFinalDeadline,
          confirmedSnapshots: history.filter((item) => item.uploadConfirmedAt),
          latestExport: history[0],
        });
      }

      const sectionUnits = sectionKeys.map((sectionKey) => {
        const history = snapshots
          .filter((item) => item.classId === classRecord.classId
            && item.assignmentId === assignment.id
            && item.sectionKey === sectionKey)
          .sort(newestFirst);
        return buildTransferUnit({
          classRecord,
          assignment,
          students: eligible,
          sectionKey,
          sectionLabel: SECTION_TRANSFER_LABELS[sectionKey],
          projectCanonicalGrade: (args) => canonicalPresentedSectionGrade({ ...args, sectionKey }),
          hasAuthoritativePracticePass: ({ student }) => practicePasses.has(`${student.id}__${classRecord.classId}__${assignment.id}`),
          resolveStudentFinalDeadline,
          confirmedSnapshots: history.filter((item) => item.uploadConfirmedAt),
          latestExport: history[0],
        });
      });

      return aggregateSectionUnits(sectionUnits);
    }));
  return { authorizedClasses, authorizedClassIds: authorizedClasses.map((entry) => entry.classId), units };
};

export { newestFirst };
