/*
 * ASSIGNMENT-LOCAL FAMILIES: ONE CONTRACT, NOT A SECOND ENGINE.
 *
 * Some problems belong to one assignment — Maria's phone plan, the bake-sale
 * table — and should not become a global platform family. MathMaster already
 * has a way to author those: the Path's substitution template
 *
 *   "generator": {
 *     "parameters":  { "a": { "type": "int", "min": 2, "max": 10 } },
 *     "derived":     { "ans": "max(a,b)" },
 *     "constraints": ["a != b"]
 *   }
 *
 * with {{a}}, {{ans}} written wherever those numbers belong. This file adapts
 * such a question into a question family with the SAME contract the platform
 * library uses, so it gets the same things: exact capacity, fingerprints,
 * class-wide uniqueness, Pre-Flight, Recovery exclusion and server grading.
 *
 * It reuses the Path's own expression language and substitution
 * (pathQuestionGeneration.mjs) rather than re-implementing them — the template
 * means exactly what it means on the Path.
 *
 * What differs from a Path draw: the PARAMETERS come from the engine's
 * permutation (questionFamilyEngine.mjs) instead of a fresh random stream, so
 * an allocation index names one tuple and two indices never name the same
 * question.
 */

import {
  FAMILY_SCOPE,
  canonicalNumber,
  choiceDomain,
  defineQuestionFamily,
  intDomain,
} from './questionFamilyContract.mjs';
import { hashString32 } from './questionFamilyEngine.mjs';
import {
  evaluateExpression,
  orderDerivedExpressions,
  placeholderOccurrences,
  placeholdersUsed,
  substitutePlaceholders,
} from './pathQuestionGeneration.mjs';
import { stableStringify } from './idUtils.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

const MAX_DECIMAL_VALUES = 401;

/** Finite domain for one authored parameter spec. */
const domainForSpec = (spec = {}) => {
  const type = clean(spec.type) || 'int';
  if (type === 'choice') return choiceDomain(Array.isArray(spec.values) ? spec.values : []);
  const min = Number(spec.min);
  const max = Number(spec.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return choiceDomain([]);
  const exclude = Array.isArray(spec.exclude) ? spec.exclude.map(Number) : [];
  if (type === 'decimal') {
    // A decimal parameter is finite at its stated precision. Very wide ranges
    // are thinned evenly rather than truncated at one end, so the domain still
    // spans what the author asked for.
    const places = Number.isFinite(Number(spec.places)) ? Math.max(0, Math.min(4, Number(spec.places))) : 2;
    const unit = 10 ** -places;
    const count = Math.floor((max - min) / unit) + 1;
    const stride = Math.max(1, Math.ceil(count / MAX_DECIMAL_VALUES));
    const values = [];
    for (let step = 0; step < count && values.length < MAX_DECIMAL_VALUES; step += stride) {
      const value = Number((min + step * unit).toFixed(places));
      if (!exclude.includes(value)) values.push(value);
    }
    return choiceDomain(values);
  }
  const step = Number.isFinite(Number(spec.step)) && Number(spec.step) > 0 ? Number(spec.step) : 1;
  return intDomain(min, max, { exclude, step });
};

const TEMPLATE_FIELDS_EXCLUDED_FROM_DOCUMENT = ['generator', 'variants', 'questionFamily'];

const documentOf = (question) => {
  const document = { ...question };
  TEMPLATE_FIELDS_EXCLUDED_FROM_DOCUMENT.forEach((field) => { delete document[field]; });
  return document;
};

/*
 * THE FINGERPRINT OF A FILLED TEMPLATE.
 *
 * The question a student reads is the filled document, so that is what is
 * compared — with the two kinds of difference that do not make a new problem
 * removed: answer-choice ORDER (sorted here) and identity fields (ids, section
 * labels) that are the same for every student anyway.
 */
const FINGERPRINT_IGNORED_FIELDS = new Set([
  'id', 'questionId', 'sectionId', 'sectionTitle', 'activityRole', 'role',
  // The grade value and the record of who set it are scoring, not mathematics:
  // re-weighting a question must never change which question it is (a pinned
  // delivery would stop replaying).
  'questionWeight', 'questionWeightBasis',
  'alignments', 'standard', 'teks', 'familyId', 'familyVersion',
]);

const mathematicalContent = (document) => {
  const content = {};
  Object.entries(document || {}).forEach(([key, value]) => {
    if (FINGERPRINT_IGNORED_FIELDS.has(key)) return;
    content[key] = value;
  });
  if (Array.isArray(content.choices)) {
    content.choices = [...content.choices].map((choice) => stableStringify(choice)).sort();
  }
  return content;
};

const hash64Hex = (text) => {
  const first = hashString32(text).toString(16).padStart(8, '0');
  const second = hashString32(text, 0x9e3779b9).toString(16).padStart(8, '0');
  return `${first}${second}`;
};

/** Deterministic shuffle keyed by the instance itself, never by a student. */
const shuffleChoices = (choices, seedKey) => {
  const ordered = [...choices];
  let state = hashString32(seedKey) || 1;
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state ^ (state >>> 15), 2246822519) + 0x6d2b79f5) >>> 0;
    const swap = state % (index + 1);
    [ordered[index], ordered[swap]] = [ordered[swap], ordered[index]];
  }
  return ordered;
};

