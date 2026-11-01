/*
 * INEQUALITY GRAPHING RUSH: GENERATED INEQUALITIES, GRAPHED ON A NUMBER LINE.
 *
 * A Live Challenge mode built on Graph Feature Rush's machinery: every student
 * gets their own items and races the round clock; the server regenerates an
 * item to grade it; attempts are rush attempts (graphFeatureRush.mjs
 * applyRushAttempts) and the student's screen is the rush's round screen with
 * a number line in place of the graph. This module owns what is particular to
 * the game — its settings, its items and their exact answers, and its hints:
 *
 *   ITEMS        the kinds a teacher toggles, each built backwards from its
 *                answer, so every endpoint is a whole number and every answer
 *                is exact (numberLineSets.mjs):
 *     simple       x ≥ a
 *     reversed     3 > x — the variable on the right
 *     compoundAnd  −2 ≤ x < 4, x > 1 and x ≤ 5 — between
 *     compoundOr   x < −1 or x ≥ 3 — outside
 *     oneStep      x + 4 > 1, 3x ≤ −6, −2x < 8 (dividing by a negative)
 *     twoStep      2x − 3 > 5, −3x + 1 ≤ 7
 *     absolute     |x − 2| < 3, |x + 1| ≥ 2; no solution (|x| < −2) and
 *                  every number (|x − 1| ≥ −3) from Standard
 *
 *   DIFFICULTY   Easy keeps every coefficient positive and every answer one
 *                that exists; Standard divides by negatives and brings in
 *                "no solution" and "all real numbers"; Challenge adds flips in
 *                two steps, absolute values to isolate first, a single point
 *                (|x − 3| ≤ 0) and every number but one (|x − 3| > 0); Mixed
 *                ramps from gentle to hard, as in Graph Feature Rush.
 *
 *   ANSWERS      drawn on a number line, in the same drawing a domain is: a
 *                tap drops a dot on the nearest whole number (● then ○ then
 *                gone), a tap on one of the line's own end arrows means
 *                "keeps going" that way, ✓ Check sends the drawing.
 *                "No solution" is its own button — Graph Feature Rush's "Does
 *                Not Exist" press — right exactly when nothing makes the
 *                inequality true, so such an item has no target at all. Every
 *                item offers the same controls: they never say which kind it is.
 *
 *   HINTS        about the one thing that is off (inequalityHint): the sign
 *                flip when the drawing is exactly what forgetting it gives,
 *                which way ("test a number"), open or closed, "and" between
 *                and "or" outside — never the answer.
 *
 * DETERMINISM, as for graphs: item k of a student's round is a pure function
 * of (room secret, student, round, k, settings, INEQUALITY_GENERATOR_VERSION).
 * Every student in a round shares each block's six slots (kind and variant)
 * in their own order with their own numbers, so no one's race is easier.
 *
 * Pure: Cloud Functions, the student device (hints) and tests. The reading
 * guide a round publishes is inequalityReading.mjs.
 */

import { createRng } from './seededRandom.mjs';
import {
  ALL_REALS,
  EMPTY_SET,
  SET_DIAGNOSIS,
  allExcept,
  diagnoseSet,
  inequalityNotation,
  intervalSet,
  pointSet,
  raySet,
  setFromPlain,
  setHint,
  setsEqual,
  setToPlain,
  SET_DIAGNOSIS_LABELS,
  unionSets,
} from './numberLineSets.mjs';
import { INEQUALITY_RUSH_MODE_ID, RUSH_SIGN_FLIP, rushQuestionWeight } from './graphFeatureRushRules.mjs';

// The game mode's id (liveChallengeModes.CHALLENGE_MODE_ID.INEQUALITY_RUSH),
// declared with the rules the rush's screen and attempts share.
export { INEQUALITY_RUSH_MODE_ID };

// Bump whenever a change would generate a different item for the same seed:
// a room is graded with the generator it was created under, or not at all.
// (An item's `weight` is read from its answer, so stamping it changed no item.)
export const INEQUALITY_GENERATOR_VERSION = 1;

// What every item asks for (a receipt's `feature`), and its one target's id.
export const INEQUALITY_FEATURE = 'inequality';
export const INEQUALITY_TARGET_ID = 'solutions';

export const INEQUALITY_BLOCK_SIZE = 6;

export class InequalityRushConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InequalityRushConfigError';
  }
}

/* --------------------------------- settings -------------------------------- */

export const INEQUALITY_ITEM = Object.freeze({
  SIMPLE: 'simple',
  REVERSED: 'reversed',
  COMPOUND_AND: 'compoundAnd',
  COMPOUND_OR: 'compoundOr',
  ONE_STEP: 'oneStep',
  TWO_STEP: 'twoStep',
  ABSOLUTE: 'absolute',
});
export const INEQUALITY_ITEM_IDS = Object.freeze(Object.values(INEQUALITY_ITEM));

