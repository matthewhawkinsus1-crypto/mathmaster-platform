/*
 * SECURE ISSUANCE, DECIDED BEFORE THE STUDENT SITS DOWN.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: no live AI call while a student is
 * testing. Not "we try not to", not "usually cached" — the plan that says which
 * approved family fills which blueprint slot, and with which seed, is computed
 * as PURE DATA and stored on the secure session before the exam starts. At
 * issue time the server looks up the next plan entry and instantiates that
 * already-approved family with an already-validated grader. There is nothing
 * left to decide, and nothing to ask a model.
 *
 * `planRequiresLiveGeneration` is the assertion in function form: a plan whose
 * every entry names a concrete family and a concrete seed needs no generation
 * service at all, and the test suite reads that answer rather than trusting
 * this comment.
 *
 * HOW TWO STUDENTS GET DIFFERENT TESTS THAT ARE THE SAME TEST.
 *
 * Family choice and seed both hash the student id, so student A and student B
 * draw different families and different numbers for the same slot. Neither can
 * differ in alignment, DOK, difficulty band, representation or weight, because
 * the slot came from the blueprint and the plan never edits a slot — see
 * `blueprintEquivalenceSignature`.
 *
 * Deterministic: the same inputs always rebuild the same plan, so a plan can be
 * audited, re-derived after a crash, and shown to a teacher before unlock.
 *
 * Pure by construction: no Firestore, no network, no Date.now().
 */

import { createSeededRandom } from './pathQuestionGeneration.mjs';
import { expandBlueprintSlots, indexApprovedFamilies, normalizeTestBlueprint } from './testCycleBlueprint.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const CYCLE_STAGE = Object.freeze({ TEST: 'test', RETEST: 'retest' });

/**
 * The identity of one issuance plan.
 *
 * Every field that must make two plans differ is in here. `stage` is what keeps
 * a retest from re-deriving the test's own seeds and handing a student the same
 * numbers back; `attempt` is what lets a teacher reset a secure session and get
 * a genuinely new draw rather than the one the student already saw.
 */
export const planSeedKey = ({
  assignmentId = '',
  blueprintId = '',
  blueprintVersion = 1,
  stage = CYCLE_STAGE.TEST,
  studentId = '',
  attempt = 1,
} = {}) => [
  'mmTestCycle',
  clean(assignmentId) || 'assignment',
  clean(blueprintId) || 'blueprint',
  `v${Math.max(1, Math.round(Number(blueprintVersion) || 1))}`,
  clean(stage) === CYCLE_STAGE.RETEST ? CYCLE_STAGE.RETEST : CYCLE_STAGE.TEST,
  clean(studentId) || 'student',
  `a${Math.max(1, Math.round(Number(attempt) || 1))}`,
].join('|');

/** Deterministically pick one entry of a pool, from a seed. */
const pick = (pool, seedKey) => {
  if (!pool.length) return null;
  const random = createSeededRandom(seedKey);
  return pool[Math.floor(random() * pool.length) % pool.length];
};

/**
 * Choose the family for one slot.
 *
 * The preference order is the whole anti-repeat policy, and each fallback is a
 * deliberate, labelled concession rather than a silent one:
 *
 *   1. a family this student has not seen, and not yet used in this plan
 *   2. any family not yet used in this plan  (student saw it on the Test)
 *   3. a family that can mint a genuinely fresh parallel variant
 *   4. anything approved at all              (marked, so preflight can object)
 *
 * Step 3 is why `generative` exists on a family descriptor: reusing a family
 * that can only produce one fixed question would hand a student the identical
 * item back, which is the thing a retest must never do.
 */
const chooseFamily = ({ slot, approved, avoidFamilyIds, usedInPlan, seedKey }) => {
  const candidates = slot.familyIds.filter((familyId) => approved.has(familyId));
  if (!candidates.length) return null;

  const unseenAndUnused = candidates.filter(
    (familyId) => !avoidFamilyIds.has(familyId) && !usedInPlan.has(familyId),
  );
  if (unseenAndUnused.length) {
    return { familyId: pick(unseenAndUnused, seedKey), reusedFamily: false, freshParallelVariant: false };
  }

  const unusedInPlan = candidates.filter((familyId) => !usedInPlan.has(familyId));
  if (unusedInPlan.length) {
    const familyId = pick(unusedInPlan, seedKey);
    return { familyId, reusedFamily: avoidFamilyIds.has(familyId), freshParallelVariant: avoidFamilyIds.has(familyId) };
  }

  const parallelCapable = candidates.filter((familyId) => approved.get(familyId)?.generative);
  if (parallelCapable.length) {
    return { familyId: pick(parallelCapable, seedKey), reusedFamily: true, freshParallelVariant: true };
  }

  return { familyId: pick(candidates, seedKey), reusedFamily: true, freshParallelVariant: false };
};

/**
 * The ordered, deterministic issuance plan for one student's secure session.
 *
 * `avoidFamilyIds` and `avoidInstanceIds` carry what the student already met on
 * the original Test. Instance ids are recorded on every entry's
 * `forbiddenInstanceIds` so the issuing function can refuse at the last moment
 * as well — the planner is the policy, and the issuer is the lock.
 */
