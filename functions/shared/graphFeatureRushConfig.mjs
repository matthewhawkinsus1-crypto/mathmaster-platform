/*
 * GRAPH FEATURE RUSH: WHAT A TEACHER CHOOSES.
 *
 * Three choices shape the questions — which function families, which
 * features, and how hard — and the game's own settings (rounds, seconds,
 * scoring) live on the room like every other mode's. Course names are not
 * part of validation: "Algebra I" is a PRESET, a starting point a teacher can
 * change, not a rule. Validation asks only whether the families chosen can
 * actually produce the features chosen at the difficulty chosen.
 *
 * A teacher who picks "vertex" with only lines selected is told plainly that
 * vertex questions need parabolas or absolute value graphs — at creation,
 * not by a class staring at an impossible game.
 *
 * Pure and light — no generator, and the families only through their static
 * catalog (graphFeatureCatalog.mjs) — so the mode registry and the teacher's
 * setup screen carry it without the graph builders.
 */

import { catalogSupportsFeature, graphFamilyLabel, GRAPH_FAMILY_CATALOG_IDS as GRAPH_FAMILY_IDS } from './graphFeatureCatalog.mjs';
import { getGraphFeature, GRAPH_FEATURE, GRAPH_FEATURE_IDS, QUESTION_TIER, QUESTION_TIER_ORDER } from './graphFeatureRegistry.mjs';

export class GraphFeatureRushConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraphFeatureRushConfigError';
  }
}

export const RUSH_DIFFICULTY = Object.freeze({
  EASY: QUESTION_TIER.EASY,
  STANDARD: QUESTION_TIER.STANDARD,
  CHALLENGE: QUESTION_TIER.CHALLENGE,
  MIXED: 'mixed',
});

export const RUSH_DIFFICULTY_OPTIONS = Object.freeze([
  Object.freeze({ id: RUSH_DIFFICULTY.EASY, label: 'Easy', description: 'Simple families, whole-number features, one target per graph.' }),
  Object.freeze({ id: RUSH_DIFFICULTY.STANDARD, label: 'Standard', description: 'Several intercepts, some halves, zeros and roots, an occasional "does not exist".' }),
  Object.freeze({ id: RUSH_DIFFICULTY.CHALLENGE, label: 'Challenge', description: 'Wider scales, three-zero cubics, asymptotes and domains, more "does not exist".' }),
  Object.freeze({ id: RUSH_DIFFICULTY.MIXED, label: 'Mixed', description: 'Starts gentle, then mixes Standard and Challenge.' }),
]);

const DIFFICULTIES = new Set(Object.values(RUSH_DIFFICULTY));

/** The tiers a difficulty draws from. */
export const difficultyTiers = (difficulty) => (difficulty === RUSH_DIFFICULTY.MIXED
  ? [...QUESTION_TIER_ORDER]
  : [difficulty]);

export const RUSH_ROUND_LIMITS = Object.freeze({
  minRounds: 1,
  maxRounds: 8,
  defaultRounds: 3,
  minSeconds: 30,
  maxSeconds: 120,
  defaultSeconds: 60,
  secondsOptions: Object.freeze([30, 45, 60, 90, 120]),
});

export const GRAPH_FEATURE_RUSH_PRESETS = Object.freeze([
  Object.freeze({
    id: 'algebra1Quick',
    label: 'Quick Algebra I',
    course: 'algebra1',
    description: 'Lines and parabolas — intercepts and vertices.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    families: Object.freeze(['linear', 'quadratic']),
    features: Object.freeze([GRAPH_FEATURE.X_INTERCEPT, GRAPH_FEATURE.Y_INTERCEPT, GRAPH_FEATURE.VERTEX]),
    difficulty: RUSH_DIFFICULTY.STANDARD,
  }),
  Object.freeze({
    id: 'algebra1Functions',
    label: 'Algebra I Functions',
    course: 'algebra1',
    description: 'Linear, quadratic and exponential — intercepts, vertex, maximum and minimum.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    families: Object.freeze(['linear', 'quadratic', 'exponential']),
    features: Object.freeze([...GRAPH_FEATURE_IDS]),
    difficulty: RUSH_DIFFICULTY.STANDARD,
  }),
  Object.freeze({
    id: 'interceptSprint',
    label: 'Intercept Sprint',
    course: null,
    description: 'A fast warm-up: x- and y-intercepts only, one target per graph.',
    roundCount: 2,
    roundSeconds: 45,
    scoringStrategyId: 'correctCount',
    families: Object.freeze(['linear', 'quadratic', 'absolute']),
    features: Object.freeze([GRAPH_FEATURE.X_INTERCEPT, GRAPH_FEATURE.Y_INTERCEPT]),
    difficulty: RUSH_DIFFICULTY.EASY,
  }),
  Object.freeze({
    id: 'algebra2Mixed',
    label: 'Algebra II Mixed',
    course: 'algebra2',
    description: 'Parent functions from parabolas to rationals, every feature, ramping difficulty.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    families: Object.freeze(['quadratic', 'absolute', 'cubic', 'squareRoot', 'rational', 'exponential', 'piecewise']),
    features: Object.freeze([...GRAPH_FEATURE_IDS]),
    difficulty: RUSH_DIFFICULTY.MIXED,
  }),
  Object.freeze({
    id: 'algebra2Challenge',
    label: 'Algebra II Challenge',
    course: 'algebra2',
    description: 'All nine families at Challenge: asymptotes, domains and "does not exist".',
    roundCount: 3,
    roundSeconds: 90,
    scoringStrategyId: 'grandPrix',
    families: Object.freeze([...GRAPH_FAMILY_IDS]),
    features: Object.freeze([...GRAPH_FEATURE_IDS]),
    difficulty: RUSH_DIFFICULTY.CHALLENGE,
  }),
]);

