/*
 * GRAPH THE LINE: GENERATED, INDIVIDUAL, VALIDATED QUESTIONS.
 *
 * Every student gets their own equations. What they share is the SCHEDULE:
 * the game is cut into blocks of six slots — (item type, form, variant,
 * tier) — and every student receives the same six slots in each block, in
 * their own order, with their own numbers. After any whole number of blocks
 * two students have graphed the same mix of forms at the same difficulty; a
 * neighbour's screen shows a different equation, usually in another form.
 * With `sameEquations` (Classic's default) the order and the numbers are
 * shared too, so the class can talk about one line.
 *
 * WHERE A SLOT SITS. Sprint and Rush rounds hold many items, so a block is
 * six items of one round. A Classic round holds one item, so its blocks run
 * ACROSS rounds: rounds 0–5 are the first block, and a game of eight rounds
 * has graphed every enabled form by round six.
 *
 * DETERMINISM. Item k for a student is a pure function of
 *
 *   (room secret, student, round, k, config, LINE_GRAPH_GENERATOR_VERSION)
 *
 * so the server never stores what it issued: it regenerates an item to grade
 * an attempt on it. Changing anything that alters generated items MUST bump
 * LINE_GRAPH_GENERATOR_VERSION; a room created under another version refuses
 * to issue or grade. (The tests pin generated items, so a change cannot slip
 * through unnoticed — including a change to seededRandom.mjs.)
 *
 * VALIDATION. An item is issued only when
 *
 *   - it is not an axis (y = 0 or x = 0 asks nothing);
 *   - the line passes through at least two grid points one unit or more
 *     inside the view (three for Name it, so the slope can be checked);
 *   - every KEY POINT of the form's method — the y-intercept, both
 *     intercepts, the point in the equation — that is a grid point lies one
 *     unit or more inside the view, so it can be placed without aiming at
 *     the edge of a phone;
 *   - for Name it, what the answer must be read from is ON the grid: the
 *     y-intercept for slope-intercept form, both intercepts for standard
 *     form, the marked point for point-slope form.
 *
 * Challenge items may put the y-intercept or an intercept between grid
 * lines on purpose (y = ½x + 3/2; 2x + 3y = 9): the student must find other
 * points on the line. Those items have no placeable key point, so a game
 * that requires the method cannot require it there.
 *
 * Pure: Cloud Functions and tests. The device receives what
 * publicLineQuestion returns; the generator never ships to a browser.
 */

import * as Q from './graphFeatureRational.mjs';
import { createRng } from './seededRandom.mjs';
import {
  horizontalLine,
  isHorizontal,
  isLatticePoint,
  isVertical,
  latticePointsInView,
  lineFromCoefficients,
  lineFromPointSlope,
  lineFromSlopeIntercept,
  pointInView,
  sameLine,
  slopeOf,
  verticalLine,
  xInterceptOf,
  yInterceptOf,
} from './lineGraphMath.mjs';
import {
  BUILD_FIELDS,
  LINE_FORM,
  LINE_FORM_IDS,
  NUMBER_STYLE,
  POINT_SLOPE_LAYOUT,
  SLOPE_INTERCEPT_ORDER,
  SPECIAL_FORM,
  pointSlopeTokens,
  presentEquation,
  slopeInterceptTokens,
  specialTokens,
  standardTokens,
} from './lineGraphForms.mjs';
import { mistakeLinesFor } from './lineGraphFeedback.mjs';
import { LINE_DIFFICULTY, LINE_NAME_STYLE, LINE_TIER } from './lineGraphConfig.mjs';
import { LINE_ANSWER_STYLE, LINE_GRAPH_FORMAT, LINE_ITEM_TYPE } from './lineGraphRules.mjs';

export const LINE_GRAPH_GENERATOR_VERSION = 1;

export const LINE_SCHEDULE_BLOCK_SIZE = 6;
export const MAX_LINE_GENERATION_ATTEMPTS = 60;

const { EASY, STANDARD, CHALLENGE } = LINE_TIER;
const { GRAPH, NAME } = LINE_ITEM_TYPE;

/* --------------------------------- views --------------------------------- */

/*
 * One square grid per tier, the same for every item: in a race, a student
 * should read the equation, not re-read the scale. Easy's grid is the
 * smallest so its cells are the biggest on a phone.
 */
export const LINE_VIEW_HALF = Object.freeze({ [EASY]: 6, [STANDARD]: 8, [CHALLENGE]: 10 });
export const KEY_POINT_INSET = 1;

export const lineViewForTier = (tier) => {
  const half = LINE_VIEW_HALF[tier] ?? LINE_VIEW_HALF[STANDARD];
  return Object.freeze({ xMin: -half, xMax: half, yMin: -half, yMax: half });
};

const innerLimit = (tier) => (LINE_VIEW_HALF[tier] ?? LINE_VIEW_HALF[STANDARD]) - KEY_POINT_INSET;

/* -------------------------------- numbers -------------------------------- */

const range = (low, high) => Array.from({ length: Math.max(0, high - low + 1) }, (_, index) => low + index);
const nonZero = (limit) => range(-limit, limit).filter((value) => value !== 0);
const signed = (rng, value) => (rng.chance(0.5) ? Q.toRational(value) : Q.neg(Q.toRational(value)));
const signedPick = (rng, values) => signed(rng, rng.pick(values));

