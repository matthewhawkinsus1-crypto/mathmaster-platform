/*
 * SYSTEMS OF EQUATIONS RUSH: GENERATED SYSTEMS, EXACT AND READABLE.
 *
 * Every system is built BACKWARDS FROM ITS ANSWER in exact rational
 * arithmetic (graphFeatureRational.mjs) — a crossing at a grid point, a pair
 * of parallel lines a clear distance apart, a line drawn twice — and is
 * issued only when
 *
 *   - its own exact solving agrees with the kind asked for (one solution,
 *     none, or infinitely many);
 *   - every target — an intercept, or the solution — is on the grid (whole
 *     numbers at Easy, halves above; a solution to tap is always a grid
 *     point), well inside the view, and a fingertip clear of every other;
 *   - a crossing the graph shows is a grid point the lines meet at a clear
 *     angle, or — the kind whose solution "can't be determined" — plainly
 *     inside a grid square (systemsRush.plainlyBetweenGridLines), well inside
 *     a view of at most 14 squares, at a wider angle still; or, at Challenge,
 *     plainly past the edge and not far past it, the lines closing in on it;
 *   - on an intercept question, the crossing is one of the intercepts or
 *     plainly clear of them, so it is never mistaken for one;
 *   - parallel lines are clearly apart, and each line crosses most of the
 *     view (the same line twice, more);
 *   - at Easy, two different lines never share an intercept, and nothing sits
 *     at the origin.
 *
 * DETERMINISM. Item k for a student is a pure function of
 *
 *   (room secret, student, round, k, settings, SYSTEMS_GENERATOR_VERSION)
 *
 * so the server never stores what it issued: it regenerates an item to grade
 * an attempt on it. Changing anything that alters generated items MUST bump
 * SYSTEMS_GENERATOR_VERSION; a room created under another version refuses to
 * issue or grade rather than grade a tap against a different system.
 *
 * Every student in a round shares each block's six slots (question, kind,
 * variant, tier) in their own order with their own numbers: after any whole
 * number of blocks two students have faced the same mix.
 *
 * If a slot ever exhausted its attempts, a known-good system of the same kind
 * is issued instead and marked `fallback`; tests hold every slot to never
 * needing it.
 *
 * Pure: Cloud Functions and tests. Never shipped to a browser: the device
 * receives an item's plain lines and targets (publicSystemsQuestion).
 */

import * as Q from './graphFeatureRational.mjs';
import { createRng } from './seededRandom.mjs';
import { RUSH_ATTEMPT_KIND, rushQuestionWeight } from './graphFeatureRushRules.mjs';
import {
  CROSSING_KINDS,
  LINE_ORIENTATION,
  MAX_CROSSING_TEXT,
  SYSTEM_ITEM_KIND,
  SYSTEM_KIND,
  SYSTEM_KIND_IDS,
  SYSTEM_PROMPTS,
  SYSTEM_QUESTION,
  SYSTEM_QUESTION_IDS,
  chordFraction,
  crossingAngle,
  parallelGap,
  plainlyBetweenGridLines,
} from './systemsRush.mjs';

// 1: the first systems.
export const SYSTEMS_GENERATOR_VERSION = 1;

export const SYSTEMS_BLOCK_SIZE = 6;
export const MAX_SYSTEM_ATTEMPTS = 80;

const TIERS = Object.freeze(['easy', 'standard', 'challenge']);
const tierRank = (tier) => Math.max(0, TIERS.indexOf(tier));

/* ------------------------------ exact geometry ----------------------------- */

const exactPoint = (x, y) => Object.freeze({ x: Q.toRational(x), y: Q.toRational(y) });
const slantedLine = (m, b) => Object.freeze({ orientation: LINE_ORIENTATION.SLANTED, m: Q.toRational(m), b: Q.toRational(b) });
const horizontalLine = (y) => Object.freeze({ orientation: LINE_ORIENTATION.HORIZONTAL, y: Q.toRational(y) });
const verticalLine = (x) => Object.freeze({ orientation: LINE_ORIENTATION.VERTICAL, x: Q.toRational(x) });
const lineThrough = (m, point) => slantedLine(m, Q.sub(point.y, Q.mul(m, point.x)));
// The slanted line through two points, or null when they do not differ in
// both coordinates (that line would be level or upright, or no line at all).
const lineJoining = (from, to) => {
  const rise = Q.sub(to.y, from.y);
  const run = Q.sub(to.x, from.x);
  return Q.isZero(rise) || Q.isZero(run) ? null : lineThrough(Q.div(rise, run), from);
};

// A non-vertical line's slope and its value at x = 0.
const slopeOf = (line) => (line.orientation === LINE_ORIENTATION.HORIZONTAL ? Q.ZERO : line.m);
const levelOf = (line) => (line.orientation === LINE_ORIENTATION.HORIZONTAL ? line.y : line.b);
const yAt = (line, x) => Q.add(Q.mul(slopeOf(line), x), levelOf(line));

/** Where an exact line crosses the y-axis, or null (a vertical line never does). */
export const yInterceptOf = (line) => (line.orientation === LINE_ORIENTATION.VERTICAL ? null : exactPoint(Q.ZERO, levelOf(line)));

/** Where an exact line crosses the x-axis, or null (a horizontal line never does). */
export const xInterceptOf = (line) => {
  if (line.orientation === LINE_ORIENTATION.HORIZONTAL) return null;
  if (line.orientation === LINE_ORIENTATION.VERTICAL) return exactPoint(line.x, Q.ZERO);
  return exactPoint(Q.neg(Q.div(line.b, line.m)), Q.ZERO);
};

/** Whether two exact lines are the same line. */
export const sameExactLine = (left, right) => left.orientation === right.orientation && (
  left.orientation === LINE_ORIENTATION.VERTICAL ? Q.eq(left.x, right.x)
    : left.orientation === LINE_ORIENTATION.HORIZONTAL ? Q.eq(left.y, right.y)
      : Q.eq(left.m, right.m) && Q.eq(left.b, right.b));

export const SOLUTION_COUNT = Object.freeze({ ONE: 'one', NONE: 'none', INFINITE: 'infinite' });

/**
 * The system solved exactly: one solution (and where), none, or infinitely
 * many. Two lines are the same line, parallel, or cross at exactly one point.
 */
