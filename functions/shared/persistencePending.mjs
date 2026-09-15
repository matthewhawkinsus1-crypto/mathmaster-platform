/*
 * A SAFETY FLAG, NEVER A SCORE.
 *
 * These signals prove only that canonical grading may not yet account for all
 * known work. They cannot supply an answer, correctness, or points. Secure Test
 * Cycle assignments deliberately bypass this ordinary-assignment policy.
 */
export const assessPersistencePending = ({
  queuedGradeBearing = 0,
  activeCheckpoints = 0,
  recoverableDrafts = 0,
  unresolvedReceipts = 0,
  worked = 0,
  canonicalAttempted = 0,
  secureTestCycle = false,
} = {}) => {
  if (secureTestCycle) return { persistencePending: false, reasons: [] };
  const reasons = [];
  if (Number(queuedGradeBearing) > 0) reasons.push('device-queue');
  if (Number(activeCheckpoints) > 0) reasons.push('response-checkpoint');
  if (Number(recoverableDrafts) > 0) reasons.push('workspace-draft');
  if (Number(unresolvedReceipts) > 0) reasons.push('server-ingestion-unresolved');
  if (Number(worked) > Number(canonicalAttempted)) reasons.push('session-summary-gap');
  return { persistencePending: reasons.length > 0, reasons };
};