// What each kind is called on the setup screen and in the report.
export const INEQUALITY_ITEMS = Object.freeze([
  Object.freeze({ id: INEQUALITY_ITEM.SIMPLE, label: 'Simple', example: 'x ≥ −2' }),
  Object.freeze({ id: INEQUALITY_ITEM.REVERSED, label: 'Reversed', example: '3 > x' }),
  Object.freeze({ id: INEQUALITY_ITEM.COMPOUND_AND, label: 'Compound "and"', example: '−1 ≤ x < 4' }),
  Object.freeze({ id: INEQUALITY_ITEM.COMPOUND_OR, label: 'Compound "or"', example: 'x < −2 or x ≥ 3' }),
  Object.freeze({ id: INEQUALITY_ITEM.ONE_STEP, label: 'Solve first: one step', example: '−3x ≤ 12' }),
  Object.freeze({ id: INEQUALITY_ITEM.TWO_STEP, label: 'Solve first: two steps', example: '2x − 5 > 3' }),
  Object.freeze({ id: INEQUALITY_ITEM.ABSOLUTE, label: 'Absolute value (Algebra II)', example: '|x − 1| ≤ 3' }),
]);
const ITEM_BY_ID = new Map(INEQUALITY_ITEMS.map((item) => [item.id, item]));
export const inequalityItemLabel = (id) => ITEM_BY_ID.get(String(id || ''))?.label || null;

export const INEQUALITY_DIFFICULTY = Object.freeze({ EASY: 'easy', STANDARD: 'standard', CHALLENGE: 'challenge', MIXED: 'mixed' });
const DIFFICULTIES = new Set(Object.values(INEQUALITY_DIFFICULTY));
const TIERS = Object.freeze(['easy', 'standard', 'challenge']);
const tierRank = (tier) => Math.max(0, TIERS.indexOf(tier));

export const INEQUALITY_DIFFICULTY_OPTIONS = Object.freeze([
  Object.freeze({ id: 'easy', label: 'Easy', description: 'Positive coefficients, no sign flips, and every inequality has solutions.' }),
  Object.freeze({ id: 'standard', label: 'Standard', description: 'Dividing by a negative, "no solution" and "all real numbers".' }),
  Object.freeze({ id: 'challenge', label: 'Challenge', description: 'Flips in two steps, absolute values to isolate first, a single point, every number but one.' }),
  Object.freeze({ id: 'mixed', label: 'Mixed', description: 'Starts gentle, then mixes Standard and Challenge.' }),
]);

export const INEQUALITY_ROUND_LIMITS = Object.freeze({
  minRounds: 1,
  maxRounds: 8,
  defaultRounds: 3,
  minSeconds: 30,
  maxSeconds: 120,
  defaultSeconds: 90,
  secondsOptions: Object.freeze([30, 45, 60, 90, 120]),
});

export const INEQUALITY_RUSH_PRESETS = Object.freeze([
  Object.freeze({
    id: 'graphIt',
    label: 'Graph It',
    course: 'algebra1',
    description: 'Simple and reversed inequalities: open or closed, and which way.',
    roundCount: 3,
    roundSeconds: 60,
    scoringStrategyId: 'grandPrix',
    itemTypes: Object.freeze([INEQUALITY_ITEM.SIMPLE, INEQUALITY_ITEM.REVERSED]),
    difficulty: 'easy',
  }),
  Object.freeze({
    id: 'solveAndGraph',
    label: 'Solve and Graph',
    course: 'algebra1',
    description: 'One- and two-step inequalities, dividing by a negative included.',
    roundCount: 3,
    roundSeconds: 90,
    scoringStrategyId: 'grandPrix',
    itemTypes: Object.freeze([INEQUALITY_ITEM.ONE_STEP, INEQUALITY_ITEM.TWO_STEP]),
    difficulty: 'standard',
  }),
  Object.freeze({
    id: 'compound',
    label: 'Compound Inequalities',
    course: null,
    description: '"And" is between, "or" is outside — and the ones that are neither.',
    roundCount: 3,
    roundSeconds: 90,
    scoringStrategyId: 'grandPrix',
    itemTypes: Object.freeze([INEQUALITY_ITEM.COMPOUND_AND, INEQUALITY_ITEM.COMPOUND_OR]),
    difficulty: 'standard',
  }),
  Object.freeze({
    id: 'absoluteValue',
    label: 'Absolute Value',
    course: 'algebra2',
    description: 'Within a distance and beyond it, no solution and all real numbers.',
    roundCount: 3,
    roundSeconds: 90,
    scoringStrategyId: 'grandPrix',
    itemTypes: Object.freeze([INEQUALITY_ITEM.ABSOLUTE, INEQUALITY_ITEM.COMPOUND_AND, INEQUALITY_ITEM.COMPOUND_OR]),
    difficulty: 'standard',
  }),
  Object.freeze({
    id: 'everything',
    label: 'Every Kind',
    course: null,
    description: 'All seven kinds, ramping from gentle to hard.',
    roundCount: 3,
    roundSeconds: 90,
    scoringStrategyId: 'grandPrix',
    itemTypes: INEQUALITY_ITEM_IDS,
    difficulty: 'mixed',
  }),
]);