/** Reduced fractions p/q with q one of `denominators` (never whole), at most `max`. */
const fractionSlopes = (denominators, maxNumerator, max) => denominators.flatMap((den) => range(1, maxNumerator)
  .map((num) => Q.rat(num, den))
  .filter((value) => value.d === den && Q.cmp(value, max) <= 0));

const WHOLE_SLOPES = Object.freeze({ [EASY]: [2, 3], [STANDARD]: [2, 3, 4], [CHALLENGE]: [2, 3, 4, 5] });
const FRACTION_SLOPES = Object.freeze({
  [STANDARD]: Object.freeze(fractionSlopes([2, 3], 5, 3)),
  [CHALLENGE]: Object.freeze(fractionSlopes([2, 3, 4, 5], 7, 3)),
});
const DECIMAL_SLOPES = Object.freeze([Q.rat(1, 2), Q.rat(3, 2), Q.rat(5, 2), Q.rat(1, 4), Q.rat(3, 4)]);
const MIXED_SLOPES = Object.freeze([1, 2, 3, 4, Q.rat(1, 2), Q.rat(2, 3), Q.rat(3, 4)].map(Q.toRational));
const ORIGIN_SLOPES = Object.freeze({
  [EASY]: Object.freeze([1, 2, 3].map(Q.toRational)),
  [STANDARD]: Object.freeze([2, 3, Q.rat(1, 2), Q.rat(1, 3), Q.rat(2, 3), Q.rat(3, 2)].map(Q.toRational)),
});

const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/* --------------------------------- drafts -------------------------------- */

/*
 * A DRAFT is one candidate item before validation:
 *
 *   line      the canonical target line
 *   equation  what a Graph-it student reads (null for Name it)
 *   spec      what the hints are made from: { form, line, point, layout }
 *   anchors   the method's key points that are grid points
 *   marked    Name it, point-slope: the point the answer is written around
 *   answer    Name it: the equation written in the asked-for form
 */
const draft = (fields) => Object.freeze({ equation: null, point: null, layout: null, marked: null, answer: null, ...fields });

const slopeInterceptDraft = ({ m, b, order = SLOPE_INTERCEPT_ORDER.SLOPE_FIRST, style = NUMBER_STYLE.FRACTION, itemType = GRAPH }) => {
  const line = lineFromSlopeIntercept(m, b);
  const intercept = Q.toRational(b);
  const written = presentEquation(slopeInterceptTokens({ m, b, order, style }));
  return draft({
    line,
    equation: itemType === GRAPH ? written : null,
    answer: itemType === NAME ? written : null,
    spec: Object.freeze({ form: LINE_FORM.SLOPE_INTERCEPT, line }),
    anchors: intercept.d === 1 ? [Object.freeze({ x: 0, y: intercept.n })] : [],
  });
};

const standardDraft = ({ A, B, C, itemType = GRAPH }) => {
  const line = lineFromCoefficients(A, B, C);
  const written = presentEquation(standardTokens({ A, B, C }));
  const xi = xInterceptOf(line);
  const yi = yInterceptOf(line);
  let anchors = [];
  if (C === 0) anchors = [Object.freeze({ x: 0, y: 0 })];
  else if (xi && yi && xi.d === 1 && yi.d === 1) anchors = [Object.freeze({ x: xi.n, y: 0 }), Object.freeze({ x: 0, y: yi.n })];
  return draft({
    line,
    equation: itemType === GRAPH ? written : null,
    answer: itemType === NAME ? written : null,
    spec: Object.freeze({ form: LINE_FORM.STANDARD, line }),
    anchors,
  });
};

const pointSlopeDraft = ({ x1, y1, m, layout = POINT_SLOPE_LAYOUT.POINT_SLOPE, itemType = GRAPH }) => {
  const point = Object.freeze({ x: x1, y: y1 });
  const line = lineFromPointSlope(point, m);
  const written = presentEquation(pointSlopeTokens({ x1, y1, m, layout }));
  return draft({
    line,
    equation: itemType === GRAPH ? written : null,
    answer: itemType === NAME ? written : null,
    spec: Object.freeze({ form: LINE_FORM.POINT_SLOPE, line, point, layout }),
    anchors: [point],
    marked: itemType === NAME ? point : null,
  });
};

const specialDraft = ({ axis, value, scale = 1, itemType = GRAPH }) => {
  const line = axis === 'y' ? horizontalLine(value) : verticalLine(value);
  const written = scale === 1
    ? presentEquation(specialTokens({ axis, value }))
    : presentEquation(standardTokens(axis === 'y' ? { A: 0, B: scale, C: scale * value } : { A: scale, B: 0, C: scale * value }));
  return draft({
    line,
    equation: itemType === GRAPH ? written : null,
    answer: itemType === NAME ? presentEquation(specialTokens({ axis, value })) : null,
    spec: Object.freeze({ form: SPECIAL_FORM, line }),
    anchors: [],
  });
};

// 9x + 7y = 63 is arithmetic, not graphing: standard forms built from two
// intercepts keep their constant this small.
const MAX_STANDARD_CONSTANT = 40;

// Standard form through two whole-number intercepts: yi·x + xi·y = xi·yi, reduced, A > 0.
const fromIntercepts = (xi, yi) => {
  const divisor = gcd(gcd(yi, xi), xi * yi) || 1;
  const sign = yi < 0 ? -1 : 1;
  return { A: (sign * yi) / divisor, B: (sign * xi) / divisor, C: (sign * xi * yi) / divisor };
};

// A grid point inside the view, both coordinates non-zero.
const offAxisPoint = (rng, limit) => ({ x: rng.pick(nonZero(limit)), y: rng.pick(nonZero(limit)) });

