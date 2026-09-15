/*
 * A SAFETY FLAG, NEVER A SCORE.
 *
 * These signals prove only that canonical grading may not yet account for all
 * known work. They cannot supply an answer, correctness, or points. Secure Test
 * Cycle assignments deliberately bypass this ordinary-assignment policy.
 *
 * EVERY INPUT HERE IS ONE PRODUCTION FINALIZATION ACTUALLY READS.
 *
 * The first version of this policy also accepted `unresolvedReceipts`, and
 * `readPersistencePending` never supplied it. That is worse than a missing
 * check: a reader of this file would conclude final passback consults the
 * receipt store, and it does not. The input is gone, and the reason it is not
 * a finality blocker is written down at the bottom of this file so nobody
 * re-adds it.
 */

/*
 * WHAT A TEACHER MAY RESOLVE, AND WHAT THEY MAY NOT.
 *
 * Only `session-summary-gap` can be resolved by a human. Every other reason
 * names a CONCRETE artifact that still exists and can still become a grade —
 * a queued submission on a Chromebook, an active checkpoint, a recoverable
 * server-held draft. Those are recoverable, so resolving them would discard
 * work that is still reachable. The session gap is the one signal that can be
 * permanently irreconcilable: presence evidence that something was worked on,
 * with no artifact left anywhere to recover.
 */
export const RESOLVABLE_PERSISTENCE_REASONS = Object.freeze(['session-summary-gap']);

const count = (value) => Math.max(0, Number(value) || 0);

/**
 * Does a recorded teacher resolution still cover the discrepancy in front of
 * us, or has the evidence moved on since the teacher looked at it?
 *
 * A resolution acknowledges ONE discrepancy — the one the teacher saw, with
 * the numbers they saw. If session evidence has since grown, the gap they
 * acknowledged is not this gap, and the hold comes back. A gap that has since
 * SHRUNK (work was recovered into canonical attempts) is still covered: it is
 * a subset of what was acknowledged.
 *
 * Concrete recoverable evidence appearing later — a Chromebook that reconnects
 * and reports queued work — reactivates protection without needing anything
 * here, because it raises its own reason and a resolution never suppresses
 * those.
 */
export const sessionGapResolutionApplies = ({
  resolution = null,
  worked = 0,
  canonicalAttempted = 0,
} = {}) => {
  if (!resolution || typeof resolution !== 'object') return false;
  if (resolution.revokedAt) return false;
  const acknowledgedGap = count(resolution.acknowledgedWorked) - count(resolution.acknowledgedCanonicalAttempted);
  if (acknowledgedGap <= 0) return false;
  const currentGap = count(worked) - count(canonicalAttempted);
  return currentGap <= acknowledgedGap;
};

export const assessPersistencePending = ({
  queuedGradeBearing = 0,
  activeCheckpoints = 0,
  recoverableDrafts = 0,
  worked = 0,
  canonicalAttempted = 0,
  secureTestCycle = false,
  sessionGapResolution = null,
} = {}) => {
  if (secureTestCycle) return { persistencePending: false, reasons: [], resolvedReasons: [] };
  const reasons = [];
  const resolvedReasons = [];
  if (count(queuedGradeBearing) > 0) reasons.push('device-queue');
  if (count(activeCheckpoints) > 0) reasons.push('response-checkpoint');
  if (count(recoverableDrafts) > 0) reasons.push('workspace-draft');
  if (count(worked) > count(canonicalAttempted)) {
    // A resolution retires the ALARM, never the evidence. Nothing about the
    // canonical record changes here: no attempt is invented, no zero is
    // written, no question becomes answered. Finalization simply proceeds on
    // the canonical evidence that does exist.
    if (sessionGapResolutionApplies({ resolution: sessionGapResolution, worked, canonicalAttempted })) {
      resolvedReasons.push('session-summary-gap');
    } else {
      reasons.push('session-summary-gap');
    }
  }
  return { persistencePending: reasons.length > 0, reasons, resolvedReasons };
};

/*
 * WHY `unresolvedReceipts` IS NOT A FINALITY BLOCKER.
 *
 * `studentSubmissionReceipts` cannot hold an unresolved ingestion. A receipt
 * is written only for a TERMINAL outcome — accepted, duplicate, superseded, or
 * permanently-invalid (see `RETIRING_DISPOSITIONS`). An ingestion the server
 * could NOT resolve writes no receipt at all, on purpose: the device keeps the
 * work and retries it.
 *
 * So "unresolved server ingestion" has exactly one observable form, and it is
 * a row still sitting in a device's IndexedDB queue. That is `device-queue`,
 * which this policy already blocks on. Counting receipts as well would either
 * double-count the same submission or, worse, read a resolved
 * `permanently-invalid` receipt — a PROVEN non-grade — as outstanding work and
 * hold a correct final grade forever.
 */
