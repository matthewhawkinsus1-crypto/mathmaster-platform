import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { fetchStudentAssignments, individuallyAssignedTestCycleIds } from '../platform/assignments/studentAssignmentScope.js';
import { loadStudentMasteryState } from '../platform/mastery/studentMasteryState.js';
// The pure legacy->Phase 5 conversion lives outside this module so that callers
// which only need the transformation do not pull a Firestore client in with it.
// Re-exported because existing importers reach for it here.
import { adaptLegacyMasteryToPhase5 } from '../platform/profile/legacyMasteryAdapter.js';

export { adaptLegacyMasteryToPhase5 };

const dataOrNull = async (reference) => {
  const snapshot = await getDoc(reference);
  return snapshot.exists() ? snapshot.data() : null;
};

/*
 * The Firestore side of loadStudentMasteryState (platform/mastery/
 * studentMasteryState.js). Without supplied assignments it reads the student's
 * own scoped set — the class query plus their work by id, exactly what the app
 * reads at sign-in — never the whole `assignments` collection (D10 P0-1).
 */
export const fetchStudentMasteryState = (studentId, { assignments = null } = {}) => loadStudentMasteryState(studentId, {
  assignments,
  reads: {
    grade: () => dataOrNull(doc(db, 'grades', String(studentId))),
    retention: () => dataOrNull(doc(db, 'studentRetentionSchedules', String(studentId))),
    serverMastery: () => dataOrNull(doc(db, 'studentMasteryProfiles', String(studentId))),
    scopedAssignments: ({ classId, gradesByAssignment, testCycleGrades }) => fetchStudentAssignments({
      db,
      studentId: String(studentId),
      classId,
      gradesByAssignment,
      individualAssignmentIds: individuallyAssignedTestCycleIds(testCycleGrades),
    }),
  },
});