export const getRushPreset = (id) => GRAPH_FEATURE_RUSH_PRESETS.find((preset) => preset.id === id) || null;

/** The preset a class of this course starts from. */
export const defaultRushPresetFor = (courseId) => (
  courseId === 'algebra2' ? getRushPreset('algebra2Mixed') : getRushPreset('algebra1Quick')
);

const listOf = (raw, allowed) => [...new Set((Array.isArray(raw) ? raw : []).map(String))]
  .filter((entry) => allowed.includes(entry))
  // Canonical order, so equal configs compare equal.
  .sort((left, right) => allowed.indexOf(left) - allowed.indexOf(right));

const joinNames = (names) => (names.length <= 1
  ? names.join('')
  : `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`);

const familyNames = (ids) => ids.map((id) => (graphFamilyLabel(id) || id).toLowerCase());

/**
 * Which selected features the selected families cannot ask at this
 * difficulty, each with a sentence a teacher can act on.
 */
export const unsupportedRushFeatures = ({ families = [], features = [], difficulty = RUSH_DIFFICULTY.STANDARD } = {}) => {
  const tiers = difficultyTiers(difficulty);
  const hardest = tiers[tiers.length - 1];
  return features.flatMap((feature) => {
    const supported = families.some((family) => tiers.some((tier) => catalogSupportsFeature(family, feature, tier)));
    if (supported) return [];
    const label = getGraphFeature(feature)?.shortLabel || feature;
    const anywhere = GRAPH_FAMILY_IDS.filter((family) => catalogSupportsFeature(family, feature, hardest));
    const atAll = GRAPH_FAMILY_IDS.filter((family) => catalogSupportsFeature(family, feature, QUESTION_TIER.CHALLENGE));
    const message = anywhere.length
      ? `${label[0].toUpperCase()}${label.slice(1)} questions at this difficulty need ${joinNames(familyNames(anywhere))} graphs.`
      : `${label[0].toUpperCase()}${label.slice(1)} questions need ${joinNames(familyNames(atAll))} graphs at a harder difficulty.`;
    return [{ feature, message }];
  });
};

/**
 * The validated question settings for a room. Throws
 * GraphFeatureRushConfigError with a teacher-facing message.
 */
export const normalizeGraphFeatureRushConfig = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const preset = getRushPreset(source.presetId);
  const families = listOf(source.families ?? preset?.families, GRAPH_FAMILY_IDS);
  const features = listOf(source.features ?? preset?.features, GRAPH_FEATURE_IDS);
  const difficulty = DIFFICULTIES.has(source.difficulty) ? source.difficulty : (preset?.difficulty || RUSH_DIFFICULTY.STANDARD);
  if (!families.length) throw new GraphFeatureRushConfigError('Choose at least one kind of graph.');
  if (!features.length) throw new GraphFeatureRushConfigError('Choose at least one feature for students to find.');
  const unsupported = unsupportedRushFeatures({ families, features, difficulty });
  if (unsupported.length) throw new GraphFeatureRushConfigError(unsupported.map((entry) => entry.message).join(' '));
  // The preset is remembered only while the settings still match it — in
  // canonical order on both sides, so a preset listed in any order matches.
  const matchesPreset = preset
    && preset.difficulty === difficulty
    && listOf(preset.families, GRAPH_FAMILY_IDS).join() === families.join()
    && listOf(preset.features, GRAPH_FEATURE_IDS).join() === features.join();
  return Object.freeze({
    presetId: matchesPreset ? preset.id : 'custom',
    families: Object.freeze(families),
    features: Object.freeze(features),
    difficulty,
  });
};

/** True when the config passes validation (for a setup screen's button). */
export const rushConfigProblem = (raw) => {
  try {
    normalizeGraphFeatureRushConfig(raw);
    return null;
  } catch (error) {
    if (error instanceof GraphFeatureRushConfigError) return error.message;
    throw error;
  }
};