/*
 * VARIANTS. Each builds a draft from the slot's tier; weights say how often a
 * tier draws it. A builder may return null (its numbers did not work out) —
 * the generator simply draws again.
 */
const variant = (id, weights, build) => Object.freeze({ id, weights: Object.freeze(weights), build });

const GRAPH_VARIANTS = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: Object.freeze([
    variant('wholeSlope', { [EASY]: 3, [STANDARD]: 2, [CHALLENGE]: 1 }, (rng, tier) => slopeInterceptDraft({
      m: signedPick(rng, WHOLE_SLOPES[tier]),
      b: rng.pick(nonZero(innerLimit(tier))),
    })),
    variant('unitSlope', { [EASY]: 1, [STANDARD]: 1 }, (rng, tier) => slopeInterceptDraft({
      m: rng.pick([1, -1]),
      b: rng.pick(nonZero(innerLimit(tier))),
    })),
    variant('throughOrigin', { [EASY]: 1, [STANDARD]: 1 }, (rng, tier) => slopeInterceptDraft({
      m: signedPick(rng, ORIGIN_SLOPES[tier]),
      b: 0,
    })),
    variant('fractionSlope', { [STANDARD]: 3, [CHALLENGE]: 2 }, (rng, tier) => slopeInterceptDraft({
      m: signedPick(rng, FRACTION_SLOPES[tier]),
      b: rng.pick(nonZero(innerLimit(tier) - 1)),
    })),
    variant('constantFirst', { [CHALLENGE]: 1 }, (rng, tier) => slopeInterceptDraft({
      m: signedPick(rng, MIXED_SLOPES),
      b: rng.pick(nonZero(innerLimit(tier))),
      order: SLOPE_INTERCEPT_ORDER.CONSTANT_FIRST,
    })),
    variant('decimalSlope', { [CHALLENGE]: 1 }, (rng, tier) => slopeInterceptDraft({
      m: signedPick(rng, DECIMAL_SLOPES),
      b: rng.pick(nonZero(innerLimit(tier) - 1)),
      style: NUMBER_STYLE.DECIMAL,
    })),
    variant('fractionIntercept', { [CHALLENGE]: 1 }, (rng, tier) => {
      // Through a grid point whose x is not a multiple of the run, so the
      // y-intercept falls between grid lines: y = ½x + 3/2.
      const m = signedPick(rng, fractionSlopes([2, 3], 4, 2));
      const x0 = rng.pick(nonZero(innerLimit(tier) - 1));
      if (x0 % m.d === 0) return null;
      const y0 = rng.pick(range(-(innerLimit(tier) - 1), innerLimit(tier) - 1));
      const b = Q.sub(y0, Q.mul(m, x0));
      return b.d === 1 ? null : slopeInterceptDraft({ m, b });
    }),
  ]),
  [LINE_FORM.STANDARD]: Object.freeze([
    variant('unitCoefficients', { [EASY]: 1, [STANDARD]: 1 }, (rng, tier) => standardDraft({
      A: 1,
      B: rng.pick([1, -1]),
      C: rng.pick(nonZero(innerLimit(tier))),
    })),
    variant('wholeIntercepts', { [EASY]: 3, [STANDARD]: 3, [CHALLENGE]: 2 }, (rng, tier) => {
      const limit = innerLimit(tier);
      const xi = tier === EASY ? rng.int(1, limit) : rng.pick(nonZero(limit));
      const yi = tier === EASY ? rng.int(1, limit) : rng.pick(nonZero(limit));
      const coefficients = fromIntercepts(xi, yi);
      return Math.abs(coefficients.C) > MAX_STANDARD_CONSTANT ? null : standardDraft(coefficients);
    }),
    variant('scaledCoefficients', { [STANDARD]: 1, [CHALLENGE]: 1 }, (rng, tier) => {
      const limit = innerLimit(tier);
      const { A, B, C } = fromIntercepts(rng.pick(nonZero(limit)), rng.pick(nonZero(limit)));
      const factor = rng.pick(tier === CHALLENGE ? [2, 3, 4] : [2, 3]);
      return Math.max(Math.abs(A), Math.abs(B)) * factor > 12 ? null : standardDraft({ A: A * factor, B: B * factor, C: C * factor });
    }),
    variant('throughOrigin', { [CHALLENGE]: 1 }, (rng) => {
      const A = rng.int(1, 5);
      const B = rng.pick(nonZero(5));
      return gcd(A, B) !== 1 || A === Math.abs(B) ? null : standardDraft({ A, B, C: 0 });
    }),
    variant('fractionIntercept', { [CHALLENGE]: 1 }, (rng, tier) => {
      const A = rng.int(2, 5);
      const B = rng.pick([-5, -4, -3, -2, 2, 3, 4, 5]);
      if (gcd(A, B) !== 1) return null;
      const point = offAxisPoint(rng, innerLimit(tier) - 1);
      const C = A * point.x + B * point.y;
      return C === 0 || (C % A === 0 && C % B === 0) ? null : standardDraft({ A, B, C });
    }),
  ]),
  [LINE_FORM.POINT_SLOPE]: Object.freeze([
    variant('positivePoint', { [EASY]: 3 }, (rng, tier) => pointSlopeDraft({
      x1: rng.int(1, innerLimit(tier) - 1),
      y1: rng.int(1, innerLimit(tier) - 1),
      m: signedPick(rng, WHOLE_SLOPES[EASY]),
    })),
    variant('signedPoint', { [STANDARD]: 3, [CHALLENGE]: 2 }, (rng, tier) => {
      const point = offAxisPoint(rng, innerLimit(tier) - 1);
      // At least one coordinate negative: that is where the signs flip.
      if (point.x > 0 && point.y > 0) point[rng.chance(0.5) ? 'x' : 'y'] *= -1;
      return pointSlopeDraft({ x1: point.x, y1: point.y, m: signedPick(rng, WHOLE_SLOPES[tier]) });
    }),
    variant('fractionSlope', { [STANDARD]: 2, [CHALLENGE]: 2 }, (rng, tier) => {
      const point = offAxisPoint(rng, innerLimit(tier) - 1);
      return pointSlopeDraft({ x1: point.x, y1: point.y, m: signedPick(rng, FRACTION_SLOPES[tier]) });
    }),
    variant('negativeOne', { [CHALLENGE]: 1 }, (rng, tier) => {
      const point = offAxisPoint(rng, innerLimit(tier) - 1);
      return pointSlopeDraft({ x1: point.x, y1: point.y, m: -1 });
    }),
    variant('pointOnXAxis', { [CHALLENGE]: 1 }, (rng, tier) => pointSlopeDraft({
      x1: rng.pick(nonZero(innerLimit(tier) - 1)),
      y1: 0,
      m: signedPick(rng, [2, 3, Q.rat(1, 2), Q.rat(2, 3), Q.rat(3, 2)]),
    })),
    variant('solvedForY', { [CHALLENGE]: 1 }, (rng, tier) => {
      const point = offAxisPoint(rng, innerLimit(tier) - 1);
      return pointSlopeDraft({
        x1: point.x,
        y1: point.y,
        m: signedPick(rng, [2, 3, Q.rat(1, 2), Q.rat(3, 2)]),
        layout: POINT_SLOPE_LAYOUT.SOLVED_FOR_Y,
      });
    }),
  ]),
  [SPECIAL_FORM]: Object.freeze([
    variant('horizontal', { [EASY]: 1, [STANDARD]: 1, [CHALLENGE]: 1 }, (rng, tier) => specialDraft({ axis: 'y', value: rng.pick(nonZero(innerLimit(tier))) })),
    variant('vertical', { [EASY]: 1, [STANDARD]: 1, [CHALLENGE]: 1 }, (rng, tier) => specialDraft({ axis: 'x', value: rng.pick(nonZero(innerLimit(tier))) })),
    variant('scaledHorizontal', { [CHALLENGE]: 1 }, (rng, tier) => specialDraft({ axis: 'y', value: rng.pick(nonZero(innerLimit(tier))), scale: rng.pick([2, 3]) })),
    variant('scaledVertical', { [CHALLENGE]: 1 }, (rng, tier) => specialDraft({ axis: 'x', value: rng.pick(nonZero(innerLimit(tier))), scale: rng.pick([2, 3]) })),
  ]),
});