export const getInequalityPreset = (id) => INEQUALITY_RUSH_PRESETS.find((preset) => preset.id === id) || null;

/** The preset a class of this course starts from. */
export const defaultInequalityPresetFor = (courseId) => (
  courseId === 'algebra2' ? getInequalityPreset('absoluteValue') : getInequalityPreset('graphIt')
);

// Canonical order, so equal settings compare equal.
const itemList = (raw) => [...new Set((Array.isArray(raw) ? raw : []).map(String))]
  .filter((id) => ITEM_BY_ID.has(id))
  .sort((left, right) => INEQUALITY_ITEM_IDS.indexOf(left) - INEQUALITY_ITEM_IDS.indexOf(right));

/**
 * The validated settings for a room. Throws InequalityRushConfigError with a
 * sentence a teacher can act on. A preset fills in whatever the request
 * leaves out, and stays named only while the settings still match it.
 */
export const normalizeInequalityRushConfig = (raw = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const preset = getInequalityPreset(source.presetId);
  const itemTypes = itemList(source.itemTypes ?? preset?.itemTypes);
  const difficulty = DIFFICULTIES.has(source.difficulty) ? source.difficulty : (preset?.difficulty || INEQUALITY_DIFFICULTY.STANDARD);
  if (!itemTypes.length) throw new InequalityRushConfigError('Choose at least one kind of inequality.');
  const matchesPreset = preset
    && preset.difficulty === difficulty
    && itemList(preset.itemTypes).join() === itemTypes.join();
  return Object.freeze({
    presetId: matchesPreset ? preset.id : 'custom',
    itemTypes: Object.freeze(itemTypes),
    difficulty,
  });
};

/** The problem with a setup, in a teacher's words, or null (for a setup screen). */
export const inequalityConfigProblem = (raw) => {
  try {
    normalizeInequalityRushConfig(raw);
    return null;
  } catch (error) {
    if (error instanceof InequalityRushConfigError) return error.message;
    throw error;
  }
};

/* ----------------------------------- text ----------------------------------- */

