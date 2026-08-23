import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import { buildStudentMasteryProfile, collectStudentEvidence } from '../masteryEngine.js';
import { toDisplayCode } from '../utils/teksUtils.js';
// The pure legacy->Phase 5 conversion lives outside this module so that callers
// which only need the transformation do not pull a Firestore client in with it.
// Re-exported because existing importers reach for it here.
import { adaptLegacyMasteryToPhase5, retentionSignal } from '../platform/profile/legacyMasteryAdapter.js';

export { adaptLegacyMasteryToPhase5 };

const mergeProfile = (fallback = {}, server = {}, schedule = {}) => ({
  ...fallback,
  ...server,
  mastery: { ...(fallback.mastery || {}), ...(server.mastery || {}) },
  dimensions: { ...(fallback.dimensions || {}), ...(server.dimensions || {}) },
  recommendation: { ...(fallback.recommendation || {}), ...(server.recommendation || {}) },
  signals: {
    ...(fallback.signals || {}),
    ...(server.signals || {}),
    retention: retentionSignal(schedule),
  },
});

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
  const legacyProfile = buildStudentMasteryProfile({ student, assignments });
  const evidenceRows = collectStudentEvidence({ student, assignments });
  const fallbackProfiles = adaptLegacyMasteryToPhase5({ legacyProfile, evidenceRows, retentionSchedulesByTEKS });
  const serverProfiles = serverMasterySnapshot.exists() ? serverMasterySnapshot.data()?.profiles || {} : {};
  const allCodes = new Set([...Object.keys(fallbackProfiles), ...Object.keys(serverProfiles)].map(toDisplayCode));
  const masteryProfilesByTEKS = {};
  allCodes.forEach((code) => {
    masteryProfilesByTEKS[code] = mergeProfile(
      fallbackProfiles[code],
      serverProfiles[code] || serverProfiles[`texas:${code}`],
      retentionSchedulesByTEKS[code] || retentionSchedulesByTEKS[`texas:${code}`],
    );
  });

  return { masteryProfilesByTEKS, retentionSchedulesByTEKS };
};
