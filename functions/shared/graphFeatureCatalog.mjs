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
  { id: 'linear', label: 'Linear', existsFrom: { xIntercept: 'easy', yIntercept: 'easy', vertex: null, maximum: null, minimum: null } },
  { id: 'quadratic', label: 'Quadratic', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: 'easy', maximum: 'easy', minimum: 'easy' } },
  { id: 'absolute', label: 'Absolute value', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: 'easy', maximum: 'easy', minimum: 'easy' } },
  { id: 'cubic', label: 'Cubic', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: null, maximum: null, minimum: null } },
  { id: 'exponential', label: 'Exponential', existsFrom: { xIntercept: 'standard', yIntercept: 'easy', vertex: null, maximum: null, minimum: null } },
  { id: 'squareRoot', label: 'Square root', existsFrom: { xIntercept: 'easy', yIntercept: 'easy', vertex: null, maximum: 'standard', minimum: 'easy' } },
  { id: 'cubeRoot', label: 'Cube root', existsFrom: { xIntercept: 'standard', yIntercept: 'standard', vertex: null, maximum: null, minimum: null } },
  { id: 'rational', label: 'Rational', existsFrom: { xIntercept: 'standard', yIntercept: 'standard', vertex: null, maximum: null, minimum: null } },
  { id: 'piecewise', label: 'Piecewise', existsFrom: { xIntercept: 'standard', yIntercept: 'standard', vertex: null, maximum: 'challenge', minimum: 'challenge' } },
].map((entry) => Object.freeze({ ...entry, existsFrom: Object.freeze({ ...entry.existsFrom }) })));

export const GRAPH_FAMILY_CATALOG_IDS = Object.freeze(GRAPH_FAMILY_CATALOG.map((entry) => entry.id));

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
