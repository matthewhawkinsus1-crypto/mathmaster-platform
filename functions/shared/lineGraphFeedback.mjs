/*
 * GRAPH THE LINE: WHAT A WRONG LINE SAYS.
 *
 * Auto-check answers within a frame, so the hint under a wrong line is the
 * teaching. It must be specific enough to act on ("check the sign of the
 * y-intercept") and it must never be WRONG — a student told to fix their
 * slope when the slope was right learns to distrust the game.
 *
 * So a hint is chosen the way the platform names a misconception
 * (misconceptionCodes.mjs): each form lists the lines that particular,
 * well-known mistakes produce from THIS equation — the slope's sign flipped,
 * rise and run swapped, the point-slope signs read literally, the intercepts
 * traded — and a student's line earns a specific hint only when it is
 * exactly one of those lines, for exactly one reason. When two mistakes
 * would draw the same line (with a slope of −1, "flipped the sign" and
 * "flipped the fraction" coincide), neither is claimed; the student gets the
 * structural hint instead — right slope, wrong place; right point, wrong
 * slope — which is true whatever they did. When nothing modelled fits, the
 * hint is the form's method in one line.
 *
 * Hints never give the answer: they name what to check. The equation a
 * student is graphing is on their screen, so a hint may quote it ("(x − 4)
 * means x = 4") — that is reading the prompt, not revealing the line.
 *
 * Graphing an equation and naming a graph go wrong in different ways (a
 * student who plots b on the x-axis, and one who reads the x-intercept as b,
 * draw different lines), and need different words, so each item type has its
 * own list of mistakes and its own sentences.
 *
 * Pure: Cloud Functions, the student device and tests.
 */

import * as Q from './graphFeatureRational.mjs';
import {
  containsPoint,
  horizontalLine,
  isHorizontal,
  isVertical,
  lineFromPointSlope,
  lineFromSlopeIntercept,
  lineKey,
  lineThroughPoints,
  parallelLines,
  sameLine,
  slopeOf,
  verticalLine,
  xInterceptOf,
  yInterceptOf,
} from './lineGraphMath.mjs';
import { LINE_FORM, MINUS, POINT_SLOPE_LAYOUT, SPECIAL_FORM } from './lineGraphForms.mjs';
import { LINE_ITEM_TYPE } from './lineGraphRules.mjs';

export const LINE_DIAGNOSIS = Object.freeze({
  CORRECT: 'correct',
  // Mistakes a specific line gives away.
  SLOPE_SIGN: 'slopeSign',
  SLOPE_RECIPROCAL: 'slopeReciprocal',
  INTERCEPT_SIGN: 'interceptSign',
  INTERCEPT_ON_X_AXIS: 'interceptOnXAxis',
  X_INTERCEPT_AS_B: 'xInterceptAsB',
  SLOPE_INTERCEPT_SWAPPED: 'slopeInterceptSwapped',
  POINT_SIGN: 'pointSign',
  POINT_SIGN_X: 'pointSignX',
  POINT_SIGN_Y: 'pointSignY',
  POINT_SWAPPED: 'pointSwapped',
  X_INTERCEPT_SIGN: 'xInterceptSign',
  Y_INTERCEPT_SIGN: 'yInterceptSign',
  INTERCEPT_SIGNS: 'interceptSigns',
  INTERCEPTS_SWAPPED: 'interceptsSwapped',
  HORIZONTAL_VERTICAL: 'horizontalVertical',
  SPECIAL_SIGN: 'specialSign',
  // True of the line whatever caused it.
  RIGHT_SLOPE: 'rightSlope',
  RIGHT_ANCHOR: 'rightAnchor',
  OFF_TRACK: 'offTrack',
});

/*
 * The platform's misconception codes a diagnosis corresponds to, where the
 * meaning is the same. Informational until the mode's classifier is declared
 * in misconceptionCodes.mjs: a code becomes evidence only from a declared
 * server classifier, never from this table.
 */
