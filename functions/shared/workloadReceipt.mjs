import { resolveStudentWorkload, formatPercentTenths, WORKLOAD_VARIANCE_LABEL } from './reducedWorkload.mjs';

/** Neutral, read-only facts from the exact resolver used by grading. No plan labels or source documents. */
export const buildWorkloadReceipt = ({ assignment, profile, tracker = null, baseIndices = null, practiceWaived = [], nowValue } = {}) => {
  const resolved = resolveStudentWorkload({ assignment, profile, tracker, baseIndices, practiceWaived, nowValue });
  if (!resolved.summary) return null;
  const summary = resolved.summary;
  const originalCount = summary.originalCount;
  const requiredCount = resolved.indices.length;
  const omittedCount = originalCount - requiredCount;
  const actualPercentTenths = originalCount ? Math.round(1000 * omittedCount / originalCount) : 0;
  const answered = (index) => {
    const record = tracker?.[index];
    const status = typeof record === 'string' ? record : record?.trackerStatusBeforeOverride ?? record?.status;
    return Boolean(status && status !== 'unattempted');
  };
  const completedCount = resolved.indices.filter(answered).length;
  const reasons = [...new Set(summary.variance || [])].map((code) => WORKLOAD_VARIANCE_LABEL[code] || 'This assignment needs a teacher review.');
  const text = resolved.status === 'manual'
    ? `${requiredCount} questions required. Your teacher recorded an individual workload; ask your teacher which questions are required. No automatic reduction is recorded here.`
    : `${requiredCount} of ${originalCount} questions required. ${omittedCount} questions not required (${formatPercentTenths(actualPercentTenths)} fewer). These do not affect your grade.`;
  return {
    originalCount, requiredCount, omittedCount, actualPercentTenths, completedCount,
    requiredIndices: resolved.indices, omittedIndices: resolved.omitted,
    targetPercent: summary.targetPercent, reasons, text,
    kind: summary.kind || 'workload', correctionEventId: summary.correctionEventId || null,
    correctedAt: summary.correctedAt || null,
    gradeCorrection: summary.kind === 'retroactive-grade-correction' ? { previousGrade: summary.previousGrade ?? null, approvedGrade: summary.appliedGrade ?? null } : null,
    progressText: `${completedCount} of ${requiredCount} required questions answered`,
    reviewNeeded: resolved.reviewNeeded === true,
  };
};

/** Teacher-mediated family handout, deliberately distinct from the confidential support report. */
export const familyWorkloadSummary = ({ assignment, receipt } = {}) => receipt
  ? `${String(assignment?.title || 'Assignment')}\nWorkload summary\n${receipt.text}\n${receipt.progressText}.${receipt.kind === 'retroactive-grade-correction' ? `\nRetroactive grade correction: these totals were approved later, not delivered on the original assignment date.\nApproved grade: ${receipt.gradeCorrection?.approvedGrade === null ? 'No grade recorded' : `${receipt.gradeCorrection?.approvedGrade}%`}.` : ''}${receipt.reasons.length ? `\n${receipt.reasons.join('\n')}` : ''}`
  : '';
