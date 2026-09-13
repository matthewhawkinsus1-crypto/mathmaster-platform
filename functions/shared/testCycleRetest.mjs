/*
 * THE RETEST, BUILT FROM WHAT THIS STUDENT ACTUALLY MISSED.
 *
 * Roughly 70% targeted weak skills, roughly 30% anchor coverage from the rest
 * of the original blueprint.
 *
 * WHY THE ANCHOR 30% IS NOT NEGOTIABLE DOWN TO ZERO.
 *
 * Without it the retest degenerates into "re-ask the one thing they missed",
 * and a student who lost a comprehensive Test on a single narrow skill could
 * replace the whole grade by passing three questions about that skill. The
 * anchor share is what keeps a replacement grade a statement about the unit.
 * So when the original blueprint declares anchors and the retest is longer than
 * one question, at least one anchor slot is always allocated, whatever rounding
 * says.
 *
 * EQUIVALENT RIGOR, NOT AN EASIER TEST. Every retest target inherits the
 * ORIGINAL target's DOK, difficulty band, representation, tool and weight. The
 * retest chooses WHICH standards to re-ask and how many times; it has no power
 * to make any of them easier, and `retestRigorIsPreserved` is the check that
 * says so out loud.
 *
 * NO REUSED INSTANCES. This module produces a blueprint; `buildSecureIssuancePlan`
 * turns it into concrete questions with the original families passed as
 * `avoidFamilyIds` and the original instances as `avoidInstanceIds`. Family
 * ordering here puts unseen families first so that avoidance usually costs
 * nothing.
 *
 * Deterministic and pure: same profile in, same retest blueprint out.
 */

import { normalizeTestBlueprint } from './testCycleBlueprint.mjs';
import { normalizeTestCyclePolicy } from './testCyclePolicy.mjs';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/**
 * How long the retest is.
 *
 * Default is a genuinely shorter form — enough evidence to justify replacing a
 * grade, not a re-run of the whole unit test. A teacher-set count is honoured,
 * but it is still clamped to the original length unless they also set
 * `allowLongerThanTest`.
 */
export const resolveRetestQuestionCount = ({ originalTotal = 0, policy = null } = {}) => {
  const resolved = normalizeTestCyclePolicy(policy);
  const total = Math.max(0, Math.round(Number(originalTotal) || 0));
  if (!total) return 0;
  const requested = resolved?.retest?.questionCount;
  const allowLonger = resolved?.retest?.allowLongerThanTest === true;
  if (Number.isFinite(Number(requested)) && Number(requested) > 0) {
    const count = Math.round(Number(requested));
    return allowLonger ? count : Math.min(total, count);
  }
  // Shorter form: about 60% of the original, never below four questions and
  // never above the original.
  return Math.max(1, Math.min(total, Math.max(Math.min(4, total), Math.ceil(total * 0.6))));
};

/** Spread `count` slots across `entries` proportionally to `weightOf`, order preserved. */
const allocate = (entries, count, weightOf) => {
  if (!entries.length || count <= 0) return new Map();
  const allocation = new Map(entries.map((entry) => [entry.targetId, 0]));
  // Everyone who is in the pool gets at least one slot, while slots last.
  let remaining = count;
  for (const entry of entries) {
    if (remaining <= 0) break;
    allocation.set(entry.targetId, 1);
    remaining -= 1;
  }
  if (remaining <= 0) return allocation;

  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, weightOf(entry)), 0);
  if (totalWeight > 0) {
    const shares = entries.map((entry) => ({
      targetId: entry.targetId,
      exact: (Math.max(0, weightOf(entry)) / totalWeight) * remaining,
    }));
    shares.forEach((share) => {
      const whole = Math.floor(share.exact);
      allocation.set(share.targetId, allocation.get(share.targetId) + whole);
      remaining -= whole;
      share.remainder = share.exact - whole;
    });
    shares.sort((left, right) => right.remainder - left.remainder || left.targetId.localeCompare(right.targetId));
    for (let index = 0; remaining > 0 && shares.length; index = (index + 1) % shares.length, remaining -= 1) {
      allocation.set(shares[index].targetId, allocation.get(shares[index].targetId) + 1);
    }
    return allocation;
  }

  for (let index = 0; remaining > 0; index = (index + 1) % entries.length, remaining -= 1) {
    allocation.set(entries[index].targetId, allocation.get(entries[index].targetId) + 1);
  }
  return allocation;
};

