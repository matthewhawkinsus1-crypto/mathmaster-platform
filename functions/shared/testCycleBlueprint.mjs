/*
 * THE TEST BLUEPRINT: WHAT THE TEST IS, BEFORE ANY STUDENT HAS ONE.
 *
 * Every student on a Test Cycle takes an EQUIVALENT secure test, not an
 * IDENTICAL one. The blueprint is what "equivalent" means, written down and
 * approved before publication:
 *
 *   standard / alignment    what is assessed
 *   DOK + difficulty band   how hard, and at what kind of thinking
 *   representation / tool   symbolic, graph, table, verbal — and which tool
 *   questionCount + weight  how much of the test, and how much of the grade
 *   anchor                  is this slot part of the comprehensive spine
 *   familyIds               the APPROVED, VALIDATED generator families that
 *                           are allowed to fill that slot
 *
 * WHY THE FAMILIES ARE NAMED IN THE BLUEPRINT AND NOT CHOSEN AT EXAM TIME.
 *
 * Because a student is sitting in a chair. Secure delivery instantiates an
 * already-approved family with an already-validated grader; it does not decide
 * what mathematics to ask, and it never calls an AI model. AI may help a
 * teacher AUTHOR families before publication — that is authoring, and it
 * finishes before anyone sits down. `testCyclePreflight` is what refuses to
 * publish a blueprint whose families cannot actually be issued.
 *
 * Pure by construction: no Firestore, no network.
 */

import { hasPathGenerator, hasPathVariants } from './pathQuestionGeneration.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

export const REPRESENTATIONS = Object.freeze([
  'symbolic', 'graph', 'table', 'verbal', 'numeric', 'multiple',
]);

const clampInt = (value, low, high, fallback) => {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(low, Math.min(high, numeric));
};

const uniqueStrings = (values) => [...new Set(list(values).map(clean).filter(Boolean))];

/**
 * One blueprint target, normalized.
 *
 * `targetId` is identity: correction plans, retest plans and teacher-visible
 * evidence mappings all join on it, so a missing one is synthesized
 * deterministically from position rather than left empty for several targets
 * to share.
 */
const normalizeTarget = (target, index) => {
  const source = isObject(target) ? target : {};
  const alignmentKey = clean(source.alignmentKey || source.alignment || source.standard);
  const representation = REPRESENTATIONS.includes(clean(source.representation))
    ? clean(source.representation)
    : 'symbolic';
  return {
    targetId: clean(source.targetId) || `target-${index + 1}`,
    alignmentKey,
    label: clean(source.label) || alignmentKey || `Target ${index + 1}`,
    dok: clampInt(source.dok, 1, 4, 2),
    difficultyBand: clampInt(source.difficultyBand, 1, 5, 3),
    representation,
    toolId: clean(source.toolId) || null,
    questionCount: clampInt(source.questionCount, 0, 60, 1),
    weight: Number.isFinite(Number(source.weight)) && Number(source.weight) > 0
      ? Math.min(20, Number(source.weight))
      : 1,
    // An anchor slot is part of the comprehensive spine of the test. The retest
    // planner keeps a share of these so a student cannot replace a whole test
    // grade on the strength of one narrow skill.
    anchor: source.anchor === true,
    familyIds: uniqueStrings(source.familyIds),
  };
};

export const normalizeTestBlueprint = (blueprint) => {
  const source = isObject(blueprint) ? blueprint : {};
  const targets = list(source.targets).map(normalizeTarget).filter((target) => target.questionCount > 0);
  const totalQuestions = targets.reduce((sum, target) => sum + target.questionCount, 0);
  return {
    blueprintId: clean(source.blueprintId) || 'blueprint',
    version: clampInt(source.version, 1, 10000, 1),
    title: clean(source.title) || 'Course Test',
    courseId: clean(source.courseId) || null,
    stage: clean(source.stage) === 'retest' ? 'retest' : 'test',
    derivedFrom: clean(source.derivedFrom) || null,
    totalQuestions,
    timeLimitSeconds: Number.isFinite(Number(source.timeLimitSeconds)) && Number(source.timeLimitSeconds) > 0
      ? Math.round(Number(source.timeLimitSeconds))
      : null,
    calculatorMode: clean(source.calculatorMode) || 'questionSpecific',
    targets,
  };
};

/**
 * The blueprint as an ordered list of question slots, one per question.
 *
 * Issuance, correction mapping and retest planning all work in slots rather
 * than targets, because a target that asks for four questions is four separate
 * pieces of evidence about a student and collapsing them loses the one that
 * was missed.
 */
