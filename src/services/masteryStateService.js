import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import { buildUnifiedMasteryProfiles } from '../platform/mastery/unifiedMastery.js';
// The pure legacy->Phase 5 conversion lives outside this module so that callers
// which only need the transformation do not pull a Firestore client in with it.
// Re-exported because existing importers reach for it here.
import { adaptLegacyMasteryToPhase5 } from '../platform/profile/legacyMasteryAdapter.js';

export { adaptLegacyMasteryToPhase5 };

export const fetchStudentMasteryState = async (studentId, { assignments: suppliedAssignments = null } = {}) => {
  if (!studentId) return { masteryProfilesByTEKS: {}, retentionSchedulesByTEKS: {} };

  const [gradeSnapshot, retentionSnapshot, serverMasterySnapshot, assignmentSnapshot] = await Promise.all([
    getDoc(doc(db, 'grades', String(studentId))),
    getDoc(doc(db, 'studentRetentionSchedules', String(studentId))),
    getDoc(doc(db, 'studentMasteryProfiles', String(studentId))),
    suppliedAssignments ? Promise.resolve(null) : getDocs(collection(db, 'assignments')),
  ]);

  const assignments = suppliedAssignments || assignmentSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const student = gradeSnapshot.exists() ? { id: String(studentId), ...gradeSnapshot.data() } : { id: String(studentId) };
  const retentionSchedulesByTEKS = retentionSnapshot.exists() ? retentionSnapshot.data()?.schedules || {} : {};
  const serverProfiles = serverMasterySnapshot.exists() ? serverMasterySnapshot.data()?.profiles || {} : {};
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