/*
 * NAME IT. The equation is the answer, so how it would be WRITTEN does not
 * vary; what varies is the line a student reads. Every answer is written the
 * conventional way in the asked-for form: y = mx + b, Ax + By = C reduced
 * with A > 0, y − y₁ = m(x − x₁) around the marked point.
 */
const nameStandard = (A, B, C) => {
  const line = lineFromCoefficients(A, B, C);
  return standardDraft({ A: line.a, B: line.b, C: line.c, itemType: NAME });
};

const NAME_VARIANTS = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: Object.freeze([
    variant('wholeSlope', { [EASY]: 3, [STANDARD]: 2, [CHALLENGE]: 1 }, (rng, tier) => slopeInterceptDraft({
      m: signedPick(rng, WHOLE_SLOPES[tier]),
      b: rng.pick(nonZero(innerLimit(tier) - 1)),
      itemType: NAME,
    })),
    variant('unitSlope', { [EASY]: 1, [STANDARD]: 1 }, (rng, tier) => slopeInterceptDraft({
      m: rng.pick([1, -1]),
      b: rng.pick(nonZero(innerLimit(tier) - 1)),
      itemType: NAME,
    })),
    variant('throughOrigin', { [EASY]: 1 }, (rng) => slopeInterceptDraft({ m: signedPick(rng, ORIGIN_SLOPES[EASY]), b: 0, itemType: NAME })),
    variant('fractionSlope', { [STANDARD]: 3, [CHALLENGE]: 3 }, (rng, tier) => slopeInterceptDraft({
      m: signedPick(rng, FRACTION_SLOPES[tier]),
      b: rng.pick(nonZero(innerLimit(tier) - 1)),
      itemType: NAME,
    })),
  ]),
  [LINE_FORM.STANDARD]: Object.freeze([
    variant('unitCoefficients', { [EASY]: 1, [STANDARD]: 1 }, (rng, tier) => nameStandard(1, rng.pick([1, -1]), rng.pick(nonZero(innerLimit(tier))))),
    variant('wholeIntercepts', { [EASY]: 3, [STANDARD]: 3, [CHALLENGE]: 3 }, (rng, tier) => {
      const limit = innerLimit(tier);
      const xi = tier === EASY ? rng.int(1, limit) : rng.pick(nonZero(limit));
      const yi = tier === EASY ? rng.int(1, limit) : rng.pick(nonZero(limit));
      const { A, B, C } = fromIntercepts(xi, yi);
      return Math.abs(C) > MAX_STANDARD_CONSTANT ? null : nameStandard(A, B, C);
    }),
    variant('throughOrigin', { [CHALLENGE]: 1 }, (rng) => {
      const A = rng.int(1, 4);
      const B = rng.pick(nonZero(4));
      return gcd(A, B) !== 1 || A === Math.abs(B) ? null : nameStandard(A, B, 0);
    }),
  ]),
  [LINE_FORM.POINT_SLOPE]: Object.freeze([
    variant('wholeSlope', { [EASY]: 3, [STANDARD]: 2, [CHALLENGE]: 1 }, (rng, tier) => {
      const point = offAxisPoint(rng, innerLimit(tier) - 1);
      return pointSlopeDraft({ x1: point.x, y1: point.y, m: signedPick(rng, WHOLE_SLOPES[tier]), itemType: NAME });
    }),
    variant('fractionSlope', { [STANDARD]: 2, [CHALLENGE]: 3 }, (rng, tier) => {
      const point = offAxisPoint(rng, innerLimit(tier) - 1);
      return pointSlopeDraft({ x1: point.x, y1: point.y, m: signedPick(rng, FRACTION_SLOPES[tier]), itemType: NAME });
    }),
  ]),
  [SPECIAL_FORM]: Object.freeze([
    variant('horizontal', { [EASY]: 1, [STANDARD]: 1, [CHALLENGE]: 1 }, (rng, tier) => specialDraft({ axis: 'y', value: rng.pick(nonZero(innerLimit(tier))), itemType: NAME })),
    variant('vertical', { [EASY]: 1, [STANDARD]: 1, [CHALLENGE]: 1 }, (rng, tier) => specialDraft({ axis: 'x', value: rng.pick(nonZero(innerLimit(tier))), itemType: NAME })),
  ]),
});