export const solveSystem = (left, right) => {
  if (sameExactLine(left, right)) return Object.freeze({ solutions: SOLUTION_COUNT.INFINITE });
  const leftUpright = left.orientation === LINE_ORIENTATION.VERTICAL;
  const rightUpright = right.orientation === LINE_ORIENTATION.VERTICAL;
  if (leftUpright && rightUpright) return Object.freeze({ solutions: SOLUTION_COUNT.NONE });
  if (leftUpright) return Object.freeze({ solutions: SOLUTION_COUNT.ONE, point: exactPoint(left.x, yAt(right, left.x)) });
  if (rightUpright) return Object.freeze({ solutions: SOLUTION_COUNT.ONE, point: exactPoint(right.x, yAt(left, right.x)) });
  const slopeGap = Q.sub(slopeOf(left), slopeOf(right));
  if (Q.isZero(slopeGap)) return Object.freeze({ solutions: SOLUTION_COUNT.NONE });
  const x = Q.div(Q.sub(levelOf(right), levelOf(left)), slopeGap);
  return Object.freeze({ solutions: SOLUTION_COUNT.ONE, point: exactPoint(x, yAt(left, x)) });
};

/** An exact line as a device receives it, in plain numbers (systemsRush.mjs). */
export const plainLine = (line, id) => {
  if (line.orientation === LINE_ORIENTATION.VERTICAL) return Object.freeze({ id, orientation: line.orientation, x: Q.toNumber(line.x) });
  if (line.orientation === LINE_ORIENTATION.HORIZONTAL) return Object.freeze({ id, orientation: line.orientation, y: Q.toNumber(line.y) });
  return Object.freeze({ id, orientation: line.orientation, m: Q.toNumber(line.m), b: Q.toNumber(line.b) });
};

const MINUS = '−';

/** A number as a student writes it, exactly: 3, −2, 7/3, −1/2. */
export const exactNumberText = (value) => {
  const rational = Q.toRational(value);
  const body = rational.d === 1 ? String(Math.abs(rational.n)) : `${Math.abs(rational.n)}/${rational.d}`;
  return rational.n < 0 ? `${MINUS}${body}` : body;
};
export const exactPointText = (point) => `(${exactNumberText(point.x)}, ${exactNumberText(point.y)})`;

/* ---------------------------------- views ---------------------------------- */

/*
 * EVERY VIEW IS A SQUARE AROUND THE ORIGIN WITH A GRID LINE AT EVERY WHOLE
 * NUMBER, so a grid point is a grid point however large the window, and both
 * axes always show. Small windows first: the larger a grid square, the
 * plainer whether a crossing is on a grid point.
 */
const HALF_SPANS = Object.freeze({
  easy: Object.freeze([5, 6, 7, 8]),
  standard: Object.freeze([5, 6, 7, 8]),
  challenge: Object.freeze([6, 7, 8, 9, 10]),
});
// A crossing between grid lines is shown in a window of 10 to 14 squares at
// every tier, so its grid square is never small.
const BETWEEN_HALF_SPANS = Object.freeze([5, 6, 7]);
const COORDINATE_RANGE = Object.freeze({ easy: 5, standard: 6, challenge: 8 });

export const SYSTEM_VIEW_RULES = Object.freeze({
  // Every required point at least this far inside each edge (of the side).
  targetInset: 0.1,
  // A crossing that can't be determined, further inside, in a window of at
  // most 14 grid squares, so its square is never small.
  betweenInset: 0.15,
  betweenMaxHalfSpan: 7,
  // Two targets at least this far apart: a fingertip never reaches two.
  targetSeparation: 0.15,
  // How much of a line the view must show (of its side); the same line twice, more.
  minChord: 0.6,
  minChordSameLine: 0.7,
  // A slanted line's slope, at most this steep and at least its reciprocal.
  maxSlope: 3,
  // The angle two lines must cross at: a readable crossing; a plainly placed
  // one between grid lines; a meeting past the edge that plainly closes in.
  minAngle: 15,
  minAngleBetween: 25,
  minAnglePastEdge: 20,
  // Parallel lines at least this far apart: in units, and of the side.
  minParallelGap: 1.5,
  minParallelGapFraction: 0.1,
  // A crossing past the edge: at least, and at most, this many half-sides
  // from the centre (1.35: a third of a half-side out, so the two lines are
  // plainly apart where they leave the graph, never touching at its edge).
  pastEdgeNear: 1.35,
  pastEdgeFar: 2.5,
});

const squareView = (half) => Object.freeze({ xMin: -half, xMax: half, yMin: -half, yMax: half, xStep: 1, yStep: 1 });

const fitsInside = (point, half, inset) => Math.abs(point.x) <= half * (1 - 2 * inset) + 1e-9
  && Math.abs(point.y) <= half * (1 - 2 * inset) + 1e-9;

/**
 * The window for a system: the smallest square that holds every required
 * point well inside — and, when one holds them too, its framing points (the
 * other intercepts), so the whole system shows.
 */
export const chooseSystemView = ({ required = [], framing = [], tier = 'standard', between = false, inset = SYSTEM_VIEW_RULES.targetInset }) => {
  const halves = between ? BETWEEN_HALF_SPANS : (HALF_SPANS[tier] || HALF_SPANS.standard);
  const fitAll = (points, half) => points.every((point) => fitsInside(point, half, inset));
  const framed = halves.find((half) => fitAll([...required, ...framing], half));
  if (framed) return squareView(framed);
  const bare = halves.find((half) => fitAll(required, half));
  return bare ? squareView(bare) : null;
};

/** The widest window that leaves a crossing plainly past its edge, but not far past it. */
const pastEdgeView = (crossing, tier) => {
  const far = Math.max(Math.abs(crossing.x), Math.abs(crossing.y));
  const halves = (HALF_SPANS[tier] || HALF_SPANS.standard)
    .filter((half) => far >= SYSTEM_VIEW_RULES.pastEdgeNear * half && far <= SYSTEM_VIEW_RULES.pastEdgeFar * half);
  return halves.length ? squareView(halves[halves.length - 1]) : null;
};

