/*
 * CANONICAL GRAPH FEATURES.
 *
 * "Find the zeros", "find the roots" and "find the x-intercepts" ask a
 * student to point at the same places on a graph. They are ONE feature —
 * `xIntercept` — with three ways of saying it, not three engines that could
 * drift apart. Everything that grades, ranks or reports uses the canonical
 * id; only the prompt a student reads varies.
 *
 * A feature declares:
 *
 *   id               permanent; stored on attempt receipts and in reports
 *   geometry         what a target is. Only 'point' is built today; a future
 *                    axis of symmetry or asymptote would be a 'line'
 *   multiTarget      whether one question can have several targets
 *   canNotExist      whether "Does Not Exist" can be the right answer
 *   vocabulary       the student-facing wordings, with the families each one
 *                    is mathematically appropriate for and the difficulty it
 *                    first appears at
 *
 * Prompt wording never reveals how many targets there are: "Find all
 * x-intercepts" reads the same for a line, a parabola with two and an
 * exponential with none. Counting them is part of the skill, and a prompt
 * that said "the x-intercept" for one would make "Does Not Exist" guessable.
 *
 * ADDING A FEATURE (an axis of symmetry, a hole, an endpoint, an asymptote,
 * an inflection point): declare it here, teach the families that have it to
 * produce its targets, and — for any geometry other than a point — give the
 * hit test (graphFeatureHitTest.mjs) a way to measure distance to it.
 * Nothing in the game engine changes.
 *
 * Pure: shared by Cloud Functions, the student device and tests.
 */

export class GraphFeatureRegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraphFeatureRegistryError';
  }
}

export const GRAPH_FEATURE = Object.freeze({
  X_INTERCEPT: 'xIntercept',
  Y_INTERCEPT: 'yIntercept',
  VERTEX: 'vertex',
  MAXIMUM: 'maximum',
  MINIMUM: 'minimum',
});

export const TARGET_GEOMETRY = Object.freeze({
  POINT: 'point',
});

// The difficulty tiers a generated question can belong to, easiest first.
export const QUESTION_TIER = Object.freeze({
  EASY: 'easy',
  STANDARD: 'standard',
  CHALLENGE: 'challenge',
});
export const QUESTION_TIER_ORDER = Object.freeze([QUESTION_TIER.EASY, QUESTION_TIER.STANDARD, QUESTION_TIER.CHALLENGE]);
export const tierRank = (tier) => Math.max(0, QUESTION_TIER_ORDER.indexOf(tier));

// Families whose zeros are conventionally called "roots" (polynomials).
const POLYNOMIAL_FAMILIES = Object.freeze(['linear', 'quadratic', 'cubic']);

// The target id a "Does Not Exist" press records. Exactly one per question,
// so a question whose feature is absent is a one-target question whose single
// target is found by that button.
export const DOES_NOT_EXIST_TARGET_ID = 'dne';

const FEATURE_ID_PATTERN = /^[a-z][A-Za-z0-9]{1,40}$/;

const normalizeVocabulary = (featureId, entries = []) => {
  if (!Array.isArray(entries) || !entries.length) {
    throw new GraphFeatureRegistryError(`Feature "${featureId}" needs at least one wording.`);
  }
  return Object.freeze(entries.map((entry) => {
    const id = String(entry?.id || '').trim();
    const prompt = String(entry?.prompt || '').trim();
    if (!id || !prompt) throw new GraphFeatureRegistryError(`Feature "${featureId}" has a wording without an id or prompt.`);
    const families = entry.families === 'any' || entry.families == null
      ? 'any'
      : Object.freeze([...new Set(entry.families.map(String))]);
    const minTier = QUESTION_TIER_ORDER.includes(entry.minTier) ? entry.minTier : QUESTION_TIER.EASY;
    return Object.freeze({ id, prompt, families, minTier });
  }));
};

/** Validate and freeze a feature declaration. */
export const defineGraphFeature = (definition = {}) => {
  const id = String(definition.id || '').trim();
  if (!FEATURE_ID_PATTERN.test(id)) throw new GraphFeatureRegistryError(`Invalid graph feature id "${id}".`);
  const geometry = definition.geometry || TARGET_GEOMETRY.POINT;
  if (!Object.values(TARGET_GEOMETRY).includes(geometry)) {
    throw new GraphFeatureRegistryError(`Feature "${id}" has an unsupported target geometry "${geometry}".`);
  }
  const label = String(definition.label || '').trim();
  const shortLabel = String(definition.shortLabel || label).trim();
  if (!label) throw new GraphFeatureRegistryError(`Feature "${id}" needs a label.`);
  return Object.freeze({
    id,
    label,
    shortLabel,
    geometry,
    multiTarget: definition.multiTarget === true,
    canNotExist: definition.canNotExist !== false,
    targetIdPrefix: String(definition.targetIdPrefix || id.slice(0, 1)),
    vocabulary: normalizeVocabulary(id, definition.vocabulary),
    // What a wrong tap is told, briefly. Never a hint about where to look.
    missMessage: String(definition.missMessage || 'Not there — try again.'),
  });
};