const MINUS = '−';
const num = (value) => (value < 0 ? `${MINUS}${Math.abs(value)}` : String(value));
const OPS = Object.freeze(['<', '<=', '>', '>=']);
const SIGN = Object.freeze({ '<': '<', '<=': '≤', '>': '>', '>=': '≥' });
// The same inequality read from the other side: a > x is x < a.
const FLIP = Object.freeze({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' });
const closedOf = (op) => op === '<=' || op === '>=';
const belowOf = (op) => op === '<' || op === '<=';
// "x + 4", "x − 3", "2x + 1"
const plus = (term, constant) => (constant === 0 ? term : `${term} ${constant < 0 ? MINUS : '+'} ${Math.abs(constant)}`);
// "3x", "−2x", "x", "−x"
const times = (coefficient) => {
  if (coefficient === 1) return 'x';
  if (coefficient === -1) return `${MINUS}x`;
  return `${num(coefficient)}x`;
};

/** The set of x with x (op) a. */
const solveSet = (op, a) => raySet(a, closedOf(op), belowOf(op) ? -1 : 1);

/* ---------------------------------- items ---------------------------------- */

const signed = (rng, low, high) => (rng.chance(0.5) ? 1 : -1) * rng.int(low, high);
// The two parts of a compound inequality, in either order from Standard.
const andParts = (rng, tier, first, second) => (tier !== 'easy' && rng.chance(0.5) ? `${second} and ${first}` : `${first} and ${second}`);
const orParts = (rng, tier, first, second) => (tier === 'challenge' && rng.chance(0.4) ? `${second} or ${first}` : `${first} or ${second}`);

/*
 * Each builder returns { text, set } — `set` the exact solution set — and,
 * for an item whose solving multiplies or divides by a negative, `flipSet`:
 * the set a student graphs who forgets to flip the sign (the hint names it).
 */
const ITEM_BUILDERS = Object.freeze({
  [INEQUALITY_ITEM.SIMPLE]: (rng) => {
    const op = rng.pick(OPS);
    const a = rng.int(-7, 7);
    return { text: `x ${SIGN[op]} ${num(a)}`, set: solveSet(op, a) };
  },

  [INEQUALITY_ITEM.REVERSED]: (rng) => {
    // a (op) x says x (flipped op) a.
    const op = rng.pick(OPS);
    const a = rng.int(-7, 7);
    return { text: `${num(a)} ${SIGN[op]} x`, set: solveSet(FLIP[op], a) };
  },

  [INEQUALITY_ITEM.COMPOUND_AND]: (rng, { tier, variant }) => {
    const a = rng.int(-7, 3);
    const b = a + rng.int(2, 6);
    if (variant === 'none') {
      // Above b and below a, with a < b: no number is both.
      const high = rng.pick(['>', '>=']);
      const low = rng.pick(['<', '<=']);
      return { text: andParts(rng, tier, `x ${SIGN[high]} ${num(b)}`, `x ${SIGN[low]} ${num(a)}`), set: EMPTY_SET };
    }
    if (variant === 'sameWay') {
      // Both the same way: both true is the stricter one.
      const right = rng.chance(0.5);
      const opA = right ? rng.pick(['>', '>=']) : rng.pick(['<', '<=']);
      const opB = right ? rng.pick(['>', '>=']) : rng.pick(['<', '<=']);
      return {
        text: andParts(rng, tier, `x ${SIGN[opA]} ${num(a)}`, `x ${SIGN[opB]} ${num(b)}`),
        set: right ? solveSet(opB, b) : solveSet(opA, a),
      };
    }
    const loClosed = rng.chance(0.5);
    const hiClosed = rng.chance(0.5);
    const set = intervalSet(a, loClosed, b, hiClosed);
    if (tier !== 'easy' && rng.chance(0.4)) {
      return { text: andParts(rng, tier, `x ${loClosed ? '≥' : '>'} ${num(a)}`, `x ${hiClosed ? '≤' : '<'} ${num(b)}`), set };
    }
    return { text: `${num(a)} ${loClosed ? '≤' : '<'} x ${hiClosed ? '≤' : '<'} ${num(b)}`, set };
  },

  [INEQUALITY_ITEM.COMPOUND_OR]: (rng, { tier, variant }) => {
    const a = rng.int(-7, 2);
    const b = a + rng.int(2, 6);
    if (variant === 'all') {
      // Below b or above a, with a < b: every number is one or the other.
      const low = rng.pick(['<', '<=']);
      const high = rng.pick(['>', '>=']);
      return { text: orParts(rng, 'challenge', `x ${SIGN[low]} ${num(b)}`, `x ${SIGN[high]} ${num(a)}`), set: ALL_REALS };
    }
    if (variant === 'sameWay') {
      // Both the same way: either true is the looser one.
      const right = rng.chance(0.5);
      const opA = right ? rng.pick(['>', '>=']) : rng.pick(['<', '<=']);
      const opB = right ? rng.pick(['>', '>=']) : rng.pick(['<', '<=']);
      return {
        text: orParts(rng, tier, `x ${SIGN[opA]} ${num(a)}`, `x ${SIGN[opB]} ${num(b)}`),
        set: right ? solveSet(opA, a) : solveSet(opB, b),
      };
    }
    const loClosed = rng.chance(0.5);
    const hiClosed = rng.chance(0.5);
    return {
      text: orParts(rng, tier, `x ${loClosed ? '≤' : '<'} ${num(a)}`, `x ${hiClosed ? '≥' : '>'} ${num(b)}`),
      set: unionSets(raySet(a, loClosed, -1), raySet(b, hiClosed, 1)),
    };
  },

  [INEQUALITY_ITEM.ONE_STEP]: (rng, { tier }) => {
    // Built from the answer, x (op) s.
    const op = rng.pick(OPS);
    const kind = tier === 'easy'
      ? rng.pick(['add', 'add', 'multiply', 'divide'])
      : rng.pick(['add', 'multiply', 'divide', 'negative', 'negative', ...(tier === 'challenge' ? ['negativeDivide'] : [])]);
    if (kind === 'add') {
      const s = rng.int(-6, 6);
      const c = signed(rng, 1, 8);
      return { text: `${plus('x', c)} ${SIGN[op]} ${num(s + c)}`, set: solveSet(op, s) };
    }
    if (kind === 'multiply') {
      const s = rng.int(-6, 6);
      const k = rng.int(2, 6);
      return { text: `${times(k)} ${SIGN[op]} ${num(k * s)}`, set: solveSet(op, s) };
    }
    if (kind === 'divide') {
      // x/k (op) q says x (op) kq.
      const k = rng.int(2, 4);
      const q = rng.int(-2, 2);
      return { text: `x/${k} ${SIGN[op]} ${num(q)}`, set: solveSet(op, k * q) };
    }
    if (kind === 'negativeDivide') {
      // −x/k (written op) q: multiplying by −k flips it, to x (op) −kq.
      const k = rng.int(2, 4);
      const q = rng.int(-2, 2);
      return {
        text: `${MINUS}x/${k} ${SIGN[FLIP[op]]} ${num(q)}`,
        set: solveSet(op, -k * q),
        flipSet: solveSet(FLIP[op], -k * q),
      };
    }
    // kx (written op) ks with k < 0: dividing by k flips it, to x (op) s.
    const s = rng.int(-6, 6);
    const k = -rng.int(1, 5);
    return { text: `${times(k)} ${SIGN[FLIP[op]]} ${num(k * s)}`, set: solveSet(op, s), flipSet: solveSet(FLIP[op], s) };
  },

  [INEQUALITY_ITEM.TWO_STEP]: (rng, { tier }) => {
    const op = rng.pick(OPS);
    if (tier !== 'easy' && rng.chance(0.2)) {
      // x/k + c (op) q + c says x (op) kq.
      const k = rng.int(2, 4);
      const q = rng.int(-2, 2);
      const c = signed(rng, 1, 7);
      return { text: `${plus(`x/${k}`, c)} ${SIGN[op]} ${num(q + c)}`, set: solveSet(op, k * q) };
    }
    const s = rng.int(-6, 6);
    const c = signed(rng, 1, 9);
    const negative = tier === 'easy' ? false : rng.chance(tier === 'challenge' ? 0.6 : 0.35);
    const k = (negative ? -1 : 1) * rng.int(2, 5);
    const written = negative ? FLIP[op] : op;
    // At Challenge, sometimes the constant first: 5 − 2x > 11.
    const left = tier === 'challenge' && rng.chance(0.4)
      ? `${num(c)} ${k < 0 ? MINUS : '+'} ${Math.abs(k)}x`
      : plus(times(k), c);
    return {
      text: `${left} ${SIGN[written]} ${num(k * s + c)}`,
      set: solveSet(op, s),
      ...(negative ? { flipSet: solveSet(FLIP[op], s) } : {}),
    };
  },

  [INEQUALITY_ITEM.ABSOLUTE]: (rng, { tier, variant }) => {
    const center = tier === 'easy' ? 0 : rng.int(-5, 5);
    const inside = center === 0 ? '|x|' : `|${plus('x', -center)}|`;
    const radius = rng.int(1, 5);
    const closed = rng.chance(0.5);
    const within = intervalSet(center - radius, closed, center + radius, closed);
    const beyond = unionSets(raySet(center - radius, closed, -1), raySet(center + radius, closed, 1));
    switch (variant) {
      case 'none':
        // An absolute value is never below a negative number.
        return { text: `${inside} ${rng.chance(0.5) ? '<' : '≤'} ${num(-rng.int(1, 5))}`, set: EMPTY_SET };
      case 'all':
        return { text: `${inside} ${rng.chance(0.5) ? '>' : '≥'} ${num(-rng.int(1, 5))}`, set: ALL_REALS };
      case 'point':
        // At most zero: zero, which happens at the center alone.
        return { text: `${inside} ≤ 0`, set: pointSet(center) };
      case 'allBut':
        return { text: `${inside} > 0`, set: allExcept(center) };
      case 'scaled': {
        // Isolate first: |mx − mc| (op) mr, or |x − c| + d (op) r + d.
        const op = closed ? rng.pick(['<=', '>=']) : rng.pick(['<', '>']);
        const set = belowOf(op) ? within : beyond;
        if (rng.chance(0.5)) {
          const m = rng.int(2, 3);
          return { text: `|${plus(`${m}x`, -m * center)}| ${SIGN[op]} ${m * radius}`, set };
        }
        const d = signed(rng, 1, 6);
        return { text: `${plus(inside, d)} ${SIGN[op]} ${num(radius + d)}`, set };
      }
      case 'beyond':
        return { text: `${inside} ${closed ? '≥' : '>'} ${radius}`, set: beyond };
      default:
        return { text: `${inside} ${closed ? '≤' : '<'} ${radius}`, set: within };
    }
  },
});

/*
 * THE VARIANTS OF EACH KIND, the tier each first appears at, its weight within
 * its kind, and whether it has solutions. Every kind has an Easy variant, so
 * any kind can be played at any difficulty; difficulty decides which variants
 * (and, inside a builder, which numbers and forms) come up.
 */
const ITEM_VARIANTS = Object.freeze({
  [INEQUALITY_ITEM.SIMPLE]: [{ id: 'basic', minTier: 'easy', weight: 1 }],
  [INEQUALITY_ITEM.REVERSED]: [{ id: 'basic', minTier: 'easy', weight: 1 }],
  [INEQUALITY_ITEM.COMPOUND_AND]: [
    { id: 'between', minTier: 'easy', weight: 4 },
    { id: 'none', minTier: 'standard', weight: 1, exists: false },
    { id: 'sameWay', minTier: 'challenge', weight: 1 },
  ],
  [INEQUALITY_ITEM.COMPOUND_OR]: [
    { id: 'outside', minTier: 'easy', weight: 4 },
    { id: 'all', minTier: 'standard', weight: 1 },
    { id: 'sameWay', minTier: 'challenge', weight: 1 },
  ],
  [INEQUALITY_ITEM.ONE_STEP]: [{ id: 'basic', minTier: 'easy', weight: 1 }],
  [INEQUALITY_ITEM.TWO_STEP]: [{ id: 'basic', minTier: 'easy', weight: 1 }],
  [INEQUALITY_ITEM.ABSOLUTE]: [
    { id: 'within', minTier: 'easy', weight: 2 },
    { id: 'beyond', minTier: 'easy', weight: 2 },
    { id: 'none', minTier: 'standard', weight: 1, exists: false },
    { id: 'all', minTier: 'standard', weight: 1 },
    { id: 'scaled', minTier: 'challenge', weight: 2 },
    { id: 'point', minTier: 'challenge', weight: 0.5 },
    { id: 'allBut', minTier: 'challenge', weight: 0.5 },
  ],
});

/** The variants of a kind, as a test reads them. */
export const inequalityVariantsOf = (itemType) => (ITEM_VARIANTS[itemType] || []).map((variant) => Object.freeze({ ...variant }));

/** The number line every item is drawn on: −10 to 10, a tick a whole number. */
export const NUMBER_LINE = Object.freeze({ min: -10, max: 10, step: 1 });
// As a rush view, so the round screen reads the line as it reads an x-axis.
const LINE_VIEW = Object.freeze({ xMin: NUMBER_LINE.min, xMax: NUMBER_LINE.max, xStep: NUMBER_LINE.step, yMin: -1, yMax: 1, yStep: 1 });

// Every finite end at least a tick inside the line, so each dot is clear of the edge.
const fitsLine = (set) => set.every((piece) => [piece.lo, piece.hi].every((end) => {
  if (end === null) return true;
  const value = end.n / end.d;
  return value >= NUMBER_LINE.min + NUMBER_LINE.step && value <= NUMBER_LINE.max - NUMBER_LINE.step;
}));

/* --------------------------------- schedule -------------------------------- */

/**
 * The slots a tier can draw for these settings: each kind weighs the same,
 * shared among its variants by their weights.
 */
export const inequalitySlotCatalog = (config, tier) => config.itemTypes.flatMap((itemType) => {
  const variants = ITEM_VARIANTS[itemType].filter((variant) => tierRank(variant.minTier) <= tierRank(tier));
  const total = variants.reduce((sum, variant) => sum + variant.weight, 0);
  return variants.map((variant) => Object.freeze({
    itemType,
    variant: variant.id,
    tier,
    exists: variant.exists !== false,
    weight: variant.weight / total,
  }));
});

/** Which tier each position of a block draws from (Mixed ramps, as graphs do). */
export const inequalityBlockTiers = (difficulty, blockIndex) => {
  if (difficulty !== 'mixed') return Array(INEQUALITY_BLOCK_SIZE).fill(difficulty);
  if (blockIndex === 0) return ['easy', 'easy', 'standard', 'easy', 'standard', 'standard'];
  if (blockIndex === 1) return ['standard', 'standard', 'challenge', 'standard', 'standard', 'challenge'];
  return ['standard', 'challenge', 'standard', 'challenge', 'challenge', 'standard'];
};

/**
 * The block every student in a round shares: six slots drawn with the room's
 * secret. Each slot settles first whether it has solutions, at the catalog's
 * own share of "no solution", then picks a kind not yet used in the block
 * where it can — so a block of six spreads across the kinds chosen.
 */
export const inequalityBlockTemplate = ({ seed, roundIndex, blockIndex, config }) => {
  const rng = createRng(`${seed}|ineq-template|r${roundIndex}|b${blockIndex}|v${INEQUALITY_GENERATOR_VERSION}`);
  const used = new Set();
  const weightOf = (slots) => slots.reduce((sum, slot) => sum + slot.weight, 0);
  return inequalityBlockTiers(config.difficulty, blockIndex).map((tier) => {
    const catalog = inequalitySlotCatalog(config, tier);
    const present = catalog.filter((slot) => slot.exists);
    const absent = catalog.filter((slot) => !slot.exists);
    const absentShare = catalog.length ? weightOf(absent) / weightOf(catalog) : 0;
    const side = absent.length && (!present.length || rng.chance(absentShare)) ? absent : present;
    const fresh = side.filter((slot) => !used.has(slot.itemType));
    const chosen = rng.weighted(fresh.length ? fresh : side);
    used.add(chosen.itemType);
    return Object.freeze({ itemType: chosen.itemType, variant: chosen.variant, tier: chosen.tier });
  });
};

/** The slot of a student's item k: their own order within the shared block. */
export const inequalitySlot = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const blockIndex = Math.floor(questionIndex / INEQUALITY_BLOCK_SIZE);
  const template = inequalityBlockTemplate({ seed, roundIndex, blockIndex, config });
  const order = createRng(`${seed}|ineq-order|${studentKey}|r${roundIndex}|b${blockIndex}`).shuffle(template.map((_, index) => index));
  return template[order[questionIndex % INEQUALITY_BLOCK_SIZE]] || null;
};

const SOLVE_FIRST = new Set([INEQUALITY_ITEM.ONE_STEP, INEQUALITY_ITEM.TWO_STEP, INEQUALITY_ITEM.ABSOLUTE]);

/** One item for a slot, from a seed. Deterministic. */
export const generateInequalityItem = ({ slot, seedText, questionIndex = 0, avoid = [] }) => {
  const rng = createRng(`${seedText}|v${INEQUALITY_GENERATOR_VERSION}`);
  const avoided = new Set(avoid);
  let built = null;
  for (let attempt = 0; attempt < 60 && !built; attempt += 1) {
    const candidate = ITEM_BUILDERS[slot.itemType](rng, { tier: slot.tier, variant: slot.variant });
    if (candidate && fitsLine(candidate.set) && !avoided.has(candidate.text)) built = candidate;
  }
  // Unreachable for these builders (a test draws thousands); a fixed item rather than none.
  if (!built) built = { text: 'x ≥ 2', set: raySet(2, true, 1) };
  const targets = Object.freeze(built.set.length
    ? [Object.freeze({ id: INEQUALITY_TARGET_ID, geometry: 'set', axis: 'x', set: setToPlain(built.set) })]
    : []);
  return Object.freeze({
    generatorVersion: INEQUALITY_GENERATOR_VERSION,
    questionIndex,
    kind: 'inequality',
    feature: INEQUALITY_FEATURE,
    family: slot.itemType,
    variant: slot.variant,
    tier: slot.tier,
    prompt: `${SOLVE_FIRST.has(slot.itemType) ? 'Solve, then graph' : 'Graph'}: ${built.text}`,
    inequality: built.text,
    numberLine: NUMBER_LINE,
    view: LINE_VIEW,
    graph: null,
    // One target, the solution set — none at all when nothing makes it true:
    // that item is answered with "No solution", as a missing feature is with
    // "Does Not Exist".
    targets,
    targetCount: 1,
    // What it is worth: the taps its answer takes (graphFeatureRushRules.rushQuestionWeight).
    weight: rushQuestionWeight({ targets }),
    ...(built.flipSet ? { flipSet: setToPlain(built.flipSet) } : {}),
  });
};

/**
 * A student's item k in a round. Two items in a row are never the same
 * inequality: an odd-numbered item passes over the text of either neighbour
 * of its kind (every adjacent pair has exactly one odd member), so no item
 * depends on more than its two neighbours' first draws.
 */
export const generateInequalityQuestion = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const slotAt = (index) => (index >= 0 ? inequalitySlot({ seed, studentKey, roundIndex, questionIndex: index, config }) : null);
  const seedTextAt = (index) => `${seed}|ineq|${studentKey}|r${roundIndex}|q${index}`;
  const slot = slotAt(questionIndex);
  if (!slot) return null;
  const avoid = questionIndex % 2 === 1
    ? [questionIndex - 1, questionIndex + 1]
      .map((index) => ({ index, neighbour: slotAt(index) }))
      .filter(({ neighbour }) => neighbour && neighbour.itemType === slot.itemType)
      .map(({ index, neighbour }) => generateInequalityItem({ slot: neighbour, seedText: seedTextAt(index), questionIndex: index }).inequality)
    : [];
  return generateInequalityItem({ slot, seedText: seedTextAt(questionIndex), questionIndex, avoid });
};