const insetOk = (point, view, inset) => {
  const span = view.xMax - view.xMin;
  return point.x - view.xMin >= inset * span - 1e-9 && view.xMax - point.x >= inset * span - 1e-9
    && point.y - view.yMin >= inset * span - 1e-9 && view.yMax - point.y >= inset * span - 1e-9;
};

const normalizedDistance = (a, b, view) => Math.hypot((a.x - b.x) / (view.xMax - view.xMin), (a.y - b.y) / (view.yMax - view.yMin));

/* --------------------------------- systems --------------------------------- */

const SLOPES = Object.freeze({
  easy: Object.freeze([[1, 1], [2, 1], [3, 1]]),
  standard: Object.freeze([[1, 1], [2, 1], [3, 1], [1, 2], [1, 3], [2, 3], [3, 2]]),
  challenge: Object.freeze([[1, 1], [2, 1], [3, 1], [1, 2], [1, 3], [2, 3], [3, 2], [3, 4], [4, 3], [2, 5], [5, 2], [3, 5], [5, 3]]),
});

/**
 * The slopes a tier draws from, both signs: never steeper than 3 nor gentler
 * than 1/3, so each line crosses an axis plainly, never lying along it.
 */
export const systemSlopes = (tier) => (SLOPES[tier] || SLOPES.standard).flatMap(([n, d]) => [Q.rat(n, d), Q.rat(-n, d)]);

const signedInt = (rng, high) => (rng.chance(0.5) ? 1 : -1) * rng.int(1, high);
const twoSlopes = (rng, tier) => {
  const pool = systemSlopes(tier);
  const first = rng.pick(pool);
  return [first, rng.pick(pool.filter((slope) => !Q.eq(slope, first)))];
};
const latticePoint = (rng, range) => exactPoint(rng.int(-range, range), rng.int(-range, range));
/*
 * Where a crossing between grid lines may sit: a quarter, a third, two thirds
 * or three quarters of the way across a grid square (systemsRush
 * plainlyBetweenGridLines) — in from the origin by at most BETWEEN_RANGE, so
 * it is well inside a window of 10 to 14 squares.
 */
const BETWEEN_FRACTIONS = Object.freeze([Q.rat(1, 4), Q.rat(1, 3), Q.rat(2, 3), Q.rat(3, 4)]);
const THIRDS = Object.freeze([Q.rat(1, 3), Q.rat(2, 3)]);
const BETWEEN_RANGE = 4;
const betweenValue = (rng, range, fractions = BETWEEN_FRACTIONS) => Q.add(Q.rat(rng.int(-range, range - 1)), rng.pick(fractions));
// A crossing inside a grid square: a quarter one way only with a third the
// other, so it is never a quarter from a grid point both ways at once.
const betweenPoint = (rng, range) => {
  const x = betweenValue(rng, range);
  return exactPoint(x, betweenValue(rng, range, Q.toRational(x).d === 4 ? THIRDS : BETWEEN_FRACTIONS));
};
// Values on a tier's grid (whole numbers at Easy, halves above), never 0: one, or two different ones.
const gridValues = (tier, range) => {
  const steps = tier === 'easy' ? 1 : 2;
  const values = [];
  for (let numerator = -range * steps; numerator <= range * steps; numerator += 1) {
    if (numerator !== 0) values.push(Q.rat(numerator, steps));
  }
  return values;
};
const gridValue = (rng, tier, range) => rng.pick(gridValues(tier, range));
const twoGridValues = (rng, tier, range) => {
  const values = gridValues(tier, range);
  const first = rng.pick(values);
  return [first, rng.pick(values.filter((value) => !Q.eq(value, first)))];
};
// Two different whole numbers, neither 0, at least `gap` apart.
const twoLevels = (rng, range, gap = 2) => {
  const first = signedInt(rng, range);
  const options = [];
  for (let value = -range; value <= range; value += 1) {
    if (value !== 0 && Math.abs(value - first) >= gap) options.push(value);
  }
  return [first, rng.pick(options)];
};

/*
 * THE VARIANTS OF EACH KIND: how its two lines are built, the questions it is
 * asked with, the tier it first appears at, its weight within its kind, and
 * how many solutions its system has (held to the exact solving). Every kind
 * has an Easy variant for every question, so any kind plays at any
 * difficulty; "Does Not Exist" on an intercept question (two horizontal, or
 * two vertical, lines) comes from Standard, as in Graph Feature Rush.
 */
const ALL_QUESTIONS = SYSTEM_QUESTION_IDS;
const INTERCEPT_QUESTIONS = Object.freeze([SYSTEM_QUESTION.Y_INTERCEPT, SYSTEM_QUESTION.X_INTERCEPT]);
const SOLUTION_ONLY = Object.freeze([SYSTEM_QUESTION.SOLUTION]);
const { ONE, NONE, INFINITE } = SOLUTION_COUNT;

/*
 * AN INTERCEPT QUESTION IS BUILT FROM ITS INTERCEPTS: the point(s) on the
 * axis asked about come first, on the tier's grid, and each slanted line is
 * drawn through one of them and the system's crossing — so the targets are
 * always on the grid, and the crossing is the kind's (a grid point, or inside
 * a grid square). A line so built is never level or upright (lineJoining).
 * A solution question is built from its crossing, with the tier's slopes.
 */
const onAxisAsked = (question, value) => (question === SYSTEM_QUESTION.Y_INTERCEPT ? exactPoint(0, value) : exactPoint(value, 0));

