/*
 * THE GRAPH FAMILIES AT A GLANCE.
 *
 * Each family's name, and the easiest difficulty at which it can ask each
 * feature with a real answer (null: never — that feature only ever "does not
 * exist" on it, or is not asked of it at all).
 *
 * A static summary of graphFeatureFamilies.mjs, which builds and analyses the
 * graphs and is far too large for a teacher's setup screen or the mode
 * registry to carry. The two cannot drift: graphFeatureRushMath tests compare
 * every cell of this table with what the families themselves report, and fail
 * the moment a family learns or loses a feature without this table following.
 *
 * Pure and dependency-free: shared by Cloud Functions, browsers and tests.
 */

export const GRAPH_FAMILY_CATALOG = Object.freeze([
  { id: 'linear', label: 'Linear', existsFrom: { xIntercept: 'easy', yIntercept: 'easy', vertex: null, maximum: null, minimum: null, asymptote: null, domain: 'easy', range: 'easy' } },
  { id: 'quadratic', label: 'Quadratic', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: 'easy', maximum: 'easy', minimum: 'easy', asymptote: null, domain: 'easy', range: 'easy' } },
  { id: 'absolute', label: 'Absolute value', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: 'easy', maximum: 'easy', minimum: 'easy', asymptote: null, domain: 'easy', range: 'easy' } },
  { id: 'cubic', label: 'Cubic', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: null, maximum: null, minimum: null, asymptote: null, domain: 'standard', range: 'standard' } },
  { id: 'exponential', label: 'Exponential', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: null, maximum: null, minimum: null, asymptote: 'easy', domain: 'standard', range: 'standard' } },
  { id: 'squareRoot', label: 'Square root', existsFrom: { xIntercept: 'easy', yIntercept: 'easy', vertex: null, maximum: 'standard', minimum: 'easy', asymptote: null, domain: 'easy', range: 'easy' } },
  { id: 'cubeRoot', label: 'Cube root', existsFrom: { xIntercept: 'standard', yIntercept: 'standard', vertex: null, maximum: null, minimum: null, asymptote: null, domain: 'standard', range: 'standard' } },
  { id: 'rational', label: 'Rational', existsFrom: { xIntercept: 'standard', yIntercept: 'standard', vertex: null, maximum: null, minimum: null, asymptote: 'standard', domain: 'standard', range: 'standard' } },
  { id: 'piecewise', label: 'Piecewise', existsFrom: { xIntercept: 'standard', yIntercept: 'standard', vertex: null, maximum: 'challenge', minimum: 'challenge', asymptote: null, domain: 'standard', range: 'challenge' } },
].map((entry) => Object.freeze({ ...entry, existsFrom: Object.freeze({ ...entry.existsFrom }) })));

export const GRAPH_FAMILY_CATALOG_IDS = Object.freeze(GRAPH_FAMILY_CATALOG.map((entry) => entry.id));

/*
 * Which features a family can put OFF THE SCREEN (the feature exists past the
 * edge of the view; a game with off-screen features turned on), from which
 * tier. Held to the families' `offScreen` variants by test, like existsFrom.
 */
export const GRAPH_FAMILY_OFF_SCREEN = Object.freeze({
  linear: Object.freeze({ xIntercept: 'standard', yIntercept: 'standard' }),
  quadratic: Object.freeze({ vertex: 'standard' }),
  absolute: Object.freeze({ xIntercept: 'challenge', vertex: 'challenge' }),
});

const BY_ID = new Map(GRAPH_FAMILY_CATALOG.map((entry) => [entry.id, entry]));
const TIER_ORDER = Object.freeze(['easy', 'standard', 'challenge']);

export const graphFamilyLabel = (id) => BY_ID.get(String(id || ''))?.label || null;

/**
 * Whether a family can ask a feature with a real answer at a difficulty tier
 * (the tier or anything easier). Equal to familySupportsFeature in
 * graphFeatureFamilies.mjs, by test.
 */
export const catalogSupportsFeature = (familyId, featureId, tier = 'challenge') => {
  const from = BY_ID.get(String(familyId || ''))?.existsFrom?.[featureId];
  if (!from) return false;
  return TIER_ORDER.indexOf(from) <= Math.max(0, TIER_ORDER.indexOf(tier));
};

/** Whether a family can put a feature off the screen at a tier (or below). */
export const catalogOffScreenFeature = (familyId, featureId, tier = 'challenge') => {
  const from = GRAPH_FAMILY_OFF_SCREEN[String(familyId || '')]?.[featureId];
  if (!from) return false;
  return TIER_ORDER.indexOf(from) <= Math.max(0, TIER_ORDER.indexOf(tier));
};
