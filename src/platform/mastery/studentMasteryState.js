import { buildUnifiedMasteryProfiles } from './unifiedMastery.js';

/*
 * ONE STUDENT'S MASTERY STATE, FROM THE ASSIGNMENTS THAT STUDENT MAY READ.
 *
 * This used to read the whole `assignments` collection whenever its caller had
 * no assignments to hand (`getDocs(collection(db, 'assignments'))`): every
 * class's lessons, with their answer keys, onto one student's device, and a
 * list the class-scoped read rule (firestore.rules, `assignments`) refuses
 * once `platformFlags/assignmentReadScope.studentListScoped` is on. D10
 * Phase 0, P0-1 (docs/handoffs/ANSWER_KEY_SERVER_SIDE_DESIGN.md §3).
 *
 * It now reads what the student's own app reads at sign-in
 * (studentAssignmentScope.js fetchStudentAssignments): their class's
 * assignments by the class query, and anything they have recorded work on (or
 * were added to on their own) by id. The mastery it shows does not change:
 * mastery is built from `gradesByAssignment` (masteryEngine.js
 * collectStudentEvidence), so an assignment with no recorded work adds
 * nothing, and every assignment with work is in the scoped set by id. The
 * scoped list is put in document-id order, the order the collection read
 * returned, so even an order-sensitive tie-break sees the same sequence.
 *
 * Pure: the Firestore reads are handed in (masteryStateService.js), so node can
 * prove the scope and the equality (tests/platform/studentMasteryStateScope.test.mjs).
 */

const byDocumentId = (a, b) => {
  const left = String(a?.id ?? '');
  const right = String(b?.id ?? '');
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

/** What the student-scoped assignment read is asked for: built from their own grade document. */
export const masteryAssignmentScope = (studentId, gradeData) => ({
  studentId: String(studentId),
  classId: gradeData?.classId || null,
  gradesByAssignment: gradeData?.gradesByAssignment && typeof gradeData.gradesByAssignment === 'object'
    ? gradeData.gradesByAssignment
    : {},
  testCycleGrades: gradeData?.testCycleGrades && typeof gradeData.testCycleGrades === 'object'
    ? gradeData.testCycleGrades
    : {},
});

/**
 * `reads` (each resolves to the document's data, or null when it is absent):
 *   grade(), retention(), serverMastery()  — the student's own documents;
 *   scopedAssignments(scope)               — the student-scoped assignment read,
 *                                            given masteryAssignmentScope(...).
 * `assignments`, when the caller already holds the student's assignments, is
 * used as is and nothing is read for them.
 */
export const loadStudentMasteryState = async (studentId, { assignments: suppliedAssignments = null, reads } = {}) => {
  if (!studentId) return { masteryProfilesByTEKS: {}, retentionSchedulesByTEKS: {} };

  const [gradeData, retentionData, serverMasteryData] = await Promise.all([
    reads.grade(),
    reads.retention(),
    reads.serverMastery(),
  ]);

  const assignments = suppliedAssignments
    || [...(await reads.scopedAssignments(masteryAssignmentScope(studentId, gradeData))) || []].sort(byDocumentId);
  const student = gradeData ? { id: String(studentId), ...gradeData } : { id: String(studentId) };
  const retentionSchedulesByTEKS = retentionData?.schedules || {};
  const serverProfiles = serverMasteryData?.profiles || {};
  // The same builder the Path map and Recommended read, so every screen agrees.
  const masteryProfilesByTEKS = buildUnifiedMasteryProfiles({ student, assignments, serverProfiles, retentionSchedulesByTEKS });

  return {
    masteryProfilesByTEKS,
    retentionSchedulesByTEKS,
    serverMasteryProfiles: serverProfiles,
    // What the fallback was built from, so a live server profile can be merged
    // over the same assignment evidence without fetching it again.
    fallbackInputs: { student, assignments },
  };
};