const VARIANTS = Object.freeze({
  [SYSTEM_KIND.SLANTED]: Object.freeze([
    {
      id: 'cross', minTier: 'easy', weight: 4, questions: ALL_QUESTIONS, solutions: ONE,
      build: (rng, { tier, question }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        const point = latticePoint(rng, range);
        if (question === SYSTEM_QUESTION.SOLUTION) {
          const [first, second] = twoSlopes(rng, tier);
          return [lineThrough(first, point), lineThrough(second, point)];
        }
        // The crossing off the axis asked about: on it, the lines would share their intercept.
        if (Q.isZero(question === SYSTEM_QUESTION.Y_INTERCEPT ? point.x : point.y)) return null;
        const [a, b] = twoGridValues(rng, tier, range);
        return [lineJoining(onAxisAsked(question, a), point), lineJoining(onAxisAsked(question, b), point)];
      },
    },
    {
      // They meet on the y-axis: one y-intercept, which is the solution.
      id: 'shareY', minTier: 'standard', weight: 1, questions: ALL_QUESTIONS, solutions: ONE,
      build: (rng, { tier, question }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        const point = exactPoint(0, signedInt(rng, range));
        if (question === SYSTEM_QUESTION.X_INTERCEPT) {
          const [a, b] = twoGridValues(rng, tier, range);
          return [lineJoining(exactPoint(a, 0), point), lineJoining(exactPoint(b, 0), point)];
        }
        const [first, second] = twoSlopes(rng, tier);
        return [lineThrough(first, point), lineThrough(second, point)];
      },
    },
    {
      // They meet on the x-axis: one x-intercept, which is the solution.
      id: 'shareX', minTier: 'standard', weight: 1, questions: ALL_QUESTIONS, solutions: ONE,
      build: (rng, { tier, question }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        const point = exactPoint(signedInt(rng, range), 0);
        if (question === SYSTEM_QUESTION.Y_INTERCEPT) {
          const [a, b] = twoGridValues(rng, tier, range);
          return [lineJoining(exactPoint(0, a), point), lineJoining(exactPoint(0, b), point)];
        }
        const [first, second] = twoSlopes(rng, tier);
        return [lineThrough(first, point), lineThrough(second, point)];
      },
    },
  ]),
  [SYSTEM_KIND.LEVEL_UPRIGHT]: Object.freeze([
    {
      // x = c and a slanted line: one y-intercept, the slanted line's.
      id: 'uprightSlanted', minTier: 'easy', weight: 2, questions: ALL_QUESTIONS, solutions: ONE,
      build: (rng, { tier, question }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        const x = signedInt(rng, range);
        const crossing = exactPoint(x, rng.int(-range, range));
        if (question === SYSTEM_QUESTION.SOLUTION) return [verticalLine(x), lineThrough(rng.pick(systemSlopes(tier)), crossing)];
        return [verticalLine(x), lineJoining(onAxisAsked(question, gridValue(rng, tier, range)), crossing)];
      },
    },
    {
      // y = c and a slanted line: one x-intercept, the slanted line's.
      id: 'levelSlanted', minTier: 'easy', weight: 2, questions: ALL_QUESTIONS, solutions: ONE,
      build: (rng, { tier, question }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        const y = signedInt(rng, range);
        const crossing = exactPoint(rng.int(-range, range), y);
        if (question === SYSTEM_QUESTION.SOLUTION) return [horizontalLine(y), lineThrough(rng.pick(systemSlopes(tier)), crossing)];
        return [horizontalLine(y), lineJoining(onAxisAsked(question, gridValue(rng, tier, range)), crossing)];
      },
    },
    {
      // x = a and y = b: one intercept on each axis, and the solution (a, b).
      id: 'uprightLevel', minTier: 'easy', weight: 1, questions: ALL_QUESTIONS, solutions: ONE,
      build: (rng, { tier }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        return [verticalLine(signedInt(rng, range)), horizontalLine(signedInt(rng, range))];
      },
    },
    {
      // Two horizontal lines: no x-intercept at all (Does Not Exist), two y-intercepts.
      id: 'twoLevel', minTier: 'standard', weight: 1, questions: INTERCEPT_QUESTIONS, solutions: NONE,
      build: (rng, { tier }) => twoLevels(rng, COORDINATE_RANGE[tier] - 1).map(horizontalLine),
    },
    {
      // Two vertical lines: no y-intercept at all (Does Not Exist), two x-intercepts.
      id: 'twoUpright', minTier: 'standard', weight: 1, questions: INTERCEPT_QUESTIONS, solutions: NONE,
      build: (rng, { tier }) => twoLevels(rng, COORDINATE_RANGE[tier] - 1).map(verticalLine),
    },
  ]),
  [SYSTEM_KIND.CANNOT_DETERMINE]: Object.freeze([
    {
      // They cross inside a grid square: built from that crossing for a
      // solution question, from the intercepts asked for otherwise.
      id: 'between', minTier: 'easy', weight: 3, questions: ALL_QUESTIONS, solutions: ONE,
      build: (rng, { tier, question }) => {
        const point = betweenPoint(rng, BETWEEN_RANGE);
        if (question === SYSTEM_QUESTION.SOLUTION) {
          const [first, second] = twoSlopes(rng, tier);
          return [lineThrough(first, point), lineThrough(second, point)];
        }
        // Each line through an intercept on the grid and the crossing: the
        // crossing is never on the axis, so neither line is level or upright.
        const [a, b] = twoGridValues(rng, tier, BETWEEN_RANGE);
        const onAxis = (value) => (question === SYSTEM_QUESTION.Y_INTERCEPT ? exactPoint(0, value) : exactPoint(value, 0));
        return [lineJoining(onAxis(a), point), lineJoining(onAxis(b), point)];
      },
    },
    {
      // They visibly close in on each other and meet past the edge: two
      // slopes a clear but modest angle apart, their crossing out along the
      // line halfway between them, so both lines run through the view.
      id: 'pastEdge', minTier: 'challenge', weight: 1, questions: SOLUTION_ONLY, solutions: ONE, pastEdge: true,
      build: (rng, { tier }) => {
        let [first, second] = twoSlopes(rng, tier);
        for (let tries = 0; tries < 12; tries += 1) {
          const apart = Math.abs(Math.atan(Q.toNumber(first)) - Math.atan(Q.toNumber(second))) * (180 / Math.PI);
          if (apart >= SYSTEM_VIEW_RULES.minAnglePastEdge && apart <= 45) break;
          [first, second] = twoSlopes(rng, tier);
        }
        const heading = (Math.atan(Q.toNumber(first)) + Math.atan(Q.toNumber(second))) / 2 + (rng.chance(0.5) ? Math.PI : 0);
        const half = rng.pick(HALF_SPANS[tier] || HALF_SPANS.challenge);
        const distance = half * (1.45 + rng.int(0, 6) / 10);
        const near = (value) => Q.add(Q.rat(Math.floor(value)), rng.pick(BETWEEN_FRACTIONS));
        const point = exactPoint(near(distance * Math.cos(heading)), near(distance * Math.sin(heading)));
        return [lineThrough(first, point), lineThrough(second, point)];
      },
    },
  ]),
  [SYSTEM_KIND.PARALLEL]: Object.freeze([
    {
      // One slope, two lines: through two x-intercepts on the grid when those are asked, else two y-intercepts.
      id: 'slanted', minTier: 'easy', weight: 3, questions: ALL_QUESTIONS, solutions: NONE,
      build: (rng, { tier, question }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        const slope = rng.pick(systemSlopes(tier));
        if (question === SYSTEM_QUESTION.X_INTERCEPT) {
          const [a, b] = twoGridValues(rng, tier, range);
          return [lineThrough(slope, exactPoint(a, 0)), lineThrough(slope, exactPoint(b, 0))];
        }
        const [first, second] = twoLevels(rng, range);
        return [slantedLine(slope, first), slantedLine(slope, second)];
      },
    },
    {
      id: 'level', minTier: 'standard', weight: 1, questions: ALL_QUESTIONS, solutions: NONE,
      build: (rng, { tier }) => twoLevels(rng, COORDINATE_RANGE[tier] - 1).map(horizontalLine),
    },
    {
      id: 'upright', minTier: 'standard', weight: 1, questions: ALL_QUESTIONS, solutions: NONE,
      build: (rng, { tier }) => twoLevels(rng, COORDINATE_RANGE[tier] - 1).map(verticalLine),
    },
  ]),
  [SYSTEM_KIND.SAME_LINE]: Object.freeze([
    {
      // Through its x-intercept on the grid when that is asked, else its y-intercept.
      id: 'slanted', minTier: 'easy', weight: 3, questions: ALL_QUESTIONS, solutions: INFINITE,
      build: (rng, { tier, question }) => {
        const range = COORDINATE_RANGE[tier] - 1;
        const slope = rng.pick(systemSlopes(tier));
        const line = question === SYSTEM_QUESTION.X_INTERCEPT
          ? lineThrough(slope, exactPoint(gridValue(rng, tier, range), 0))
          : slantedLine(slope, signedInt(rng, range));
        return [line, line];
      },
    },
    {
      id: 'level', minTier: 'standard', weight: 1, questions: ALL_QUESTIONS, solutions: INFINITE,
      build: (rng, { tier }) => {
        const line = horizontalLine(signedInt(rng, COORDINATE_RANGE[tier] - 1));
        return [line, line];
      },
    },
    {
      id: 'upright', minTier: 'standard', weight: 1, questions: ALL_QUESTIONS, solutions: INFINITE,
      build: (rng, { tier }) => {
        const line = verticalLine(signedInt(rng, COORDINATE_RANGE[tier] - 1));
        return [line, line];
      },
    },
  ]),
});