export const DIAGNOSIS_MISCONCEPTION = Object.freeze({
  [LINE_DIAGNOSIS.SLOPE_SIGN]: 'slope-sign-reversed',
  [LINE_DIAGNOSIS.SLOPE_RECIPROCAL]: 'slope-run-over-rise',
  [LINE_DIAGNOSIS.SLOPE_INTERCEPT_SWAPPED]: 'slope-intercept-swapped',
  [LINE_DIAGNOSIS.INTERCEPTS_SWAPPED]: 'intercepts-swapped',
  [LINE_DIAGNOSIS.POINT_SWAPPED]: 'ordered-pair-reversed',
});

/*
 * What a teacher's report calls each diagnosis. The structural ones say what
 * was true of the line, never why — the work did not tell.
 */
export const DIAGNOSIS_LABELS = Object.freeze({
  [LINE_DIAGNOSIS.SLOPE_SIGN]: 'Slope sign flipped',
  [LINE_DIAGNOSIS.SLOPE_RECIPROCAL]: 'Rise and run swapped',
  [LINE_DIAGNOSIS.INTERCEPT_SIGN]: 'y-intercept sign flipped',
  [LINE_DIAGNOSIS.INTERCEPT_ON_X_AXIS]: 'b plotted on the x-axis',
  [LINE_DIAGNOSIS.X_INTERCEPT_AS_B]: 'x-intercept read as b',
  [LINE_DIAGNOSIS.SLOPE_INTERCEPT_SWAPPED]: 'Slope and y-intercept swapped',
  [LINE_DIAGNOSIS.POINT_SIGN]: 'Point-slope: both signs flipped',
  [LINE_DIAGNOSIS.POINT_SIGN_X]: 'Point-slope: x sign flipped',
  [LINE_DIAGNOSIS.POINT_SIGN_Y]: 'Point-slope: y sign flipped',
  [LINE_DIAGNOSIS.POINT_SWAPPED]: 'Point coordinates swapped',
  [LINE_DIAGNOSIS.X_INTERCEPT_SIGN]: 'x-intercept sign flipped',
  [LINE_DIAGNOSIS.Y_INTERCEPT_SIGN]: 'y-intercept sign flipped (standard form)',
  [LINE_DIAGNOSIS.INTERCEPT_SIGNS]: 'Both intercept signs flipped',
  [LINE_DIAGNOSIS.INTERCEPTS_SWAPPED]: 'x- and y-intercepts swapped',
  [LINE_DIAGNOSIS.HORIZONTAL_VERTICAL]: 'Horizontal and vertical confused',
  [LINE_DIAGNOSIS.SPECIAL_SIGN]: 'Sign of x = h or y = k flipped',
  [LINE_DIAGNOSIS.RIGHT_SLOPE]: 'Right slope, wrong place',
  [LINE_DIAGNOSIS.RIGHT_ANCHOR]: 'Right point, wrong slope',
  [LINE_DIAGNOSIS.OFF_TRACK]: 'Other wrong lines',
});

const SPECIFIC = new Set([
  LINE_DIAGNOSIS.SLOPE_SIGN,
  LINE_DIAGNOSIS.SLOPE_RECIPROCAL,
  LINE_DIAGNOSIS.INTERCEPT_SIGN,
  LINE_DIAGNOSIS.INTERCEPT_ON_X_AXIS,
  LINE_DIAGNOSIS.X_INTERCEPT_AS_B,
  LINE_DIAGNOSIS.SLOPE_INTERCEPT_SWAPPED,
  LINE_DIAGNOSIS.POINT_SIGN,
  LINE_DIAGNOSIS.POINT_SIGN_X,
  LINE_DIAGNOSIS.POINT_SIGN_Y,
  LINE_DIAGNOSIS.POINT_SWAPPED,
  LINE_DIAGNOSIS.X_INTERCEPT_SIGN,
  LINE_DIAGNOSIS.Y_INTERCEPT_SIGN,
  LINE_DIAGNOSIS.INTERCEPT_SIGNS,
  LINE_DIAGNOSIS.INTERCEPTS_SWAPPED,
  LINE_DIAGNOSIS.HORIZONTAL_VERTICAL,
  LINE_DIAGNOSIS.SPECIAL_SIGN,
]);

export const isSpecificDiagnosis = (code) => SPECIFIC.has(code);