const VARIANTS = Object.freeze({ [GRAPH]: GRAPH_VARIANTS, [NAME]: NAME_VARIANTS });

export const LINE_SLOT_FORMS = Object.freeze([...LINE_FORM_IDS, SPECIAL_FORM]);

/** The variants an (item type, form) can draw at a tier. */
export const lineVariantsFor = (itemType, form, tier) => (VARIANTS[itemType]?.[form] || [])
  .filter((entry) => (entry.weights[tier] || 0) > 0);

/** Every slot the generator can be asked for: (item type, form, variant, tier). */
export const listLineSlots = () => Object.keys(VARIANTS).flatMap((itemType) => LINE_SLOT_FORMS.flatMap((form) => [EASY, STANDARD, CHALLENGE]
  .flatMap((tier) => lineVariantsFor(itemType, form, tier).map((entry) => Object.freeze({ itemType, form, variant: entry.id, tier })))));

/* ------------------------------- validation ------------------------------ */

const isAxis = (line) => line.c === 0 && (isHorizontal(line) || isVertical(line));

/** What keeps a draft from being issued; empty when it is fit to issue. */
export const lineDraftProblems = (candidate, { itemType, tier }) => {
  const view = lineViewForTier(tier);
  const problems = [];
  if (isAxis(candidate.line)) problems.push('axis');
  const inside = latticePointsInView(candidate.line, view, { inset: KEY_POINT_INSET });
  if (inside.length < (itemType === NAME ? 3 : 2)) problems.push('gridPoints');
  candidate.anchors.forEach((anchor) => {
    if (!pointInView(anchor, view, { inset: KEY_POINT_INSET })) problems.push('keyPointOutside');
  });
  if (itemType === NAME) {
    const { form } = candidate.spec;
    if (form === LINE_FORM.SLOPE_INTERCEPT && candidate.anchors.length !== 1) problems.push('yInterceptOffGrid');
    if (form === LINE_FORM.STANDARD && candidate.line.c !== 0 && candidate.anchors.length !== 2) problems.push('interceptOffGrid');
    if (form === LINE_FORM.POINT_SLOPE && !(candidate.marked && isLatticePoint(candidate.marked) && pointInView(candidate.marked, view, { inset: KEY_POINT_INSET }))) {
      problems.push('markedPointOutside');
    }
  }
  return problems;
};

/* -------------------------------- choices -------------------------------- */

const CHOICE_IDS = Object.freeze(['a', 'b', 'c', 'd']);

/** An option's equation, written in the asked-for form; null when the line has none. */
const optionEquation = (form, line, point = null) => {
  if (form === SPECIAL_FORM) {
    if (isHorizontal(line)) return presentEquation(specialTokens({ axis: 'y', value: yInterceptOf(line) }));
    if (isVertical(line)) return presentEquation(specialTokens({ axis: 'x', value: xInterceptOf(line) }));
    return null;
  }
  if (form === LINE_FORM.STANDARD) return presentEquation(standardTokens({ A: line.a, B: line.b, C: line.c }));
  if (isVertical(line)) return null;
  if (form === LINE_FORM.SLOPE_INTERCEPT) return presentEquation(slopeInterceptTokens({ m: slopeOf(line), b: yInterceptOf(line) }));
  if (!point) return null;
  return presentEquation(pointSlopeTokens({ x1: point.x, y1: point.y, m: slopeOf(line) }));
};

/*
 * Plain neighbours of the answer, for when the modelled mistakes give fewer
 * than three distinct options (a horizontal line has only two mistakes).
 */
