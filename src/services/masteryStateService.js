import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import { buildStudentMasteryProfile, collectStudentEvidence } from '../masteryEngine.js';
import { toDisplayCode } from '../utils/teksUtils.js';

const phase5StatusForLegacyLevel = (levelKey) => ({
  masters: 'Mastered',
  meets: 'Secure',
  approaches: 'Developing',
  didNotMeet: 'Needs Attention',
  insufficient: 'Not Enough Evidence',
}[levelKey] || 'Not Enough Evidence');

const retentionSignal = (schedule = {}) => {
  if (schedule.status === 'confirmedLoss') return 'confirmedLoss';
  if (['concern', 'overdue'].includes(schedule.status)) return 'concern';
  return 'stable';
};

export const adaptLegacyMasteryToPhase5 = ({ legacyProfile = {}, evidenceRows = [], retentionSchedulesByTEKS = {} } = {}) => {
  const result = {};
  Object.entries(legacyProfile.teks || {}).forEach(([rawCode, summary]) => {
    const code = toDisplayCode(rawCode);
    const rows = evidenceRows.filter((row) => toDisplayCode(row.teks) === code);
    const independentSuccesses = rows
      .filter((row) => row.eventuallyCorrect && row.isMathematicallyIndependent)
      .map((row) => row.lastAttemptAt)
      .filter(Boolean)
      .map((value) => Date.parse(value))
      .filter(Number.isFinite);
    const schedule = retentionSchedulesByTEKS[code] || retentionSchedulesByTEKS[rawCode] || {};
    result[code] = {
      teksCode: code,
      mastery: {
        estimate: Number.isFinite(Number(summary.score)) ? Math.round(Number(summary.score)) : null,
        status: phase5StatusForLegacyLevel(summary.performance?.key),
        confidence: summary.confidence || 'Low',
        observedPerformance: Number.isFinite(Number(summary.eventualCorrectRate))
          ? Math.round(Number(summary.eventualCorrectRate))
          : null,
      },
      signals: {
        retention: retentionSignal(schedule),
        breadth: (summary.dokLevels || []).length >= 2 ? 'broad' : 'developing',
      },
      dimensions: {
        eligibleGradeLevelEvents: Number(summary.itemCount) || 0,
        dokRepresented: summary.dokLevels || [],
        familiesRepresented: [...new Set(rows.map((row) => row.questionType).filter(Boolean))],
        lastIndependentSuccessAt: independentSuccesses.length ? Math.max(...independentSuccesses) : null,
      },
      recommendation: {
        reason: summary.performance?.ceilingReason
          || (summary.performance?.key === 'didNotMeet'
            ? 'Rebuild this skill with targeted grade-level support.'
            : 'Continue building independent accuracy and breadth.'),
      },
    };
  });
  return result;
};

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
