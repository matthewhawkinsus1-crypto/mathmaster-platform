/*
 * MY MATH PATH'S POST-ANSWER REVIEW WAS NEVER HELP WITH THAT ANSWER.
 *
 * submitPathResponse recorded `workedExampleUsed: reviewReleased`, and the
 * review is released by the very attempt that closes the question
 * (pathSolutionSupport.mjs buildAttemptSupportPayload: "Never before the
 * question closes"). So every finalized Path answer read as worked-example
 * supported and not mathematically independent: Path-only learners had no
 * independent successes and a 75%-credited estimate (release-candidate QA
 * round 2, R2-M2). Job L fixes the record going forward; this reads the
 * history as it should have been written, for the owner-run rescoring
 * backfill (scripts/backfill-mastery-scoring.mjs).
 *
 * An event is reclassified only when the record itself proves the review came
 * with it, not before it:
 *   - it is My Math Path evidence (source.kind 'myMathPath');
 *   - it is the FINALIZED attempt of its question, the last attempt on record
 *     for that delivered instance;
 *   - no earlier attempt of the same question carries a worked example (the
 *     review cannot have been out before this attempt).
 * Only `workedExampleUsed` is cleared. A hint released before the attempt, a
 * teacher's help, a scaffold, an algebra auto-apply keep it not independent.
 *
 * Evidence events are immutable and are never rewritten: this returns
 * corrected COPIES that the rescoring reads. Pure; the caller passes
 * functions/lib/mathPath.js mathematicalIndependence.
 */

const isPath = (evidence) => String(evidence?.source?.kind || '') === 'myMathPath';
const instanceOf = (evidence) => String(evidence?.questionSnapshot?.questionInstanceId || '');
const attemptOf = (evidence) => Math.max(1, Number(evidence?.performance?.attemptNumber) || 1);

/**
 * @param events [{ id, evidence }]
 * @returns { events, counts: { pathEvents, reclassified, anomalies } }
 */
export const reclassifyPathReviewEvidence = (events = [], { mathematicalIndependence }) => {
  const byInstance = new Map();
  (Array.isArray(events) ? events : []).forEach(({ evidence }) => {
    if (!isPath(evidence) || !instanceOf(evidence)) return;
    if (!byInstance.has(instanceOf(evidence))) byInstance.set(instanceOf(evidence), []);
    byInstance.get(instanceOf(evidence)).push(evidence);
  });
  const counts = { pathEvents: 0, reclassified: 0, anomalies: 0 };
  const corrected = (Array.isArray(events) ? events : []).map((entry) => {
    const { evidence } = entry;
    if (!isPath(evidence)) return entry;
    counts.pathEvents += 1;
    const usage = evidence.supportUsage || {};
    if (usage.workedExampleUsed !== true) return entry;
    const siblings = byInstance.get(instanceOf(evidence)) || [];
    const attempt = attemptOf(evidence);
    const finalized = String(evidence.performance?.status || '') === 'finalized';
    const isLast = siblings.every((other) => attemptOf(other) <= attempt);
    const reviewBefore = siblings.some((other) => other !== evidence && attemptOf(other) < attempt && other.supportUsage?.workedExampleUsed === true);
    if (!instanceOf(evidence) || !finalized || !isLast || reviewBefore) {
      counts.anomalies += 1;
      return entry;
    }
    const { isMathematicallyIndependent: _stored, ...rest } = usage;
    const supportUsage = { ...rest, workedExampleUsed: false };
    const independent = mathematicalIndependence(supportUsage);
    counts.reclassified += 1;
    return {
      ...entry,
      evidence: {
        ...evidence,
        supportUsage: { ...supportUsage, isMathematicallyIndependent: independent },
        performance: { ...evidence.performance, isMathematicallyIndependent: independent },
      },
    };
  });
  return { events: corrected, counts };
};

export default reclassifyPathReviewEvidence;
