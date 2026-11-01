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
 *   geometry         what a target is: a 'point' (an intercept, a vertex), a
 *                    'line' (an asymptote: a tap anywhere near it counts) or
 *                    a 'set' (a domain or range: a set of numbers the student
 *                    draws on an axis and checks)
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
  ASYMPTOTE: 'asymptote',
  DOMAIN: 'domain',
  RANGE: 'range',
  INCREASING: 'increasing',
  DECREASING: 'decreasing',
  CONSTANT: 'constant',
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
});

// The features every game had before asymptotes: what the existing presets
// ask, unchanged as the registry grows.
export const CLASSIC_GRAPH_FEATURE_IDS = Object.freeze([
  GRAPH_FEATURE.X_INTERCEPT,
  GRAPH_FEATURE.Y_INTERCEPT,
  GRAPH_FEATURE.VERTEX,
  GRAPH_FEATURE.MAXIMUM,
  GRAPH_FEATURE.MINIMUM,
]);

export const TARGET_GEOMETRY = Object.freeze({
  POINT: 'point',
  // A vertical (x = c) or horizontal (y = c) line.
  LINE: 'line',
  // A set of real numbers, drawn on an axis (numberLineSets.mjs).
  SET: 'set',
});

// The features whose answer is a set drawn on an axis, and the axis: a
// range on the y-axis, everything else — a domain, and where a graph rises,
// falls, stays level, or is above or below the x-axis — on the x-axis.
export const SET_FEATURE_AXIS = Object.freeze({
  domain: 'x',
  range: 'y',
  increasing: 'x',
  decreasing: 'x',
  constant: 'x',
  positive: 'x',
  negative: 'x',
});
// The interval features: sets of x that can be empty ("Does Not Exist").
export const INTERVAL_FEATURE_IDS = Object.freeze(['increasing', 'decreasing', 'constant', 'positive', 'negative']);
export const isIntervalFeature = (id) => INTERVAL_FEATURE_IDS.includes(String(id || ''));
export const isSetFeature = (id) => Object.prototype.hasOwnProperty.call(SET_FEATURE_AXIS, String(id || ''));

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

// The target id an "Off screen" press records: the feature exists, but every
// one of its targets lies past the edge of the view (a game with off-screen
// features turned on). Like "Does Not Exist", one per question.
export const OFF_SCREEN_TARGET_ID = 'offScreen';

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

registerGraphFeature({
  id: GRAPH_FEATURE.ASYMPTOTE,
  label: 'asymptotes',
  shortLabel: 'asymptotes',
  geometry: TARGET_GEOMETRY.LINE,
  multiTarget: true,
  canNotExist: true,
  targetIdPrefix: 'a',
  missMessage: 'Not an asymptote — try again.',
  vocabulary: [
    // A rational graph has two, an exponential one, everything else none:
    // never said, like the number of zeros.
    { id: 'asymptotes', prompt: 'Find all asymptotes', families: 'any', minTier: QUESTION_TIER.EASY },
  ],
});

/*
 * DOMAIN AND RANGE are answered on an axis, built by tapping the graph
 * itself: a point where it starts, stops or turns drops a dot at its x (a
 * domain) or its y (a range) — once for a closed dot, twice for open, a third
 * time to take it away — an arrow says "keeps going", and ✓ Check sends the
 * drawing. Every function has both, so neither is ever "Does Not Exist".
 */
registerGraphFeature({
  id: GRAPH_FEATURE.DOMAIN,
  label: 'domain',
  shortLabel: 'domain',
  geometry: TARGET_GEOMETRY.SET,
  multiTarget: false,
  canNotExist: false,
  targetIdPrefix: 'dom',
  missMessage: 'Not the domain — look again.',
  vocabulary: [
    { id: 'domain', prompt: 'Mark the domain', families: 'any', minTier: QUESTION_TIER.EASY },
  ],
});

registerGraphFeature({
  id: GRAPH_FEATURE.RANGE,
  label: 'range',
  shortLabel: 'range',
  geometry: TARGET_GEOMETRY.SET,
  multiTarget: false,
  canNotExist: false,
  targetIdPrefix: 'ran',
  missMessage: 'Not the range — look again.',
  vocabulary: [
    { id: 'range', prompt: 'Mark the range', families: 'any', minTier: QUESTION_TIER.EASY },
  ],
});

/*
 * WHERE A GRAPH RISES, FALLS OR STAYS LEVEL, AND WHERE IT IS ABOVE OR BELOW
 * THE x-AXIS: sets of x, drawn on the x-axis exactly as a domain is, by
 * tapping the graph (its turning points, zeros, ends and arrows). Increasing,
 * decreasing and constant are written as open intervals, the convention a
 * class uses: where a graph turns, starts or stops is never in the set.
 * Positive and negative are f(x) > 0 and f(x) < 0: a zero is never in the
 * set, a closed end of the graph is when the graph is above (below) the axis
 * there. Any of them can be empty — a parabola is never constant, a line
 * with a positive slope never decreasing — and then "Does Not Exist" is the
 * answer, so every question offers that button.
 */
const intervalFeature = ({ id, label, word, prefix }) => registerGraphFeature({
  id,
  label: `${label} intervals`,
  shortLabel: `${label} intervals`,
  geometry: TARGET_GEOMETRY.SET,
  multiTarget: false,
  canNotExist: true,
  targetIdPrefix: prefix,
  missMessage: `Not where it is ${word} — look again.`,
  vocabulary: [
    { id, prompt: `Mark where it is ${word}`, families: 'any', minTier: QUESTION_TIER.EASY },
  ],
});

intervalFeature({ id: GRAPH_FEATURE.INCREASING, label: 'increasing', word: 'increasing', prefix: 'inc' });
intervalFeature({ id: GRAPH_FEATURE.DECREASING, label: 'decreasing', word: 'decreasing', prefix: 'dec' });
intervalFeature({ id: GRAPH_FEATURE.CONSTANT, label: 'constant', word: 'constant', prefix: 'con' });
intervalFeature({ id: GRAPH_FEATURE.POSITIVE, label: 'positive', word: 'positive', prefix: 'pos' });
intervalFeature({ id: GRAPH_FEATURE.NEGATIVE, label: 'negative', word: 'negative', prefix: 'neg' });

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