/*
 * WHAT AN EQUATION TOLD THE STUDENT — the facts mistakes are made from.
 *
 *   form        slopeIntercept | standard | pointSlope | special
 *   line        the canonical target line
 *   point       point-slope's point (x₁, y₁), else null
 *   layout      point-slope's layout (pointSlope | solvedForY), else null
 *
 * Slope and intercepts are read from the line itself.
 */
const factsOf = (spec = {}) => {
  const { line } = spec;
  return {
    form: spec.form,
    line,
    point: spec.point ? { x: Q.toRational(spec.point.x), y: Q.toRational(spec.point.y) } : null,
    layout: spec.layout || null,
    slope: slopeOf(line),
    yIntercept: yInterceptOf(line),
    xIntercept: xInterceptOf(line),
  };
};

const isZero = (value) => value !== null && value.n === 0;
const reciprocal = (value) => Q.div(1, value);

/*
 * The lines particular mistakes draw from these facts, each with the mistake
 * that draws it (and, for a point-slope mistake, the point the student would
 * have used). A builder that cannot make a line (a reciprocal of 0, a
 * point-slope sign flip of a zero coordinate) contributes nothing, and a
 * "mistake" that lands on the right line is no mistake at all.
 */
const mistakeLines = (facts, itemType) => {
  const out = [];
  const add = (code, build, point = null) => {
    let built = null;
    try {
      built = build();
    } catch {
      built = null;
    }
    if (built && !sameLine(built, facts.line)) out.push(Object.freeze({ code, line: built, point }));
  };
  const { form, line, slope: m, yIntercept: b, xIntercept: xi, point } = facts;

  if (form === SPECIAL_FORM) {
    if (isHorizontal(line) && !isZero(b)) {
      add(LINE_DIAGNOSIS.HORIZONTAL_VERTICAL, () => verticalLine(b));
      add(LINE_DIAGNOSIS.SPECIAL_SIGN, () => horizontalLine(Q.neg(b)));
    }
    if (isVertical(line) && !isZero(xi)) {
      add(LINE_DIAGNOSIS.HORIZONTAL_VERTICAL, () => horizontalLine(xi));
      add(LINE_DIAGNOSIS.SPECIAL_SIGN, () => verticalLine(Q.neg(xi)));
    }
    return out;
  }
  if (isVertical(line)) return out;

  if (form === LINE_FORM.SLOPE_INTERCEPT) {
    if (!isZero(m)) {
      add(LINE_DIAGNOSIS.SLOPE_SIGN, () => lineFromSlopeIntercept(Q.neg(m), b));
      add(LINE_DIAGNOSIS.SLOPE_RECIPROCAL, () => lineFromSlopeIntercept(reciprocal(m), b));
    }
    if (!isZero(b)) {
      add(LINE_DIAGNOSIS.INTERCEPT_SIGN, () => lineFromSlopeIntercept(m, Q.neg(b)));
      if (itemType === LINE_ITEM_TYPE.GRAPH) {
        // Plotted b on the x-axis: the right slope through (b, 0).
        add(LINE_DIAGNOSIS.INTERCEPT_ON_X_AXIS, () => lineFromPointSlope({ x: b, y: 0 }, m));
      }
    }
    if (itemType === LINE_ITEM_TYPE.NAME && xi !== null && !isZero(m)) {
      // Read where the line crosses the x-axis as b.
      add(LINE_DIAGNOSIS.X_INTERCEPT_AS_B, () => lineFromSlopeIntercept(m, xi));
    }
    add(LINE_DIAGNOSIS.SLOPE_INTERCEPT_SWAPPED, () => lineFromSlopeIntercept(b, m));
    return out;
  }

  if (form === LINE_FORM.POINT_SLOPE && point) {
    const { x: x1, y: y1 } = point;
    const at = (x, y) => Object.freeze({ x, y });
    const withPoint = (code, used, slope) => add(code, () => lineFromPointSlope(used, slope), used);
    if (!isZero(x1) && !isZero(y1)) withPoint(LINE_DIAGNOSIS.POINT_SIGN, at(Q.neg(x1), Q.neg(y1)), m);
    if (!isZero(x1)) withPoint(LINE_DIAGNOSIS.POINT_SIGN_X, at(Q.neg(x1), y1), m);
    if (!isZero(y1)) withPoint(LINE_DIAGNOSIS.POINT_SIGN_Y, at(x1, Q.neg(y1)), m);
    withPoint(LINE_DIAGNOSIS.POINT_SWAPPED, at(y1, x1), m);
    if (!isZero(m)) {
      withPoint(LINE_DIAGNOSIS.SLOPE_SIGN, at(x1, y1), Q.neg(m));
      withPoint(LINE_DIAGNOSIS.SLOPE_RECIPROCAL, at(x1, y1), reciprocal(m));
    }
    return out;
  }

  if (form === LINE_FORM.STANDARD) {
    if (xi !== null && b !== null && !isZero(xi) && !isZero(b)) {
      const through = (x, y) => () => lineThroughPoints({ x, y: 0 }, { x: 0, y });
      add(LINE_DIAGNOSIS.X_INTERCEPT_SIGN, through(Q.neg(xi), b));
      add(LINE_DIAGNOSIS.Y_INTERCEPT_SIGN, through(xi, Q.neg(b)));
      add(LINE_DIAGNOSIS.INTERCEPT_SIGNS, through(Q.neg(xi), Q.neg(b)));
      add(LINE_DIAGNOSIS.INTERCEPTS_SWAPPED, through(b, xi));
    } else if (isZero(b) && !isZero(m)) {
      // Through the origin: the intercepts are no help, so the slope is
      // found from the coefficients — and its sign or fraction can slip.
      add(LINE_DIAGNOSIS.SLOPE_SIGN, () => lineFromSlopeIntercept(Q.neg(m), 0));
      add(LINE_DIAGNOSIS.SLOPE_RECIPROCAL, () => lineFromSlopeIntercept(reciprocal(m), 0));
    }
  }
  return out;
};