/**
 * Does this question carry an assignment-local template the adapter can use?
 */
export const hasLocalFamilyTemplate = (question) => Boolean(
  (question?.questionFamily?.scope === 'assignment' && Array.isArray(question?.variants) && question.variants.length >= 2)
  || (isObject(question?.generator)
  && isObject(question.generator.parameters)
  && Object.keys(question.generator.parameters).length > 0),
);

/**
 * Structural faults in a template, found before any student sees it.
 *
 * Returns reason codes in the Path generator's own vocabulary
 * (`derived_cycle:…`, `unbound_placeholders:…`) so a teacher-facing message
 * means the same thing in Pre-Flight that it means on the Path.
 */
export const templateStructuralIssues = (question) => {
  if (Array.isArray(question?.variants) && question.variants.length >= 2) {
    return question.variants.every(isObject) ? [] : ['invalid_variant_document'];
  }
  if (!hasLocalFamilyTemplate(question)) return ['not_a_template'];
  const generator = question.generator;
  const names = Object.keys(generator.parameters);
  const plan = orderDerivedExpressions(names, isObject(generator.derived) ? generator.derived : {});
  const issues = [];
  if (plan.reason) issues.push(plan.reason);
  const derivedNames = Object.keys(isObject(generator.derived) ? generator.derived : {});
  const bound = new Set([...names, ...derivedNames]);
  const unbound = [...placeholdersUsed(documentOf(question))].filter((name) => !bound.has(name));
  if (unbound.length) issues.push(`unbound_placeholders:${unbound.sort().join(',')}`);
  const emptyDomains = names.filter((name) => domainForSpec(generator.parameters[name]).values.length === 0);
  if (emptyDomains.length) issues.push(`empty_parameter_domain:${emptyDomains.sort().join(',')}`);
  return issues;
};

/**
 * Placeholders an authored template uses that a transformed copy of it carries
 * FEWER times — a templated value that a transformation (the V5 authoring
 * compiler) dropped, or coerced into something that is no longer a token.
 *
 * Either way the student would be generated a question without that value:
 * `function.m: "{{m}}"` coerced to NaN draws no line, and a templated field the
 * tool does not keep simply never reaches the screen. Counting occurrences
 * rather than names catches the loss even when the name survives elsewhere
 * (in the prompt, say). Returns the names, sorted; empty means nothing lost.
 */
export const lostTemplatePlaceholders = (authored, transformed) => {
  const before = placeholderOccurrences(documentOf(isObject(authored) ? authored : {}));
  const after = placeholderOccurrences(documentOf(isObject(transformed) ? transformed : {}));
  return Object.keys(before).filter((name) => (after[name] || 0) < before[name]).sort();
};

/**
 * The family for one template question.
 *
 * `slotKey` names the slot the template lives in (assignment + question id), so
 * two assignments that happen to share a template still get unrelated ids.
 * Throws QuestionFamilyDefinitionError for an unusable template — callers that
 * must not throw (the student runtime) catch it and fail closed for that one
 * question.
 */