const REGISTRY = new Map();

export const registerGraphFeature = (definition) => {
  const feature = defineGraphFeature(definition);
  if (REGISTRY.has(feature.id)) throw new GraphFeatureRegistryError(`Graph feature "${feature.id}" is already registered.`);
  REGISTRY.set(feature.id, feature);
  return feature;
};

registerGraphFeature({
  id: GRAPH_FEATURE.X_INTERCEPT,
  label: 'x-intercepts (zeros, roots)',
  shortLabel: 'x-intercepts',
  multiTarget: true,
  canNotExist: true,
  targetIdPrefix: 'x',
  missMessage: 'Not an x-intercept — try again.',
  vocabulary: [
    { id: 'xIntercepts', prompt: 'Find all x-intercepts', families: 'any', minTier: QUESTION_TIER.EASY },
    { id: 'zeros', prompt: 'Find all zeros', families: 'any', minTier: QUESTION_TIER.STANDARD },
    // "Roots" belongs to polynomials; asking for the roots of an exponential
    // would be loose language a teacher would correct.
    { id: 'roots', prompt: 'Find all roots', families: POLYNOMIAL_FAMILIES, minTier: QUESTION_TIER.STANDARD },
  ],
});

registerGraphFeature({
  id: GRAPH_FEATURE.Y_INTERCEPT,
  label: 'y-intercept',
  shortLabel: 'y-intercept',
  multiTarget: false,
  canNotExist: true,
  targetIdPrefix: 'y',
  missMessage: 'Not the y-intercept — try again.',
  vocabulary: [
    { id: 'yIntercept', prompt: 'Find the y-intercept', families: 'any', minTier: QUESTION_TIER.EASY },
  ],
});

registerGraphFeature({
  id: GRAPH_FEATURE.VERTEX,
  label: 'vertex',
  shortLabel: 'vertex',
  multiTarget: false,
  // Only asked of parabolas and absolute value graphs, which always have one.
  canNotExist: false,
  targetIdPrefix: 'v',
  missMessage: 'Not the vertex — try again.',
  vocabulary: [
    { id: 'vertex', prompt: 'Find the vertex', families: ['quadratic', 'absolute'], minTier: QUESTION_TIER.EASY },
  ],
});

registerGraphFeature({
  id: GRAPH_FEATURE.MAXIMUM,
  label: 'maximum',
  shortLabel: 'maximum',
  multiTarget: false,
  canNotExist: true,
  targetIdPrefix: 'max',
  missMessage: 'Not the maximum — try again.',
  vocabulary: [
    { id: 'maximum', prompt: 'Find the maximum', families: 'any', minTier: QUESTION_TIER.EASY },
  ],
});

registerGraphFeature({
  id: GRAPH_FEATURE.MINIMUM,
  label: 'minimum',
  shortLabel: 'minimum',
  multiTarget: false,
  canNotExist: true,
  targetIdPrefix: 'min',
  missMessage: 'Not the minimum — try again.',
  vocabulary: [
    { id: 'minimum', prompt: 'Find the minimum', families: 'any', minTier: QUESTION_TIER.EASY },
  ],
});

export const isGraphFeature = (id) => REGISTRY.has(String(id || ''));
export const getGraphFeature = (id) => REGISTRY.get(String(id || '')) || null;
export const listGraphFeatures = () => [...REGISTRY.values()];
export const GRAPH_FEATURE_IDS = Object.freeze(Object.values(GRAPH_FEATURE));

/**
 * The wordings a question may use: appropriate for its family and already
 * introduced at its tier. Easy questions always use the plain name.
 */
export const featureWordings = (featureId, { family = null, tier = QUESTION_TIER.STANDARD } = {}) => {
  const feature = getGraphFeature(featureId);
  if (!feature) return [];
  return feature.vocabulary.filter((entry) => (
    tierRank(entry.minTier) <= tierRank(tier)
    && (entry.families === 'any' || (family && entry.families.includes(family)))
  ));
};

/** The canonical id of a target, ordered left to right: x1, x2, ... */
export const featureTargetId = (featureId, index = 0) => {
  const feature = getGraphFeature(featureId);
  const prefix = feature?.targetIdPrefix || 't';
  return feature?.multiTarget ? `${prefix}${index + 1}` : prefix;
};