export const expandBlueprintSlots = (blueprint) => {
  const normalized = normalizeTestBlueprint(blueprint);
  const slots = [];
  normalized.targets.forEach((target) => {
    for (let index = 0; index < target.questionCount; index += 1) {
      slots.push({
        ordinal: slots.length + 1,
        slotId: `${target.targetId}#${index + 1}`,
        targetId: target.targetId,
        alignmentKey: target.alignmentKey,
        label: target.label,
        dok: target.dok,
        difficultyBand: target.difficultyBand,
        representation: target.representation,
        toolId: target.toolId,
        weight: target.weight,
        anchor: target.anchor,
        familyIds: [...target.familyIds],
      });
    }
  });
  return slots;
};

export const blueprintTargetById = (blueprint, targetId) => (
  normalizeTestBlueprint(blueprint).targets.find((target) => target.targetId === clean(targetId)) || null
);

export const blueprintAnchorTargets = (blueprint) => (
  normalizeTestBlueprint(blueprint).targets.filter((target) => target.anchor)
);

/*
 * WHAT "EQUIVALENT" IS ALLOWED TO MEAN, AS A COMPARABLE VALUE.
 *
 * Two students' secure tests may differ in every number, context and family
 * they contain. They may NOT differ in what is being assessed or how hard it
 * is. This signature is exactly the metadata that must match, in slot order,
 * and it is what the equivalence test asserts on — so "different instances,
 * same test" stops being a claim and becomes a comparison.
 */
export const blueprintEquivalenceSignature = (blueprint) => (
  expandBlueprintSlots(blueprint).map((slot) => [
    slot.alignmentKey,
    `dok${slot.dok}`,
    `band${slot.difficultyBand}`,
    slot.representation,
    slot.toolId || 'noTool',
    `w${slot.weight}`,
    slot.anchor ? 'anchor' : 'targeted',
  ].join('|'))
);

/**
 * A bank question, seen the way the blueprint sees it.
 *
 * Issuance and preflight must agree about what a family IS, so both read it
 * through here rather than each reaching into a differently-shaped bank record.
 */
export const describeFamily = (question) => {
  const source = isObject(question) ? question : {};
  const alignments = uniqueStrings([
    ...list(source.alignmentKeys),
    ...list(source.teksAlignments),
    ...list(source.alignments).map((entry) => (isObject(entry) ? entry.alignmentKey || entry.code : entry)),
    source.alignmentKey,
    source.teks,
  ]);
  return {
    familyId: clean(source.familyId) || clean(source.id) || clean(source.questionId) || null,
    bankQuestionId: clean(source.id) || clean(source.questionId) || null,
    alignmentKeys: alignments,
    dok: clampInt(source.dok, 1, 4, 2),
    difficultyBand: clampInt(source.difficultyBand, 1, 5, 3),
    representation: REPRESENTATIONS.includes(clean(source.representation)) ? clean(source.representation) : 'symbolic',
    toolId: clean(source.toolId) || clean(source.pathToolId) || null,
    // A family is only "parallel-capable" when it can produce genuinely
    // different instances. A fixed question can fill a slot once; it cannot
    // supply a fresh variant for a retest.
    //
    // The answer comes from the GENERATOR's own predicates, not from a local
    // guess at what a generator looks like. A second opinion here would let
    // preflight approve a retest the issuing server then could not vary.
    generative: hasPathGenerator(source) || hasPathVariants(source),
    parallelGroup: clean(source.parallelGroup) || null,
    validated: source.validated !== false && source.active !== false,
    active: source.active !== false,
  };
};

/** Index approved families by id, keeping only validated, active ones. */
export const indexApprovedFamilies = (families) => {
  const index = new Map();
  list(families).forEach((entry) => {
    const described = isObject(entry) && entry.familyId && entry.alignmentKeys
      ? entry
      : describeFamily(entry);
    if (!described.familyId || !described.validated || !described.active) return;
    if (!index.has(described.familyId)) index.set(described.familyId, described);
  });
  return index;
};

/**
 * How many distinct approved families each target can actually draw on.
 *
 * The blueprint may name families that were later retired or that never
 * validated; only what is present in the approved index counts.
 */
export const targetFamilyCoverage = (blueprint, families) => {
  const index = indexApprovedFamilies(families);
  return normalizeTestBlueprint(blueprint).targets.map((target) => {
    const available = target.familyIds.filter((familyId) => index.has(familyId));
    const parallel = available.filter((familyId) => index.get(familyId).generative);
    return {
      targetId: target.targetId,
      alignmentKey: target.alignmentKey,
      questionCount: target.questionCount,
      anchor: target.anchor,
      declaredFamilies: target.familyIds.length,
      availableFamilies: available.length,
      parallelCapableFamilies: parallel.length,
      availableFamilyIds: available,
      // Enough distinct families to fill every slot of this target once.
      sufficientForTest: available.length >= target.questionCount,
      // A retest slot must not reuse the family the student already saw unless
      // that family can mint a genuinely fresh parallel variant.
      sufficientForRetest: available.length > target.questionCount || parallel.length > 0,
    };
  });
};