/**
 * Every modelled mistake for an item, as { code, line, point }: what the
 * generator builds "choose the equation" options from, so a wrong option is
 * always a mistake a student actually makes.
 */
export const mistakeLinesFor = ({ spec, itemType = LINE_ITEM_TYPE.GRAPH } = {}) => mistakeLines(factsOf(spec), itemType);

// The point a form's method starts from, when it has one.
const anchorsOf = (facts) => {
  if (facts.form === LINE_FORM.SLOPE_INTERCEPT && facts.yIntercept !== null) return [{ x: 0, y: facts.yIntercept }];
  if (facts.form === LINE_FORM.POINT_SLOPE && facts.point) return [facts.point];
  if (facts.form === LINE_FORM.STANDARD) {
    const out = [];
    if (facts.xIntercept !== null) out.push({ x: facts.xIntercept, y: 0 });
    if (facts.yIntercept !== null && !isZero(facts.yIntercept)) out.push({ x: 0, y: facts.yIntercept });
    return out;
  }
  return [];
};

/**
 * Why a student's line (or the line of the equation they chose or wrote) is
 * not the equation's line:
 *
 *   { code, specific, misconception, params }
 *
 * `specific` — the line is exactly one modelled mistake. `misconception` —
 * the platform code with the same meaning, when there is one (see
 * DIAGNOSIS_MISCONCEPTION). `params` carry what a sentence may quote.
 */