export const buildTemplateFamily = (question, { slotKey = '' } = {}) => {
  const issues = templateStructuralIssues(question);
  if (issues.length) {
    const error = new Error(`Assignment template cannot generate questions: ${issues.join('; ')}`);
    error.templateIssues = issues;
    throw error;
  }
  if (Array.isArray(question.variants) && question.variants.length >= 2) {
    const document = documentOf(question);
    const variants = question.variants.map((variant) => ({ ...document, ...documentOf(variant) }));
    const contentHash = hash64Hex(stableStringify(variants));
    const id = `local:${clean(slotKey).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120) || contentHash}`;
    const tool = clean(question.type) || 'multiAnswer';
    const resolve = (values) => variants[values.variant];
    return defineQuestionFamily({
      id, scope: FAMILY_SCOPE.ASSIGNMENT, version: 1,
      title: clean(question.title) || 'Parallel review task',
      skill: { objective: clean(question.prompt) || 'District review', alignments: (question.alignments || []).map((a) => clean(a?.code || a)) },
      difficulty: { band: Number(question.difficultyBand) || 3, dok: Number(question.dok) || 2 },
      constraints: {}, parameters: () => ({ variant: intDomain(0, variants.length - 1) }), derive: () => ({}), rules: () => [],
      fingerprint: (values) => `${id}:${hash64Hex(stableStringify(mathematicalContent(resolve(values))))}`,
      answer: (values) => ({ kind: 'fields', value: Object.fromEntries((resolve(values).answerFields || []).map((field) => [field.id, field.answer])), parameters: { variant: values.variant } }),
      tools: { [tool]: (values) => resolve(values) }, defaultTool: tool,
      recovery: { eligible: question.questionFamily?.recoveryEligible !== false },
      source: Object.freeze({ kind: 'template', contentHash, slotKey: clean(slotKey) }),
    });
  }
  const generator = question.generator;
  const parameterNames = Object.keys(generator.parameters).sort();
  const derived = isObject(generator.derived) ? generator.derived : {};
  const derivedPlan = orderDerivedExpressions(parameterNames, derived);
  const constraints = Array.isArray(generator.constraints) ? generator.constraints : [];
  const document = documentOf(question);
  const contentHash = hash64Hex(stableStringify({ generator, document }));
  const familyId = `local:${clean(slotKey).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 120) || contentHash}`;
  const toolType = clean(question.type) || 'multiAnswer';

  return defineQuestionFamily({
    id: familyId,
    scope: FAMILY_SCOPE.ASSIGNMENT,
    version: Math.max(1, Math.round(Number(generator.version) || 1)),
    title: clean(question.title) || clean(question.prompt).slice(0, 80) || 'Assignment question template',
    skill: {
      objective: clean(question.objective?.label) || clean(question.prompt).slice(0, 160) || 'Assignment-specific generated question',
      alignments: (Array.isArray(question.alignments) ? question.alignments : [])
        .map((alignment) => clean(alignment?.code || alignment))
        .filter(Boolean)
        .concat(clean(question.standard) ? [clean(question.standard)] : []),
    },
    difficulty: {
      band: Math.min(5, Math.max(1, Math.round(Number(question.difficultyBand ?? question.difficulty?.generatorBand) || 3))),
      dok: Math.min(4, Math.max(1, Math.round(Number(question.dok) || 2))),
    },
    constraints: {},
    parameters: () => Object.fromEntries(parameterNames.map((name) => [name, domainForSpec(generator.parameters[name])])),
    derive: (params) => {
      const scope = { ...params };
      derivedPlan.entries.forEach(([name, expression]) => {
        const value = evaluateExpression(expression, scope);
        if (value === null) throw new Error(`derived_unavailable:${name}`);
        scope[name] = value;
      });
      const derivedValues = {};
      derivedPlan.entries.forEach(([name]) => { derivedValues[name] = scope[name]; });
      return derivedValues;
    },
    rules: (values) => (
      constraints.every((expression) => evaluateExpression(expression, values) === 1)
        ? []
        : ['template_constraint']
    ),
    fingerprint: (values) => {
      const filled = substitutePlaceholders(document, values);
      return `${familyId}:${hash64Hex(stableStringify(mathematicalContent(filled)))}`;
    },
    answer: (values) => {
      const filled = substitutePlaceholders(document, values);
      const fields = Array.isArray(filled.answerFields) ? filled.answerFields : [];
      return {
        kind: 'fields',
        value: Object.fromEntries(fields.filter((field) => field?.id).map((field) => [field.id, field.answer ?? field.expected ?? null])),
        display: fields.map((field) => `${field.label || field.id}: ${field.answer ?? field.expected ?? ''}`).join('; '),
        parameters: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, canonicalNumber(value)])),
      };
    },
    tools: {
      [toolType]: (values) => {
        const filled = substitutePlaceholders(document, values);
        if (Array.isArray(filled.choices) && filled.choices.length > 1) {
          filled.choices = shuffleChoices(filled.choices, `${familyId}|${stableStringify(values)}`);
        }
        return filled;
      },
    },
    defaultTool: toolType,
    recovery: { eligible: question?.questionFamily?.recoveryEligible !== false },
    source: Object.freeze({ kind: 'template', contentHash, slotKey: clean(slotKey) }),
  });
};
