/*
 * THE RECORDED SCORE OF A RECOVERED WARM-UP OR DOL. ONE RULE, ONE PLACE.
 *
 *     recordedScore = max(originalScore, min(rawRecoveryScore, cap))
 *
 * The same shape as the Test Cycle retest rule (testCycleGrade.mjs), and for
 * the same reason: capping the RECOVERY'S CONTRIBUTION before the comparison
 * means a recovery can only ever raise a recorded score, and only as far as
 * the cap. Capping after — min(max(original, recovery), cap) — would pull an
 * original 95 down to 90, punishing a student for trying.
 *
 *   DOL, cap 90:   original 48, recovery 72 -> max(48, 72) = 72
 *                  original 62, recovery 96 -> max(62, 90) = 90
 *                  original 88, recovery 81 -> max(88, 81) = 88
 *   Excused make-up (cap 100): original missing, recovery 84 -> 84
 *
 * NOTHING IS OVERWRITTEN. The original section score is never stored here: it
 * is computed live from the untouched question records, so a later teacher
 * correction to an original answer still flows through. The raw recovery
 * score is kept alongside its capped contribution and an audit reason, so a
 * teacher can always answer "why is this 90?".
 *
 * Pure by construction: no Firestore, no network.
 */

import { RECOVERY_TYPE, recoveryCapFor } from './recoveryPolicy.mjs';

const list = (value) => (Array.isArray(value) ? value : []);

/** A score that was never earned is null, and null is not zero. */
const optionalPercent = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : null;
};

export const RECOVERY_GRADE_SOURCE = Object.freeze({
  NONE: 'none',
  ORIGINAL: 'original',
  RECOVERY: 'recovery',
});

export const cappedRecoveryContribution = (rawRecoveryScore, cap) => {
  const raw = optionalPercent(rawRecoveryScore);
  if (raw === null) return null;
  return Math.min(raw, optionalPercent(cap) ?? 100);
};

/** The canonical rule. Everything else in this file is commentary on it. */
export const recordedSectionScore = ({ originalScore = null, rawRecoveryScore = null, cap = 100 } = {}) => {
  const original = optionalPercent(originalScore);
  const contribution = cappedRecoveryContribution(rawRecoveryScore, cap);
  if (original === null && contribution === null) return null;
  if (original === null) return contribution;
  if (contribution === null) return original;
  return Math.max(original, contribution);
};

/**
 * Every number a teacher or student needs to read a recovered section score,
 * computed once from the two raw scores and the policy.
 */
export const buildSectionRecoveryGradeState = ({
  section = 'dol',
  originalScore = null,
  originalAttempted = true,
  rawRecoveryScore = null,
  type = RECOVERY_TYPE.RECOVERY,
  policy = null,
  // The cap frozen on the record when the Recovery started. A later policy
  // edit never re-scores a Recovery that was taken under the earlier one.
  capOverride = null,
} = {}) => {
  const cap = Number.isFinite(Number(capOverride)) && capOverride !== null
    ? Math.max(0, Math.min(100, Number(capOverride)))
    : recoveryCapFor(policy, section, type);
  const original = optionalPercent(originalScore);
  const raw = optionalPercent(rawRecoveryScore);
  const contribution = cappedRecoveryContribution(raw, cap);
  const recorded = recordedSectionScore({ originalScore: original, rawRecoveryScore: raw, cap });
  let source = RECOVERY_GRADE_SOURCE.NONE;
  if (recorded !== null) {
    source = contribution !== null && (original === null || contribution > original)
      ? RECOVERY_GRADE_SOURCE.RECOVERY
      : RECOVERY_GRADE_SOURCE.ORIGINAL;
  }
  const capApplied = raw !== null && raw > cap;
  return {
    section,
    type,
    originalScore: original,
    // "Missing" is a fact the teacher reads; it is still worth zero in the
    // max() above, exactly as an unanswered question always has been.
    originalMissing: originalAttempted === false,
    rawRecoveryScore: raw,
    recoveryContribution: contribution,
    cap,
    recordedScore: recorded,
    source,
    capApplied,
    recoveryDidNotImprove: contribution !== null && original !== null && contribution <= original,
    reason: describeRecoveryGrade({ original, raw, recorded, cap, source, capApplied, type, originalMissing: originalAttempted === false }),
  };
};

const describeRecoveryGrade = ({ original, raw, recorded, cap, source, capApplied, type, originalMissing }) => {
  const originalLabel = originalMissing ? 'Missing' : `${original}%`;
  if (recorded === null) return 'No score recorded yet.';
  if (raw === null) return `Recorded from the original (${originalLabel}).`;
  const kind = type === RECOVERY_TYPE.EXCUSED_MAKE_UP ? 'Excused make-up' : 'Recovery';
  if (source === RECOVERY_GRADE_SOURCE.ORIGINAL) {
    return capApplied
      ? `${kind} ${raw}% counts up to ${cap}%, which did not beat the original (${originalLabel}). Original kept.`
      : `${kind} ${raw}% did not beat the original (${originalLabel}). Original kept.`;
  }
  return capApplied
    ? `${kind} ${raw}% recorded at the ${cap}% recovery cap (original ${originalLabel}).`
    : `${kind} ${raw}% replaced the original (${originalLabel}).`;
};

/*
 * THE SECTION CREDIT GRADING READS.
 *
 * Section scores are not stored anywhere; they are weighted question credit
 * over the section's questions (gradeEvidence.js). A recovered section is
 * folded into exactly that calculation: every question in the section is
 * credited at recordedScore / 100. Each question keeps its own weight, so the
 * assignment denominator, the other sections and every existing weight are
 * unchanged — a recovery never becomes an extra assignment or an extra item.
 */
export const recoveredSectionCredit = (state) => {
  const recorded = optionalPercent(state?.recordedScore);
  return recorded === null ? null : recorded / 100;
};

export const RECOVERY_HISTORY_EVENT = Object.freeze({
  PRACTICE: 'practice',
  UNLOCKED: 'unlocked',
  STARTED: 'started',
  COMPLETED: 'completed',
  // Submitted, and held for a teacher: MathMaster could not grade enough of it.
  HELD: 'held',
  TEACHER_OVERRIDE: 'teacherOverride',
});

/** Append one audit row (bounded), only when something changed. */
export const appendRecoveryHistory = (history, entry) => {
  const rows = list(history).filter((row) => row && typeof row === 'object');
  const next = {
    at: String(entry?.at || new Date().toISOString()),
    event: String(entry?.event || RECOVERY_HISTORY_EVENT.TEACHER_OVERRIDE),
    detail: String(entry?.detail || '').slice(0, 400) || null,
    ...(entry?.recordedScore !== undefined ? { recordedScore: optionalPercent(entry.recordedScore) } : {}),
  };
  const previous = rows[rows.length - 1] || null;
  if (previous && previous.event === next.event && previous.detail === next.detail && previous.event !== RECOVERY_HISTORY_EVENT.PRACTICE) {
    return rows;
  }
  return [...rows, next].slice(-50);
};
