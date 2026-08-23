// The legacy mastery profile, expressed in the Phase 5 per-TEKS contract.
//
// WHY THIS LIVES HERE AND NOT IN THE SERVICE. It is a pure transformation —
// legacy summary in, per-TEKS mastery record out — but it used to sit inside
// `masteryStateService.js`, which imports Firestore. That put a network client
// in the import graph of anything that wanted the conversion, so the teacher
// roster and the Path Simulator could not use it and instead showed a student
// with no course mastery and a permanently blank performance projection.
//
// Nothing here reads or writes anything. `masteryStateService` imports it and
// keeps doing the fetching, which is the only thing it should have owned.

import { toDisplayCode } from '../../utils/teksUtils.js';

const phase5StatusForLegacyLevel = (levelKey) => ({
  masters: 'Mastered',
  meets: 'Secure',
  approaches: 'Developing',
  didNotMeet: 'Needs Attention',
  insufficient: 'Not Enough Evidence',
}[levelKey] || 'Not Enough Evidence');

export const retentionSignal = (schedule = {}) => {
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