const neighbourLines = (candidate) => {
  const { line, spec } = candidate;
  if (spec.form === SPECIAL_FORM) {
    const value = isHorizontal(line) ? yInterceptOf(line) : xInterceptOf(line);
    const same = isHorizontal(line) ? horizontalLine : verticalLine;
    const other = isHorizontal(line) ? verticalLine : horizontalLine;
    return [
      { line: other(Q.neg(value)) },
      { line: same(Q.add(value, 1)) },
      { line: same(Q.sub(value, 1)) },
    ];
  }
  if (spec.form === LINE_FORM.STANDARD) {
    return [
      { line: lineFromCoefficients(line.a, line.b, line.c + 1) },
      { line: lineFromCoefficients(line.a, line.b, line.c - 1) },
      { line: lineFromCoefficients(line.a + 1, line.b, line.c) },
      { line: lineFromCoefficients(line.a, line.b + 1, line.c) },
    ];
  }
  const m = slopeOf(line);
  if (spec.form === LINE_FORM.POINT_SLOPE) {
    const point = candidate.marked;
    return [
      { line: lineFromPointSlope(point, Q.add(m, 1)), point },
      { line: lineFromPointSlope(point, Q.sub(m, 1)), point },
      { line: lineFromPointSlope({ x: point.x + 1, y: point.y }, m), point: { x: point.x + 1, y: point.y } },
    ];
  }
  const b = yInterceptOf(line);
  return [
    { line: lineFromSlopeIntercept(Q.add(m, 1), b) },
    { line: lineFromSlopeIntercept(m, Q.add(b, 1)) },
    { line: lineFromSlopeIntercept(Q.sub(m, 1), b) },
    { line: lineFromSlopeIntercept(m, Q.sub(b, 1)) },
  ];
};

/**
 * Four options — the answer and three mistakes students make with this line
 * (padded with near neighbours only when fewer than three mistakes are
 * distinct) — in the room's own shuffled order.
 */
const buildChoices = (candidate, rng) => {
  const { form } = candidate.spec;
  const seen = [candidate.line];
  const take = (entries) => entries.flatMap((entry) => {
    if (seen.some((line) => sameLine(line, entry.line))) return [];
    const equation = optionEquation(form, entry.line, entry.point || (form === LINE_FORM.POINT_SLOPE ? candidate.marked : null));
    if (!equation) return [];
    seen.push(entry.line);
    return [{ line: entry.line, equation }];
  });
  const mistakes = take(rng.shuffle(mistakeLinesFor({ spec: candidate.spec, itemType: NAME })));
  const wrong = [...mistakes, ...take(neighbourLines(candidate))].slice(0, 3);
  const options = rng.shuffle([{ line: candidate.line, equation: candidate.answer, correct: true }, ...wrong]);
  const choices = options.map((option, index) => Object.freeze({ id: CHOICE_IDS[index], equation: option.equation, line: option.line }));
  return { choices: Object.freeze(choices), answerChoice: choices[options.findIndex((option) => option.correct)].id };
};

/* --------------------------------- items --------------------------------- */

const METHOD_INSTRUCTIONS = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: 'Use the y-intercept and the slope.',
  [LINE_FORM.STANDARD]: 'Use the x- and y-intercepts.',
  [LINE_FORM.POINT_SLOPE]: 'Start at the point in the equation, then use the slope.',
});

const BUILD_TITLES = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: 'Write the line in slope-intercept form.',
  [LINE_FORM.STANDARD]: 'Write the line in standard form.',
  [LINE_FORM.POINT_SLOPE]: 'Write the line in point-slope form.',
});

const BUILD_INSTRUCTIONS = Object.freeze({
  [LINE_FORM.SLOPE_INTERCEPT]: null,
  [LINE_FORM.STANDARD]: 'Use whole numbers for A, B and C.',
  [LINE_FORM.POINT_SLOPE]: 'Use the marked point.',
});

const wordingFor = ({ itemType, form, answerStyle, config, anchors }) => {
  if (itemType === GRAPH) {
    const method = config.showMethod && anchors.length ? METHOD_INSTRUCTIONS[form] || null : null;
    return { title: 'Graph the line.', instructions: method };
  }
  if (answerStyle === LINE_ANSWER_STYLE.BUILD) return { title: BUILD_TITLES[form], instructions: BUILD_INSTRUCTIONS[form] };
  return {
    title: 'Which equation matches the line?',
    instructions: form === LINE_FORM.POINT_SLOPE ? 'It is written around the marked point.' : null,
  };
};

// The two grid points a revealed answer highlights: the method's key points
// first, then a slope step from the first, then any grid point in view.
const revealPoints = (candidate, view) => {
  const points = [...candidate.anchors];
  const slope = slopeOf(candidate.line);
  if (points.length && slope && isLatticePoint(points[0])) {
    const [start] = points;
    [[slope.d, slope.n], [-slope.d, -slope.n]].forEach(([dx, dy]) => points.push({ x: Q.toNumber(start.x) + dx, y: Q.toNumber(start.y) + dy }));
  }
  points.push(...latticePointsInView(candidate.line, view, { inset: KEY_POINT_INSET }));
  const out = [];
  points.forEach((point) => {
    if (out.length >= 2 || !isLatticePoint(point) || !pointInView(point, view)) return;
    const plain = Object.freeze({ x: Q.toNumber(point.x), y: Q.toNumber(point.y) });
    if (!out.some((kept) => kept.x === plain.x && kept.y === plain.y)) out.push(plain);
  });
  return Object.freeze(out);
};

const plainPoint = (point) => (point ? Object.freeze({ x: Q.toNumber(point.x), y: Q.toNumber(point.y) }) : null);