const variantOf = (kind, variantId) => (VARIANTS[kind] || []).find((variant) => variant.id === variantId) || null;

/** The variants of a kind, as a test reads them (everything but how each is built). */
export const systemVariantsOf = (kind) => (VARIANTS[kind] || []).map((variant) => Object.freeze(Object.fromEntries(Object.entries(variant).filter(([key]) => key !== 'build'))));

// The press that answers a solution question of each special kind (none for a
// kind whose solution is tapped, and none for parallel lines: a question with
// nothing to tap and no other press is answered by "Does Not Exist" — its
// "No Solution").
const ANSWER_PRESS = Object.freeze({
  [SYSTEM_KIND.SAME_LINE]: RUSH_ATTEMPT_KIND.INFINITELY_MANY,
  [SYSTEM_KIND.CANNOT_DETERMINE]: RUSH_ATTEMPT_KIND.CANNOT_DETERMINE,
});

/* ------------------------------ targets, rules ----------------------------- */

const TARGET_PREFIX = Object.freeze({ [SYSTEM_QUESTION.Y_INTERCEPT]: 'y', [SYSTEM_QUESTION.X_INTERCEPT]: 'x' });
export const SOLUTION_TARGET_ID = 'sol';

const toPlainPoint = (point) => Object.freeze({ x: Q.toNumber(point.x), y: Q.toNumber(point.y) });
const pointKey = (point) => `${Q.format(point.x)}|${Q.format(point.y)}`;

/*
 * An intercept question's targets, exactly: each line's intercept with the
 * axis asked about — one point where the two lines share it — left to right
 * (bottom to top on the y-axis). A line that misses the axis has none there.
 */
const interceptTargets = (question, exactLines) => {
  const of = question === SYSTEM_QUESTION.Y_INTERCEPT ? yInterceptOf : xInterceptOf;
  const found = exactLines.map(of).filter(Boolean);
  const unique = [];
  found.forEach((point) => { if (!unique.some((other) => pointKey(other) === pointKey(point))) unique.push(point); });
  const sorted = unique.sort((left, right) => Q.cmp(left.x, right.x) || Q.cmp(left.y, right.y));
  return {
    shared: found.length > unique.length,
    targets: sorted.map((point, index) => Object.freeze({ id: `${TARGET_PREFIX[question]}${index + 1}`, ...toPlainPoint(point), exactX: point.x, exactY: point.y })),
  };
};

// A solution question's one target, when its solution is a point to tap.
const solutionTargets = (kind, solved) => (CROSSING_KINDS.includes(kind) && solved.point
  ? [Object.freeze({ id: SOLUTION_TARGET_ID, ...toPlainPoint(solved.point), exactX: solved.point.x, exactY: solved.point.y })]
  : []);

/**
 * Every reason a candidate system is not fit to issue (empty: issue it).
 * `lines` are its plain lines, as the device will draw them.
 */