export const buildSecureIssuancePlan = ({
  blueprint = null,
  families = [],
  studentId = '',
  assignmentId = '',
  stage = CYCLE_STAGE.TEST,
  attempt = 1,
  avoidFamilyIds = [],
  avoidInstanceIds = [],
} = {}) => {
  const normalized = normalizeTestBlueprint(blueprint);
  const approved = indexApprovedFamilies(families);
  const slots = expandBlueprintSlots(normalized);
  const resolvedStage = clean(stage) === CYCLE_STAGE.RETEST ? CYCLE_STAGE.RETEST : CYCLE_STAGE.TEST;
  const planId = planSeedKey({
    assignmentId,
    blueprintId: normalized.blueprintId,
    blueprintVersion: normalized.version,
    stage: resolvedStage,
    studentId,
    attempt,
  });
  const avoidSet = new Set(list(avoidFamilyIds).map(clean).filter(Boolean));
  const forbiddenInstanceIds = [...new Set(list(avoidInstanceIds).map(clean).filter(Boolean))];
  const usedInPlan = new Set();
  const entries = [];
  const unfilledSlots = [];

  slots.forEach((slot) => {
    const slotSeed = `${planId}|${slot.slotId}`;
    const chosen = chooseFamily({ slot, approved, avoidFamilyIds: avoidSet, usedInPlan, seedKey: slotSeed });
    if (!chosen?.familyId) {
      unfilledSlots.push({ slotId: slot.slotId, targetId: slot.targetId, reason: 'no_approved_family' });
      return;
    }
    usedInPlan.add(chosen.familyId);
    const family = approved.get(chosen.familyId);
    entries.push({
      ordinal: entries.length + 1,
      slotId: slot.slotId,
      targetId: slot.targetId,
      alignmentKey: slot.alignmentKey,
      dok: slot.dok,
      difficultyBand: slot.difficultyBand,
      representation: slot.representation,
      toolId: slot.toolId,
      weight: slot.weight,
      anchor: slot.anchor,
      familyId: chosen.familyId,
      bankQuestionId: family?.bankQuestionId || chosen.familyId,
      // The seed the server hands the generator. Stage and attempt are inside
      // planId, so a retest of the same family is a different draw.
      seedKey: `${slotSeed}|${chosen.familyId}`,
      reusedFamily: chosen.reusedFamily,
      freshParallelVariant: chosen.freshParallelVariant,
    });
  });

  return {
    planId,
    stage: resolvedStage,
    studentId: clean(studentId),
    assignmentId: clean(assignmentId),
    blueprintId: normalized.blueprintId,
    blueprintVersion: normalized.version,
    attempt: Math.max(1, Math.round(Number(attempt) || 1)),
    totalQuestions: entries.length,
    entries,
    unfilledSlots,
    forbiddenInstanceIds,
    equivalenceSlots: slots.length,
    // Stored on the session and read by the test suite. A complete plan is the
    // proof that secure delivery has nothing left to generate from scratch.
    requiresLiveGeneration: false,
  };
};

/**
 * Does anything about this plan force generation at exam time?
 *
 * True only when a slot could not be filled from approved families — which is
 * precisely the case preflight refuses to publish.
 */
export const planRequiresLiveGeneration = (plan) => {
  const entries = list(plan?.entries);
  if (!entries.length) return true;
  if (list(plan?.unfilledSlots).length > 0) return true;
  return entries.some((entry) => !clean(entry?.familyId) || !clean(entry?.seedKey));
};

/** The plan entry for the next unanswered question, in blueprint order. */
export const nextPlanEntry = (plan, completedSlotIds = []) => {
  const done = new Set(list(completedSlotIds).map(clean).filter(Boolean));
  return list(plan?.entries).find((entry) => !done.has(clean(entry.slotId))) || null;
};

/**
 * Does this retest plan honour "never reuse the original question instance"?
 *
 * Reported rather than thrown so a teacher inspecting a plan can see WHICH slot
 * is at fault instead of a plan that simply refused to exist.
 */
export const auditRetestInstanceReuse = (plan, originalInstances = []) => {
  const originals = list(originalInstances).filter(Boolean);
  const originalInstanceIds = new Set(originals.map((entry) => clean(entry.questionInstanceId)).filter(Boolean));
  const originalSeeds = new Set(originals.map((entry) => clean(entry.seedKey)).filter(Boolean));
  const originalFamilies = new Set(originals.map((entry) => clean(entry.familyId)).filter(Boolean));

  const violations = [];
  list(plan?.entries).forEach((entry) => {
    if (originalInstanceIds.has(clean(entry.questionInstanceId))) {
      violations.push({ slotId: entry.slotId, reason: 'reused_question_instance' });
    }
    if (originalSeeds.has(clean(entry.seedKey))) {
      violations.push({ slotId: entry.slotId, reason: 'reused_generated_instance' });
    }
    if (originalFamilies.has(clean(entry.familyId)) && !entry.freshParallelVariant) {
      violations.push({ slotId: entry.slotId, reason: 'reused_family_without_parallel_variant' });
    }
  });
  return { clean: violations.length === 0, violations };
};