const finalizeItem = ({ candidate, slot, rng, config, questionIndex, attempts, fallback }) => {
  const { itemType, form, variant: variantId, tier } = slot;
  const view = lineViewForTier(tier);
  let answerStyle = LINE_ANSWER_STYLE.GRAPH;
  if (itemType === NAME) {
    // A horizontal or vertical line is always chosen: x = h and y = k have no
    // boxes to fill, and the four options test exactly the confusion.
    answerStyle = form !== SPECIAL_FORM && config.nameStyle === LINE_NAME_STYLE.BUILD ? LINE_ANSWER_STYLE.BUILD : LINE_ANSWER_STYLE.CHOICE;
  }
  const anchors = Object.freeze(candidate.anchors.map(plainPoint));
  const choice = answerStyle === LINE_ANSWER_STYLE.CHOICE ? buildChoices(candidate, rng) : null;
  return Object.freeze({
    generatorVersion: LINE_GRAPH_GENERATOR_VERSION,
    questionIndex,
    itemType,
    form,
    variant: variantId,
    tier,
    ...wordingFor({ itemType, form, answerStyle, config, anchors }),
    equation: candidate.equation,
    answer: candidate.answer,
    view,
    line: candidate.line,
    spec: candidate.spec,
    anchors,
    marked: plainPoint(candidate.marked),
    answerStyle,
    choices: choice ? choice.choices : null,
    answerChoice: choice ? choice.answerChoice : null,
    build: answerStyle === LINE_ANSWER_STYLE.BUILD ? Object.freeze({ form, fields: BUILD_FIELDS[form] }) : null,
    reveal: Object.freeze({ points: revealPoints(candidate, view) }),
    targetCount: 1,
    buildAttempts: attempts,
    fallback,
  });
};

/*
 * KNOWN-GOOD ITEMS, issued (and marked `fallback`) only if a slot's draws all
 * fail validation. Each fits the smallest grid. Tests hold every slot to
 * never needing one.
 */
const FALLBACKS = Object.freeze({
  [GRAPH]: Object.freeze({
    [LINE_FORM.SLOPE_INTERCEPT]: () => slopeInterceptDraft({ m: 2, b: -3 }),
    [LINE_FORM.STANDARD]: () => standardDraft({ A: 2, B: 3, C: 6 }),
    [LINE_FORM.POINT_SLOPE]: () => pointSlopeDraft({ x1: 2, y1: 1, m: 2 }),
    [SPECIAL_FORM]: (slot) => specialDraft({ axis: slot.variant.toLowerCase().includes('vertical') ? 'x' : 'y', value: 3 }),
  }),
  [NAME]: Object.freeze({
    [LINE_FORM.SLOPE_INTERCEPT]: () => slopeInterceptDraft({ m: 2, b: -3, itemType: NAME }),
    [LINE_FORM.STANDARD]: () => nameStandard(2, 3, 6),
    [LINE_FORM.POINT_SLOPE]: () => pointSlopeDraft({ x1: 2, y1: 1, m: 2, itemType: NAME }),
    [SPECIAL_FORM]: (slot) => specialDraft({ axis: slot.variant.toLowerCase().includes('vertical') ? 'x' : 'y', value: 3, itemType: NAME }),
  }),
});

/**
 * One item for a slot, from its seed text. `avoidLines` are lines this item
 * must not repeat (its neighbours'). Deterministic.
 */
export const generateLineQuestionForSlot = ({ slot, seedText, questionIndex = 0, config = {}, avoidLines = [] }) => {
  const entry = (VARIANTS[slot.itemType]?.[slot.form] || []).find((candidate) => candidate.id === slot.variant);
  if (!entry) throw new RangeError(`No line variant ${slot.itemType}/${slot.form}/${slot.variant}.`);
  const rng = createRng(`${seedText}|v${LINE_GRAPH_GENERATOR_VERSION}`);
  for (let attempt = 1; attempt <= MAX_LINE_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = entry.build(rng, slot.tier);
    if (!candidate) continue;
    if (avoidLines.some((line) => sameLine(line, candidate.line))) continue;
    if (lineDraftProblems(candidate, slot).length) continue;
    return finalizeItem({ candidate, slot, rng, config, questionIndex, attempts: attempt, fallback: false });
  }
  const candidate = FALLBACKS[slot.itemType][slot.form](slot);
  return finalizeItem({ candidate, slot, rng, config, questionIndex, attempts: MAX_LINE_GENERATION_ATTEMPTS, fallback: true });
};

/* -------------------------------- schedule ------------------------------- */

/** Which tier each position of a block draws from (Mixed ramps, like the rush). */
export const lineBlockTiers = (difficulty, blockIndex) => {
  if (difficulty !== LINE_DIFFICULTY.MIXED) return Array(LINE_SCHEDULE_BLOCK_SIZE).fill(difficulty);
  if (blockIndex === 0) return [EASY, EASY, STANDARD, EASY, STANDARD, STANDARD];
  if (blockIndex === 1) return [STANDARD, STANDARD, CHALLENGE, STANDARD, STANDARD, CHALLENGE];
  return [STANDARD, CHALLENGE, STANDARD, CHALLENGE, CHALLENGE, STANDARD];
};

/*
 * The six slots every student shares in one block. With both item types on,
 * exactly two of six are Name it; with horizontal and vertical lines on,
 * exactly one is one; the enabled forms are dealt evenly over the rest
 * (which form gets a block's spare slot rotates with the seed); no variant
 * repeats inside a block when the catalog allows it.
 */