/**
 * What a student's device receives. The answer travels with the item, as a
 * graph's targets do: the device answers a ✓ Check at once, and the server
 * grades every attempt again from its own regenerated copy.
 */
export const publicInequalityQuestion = (question) => (question ? Object.freeze({
  questionIndex: question.questionIndex,
  kind: question.kind,
  feature: question.feature,
  family: question.family,
  prompt: question.prompt,
  inequality: question.inequality,
  numberLine: question.numberLine,
  view: question.view,
  graph: null,
  targets: question.targets,
  targetCount: question.targetCount,
  weight: question.weight,
  ...(question.flipSet ? { flipSet: question.flipSet } : {}),
}) : null);

/** Whether a question is an inequality item (and not a graph). */
export const isInequalityQuestion = (question) => question?.kind === 'inequality';

/** An item's answer, in words: "x > −4", "−1 ≤ x < 3", "no solution", "all real numbers". */
export const inequalityAnswerText = (question) => {
  const target = (question?.targets || [])[0];
  const set = target ? setFromPlain(target.set) : EMPTY_SET;
  return inequalityNotation(set || EMPTY_SET);
};

/* ----------------------------------- hints ---------------------------------- */

// Two finite ends and both arrows: shaded outside ("or", or beyond a distance).
const outsideShape = (set) => set.length === 2 && set[0].lo === null && set[1].hi === null;
// Two finite ends, no arrows: shaded between ("and", or within a distance).
const betweenShape = (set) => set.length === 1 && set[0].lo !== null && set[0].hi !== null;
const endsOf = (set) => set.flatMap((piece) => [piece.lo, piece.hi]).filter((end) => end !== null).map((end) => end.n / end.d).join();