export const systemProblems = ({ slot, variant, lines, solved, targets, shared = false, view }) => {
  if (!view) return ['no readable view'];
  const problems = [];
  const span = view.xMax - view.xMin;
  const minChord = slot.kind === SYSTEM_KIND.SAME_LINE ? SYSTEM_VIEW_RULES.minChordSameLine : SYSTEM_VIEW_RULES.minChord;
  lines.forEach((line) => { if (chordFraction(line, view) < minChord) problems.push('a line barely crosses the graph'); });
  // A slanted line never steeper than 3 nor gentler than 1/3: it crosses each
  // axis plainly, never lying along it for a stretch.
  if (lines.some((line) => line.orientation === LINE_ORIENTATION.SLANTED
    && (Math.abs(line.m) > SYSTEM_VIEW_RULES.maxSlope + 1e-9 || Math.abs(line.m) < 1 / SYSTEM_VIEW_RULES.maxSlope - 1e-9))) {
    problems.push('a line too steep or too flat to read');
  }
  // An item's targets: on the tier's grid (whole numbers at Easy, halves above), well inside, apart.
  const grid = slot.tier === 'easy' ? 1 : 2;
  targets.forEach((target) => {
    if (!Q.onGrid(target.exactX, grid) || !Q.onGrid(target.exactY, grid)) problems.push('target off the grid');
    if (!insetOk(target, view, SYSTEM_VIEW_RULES.targetInset)) problems.push('target too close to the edge');
    if (slot.tier === 'easy' && target.x === 0 && target.y === 0) problems.push('target at the origin on Easy');
  });
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      if (normalizedDistance(targets[i], targets[j], view) < SYSTEM_VIEW_RULES.targetSeparation) problems.push('targets too close together');
    }
  }
  // At Easy two different lines never share an intercept: every intercept is one line's own.
  if (slot.tier === 'easy' && shared && slot.kind !== SYSTEM_KIND.SAME_LINE) problems.push('a shared intercept on Easy');
  if (solved.solutions === SOLUTION_COUNT.ONE) {
    const crossing = toPlainPoint(solved.point);
    const angle = crossingAngle(lines[0], lines[1]);
    if (exactPointText(solved.point).length > MAX_CROSSING_TEXT) problems.push('the crossing is too long to say');
    if (variant.pastEdge) {
      // Plainly past the edge, never far past it, and closing in visibly.
      const far = Math.max(Math.abs(crossing.x), Math.abs(crossing.y));
      if (far < SYSTEM_VIEW_RULES.pastEdgeNear * (span / 2)) problems.push('the crossing is not plainly past the edge');
      if (far > SYSTEM_VIEW_RULES.pastEdgeFar * (span / 2)) problems.push('the crossing is too far past the edge');
      if (angle < SYSTEM_VIEW_RULES.minAnglePastEdge) problems.push('the lines cross at too shallow an angle');
      if (!plainlyBetweenGridLines(solved.point)) problems.push('the crossing is not plainly between grid lines');
    } else {
      const between = slot.kind === SYSTEM_KIND.CANNOT_DETERMINE;
      if (!insetOk(crossing, view, between ? SYSTEM_VIEW_RULES.betweenInset : SYSTEM_VIEW_RULES.targetInset)) problems.push('the crossing is near the edge');
      if (between) {
        if (!plainlyBetweenGridLines(solved.point)) problems.push('the crossing is not plainly between grid lines');
        if (angle < SYSTEM_VIEW_RULES.minAngleBetween) problems.push('the lines cross at too shallow an angle');
        if (span / 2 > SYSTEM_VIEW_RULES.betweenMaxHalfSpan) problems.push('the grid squares are too small');
      } else {
        if (!Q.isInteger(solved.point.x) || !Q.isInteger(solved.point.y)) problems.push('the crossing is not on a grid point');
        if (angle < SYSTEM_VIEW_RULES.minAngle) problems.push('the lines cross at too shallow an angle');
      }
      // On an intercept question the crossing is an intercept, or plainly clear of every one.
      if (slot.question !== SYSTEM_QUESTION.SOLUTION) {
        targets.forEach((target) => {
          const same = Q.eq(target.exactX, solved.point.x) && Q.eq(target.exactY, solved.point.y);
          if (!same && normalizedDistance(crossing, target, view) < SYSTEM_VIEW_RULES.targetSeparation) problems.push('the crossing crowds an intercept');
        });
      }
    }
  }
  if (solved.solutions === SOLUTION_COUNT.NONE
    && parallelGap(lines[0], lines[1]) < Math.max(SYSTEM_VIEW_RULES.minParallelGap, SYSTEM_VIEW_RULES.minParallelGapFraction * span)) {
    problems.push('parallel lines too close together');
  }
  return [...new Set(problems)];
};

/** One attempt at a slot. Returns { item } or { problems }. */
const attemptSystem = ({ slot, rng }) => {
  const variant = variantOf(slot.kind, slot.variant);
  if (!variant || !variant.questions.includes(slot.question)) return { problems: ['unknown slot'] };
  const built = variant.build(rng, { tier: slot.tier, question: slot.question });
  if (!built || built.some((line) => !line)) return { problems: ['no system'] };
  // Either line may be line 1.
  const exactLines = rng.chance(0.5) ? [built[1], built[0]] : [built[0], built[1]];
  const solved = solveSystem(exactLines[0], exactLines[1]);
  if (solved.solutions !== variant.solutions) return { problems: [`solving says ${solved.solutions}`] };
  const lines = exactLines.map((line, index) => plainLine(line, index + 1));
  const { targets, shared } = slot.question === SYSTEM_QUESTION.SOLUTION
    ? { shared: false, targets: solutionTargets(slot.kind, solved) }
    : interceptTargets(slot.question, exactLines);
  const crossing = solved.point ? toPlainPoint(solved.point) : null;
  let view;
  if (variant.pastEdge) view = crossing ? pastEdgeView(crossing, slot.tier) : null;
  else {
    const between = slot.kind === SYSTEM_KIND.CANNOT_DETERMINE;
    // The rest of the system, in view where it fits: both lines' intercepts.
    const framing = [...exactLines.map(yInterceptOf), ...exactLines.map(xInterceptOf)].filter(Boolean).map(toPlainPoint);
    view = chooseSystemView({
      required: [...targets, ...(crossing ? [crossing] : [])],
      framing,
      tier: slot.tier,
      between,
      inset: between ? SYSTEM_VIEW_RULES.betweenInset : SYSTEM_VIEW_RULES.targetInset,
    });
  }
  const problems = systemProblems({ slot, variant, lines, solved, targets, shared, view });
  if (problems.length) return { problems };
  return { item: { exactLines, lines, solved, targets, view } };
};