export const lineBlockTemplate = ({ seed, scope, blockIndex, config }) => {
  const rng = createRng(`${seed}|lines|template|${scope}|b${blockIndex}|v${LINE_GRAPH_GENERATOR_VERSION}`);
  const tiers = lineBlockTiers(config.difficulty, blockIndex);
  const positions = range(0, LINE_SCHEDULE_BLOCK_SIZE - 1);
  const itemTypes = config.itemTypes.length > 1
    ? rng.shuffle([GRAPH, GRAPH, GRAPH, GRAPH, NAME, NAME])
    : Array(LINE_SCHEDULE_BLOCK_SIZE).fill(config.itemTypes[0]);
  const specialPosition = config.specialLines ? rng.int(0, LINE_SCHEDULE_BLOCK_SIZE - 1) : -1;
  const formOffset = rng.int(0, config.forms.length - 1);
  const forms = [];
  rng.shuffle(positions.filter((position) => position !== specialPosition)).forEach((position, index) => {
    forms[position] = config.forms[(index + formOffset) % config.forms.length];
  });
  const used = new Set();
  return Object.freeze(positions.map((position) => {
    const tier = tiers[position];
    const itemType = itemTypes[position];
    const form = position === specialPosition ? SPECIAL_FORM : forms[position];
    const catalog = lineVariantsFor(itemType, form, tier);
    const fresh = catalog.filter((entry) => !used.has(`${itemType}|${form}|${entry.id}`));
    const chosen = rng.weighted(fresh.length ? fresh : catalog, (entry) => entry.weights[tier]);
    used.add(`${itemType}|${form}|${chosen.id}`);
    return Object.freeze({ itemType, form, variant: chosen.id, tier });
  }));
};

const isClassic = (config) => config.format === LINE_GRAPH_FORMAT.CLASSIC;

// A Classic game schedules across rounds; Sprint and Rush within each round.
const scheduleScope = (config, roundIndex) => (isClassic(config) ? 'classic' : `r${roundIndex}`);
const schedulePosition = (config, roundIndex, questionIndex) => (isClassic(config) ? roundIndex : questionIndex);
const orderKeyFor = (config, studentKey) => (config.sameEquations ? '*' : String(studentKey));

const slotAtPosition = ({ seed, orderKey, scope, position, config }) => {
  if (position < 0) return null;
  const blockIndex = Math.floor(position / LINE_SCHEDULE_BLOCK_SIZE);
  const template = lineBlockTemplate({ seed, scope, blockIndex, config });
  const order = createRng(`${seed}|lines|order|${orderKey}|${scope}|b${blockIndex}`).shuffle(range(0, LINE_SCHEDULE_BLOCK_SIZE - 1));
  return template[order[position % LINE_SCHEDULE_BLOCK_SIZE]] || null;
};

/** The slot of a student's item k in a round (in a Classic game, the round's one item). */
export const scheduledLineSlot = ({ seed, studentKey, roundIndex, questionIndex, config }) => slotAtPosition({
  seed,
  orderKey: orderKeyFor(config, studentKey),
  scope: scheduleScope(config, roundIndex),
  position: schedulePosition(config, roundIndex, questionIndex),
  config,
});

/**
 * A student's item k in a round.
 *
 * Two items in a row are never the same line asked the same way — on a small
 * Easy catalog a repeat would look like the check had not registered. Even
 * positions draw freely; an odd one passes over the line of either neighbour
 * with its item type and form, so every adjacent pair has one free member and
 * grading never regenerates more than three items (the rush's rule).
 */
export const generateLineQuestion = ({ seed, studentKey, roundIndex, questionIndex, config }) => {
  const orderKey = orderKeyFor(config, studentKey);
  const scope = scheduleScope(config, roundIndex);
  const position = schedulePosition(config, roundIndex, questionIndex);
  const slotAt = (at) => slotAtPosition({ seed, orderKey, scope, position: at, config });
  const seedTextAt = (at) => `${seed}|lines|q|${orderKey}|${scope}|p${at}`;
  const slot = slotAt(position);
  if (!slot) return null;
  const avoidLines = position % 2 === 1
    ? [position - 1, position + 1]
      .map((at) => ({ at, neighbour: slotAt(at) }))
      .filter(({ neighbour }) => neighbour && neighbour.itemType === slot.itemType && neighbour.form === slot.form)
      .map(({ at, neighbour }) => generateLineQuestionForSlot({ slot: neighbour, seedText: seedTextAt(at), questionIndex: at, config }).line)
    : [];
  return generateLineQuestionForSlot({ slot, seedText: seedTextAt(position), questionIndex, config, avoidLines });
};

/**
 * What a student's device receives. The line travels with the item: the
 * device checks a drawn line, a tapped option or a typed equation the instant
 * it is complete, and the equation (or the drawn graph) already shows the
 * line by design — withholding it would cost the game its speed and protect
 * nothing. Every attempt is still re-graded by the server against its own
 * regenerated copy.
 */
export const publicLineQuestion = (question) => (question ? Object.freeze({
  questionIndex: question.questionIndex,
  itemType: question.itemType,
  form: question.form,
  variant: question.variant,
  tier: question.tier,
  title: question.title,
  instructions: question.instructions,
  equation: question.equation,
  view: question.view,
  line: question.line,
  spec: question.spec,
  anchors: question.anchors,
  marked: question.marked,
  answerStyle: question.answerStyle,
  choices: question.choices,
  answerChoice: question.answerChoice,
  build: question.build,
  reveal: question.reveal,
  targetCount: question.targetCount,
}) : null);
