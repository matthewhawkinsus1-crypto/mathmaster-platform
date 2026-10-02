/*
 * CAN THIS QUESTION ACTUALLY BE DIFFERENT?
 *
 * The platform asked this in one place, `isPersonalizedBlueprint`, and
 * answered it optimistically: ANY `generator` object counted. A generator the
 * runtime did not recognise (a misspelled `kind`, an empty `parameters`) was
 * returned unchanged to every student — while the student was offered
 * "Request New Question", which then handed back the identical question,
 * with fresh attempts, right after the solution had been shown.
 *
 * This module answers it honestly, from the same rules the runtime uses to
 * generate, so Pre-Flight, the replacement button and the server can no longer
 * disagree with what generation will really do.
 *
 * Pure: no Firestore, no clock.
 */

import { isFamilyBackedQuestion, resolveQuestionFamilyDefinition } from './questionFamilyInstance.mjs';
import { hasLocalFamilyTemplate } from './questionFamilyTemplate.mjs';
import { fractionQuestionDrawsNumbers } from './fractionAnswer.mjs';

// The `generator.kind` values src/problemGenerator.js knows how to run.
export const LEGACY_GENERATOR_KINDS = Object.freeze([
  'stepLinearEquation',
  'literalLinear',
  'linearSystem',
  'functionTable',
  'orderedPair',
  'lineGraph',
  'lineFeatures',
  'parentFunctionGraph',
  'graphFeatureAnalysis',
]);

// Legacy types the runtime generates from defaults even with no generator.
export const LEGACY_SELF_GENERATING_TYPES = Object.freeze(['algebra', 'fraction', 'numberLine']);

export const VARIABILITY = Object.freeze({
  FAMILY: 'family',
  FAMILY_BROKEN: 'familyBroken',
  TEMPLATE: 'template',
  LEGACY_GENERATOR: 'legacyGenerator',
  LEGACY_SELF_GENERATING: 'legacySelfGenerating',
  VARIANTS: 'variants',
  UNRECOGNIZED_GENERATOR: 'unrecognizedGenerator',
  STATIC: 'static',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

const objectVariants = (question) => (Array.isArray(question?.variants)
  ? question.variants.filter((variant) => isObject(variant))
  : []);

/**
 * How this question varies between students, and whether it can at all.
 *
 *   canVary          the runtime will produce a different instance for a
 *                    different seat/variant (necessary, not sufficient, for
 *                    uniqueness — capacity is Pre-Flight's job)
 *   uniquenessManaged  class-wide distinct allocation is in effect (only the
 *                    question family engine does this)
 */
export const describeQuestionVariability = (question) => {
  if (!isObject(question)) {
    return { mode: VARIABILITY.STATIC, canVary: false, uniquenessManaged: false, reason: 'missing_question' };
  }
  if (isFamilyBackedQuestion(question)) {
    const definition = resolveQuestionFamilyDefinition(question, { slotKey: 'variability-check' });
    if (definition.error) {
      return { mode: VARIABILITY.FAMILY_BROKEN, canVary: false, uniquenessManaged: false, reason: definition.error, issues: definition.issues || [] };
    }
    return {
      mode: VARIABILITY.FAMILY,
      canVary: true,
      uniquenessManaged: true,
      reason: null,
      familyId: definition.family.id,
      familyVersion: definition.family.version,
      scope: definition.family.scope,
    };
  }
  if (hasLocalFamilyTemplate(question) || objectVariants(question).some((variant) => hasLocalFamilyTemplate(variant))) {
    return { mode: VARIABILITY.TEMPLATE, canVary: true, uniquenessManaged: false, reason: null };
  }
  const kind = clean(question.generator?.kind);
  if (kind && LEGACY_GENERATOR_KINDS.includes(kind)) {
    return { mode: VARIABILITY.LEGACY_GENERATOR, canVary: true, uniquenessManaged: false, reason: null, kind };
  }
  // A fraction question draws its own numbers only as a drill. Authored
  // operands or an authored answer are delivered as written to every student
  // (src/problemGenerator.js generateFraction), whatever generator settings
  // ride along with them.
  const isFraction = clean(question.type) === 'fraction';
  if (LEGACY_SELF_GENERATING_TYPES.includes(clean(question.type)) && (!isFraction || fractionQuestionDrawsNumbers(question))) {
    return { mode: VARIABILITY.LEGACY_SELF_GENERATING, canVary: true, uniquenessManaged: false, reason: null };
  }
  if (objectVariants(question).length >= 2) {
    return { mode: VARIABILITY.VARIANTS, canVary: true, uniquenessManaged: false, reason: null, variantCount: objectVariants(question).length };
  }
  if (isFraction) {
    return { mode: VARIABILITY.STATIC, canVary: false, uniquenessManaged: false, reason: 'authored_fraction' };
  }
  if (isObject(question.generator)) {
    return {
      mode: VARIABILITY.UNRECOGNIZED_GENERATOR,
      canVary: false,
      uniquenessManaged: false,
      reason: kind ? `unknown_generator_kind:${kind}` : 'generator_without_parameters',
    };
  }
  return { mode: VARIABILITY.STATIC, canVary: false, uniquenessManaged: false, reason: 'static_question' };
};

export const canGenerateDistinctVariants = (question) => describeQuestionVariability(question).canVary;