/**
 * The student's retest blueprint, plus the audit that explains it.
 *
 * The audit is not decoration: a teacher may inspect a generated retest plan
 * before unlocking it, and "why are three of these about A.5A?" has to have an
 * answer that is not "the algorithm decided".
 */
export const buildRetestBlueprint = ({
  blueprint = null,
  profile = null,
  policy = null,
  questionCount = null,
} = {}) => {
  const original = normalizeTestBlueprint(blueprint);
  const resolved = normalizeTestCyclePolicy(policy);
  if (!resolved || !original.targets.length) return null;

  const total = Number.isFinite(Number(questionCount)) && Number(questionCount) > 0
    ? Math.max(1, Math.min(
      resolved.retest.allowLongerThanTest ? 60 : original.totalQuestions,
      Math.round(Number(questionCount)),
    ))
    : resolveRetestQuestionCount({ originalTotal: original.totalQuestions, policy: resolved });
  if (total <= 0) return null;

  const targetsById = new Map(original.targets.map((target) => [target.targetId, target]));
  const weakPool = list(profile?.weakestFirst)
    .filter((entry) => targetsById.has(clean(entry.targetId)))
    .map((entry) => ({ ...entry, targetId: clean(entry.targetId) }));

  // Anchor coverage comes from the REST of the original blueprint: anchors the
  // student did not fail. If every anchor is also a weak target, anchors are
  // still covered — the point is breadth, not exclusion.
  const weakIds = new Set(weakPool.map((entry) => entry.targetId));
  const declaredAnchors = original.targets.filter((target) => target.anchor);
  const unfailedAnchors = declaredAnchors.filter((target) => !weakIds.has(target.targetId));
  const anchorPool = (unfailedAnchors.length ? unfailedAnchors : declaredAnchors)
    .map((target) => ({ targetId: target.targetId, weight: target.weight, questionCount: target.questionCount }));

  let anchorSlots = 0;
  if (anchorPool.length && total > 1) {
    anchorSlots = Math.round(total * resolved.retest.anchorShare);
    // At least one anchor, and never so many that no weak skill is re-asked.
    anchorSlots = Math.max(1, Math.min(total - 1, anchorSlots));
  }
  if (!weakPool.length) anchorSlots = anchorPool.length ? total : 0;
  const weakSlots = Math.max(0, total - anchorSlots);

  const weakAllocation = allocate(weakPool, weakSlots, (entry) => Number(entry.weightedDeficit) || 0);
  const anchorAllocation = allocate(anchorPool, anchorSlots, (entry) => Number(entry.weight) || 1);

  const seenFamiliesByTarget = new Map(
    weakPool.map((entry) => [entry.targetId, new Set(list(entry.seenFamilyIds).map(clean))]),
  );

  const buildTarget = (targetId, count, role) => {
    const source = targetsById.get(targetId);
    if (!source || count <= 0) return null;
    const seen = seenFamiliesByTarget.get(targetId) || new Set();
    // Unseen families first, so avoiding a repeat costs nothing in the common
    // case and the issuance planner's fallbacks stay unused.
    const familyIds = [
      ...source.familyIds.filter((familyId) => !seen.has(familyId)),
      ...source.familyIds.filter((familyId) => seen.has(familyId)),
    ];
    return {
      targetId: `${role}-${targetId}`,
      sourceTargetId: targetId,
      alignmentKey: source.alignmentKey,
      label: source.label,
      // Inherited, not recomputed. This is the equivalent-rigor guarantee.
      dok: source.dok,
      difficultyBand: source.difficultyBand,
      representation: source.representation,
      toolId: source.toolId,
      weight: source.weight,
      anchor: role === 'anchor',
      retestRole: role,
      questionCount: count,
      familyIds,
    };
  };

  const targets = [
    ...weakPool.map((entry) => buildTarget(entry.targetId, weakAllocation.get(entry.targetId) || 0, 'targeted')),
    ...anchorPool.map((entry) => buildTarget(entry.targetId, anchorAllocation.get(entry.targetId) || 0, 'anchor')),
  ].filter(Boolean);

  const retestBlueprint = normalizeTestBlueprint({
    blueprintId: `${original.blueprintId}-retest`,
    version: original.version,
    title: `${original.title} — Retest`,
    courseId: original.courseId,
    stage: 'retest',
    derivedFrom: original.blueprintId,
    timeLimitSeconds: original.timeLimitSeconds,
    calculatorMode: original.calculatorMode,
    targets,
  });
  // normalizeTestBlueprint keeps only the contract fields; the retest-specific
  // provenance is re-attached so a plan can be traced back to what it replaced.
  retestBlueprint.targets = retestBlueprint.targets.map((target, index) => ({
    ...target,
    sourceTargetId: targets[index]?.sourceTargetId || null,
    retestRole: targets[index]?.retestRole || null,
  }));

  const targetedQuestionCount = targets
    .filter((target) => target.retestRole === 'targeted')
    .reduce((sum, target) => sum + target.questionCount, 0);
  const anchorQuestionCount = targets
    .filter((target) => target.retestRole === 'anchor')
    .reduce((sum, target) => sum + target.questionCount, 0);
  const totalQuestions = targetedQuestionCount + anchorQuestionCount;

  return {
    blueprint: retestBlueprint,
    audit: {
      derivedFrom: original.blueprintId,
      originalQuestionCount: original.totalQuestions,
      questionCount: totalQuestions,
      shorterThanOriginal: totalQuestions <= original.totalQuestions,
      requestedWeakShare: resolved.retest.targetedWeakShare,
      requestedAnchorShare: resolved.retest.anchorShare,
      targetedQuestionCount,
      anchorQuestionCount,
      actualWeakShare: totalQuestions ? targetedQuestionCount / totalQuestions : 0,
      actualAnchorShare: totalQuestions ? anchorQuestionCount / totalQuestions : 0,
      targetedTargetIds: targets.filter((target) => target.retestRole === 'targeted').map((target) => target.sourceTargetId),
      anchorTargetIds: targets.filter((target) => target.retestRole === 'anchor').map((target) => target.sourceTargetId),
      // Carried through to issuance so the planner can avoid what the student
      // has already met, and so an auditor can check that it did.
      avoidFamilyIds: [...new Set(weakPool.flatMap((entry) => list(entry.seenFamilyIds).map(clean)).filter(Boolean))],
      avoidInstanceIds: [...new Set(weakPool.flatMap((entry) => list(entry.seenInstanceIds).map(clean)).filter(Boolean))],
    },
  };
};