/**
 * Why candidates for a slot get rejected — a histogram of problems over
 * `attempts` draws. For tuning and for tests; never on a hot path.
 */
export const diagnoseSystemSlot = ({ slot, seedText, attempts = 200 }) => {
  const rng = createRng(`${seedText}|diagnose`);
  const reasons = {};
  let accepted = 0;
  for (let index = 0; index < attempts; index += 1) {
    const outcome = attemptSystem({ slot, rng });
    if (outcome.item) accepted += 1;
    else (outcome.problems || ['unknown']).forEach((problem) => { reasons[problem] = (reasons[problem] || 0) + 1; });
  }
  return { accepted, attempts, reasons };
};

/*
 * A KNOWN-GOOD SYSTEM FOR EACH KIND, issued only if a slot ever exhausted its
 * attempts (marked `fallback`). Each passes every rule for every question at
 * every tier, in a window of six squares each way.
 */
const FALLBACKS = Object.freeze({
  // y = x + 1 and y = −x + 3 cross at (1, 2).
  [SYSTEM_KIND.SLANTED]: () => [slantedLine(1, 1), slantedLine(-1, 3)],
  // x = 2 and y = −3 cross at (2, −3).
  [SYSTEM_KIND.LEVEL_UPRIGHT]: () => [verticalLine(2), horizontalLine(-3)],
  // y = 2x − 2 and y = −x + 3 cross at (5/3, 4/3).
  [SYSTEM_KIND.CANNOT_DETERMINE]: () => [slantedLine(2, -2), slantedLine(-1, 3)],
  // y = x + 2 and y = x − 2.
  [SYSTEM_KIND.PARALLEL]: () => [slantedLine(1, 2), slantedLine(1, -2)],
  // y = x + 2, twice.
  [SYSTEM_KIND.SAME_LINE]: () => [slantedLine(1, 2), slantedLine(1, 2)],
});
export const FALLBACK_VIEW = squareView(6);

const fallbackItem = (slot) => {
  const exactLines = (FALLBACKS[slot.kind] || FALLBACKS[SYSTEM_KIND.SLANTED])();
  const solved = solveSystem(exactLines[0], exactLines[1]);
  const targets = slot.question === SYSTEM_QUESTION.SOLUTION
    ? solutionTargets(slot.kind, solved)
    : interceptTargets(slot.question, exactLines).targets;
  return { exactLines, lines: exactLines.map((line, index) => plainLine(line, index + 1)), solved, targets, view: FALLBACK_VIEW };
};

const wordingFor = (rng, slot) => {
  if (slot.question !== SYSTEM_QUESTION.SOLUTION) return SYSTEM_PROMPTS[slot.question];
  if (slot.tier === 'easy') return SYSTEM_PROMPTS.intersect;
  if (slot.tier === 'standard' && rng.chance(0.35)) return SYSTEM_PROMPTS.intersect;
  return SYSTEM_PROMPTS[SYSTEM_QUESTION.SOLUTION];
};

/* ---------------------------------- items ---------------------------------- */

/** One item for a slot, from a seed. Deterministic. */
export const generateSystemItem = ({ slot, seedText, questionIndex = 0, avoid = [] }) => {
  const rng = createRng(`${seedText}|v${SYSTEMS_GENERATOR_VERSION}`);
  const wording = wordingFor(rng, slot);
  const avoided = new Set(avoid);
  let built = null;
  let attempts = 0;
  for (; attempts < MAX_SYSTEM_ATTEMPTS && !built; attempts += 1) {
    const outcome = attemptSystem({ slot, rng });
    if (outcome.item && !avoided.has(JSON.stringify(outcome.item.lines))) built = outcome.item;
  }
  const fallback = !built;
  const item = built || fallbackItem(slot);
  const targets = Object.freeze(item.targets.map(({ id, x, y }) => Object.freeze({ id, x, y })));
  const solution = slot.question === SYSTEM_QUESTION.SOLUTION;
  const answerPress = solution ? ANSWER_PRESS[slot.kind] || null : null;
  const pastEdge = !fallback && variantOf(slot.kind, slot.variant)?.pastEdge === true;
  // Every point a student could tap of this system, for the teacher's report
  // only (graphFeatureRush.rushTapDiagnosis: "Tapped a y-intercept when asked
  // for the solution"). Never on the device's copy.
  const graphFeatures = Object.freeze({
    [SYSTEM_QUESTION.Y_INTERCEPT]: Object.freeze(interceptTargets(SYSTEM_QUESTION.Y_INTERCEPT, item.exactLines).targets.map(({ x, y }) => Object.freeze({ x, y }))),
    [SYSTEM_QUESTION.X_INTERCEPT]: Object.freeze(interceptTargets(SYSTEM_QUESTION.X_INTERCEPT, item.exactLines).targets.map(({ x, y }) => Object.freeze({ x, y }))),
    [SYSTEM_QUESTION.SOLUTION]: Object.freeze(item.solved.point && !pastEdge ? [toPlainPoint(item.solved.point)] : []),
  });
  return Object.freeze({
    generatorVersion: SYSTEMS_GENERATOR_VERSION,
    questionIndex,
    kind: SYSTEM_ITEM_KIND,
    feature: slot.question,
    family: slot.kind,
    variant: fallback ? 'fallback' : slot.variant,
    tier: slot.tier,
    wording: wording.id,
    prompt: wording.prompt,
    // Two lines in place of a graph (the round screen draws them).
    graph: null,
    lines: Object.freeze(item.lines),
    view: item.view,
    targets,
    // "Does Not Exist", "No Solution", "Infinitely Many" and "Can't Be
    // Determined" are each one target, found by its button.
    targetCount: Math.max(1, targets.length),
    // What it is worth: the taps its answer takes (graphFeatureRushRules.rushQuestionWeight).
    weight: rushQuestionWeight({ targets }),
    doesNotExist: targets.length === 0 && !answerPress,
    // The press that answers it, where that is not "Does Not Exist"
    // (graphFeatureRushRules.rushPressAnswer).
    ...(answerPress ? { answerPress } : {}),
    // A solution question's crossing, exactly, for its words: where the
    // lines meet, said when the graph cannot show it, and the reveal.
    ...(solution && item.solved.point
      ? { crossing: toPlainPoint(item.solved.point), crossingText: exactPointText(item.solved.point), ...(pastEdge ? { pastEdge: true } : {}) }
      : {}),
    graphFeatures,
    fallback,
    attempts,
  });
};

