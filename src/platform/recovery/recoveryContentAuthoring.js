/*
 * RECOVERY CONTENT AT CREATION — EVERY NEW LESSON STARTS RECOVERABLE.
 *
 * Pre-Flight pairs each static Warm-Up and DOL question with a certified
 * Question Family that recognizes it (functions/shared/recoveryContentPlan.mjs)
 * and shows the teacher the result. Creation stores those pairings on the
 * assignment as its versioned `recoveryContent` (recoveryContent.mjs), so a
 * teacher never writes Recovery questions, configures a generator or attaches
 * a family by hand for an ordinary lesson.
 *
 * Planned again here on the EXACT payload being written — Standard and Honors
 * copies separately, each from its own questions — because a binding is tied
 * to the stored question it was certified for, and a Pre-Flight view of the
 * question (runtime-repaired) is not always byte-identical to it.
 *
 * A question no certified family can recognize simply has no binding: its
 * section reads "not ready" everywhere, with the reason, and nothing claims
 * otherwise. The server's recovery upgrade (commitRecoveryContentUpgrade) is
 * the only way recoveryContent changes afterwards (firestore.rules).
 */
import { RECOVERY_BINDING_ORIGIN, applyRecoveryBindings } from '../../../functions/shared/recoveryContent.mjs';
import { planAssignmentRecoveryContent } from '../../../functions/shared/recoveryContentPlan.mjs';
import { lightRecoveryKeyCheck } from '../../../functions/shared/recoveryLightKeyCheck.mjs';
import { generatedVersionProblems } from '../preflight/questionGenerationPreflight.js';

/**
 * The recoveryContent a new assignment document should carry, or null when no
 * static Warm-Up or DOL question can be paired (nothing is written then).
 * `payload` is the assignment document exactly as it will be stored.
 */
export const creationRecoveryContent = (payload = {}, { at = new Date().toISOString(), actorUid = null } = {}) => {
  if (!payload || Number(payload.schemaVersion) !== 5) return null;
  const plan = planAssignmentRecoveryContent({
    assignment: { ...payload, id: payload.id || 'new-assignment' },
    gradeSample: lightRecoveryKeyCheck,
    validateVersion: (built) => generatedVersionProblems(built).map((problem) => problem.text),
    origin: RECOVERY_BINDING_ORIGIN.PREFLIGHT,
    at,
  });
  if (!plan.changed) return payload.recoveryContent || null;
  const applied = applyRecoveryBindings({
    content: payload.recoveryContent || null,
    bindings: plan.bindingsToApply,
    at,
    actorUid,
    source: RECOVERY_BINDING_ORIGIN.PREFLIGHT,
  });
  // Firestore refuses `undefined`; the record is plain data.
  return JSON.parse(JSON.stringify(applied.content));
};