export const diagnoseLine = ({ spec, studentLine, itemType = LINE_ITEM_TYPE.GRAPH } = {}) => {
  const facts = factsOf(spec);
  if (sameLine(studentLine, facts.line)) {
    return Object.freeze({ code: LINE_DIAGNOSIS.CORRECT, specific: false, misconception: null, params: Object.freeze({}) });
  }
  const byLine = new Map();
  mistakeLines(facts, itemType).forEach(({ code, line }) => {
    const key = lineKey(line);
    byLine.set(key, [...(byLine.get(key) || []), code]);
  });
  const explanations = byLine.get(lineKey(studentLine)) || [];
  const params = Object.freeze({
    form: facts.form,
    itemType,
    layout: facts.layout,
    point: facts.point,
    slope: facts.slope,
    yIntercept: facts.yIntercept,
    xIntercept: facts.xIntercept,
    horizontal: isHorizontal(facts.line),
    vertical: isVertical(facts.line),
  });
  if (explanations.length === 1) {
    const [code] = explanations;
    return Object.freeze({ code, specific: true, misconception: DIAGNOSIS_MISCONCEPTION[code] || null, params });
  }
  // Ambiguous or unmodelled: say only what is true of the line itself.
  let code = LINE_DIAGNOSIS.OFF_TRACK;
  if (facts.form !== SPECIAL_FORM && parallelLines(studentLine, facts.line)) code = LINE_DIAGNOSIS.RIGHT_SLOPE;
  else if (anchorsOf(facts).some((anchor) => containsPoint(studentLine, anchor))) code = LINE_DIAGNOSIS.RIGHT_ANCHOR;
  return Object.freeze({ code, specific: false, misconception: null, params });
};

/* ------------------------------- sentences ------------------------------- */

const numberText = (value) => {
  const r = Q.toRational(value);
  const magnitude = r.d === 1 ? String(Math.abs(r.n)) : `${Math.abs(r.n)}/${r.d}`;
  return r.n < 0 ? `${MINUS}${magnitude}` : magnitude;
};

// How the equation wrote a point-slope coordinate: (x − 4), (y + 3).
const offsetText = (name, value) => {
  const r = Q.toRational(value);
  const magnitude = numberText(Q.abs(r));
  return `(${name} ${r.n < 0 ? '+' : MINUS} ${magnitude})`;
};

const GRAPH_SENTENCES = Object.freeze({
  [LINE_DIAGNOSIS.SLOPE_SIGN]: () => 'Your line slants the wrong way — check the sign of the slope.',
  [LINE_DIAGNOSIS.SLOPE_RECIPROCAL]: () => 'Slope is rise over run: go up or down first, then across.',
  [LINE_DIAGNOSIS.INTERCEPT_SIGN]: () => 'Right slope — check the sign of the y-intercept.',
  [LINE_DIAGNOSIS.INTERCEPT_ON_X_AXIS]: () => 'The y-intercept is on the y-axis, where x = 0.',
  [LINE_DIAGNOSIS.SLOPE_INTERCEPT_SWAPPED]: () => 'The number with x is the slope; the number on its own is the y-intercept.',
  [LINE_DIAGNOSIS.POINT_SIGN]: ({ point }) => `Check both signs: ${offsetText('x', point.x)} means x = ${numberText(point.x)}, and ${offsetText('y', point.y)} means y = ${numberText(point.y)}.`,
  [LINE_DIAGNOSIS.POINT_SIGN_X]: ({ point }) => `Check the sign: ${offsetText('x', point.x)} means x = ${numberText(point.x)}.`,
  [LINE_DIAGNOSIS.POINT_SIGN_Y]: ({ point, layout }) => (layout === POINT_SLOPE_LAYOUT.SOLVED_FOR_Y
    ? `Check the sign: the number added at the end is the point's y, ${numberText(point.y)}.`
    : `Check the sign: ${offsetText('y', point.y)} means y = ${numberText(point.y)}.`),
  [LINE_DIAGNOSIS.POINT_SWAPPED]: () => 'Check the point: the number with x is its x-coordinate, the number with y its y-coordinate.',
  [LINE_DIAGNOSIS.X_INTERCEPT_SIGN]: () => 'Check the sign of your x-intercept.',
  [LINE_DIAGNOSIS.Y_INTERCEPT_SIGN]: () => 'Check the sign of your y-intercept.',
  [LINE_DIAGNOSIS.INTERCEPT_SIGNS]: () => 'Check the signs of both intercepts.',
  [LINE_DIAGNOSIS.INTERCEPTS_SWAPPED]: () => 'The x-intercept is on the x-axis (y = 0); the y-intercept is on the y-axis (x = 0).',
  [LINE_DIAGNOSIS.HORIZONTAL_VERTICAL]: ({ horizontal, yIntercept, xIntercept }) => (horizontal
    ? `y = ${numberText(yIntercept)} is horizontal: every point on it has y = ${numberText(yIntercept)}.`
    : `x = ${numberText(xIntercept)} is vertical: every point on it has x = ${numberText(xIntercept)}.`),
  [LINE_DIAGNOSIS.SPECIAL_SIGN]: ({ horizontal, yIntercept, xIntercept }) => (horizontal
    ? `Check the sign: every point on this line has y = ${numberText(yIntercept)}.`
    : `Check the sign: every point on this line has x = ${numberText(xIntercept)}.`),
});