/* --------------------------------- schedule -------------------------------- */

// Each kind's share of a question's items: the two that cross at a grid point
// twice the special ones', so the special ones stay special.
const KIND_WEIGHT = Object.freeze({
  [SYSTEM_KIND.SLANTED]: 2,
  [SYSTEM_KIND.LEVEL_UPRIGHT]: 2,
  [SYSTEM_KIND.CANNOT_DETERMINE]: 1,
  [SYSTEM_KIND.PARALLEL]: 1,
  [SYSTEM_KIND.SAME_LINE]: 1,
});

/**
 * Every slot a tier can draw for these settings: each question an equal
 * share, each kind its weight of that, each variant its weight of the kind.
 */
export const systemsSlotCatalog = (config, tier) => {
  const questions = (config?.questions || []).filter((question) => SYSTEM_QUESTION_IDS.includes(question));
  const kinds = (config?.kinds || []).filter((kind) => SYSTEM_KIND_IDS.includes(kind));
  const slots = [];
  questions.forEach((question) => {
    const entries = kinds.map((kind) => ({
      kind,
      variants: (VARIANTS[kind] || []).filter((variant) => tierRank(variant.minTier) <= tierRank(tier) && variant.questions.includes(question)),
    })).filter((entry) => entry.variants.length);
    const kindTotal = entries.reduce((sum, entry) => sum + KIND_WEIGHT[entry.kind], 0);
    entries.forEach(({ kind, variants }) => {
      const variantTotal = variants.reduce((sum, variant) => sum + variant.weight, 0);
      variants.forEach((variant) => {
        slots.push(Object.freeze({
          question,
          kind,
          variant: variant.id,
          tier,
          weight: (1 / questions.length) * (KIND_WEIGHT[kind] / kindTotal) * (variant.weight / variantTotal),
        }));
      });
    });
  });
  return Object.freeze(slots);
};

/** Which tier each position of a block draws from (Mixed ramps, as Graph Feature Rush does). */
export const systemsBlockTiers = (difficulty, blockIndex) => {
  if (difficulty !== 'mixed') return Array(SYSTEMS_BLOCK_SIZE).fill(difficulty);
  if (blockIndex === 0) return ['easy', 'easy', 'standard', 'easy', 'standard', 'standard'];
  if (blockIndex === 1) return ['standard', 'standard', 'challenge', 'standard', 'standard', 'challenge'];
  return ['standard', 'challenge', 'standard', 'challenge', 'challenge', 'standard'];
};

/**
 * The block every student in a round shares: six slots drawn with the room's
 * secret, a (question, kind) not yet used in the block where the catalog
 * allows — so a block spreads across what the teacher chose.
 */
export const systemsBlockTemplate = ({ seed, roundIndex, blockIndex, config }) => {
  const rng = createRng(`${seed}|sys-template|r${roundIndex}|b${blockIndex}|v${SYSTEMS_GENERATOR_VERSION}`);
  const used = new Set();
  return systemsBlockTiers(config.difficulty, blockIndex).map((tier) => {
    const catalog = systemsSlotCatalog(config, tier);
    const fresh = catalog.filter((slot) => !used.has(`${slot.question}|${slot.kind}`));
    const chosen = rng.weighted(fresh.length ? fresh : catalog);
    if (!chosen) return null;
    used.add(`${chosen.question}|${chosen.kind}`);
    return Object.freeze({ question: chosen.question, kind: chosen.kind, variant: chosen.variant, tier: chosen.tier });
  });
};

/** The slot of a student's item k: their own order within the shared block. */
export const systemsSlot = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const blockIndex = Math.floor(questionIndex / SYSTEMS_BLOCK_SIZE);
  const template = systemsBlockTemplate({ seed, roundIndex, blockIndex, config });
  const order = createRng(`${seed}|sys-order|${studentKey}|r${roundIndex}|b${blockIndex}`).shuffle(template.map((_, index) => index));
  return template[order[questionIndex % SYSTEMS_BLOCK_SIZE]] || null;
};

/**
 * A student's item k in a round. Two items in a row are never the same system
 * asked the same way: an odd-numbered item passes over the lines of either
 * neighbour with its question and kind (every adjacent pair has exactly one
 * odd member), so no item depends on more than its two neighbours' first draws.
 */
export const generateSystemsQuestion = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const slotAt = (index) => (index >= 0 ? systemsSlot({ seed, studentKey, roundIndex, questionIndex: index, config }) : null);
  const seedTextAt = (index) => `${seed}|sys|${studentKey}|r${roundIndex}|q${index}`;
  const slot = slotAt(questionIndex);
  if (!slot) return null;
  const avoid = questionIndex % 2 === 1
    ? [questionIndex - 1, questionIndex + 1]
      .map((index) => ({ index, neighbour: slotAt(index) }))
      .filter(({ neighbour }) => neighbour && neighbour.question === slot.question && neighbour.kind === slot.kind)
      .map(({ index, neighbour }) => JSON.stringify(generateSystemItem({ slot: neighbour, seedText: seedTextAt(index), questionIndex: index }).lines))
    : [];
  return generateSystemItem({ slot, seedText: seedTextAt(questionIndex), questionIndex, avoid });
};

/**
 * What a student's device receives. The answer travels with the item, as a
 * graph's targets do: the device answers a tap or a press at once, and the
 * server grades every attempt again from its own regenerated copy. The
 * system's other features (for the teacher's report) stay on the server.
 */
export const publicSystemsQuestion = (question) => (question ? Object.freeze({
  questionIndex: question.questionIndex,
  kind: question.kind,
  feature: question.feature,
  family: question.family,
  prompt: question.prompt,
  graph: null,
  lines: question.lines,
  view: question.view,
  targets: question.targets,
  targetCount: question.targetCount,
  weight: question.weight,
  ...(question.answerPress ? { answerPress: question.answerPress } : {}),
  ...(question.crossing ? { crossing: question.crossing, crossingText: question.crossingText } : {}),
  ...(question.pastEdge ? { pastEdge: true } : {}),
}) : null);