/** The hint when "No solution" is pressed on an item that has solutions. */
export const NO_SOLUTION_MISS = 'It has solutions — test a number.';

/**
 * A HINT FOR A WRONG GRAPH OF AN INEQUALITY, a question back at the student
 * about the one thing that is off, never the answer: the sign flip first (the
 * drawing is exactly what forgetting it gives), then "and"/"or" (or within
 * and beyond, for an absolute value), which way, open or closed, and the rest
 * from the number-line diagnosis (numberLineSets.setHint).
 */
export const inequalityHint = (question, studentSet) => {
  const target = (question?.targets || [])[0];
  const answer = target ? setFromPlain(target.set) : null;
  if (!answer) return 'Test a number you shaded: does it make the inequality true?';
  if (!studentSet) return 'Look again: which numbers make it true?';
  const flipSet = question.flipSet ? setFromPlain(question.flipSet) : null;
  if (flipSet && setsEqual(studentSet, flipSet)) return 'Did you multiply or divide by a negative? That flips the sign.';
  const swappedShape = endsOf(studentSet) === endsOf(answer)
    && ((outsideShape(answer) && betweenShape(studentSet)) || (betweenShape(answer) && outsideShape(studentSet)));
  if (swappedShape) {
    if (question.family === INEQUALITY_ITEM.ABSOLUTE) {
      return outsideShape(answer) ? 'More than a distance from the center: shade outside.' : 'Less than a distance from the center: shade between.';
    }
    return outsideShape(answer) ? '"Or": either part can be true — shade outside.' : '"And": both parts must be true — shade between.';
  }
  const { kind, end } = diagnoseSet(studentSet, answer);
  if (kind === SET_DIAGNOSIS.DIRECTION) return 'Which way? Test a number: does it make the inequality true?';
  if (kind === SET_DIAGNOSIS.INCLUSION) {
    const at = end === 'both' ? 'each end' : `the ${end === 'high' ? 'right' : 'left'} end`;
    return `Open or closed at ${at}? ≤ and ≥ include the number; < and > leave it out.`;
  }
  if (kind === SET_DIAGNOSIS.ENDPOINT && SOLVE_FIRST.has(question.family)) return 'Check the number: solve for x first.';
  return setHint(studentSet, answer, { axis: 'x' });
};

/**
 * What a wrong check got wrong, for the teacher's report: the sign flip, or
 * the number-line diagnosis (numberLineSets.SET_DIAGNOSIS). Null when there
 * is nothing to compare (an item with no solution has no shape).
 */
export const inequalityDiagnosis = (question, studentSet) => {
  const target = (question?.targets || [])[0];
  const answer = target ? setFromPlain(target.set) : null;
  if (!answer || !studentSet || setsEqual(studentSet, answer)) return null;
  const flipSet = question.flipSet ? setFromPlain(question.flipSet) : null;
  if (flipSet && setsEqual(studentSet, flipSet)) return RUSH_SIGN_FLIP;
  return diagnoseSet(studentSet, answer).kind;
};

/* ---------------------------------- report ---------------------------------- */

/** How the teacher's report names an inequality game's rows (graphFeatureRush.buildRushReport). */
export const INEQUALITY_REPORT_LABELS = Object.freeze({
  featureLabel: () => 'Inequalities',
  familyLabel: (id) => inequalityItemLabel(id) || id,
  mistakeLabel: (id) => (id === RUSH_SIGN_FLIP ? 'Did not flip the sign' : SET_DIAGNOSIS_LABELS[id] || id),
});