const NAME_SENTENCES = Object.freeze({
  [LINE_DIAGNOSIS.SLOPE_SIGN]: () => 'Check the sign of the slope: does the line rise or fall from left to right?',
  [LINE_DIAGNOSIS.SLOPE_RECIPROCAL]: () => 'Slope is rise over run — the change in y goes on top.',
  [LINE_DIAGNOSIS.INTERCEPT_SIGN]: () => 'Check the sign of the y-intercept: is it above or below the origin?',
  [LINE_DIAGNOSIS.X_INTERCEPT_AS_B]: () => 'b is where the line crosses the y-axis, not the x-axis.',
  [LINE_DIAGNOSIS.SLOPE_INTERCEPT_SWAPPED]: () => 'The slope goes with x; the y-intercept is the number on its own.',
  [LINE_DIAGNOSIS.POINT_SIGN]: () => 'Check the signs: for the point (h, k), write y − k and x − h.',
  [LINE_DIAGNOSIS.POINT_SIGN_X]: () => 'Check the sign with x: for the point (h, k), write x − h.',
  [LINE_DIAGNOSIS.POINT_SIGN_Y]: () => 'Check the sign with y: for the point (h, k), write y − k.',
  [LINE_DIAGNOSIS.POINT_SWAPPED]: () => 'Check the point: its x-coordinate goes with x, its y-coordinate with y.',
  [LINE_DIAGNOSIS.X_INTERCEPT_SIGN]: () => 'Test it: put y = 0 into the equation — does it give the x-intercept you see?',
  [LINE_DIAGNOSIS.Y_INTERCEPT_SIGN]: () => 'Test it: put x = 0 into the equation — does it give the y-intercept you see?',
  [LINE_DIAGNOSIS.INTERCEPT_SIGNS]: () => 'Check the signs: test both intercepts in the equation.',
  [LINE_DIAGNOSIS.INTERCEPTS_SWAPPED]: () => 'Check the intercepts: the x-intercept is where the line crosses the x-axis.',
  [LINE_DIAGNOSIS.HORIZONTAL_VERTICAL]: ({ horizontal }) => (horizontal
    ? 'This line is horizontal: every point on it has the same y.'
    : 'This line is vertical: every point on it has the same x.'),
  [LINE_DIAGNOSIS.SPECIAL_SIGN]: ({ horizontal }) => (horizontal
    ? 'Check the sign: is the line above or below the x-axis?'
    : 'Check the sign: is the line left or right of the y-axis?'),
});