/**
 * Is every retest target at least as demanding as the original it came from?
 *
 * A retest that quietly drops a DOK 3 target to DOK 1 would let a student
 * replace a grade with easier mathematics. Reported per target so a failure
 * names the slot rather than the whole plan.
 */
export const retestRigorIsPreserved = (originalBlueprint, retestBlueprint) => {
  const original = normalizeTestBlueprint(originalBlueprint);
  const retest = normalizeTestBlueprint(retestBlueprint);
  const byId = new Map(original.targets.map((target) => [target.targetId, target]));
  const violations = [];
  list(retestBlueprint?.targets).forEach((target, index) => {
    const source = byId.get(clean(target.sourceTargetId));
    const normalizedTarget = retest.targets[index] || target;
    if (!source) return;
    if (Number(normalizedTarget.dok) < Number(source.dok)) {
      violations.push({ targetId: normalizedTarget.targetId, reason: 'dok_lowered' });
    }
    if (Number(normalizedTarget.difficultyBand) < Number(source.difficultyBand)) {
      violations.push({ targetId: normalizedTarget.targetId, reason: 'difficulty_lowered' });
    }
    if (clean(normalizedTarget.representation) !== clean(source.representation)) {
      violations.push({ targetId: normalizedTarget.targetId, reason: 'representation_changed' });
    }
  });
  return { preserved: violations.length === 0, violations };
};