const STRUCTURAL = Object.freeze({
  [LINE_ITEM_TYPE.GRAPH]: Object.freeze({
    [LINE_DIAGNOSIS.RIGHT_SLOPE]: {
      [LINE_FORM.SLOPE_INTERCEPT]: 'Right slope! Now check where your line crosses the y-axis.',
      [LINE_FORM.POINT_SLOPE]: 'Right slope! Now make sure your line goes through the point in the equation.',
      [LINE_FORM.STANDARD]: 'Right slant! Now check your intercepts.',
    },
    [LINE_DIAGNOSIS.RIGHT_ANCHOR]: {
      [LINE_FORM.SLOPE_INTERCEPT]: 'Right y-intercept! Now check the slope: rise over run.',
      [LINE_FORM.POINT_SLOPE]: 'Your line goes through the right point — now check the slope.',
      [LINE_FORM.STANDARD]: 'One intercept is right — check the other one.',
    },
    [LINE_DIAGNOSIS.OFF_TRACK]: {
      [LINE_FORM.SLOPE_INTERCEPT]: 'Start at the y-intercept, then use the slope to find a second point.',
      [LINE_FORM.POINT_SLOPE]: 'Start at the point in the equation, then use the slope.',
      [LINE_FORM.STANDARD]: 'Find the x-intercept (y = 0) and the y-intercept (x = 0), then connect them.',
    },
  }),
  [LINE_ITEM_TYPE.NAME]: Object.freeze({
    [LINE_DIAGNOSIS.RIGHT_SLOPE]: {
      [LINE_FORM.SLOPE_INTERCEPT]: 'Right slope — check the y-intercept.',
      [LINE_FORM.POINT_SLOPE]: 'Right slope — check the point.',
      [LINE_FORM.STANDARD]: 'Right slant — check the intercepts.',
    },
    [LINE_DIAGNOSIS.RIGHT_ANCHOR]: {
      [LINE_FORM.SLOPE_INTERCEPT]: 'Right y-intercept — check the slope.',
      [LINE_FORM.POINT_SLOPE]: 'Right point — check the slope.',
      [LINE_FORM.STANDARD]: 'One intercept is right — check the other.',
    },
    [LINE_DIAGNOSIS.OFF_TRACK]: {
      [LINE_FORM.SLOPE_INTERCEPT]: 'Find the y-intercept, then count rise over run between two grid points.',
      [LINE_FORM.POINT_SLOPE]: 'Pick a grid point on the line, then find the slope.',
      [LINE_FORM.STANDARD]: 'Find both intercepts, then write Ax + By = C.',
    },
  }),
});

const specialFallback = (params, itemType) => {
  if (itemType === LINE_ITEM_TYPE.NAME) {
    return params.horizontal ? 'This line is horizontal: what is the same about every point on it?' : 'This line is vertical: what is the same about every point on it?';
  }
  return params.horizontal
    ? `Every point on y = ${numberText(params.yIntercept)} has y = ${numberText(params.yIntercept)} — the line is horizontal.`
    : `Every point on x = ${numberText(params.xIntercept)} has x = ${numberText(params.xIntercept)} — the line is vertical.`;
};

/** The one sentence a student reads under a wrong answer. */
export const diagnosisMessage = (diagnosis = {}) => {
  const { code, params = {} } = diagnosis;
  const itemType = params.itemType === LINE_ITEM_TYPE.NAME ? LINE_ITEM_TYPE.NAME : LINE_ITEM_TYPE.GRAPH;
  if (code === LINE_DIAGNOSIS.CORRECT) return 'Correct!';
  const specific = (itemType === LINE_ITEM_TYPE.NAME ? NAME_SENTENCES : GRAPH_SENTENCES)[code];
  if (specific) return specific(params);
  if (params.form === SPECIAL_FORM) return specialFallback(params, itemType);
  if (params.form === LINE_FORM.STANDARD && code === LINE_DIAGNOSIS.OFF_TRACK && params.yIntercept && isZero(params.yIntercept)) {
    return itemType === LINE_ITEM_TYPE.NAME
      ? 'This line goes through the origin: find one more grid point on it.'
      : 'This line goes through the origin — choose an x and find a second point.';
  }
  const structural = STRUCTURAL[itemType][code] || STRUCTURAL[itemType][LINE_DIAGNOSIS.OFF_TRACK];
  return structural[params.form] || structural[LINE_FORM.SLOPE_INTERCEPT];
};

/*
 * "RIGHT LINE — NOW SHOW THE METHOD." In a game set to require the method,
 * a right line drawn through other points is neither credit nor a miss; this
 * is what the student reads.
 */
export const methodMessage = (spec = {}) => {
  const facts = factsOf(spec);
  if (facts.form === LINE_FORM.SLOPE_INTERCEPT) return 'Right line! Now draw it through the y-intercept.';
  if (facts.form === LINE_FORM.POINT_SLOPE) return 'Right line! Now draw it through the point in the equation.';
  if (facts.form === LINE_FORM.STANDARD) {
    return facts.yIntercept !== null && isZero(facts.yIntercept)
      ? 'Right line! Now draw it through the origin.'
      : 'Right line! Now draw it through both intercepts.';
  }
  return 'Right line!';
};
