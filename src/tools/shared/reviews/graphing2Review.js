// Worked solution review for graphing2 (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * GRAPHING2'S WORKED SOLUTION — POINTS THE SHARED GRADER MARKS CORRECT.
 *
 * Graphing2 is a line-construction tool: in every mode the student plots
 * points and the points ARE the answer. The shared grader
 * (functions/shared/serverGrading/tools/graphing2.mjs) marks them against one
 * target line, read with the tool's own helper (graphingTargetLine):
 *
 *   slopeIntercept      y = mx + b (or an authored vertical x = c)
 *   pointSlope          through the given point with the given slope
 *   factoredLinear      y = a(x − c)
 *   standardForm        Ax + By = C
 *   throughPoints       through the two given points
 *   verticalHorizontal  x = value or y = value
 *
 * Every mode has a single correct LINE, so every mode gets a review. The
 * review names that line and a set of points that construct it — as many as
 * the tool asks for (requiredConstructionPointCount), starting from the piece
 * of information the question's form gives (the y-intercept, the given point,
 * the x-intercept, the intercepts) and stepping along the slope. Under a
 * form-aware constructionPolicy the anchors the grader requires
 * (formAwareAnchorsForMode) are always among them.
 *
 * Every stated point is one the student could actually plot: on the tool's
 * snap grid (the same rule Graphing2.jsx's resolveSnapStep uses) and inside
 * the plane's authored bounds (CoordinatePlane clamps every click to them),
 * and exactly on the line. Before the review is returned, those points are
 * graded by the shared grader through the bytes the server reads
 * (gradeWorkWithGrader); unless it calls them correct AND complete, the
 * review is null — it never states a construction the gradebook would reject.
 *
 * Null — never a guess — when:
 *   - the question is not an object, its mode is not one Graphing2 renders,
 *     or it leaves out the data its mode needs (no authored `line` for
 *     slope-intercept, no `point` for point-slope: the tool's demonstration
 *     fallbacks are not a question a teacher wrote; any other missing or
 *     non-numeric data leaves no target line at all);
 *   - a form-aware anchor the grader requires cannot be plotted (it lies
 *     between the gridlines or outside the graph) or does not exist;
 *   - fewer plottable points lie exactly on the line than the tool asks for
 *     (a slope such as 0.67 crosses no grid point inside the graph);
 *   - a number the review would print has no exact short form (a fraction
 *     with denominator ≤ 100 or a decimal of ≤ 6 places): a rounding is never
 *     written after an "=";
 *   - the grader does not accept the stated points (an authored tolerance it
 *     cannot use, for example).
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import graphing2Grader from '../../../../functions/shared/serverGrading/tools/graphing2.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import {
  graphingModeOf,
  graphingTargetLine,
  lineFromPoints,
} from '../../../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import {
  formAwareAnchorsForMode,
  requiredConstructionPointCount,
  resolveConstructionPolicy,
} from '../../../../functions/shared/toolMath/graphing2/constructionPolicy.mjs';

export const implemented = true;

// The modes Graphing2.jsx renders a dedicated view for (MODE_LABELS).
const MODES = Object.freeze(['slopeIntercept', 'factoredLinear', 'throughPoints', 'pointSlope', 'standardForm', 'verticalHorizontal']);

const MINUS = '−';
// "Exactly", for a stated point, a slope or an intercept: floating-point noise
// only. The review's line is computed from the authored numbers without the
// 8-place rounding targetLineFromQuestion applies (exactLineOf), so a point it
// calls "on the line" is on it, not merely inside the grader's 0.12.
const EXACT = 1e-9;
// Graphing2.jsx: `questionData.graphBounds || { xMin: -7, ... }`; a bound the
// authored object leaves out is CoordinatePlane's own default (±10).
const TOOL_BOUNDS = Object.freeze({ xMin: -7, xMax: 7, yMin: -7, yMax: 7 });
const PLANE_DEFAULTS = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 });
// More grid lines than this across the plane is not a grid a student plots on.
const MAX_GRID_LINES = 4000;

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isZero = (value) => Math.abs(value) <= EXACT;
const isOne = (value) => Math.abs(value - 1) <= EXACT;
const isMinusOne = (value) => Math.abs(value + 1) <= EXACT;
const readPoint = (point) => {
  if (!Array.isArray(point) || point.length !== 2) return null;
  const pair = point.map(Number);
  return pair.every(Number.isFinite) ? pair : null;
};

/* ------------------------------------------------------------- numbers */

// CoordinatePlane's own tidy(): six decimal places, never -0.
const tidy = (value) => {
  const rounded = Number(Number(value).toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
};

// A decimal as the plane shows it, with a typographic minus.
const dec = (value) => {
  const rounded = tidy(value);
  return rounded < 0 ? `${MINUS}${Math.abs(rounded)}` : String(rounded);
};

// p/q in lowest terms with q ≤ maxDenominator when the value is one, else null.
const fractionOf = (value, maxDenominator) => {
  for (let q = 1; q <= maxDenominator; q += 1) {
    const p = Math.round(value * q);
    if (Math.abs(value * q - p) <= EXACT) return { p, q };
  }
  return null;
};
const fractionText = ({ p, q }) => (q === 1 ? dec(p) : `${p < 0 ? MINUS : ''}${Math.abs(p)}/${q}`);
const isShortDecimal = (value) => Math.abs(value - tidy(value)) <= 1e-9;

// Thrown (and caught by buildGraphing2Review) when a value has no exact
// short form: the review never prints a rounded number after an "=".
class InexactValue extends Error {}

// A slope, coefficient or intercept: a whole number or a simple fraction (the
// way the tool's hints write a slope), else the decimal itself, else a larger
// fraction. Never a rounding.
const frac = (value) => {
  const simple = fractionOf(value, 12);
  if (simple) return fractionText(simple);
  if (isShortDecimal(value)) return dec(value);
  const fraction = fractionOf(value, 100);
  if (fraction) return fractionText(fraction);
  throw new InexactValue(String(value));
};

// A coordinate: the decimal when it IS that decimal, else its fraction (an
// intercept such as 7/3 that no grid point reaches).
const num = (value) => (isShortDecimal(value) ? dec(value) : frac(value));
const pt = (point) => `(${num(point[0])}, ${num(point[1])})`;
const listText = (values) => (values.length <= 1 ? values.join('')
  : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`);

// A coefficient written in front of x or a bracket: 1 → '', −1 → '−'.
const coefficient = (value) => {
  if (isOne(value)) return '';
  if (isMinusOne(value)) return MINUS;
  const text = frac(value);
  return text.includes('/') ? `(${text})` : text;
};

// " + 3" / " − 3" / "" — a constant term after an expression.
const plusTerm = (value) => (isZero(value) ? '' : ` ${value < 0 ? MINUS : '+'} ${frac(Math.abs(value))}`);

// k times a plotted value, as substituted: 2(3), (2/3)(3), −(3), 3.
const product = (k, value) => {
  const bracket = `(${num(value)})`;
  if (isOne(k)) return value < 0 ? bracket : num(value);
  if (isMinusOne(k)) return `${MINUS}${bracket}`;
  return `${coefficient(k)}${bracket}`;
};

// "v − v₁" with v₁ written after its sign: 5 − 2, 5 + 2, 5.
const difference = (value, minus) => (isZero(minus) ? num(value)
  : `${num(value)} ${minus < 0 ? '+' : MINUS} ${num(Math.abs(minus))}`);

const lineText = (line) => {
  if (line.kind === 'vertical') return `x = ${frac(line.x)}`;
  if (isZero(line.m)) return `y = ${frac(line.b)}`;
  return `y = ${coefficient(line.m)}x${plusTerm(line.b)}`;
};

const standardText = ({ A, B, C }) => {
  const terms = [];
  if (!isZero(A)) terms.push(`${coefficient(A)}x`);
  if (!isZero(B)) {
    terms.push(terms.length ? `${B < 0 ? MINUS : '+'} ${coefficient(Math.abs(B))}y` : `${coefficient(B)}y`);
  }
  return `${terms.join(' ')} = ${frac(C)}`;
};

const factoredText = ({ a, c }) => (isZero(c) ? `y = ${coefficient(a)}x` : `y = ${coefficient(a)}(x${plusTerm(-c)})`);

// Solving k·v = rhs for v, in words: "2x = 4 and x = 2" (or "x = 4").
const solveText = (k, variable, rhs) => (isOne(k)
  ? `${variable} = ${num(rhs)}`
  : `${coefficient(k)}${variable} = ${num(rhs)} and ${variable} = ${num(rhs / k)}`);

/* ----------------------------------------------------------- the plane */

// The plane the student plotted on: its bounds and its snap step, read the way
// Graphing2.jsx hands them to CoordinatePlane.
const planeOf = (question, target) => {
  const bounds = question.graphBounds || TOOL_BOUNDS;
  if (!isRecord(bounds)) return null;
  const read = (key) => (bounds[key] === undefined ? PLANE_DEFAULTS[key] : (bounds[key] === null ? Number.NaN : Number(bounds[key])));
  const plane = { xMin: read('xMin'), xMax: read('xMax'), yMin: read('yMin'), yMax: read('yMax') };
  if (![plane.xMin, plane.xMax, plane.yMin, plane.yMax].every(Number.isFinite)) return null;
  if (plane.xMin >= plane.xMax || plane.yMin >= plane.yMax) return null;
  // Graphing2.jsx resolveSnapStep: an authored step, else whole numbers unless
  // the line genuinely lives between the gridlines.
  const explicit = Number(question.snapStep);
  let step;
  if (Number.isFinite(explicit) && explicit > 0) step = explicit;
  else if (target.kind === 'vertical') step = Number.isInteger(target.x) ? 1 : 0.5;
  else step = Number.isInteger(Number(target.m)) && Number.isInteger(Number(target.b)) ? 1 : 0.5;
  return { ...plane, step };
};

const snap = (value, step) => tidy(Math.round(value / step) * step);
const onGrid = (value, step) => Math.abs(value - snap(value, step)) <= EXACT;
const inRange = (value, min, max) => value >= min - EXACT && value <= max + EXACT;
const plottable = (point, plane) => onGrid(point[0], plane.step) && onGrid(point[1], plane.step)
  && inRange(point[0], plane.xMin, plane.xMax) && inRange(point[1], plane.yMin, plane.yMax);
const whyNotPlottable = (point, plane) => (
  inRange(point[0], plane.xMin, plane.xMax) && inRange(point[1], plane.yMin, plane.yMax)
    ? 'falls between the gridlines you can plot on'
    : 'is outside the graph'
);
const samePoint = (a, b) => Math.abs(a[0] - b[0]) <= 1e-4 && Math.abs(a[1] - b[1]) <= 1e-4;

const gridValues = (min, max, step) => {
  const low = Math.ceil(min / step - EXACT);
  const high = Math.floor(max / step + EXACT);
  if (!(high >= low) || high - low > MAX_GRID_LINES) return null;
  return Array.from({ length: high - low + 1 }, (_, index) => tidy((low + index) * step));
};

// Every plottable point exactly on the line (null: no usable grid).
const gridPointsOnLine = (target, plane) => {
  if (target.kind === 'vertical') {
    if (!onGrid(target.x, plane.step) || !inRange(target.x, plane.xMin, plane.xMax)) return [];
    const ys = gridValues(plane.yMin, plane.yMax, plane.step);
    return ys && ys.map((y) => [snap(target.x, plane.step), y]);
  }
  const xs = gridValues(plane.xMin, plane.xMax, plane.step);
  if (!xs) return null;
  return xs.map((x) => [x, target.m * x + target.b])
    .filter(([, y]) => onGrid(y, plane.step) && inRange(y, plane.yMin, plane.yMax))
    .map(([x, y]) => [x, snap(y, plane.step)]);
};

// The next point to plot from `from`: whole-number coordinates first, then
// forward (right, or up on a vertical line), then the shortest step.
const nextPoint = (candidates, chosen, from, vertical) => {
  const axis = vertical ? 1 : 0;
  const key = (point) => [
    Number.isInteger(point[0]) && Number.isInteger(point[1]) ? 0 : 1,
    point[axis] - from[axis] > 0 ? 0 : 1,
    Math.abs(point[axis] - from[axis]),
  ];
  const options = candidates.filter((point) => !chosen.some((existing) => samePoint(existing, point)));
  options.sort((left, right) => {
    const a = key(left); const b = key(right);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  });
  return options[0] || null;
};

/* ------------------------------------------------------ the question */

// What the question's form gives directly, in the order a student uses it.
// Each entry: the point, its role in the construction, and its name.
const formPoints = (mode, question, target) => {
  if (mode === 'pointSlope') return [{ point: readPoint(question.point), role: 'given', name: 'the given point' }];
  if (mode === 'factoredLinear') return [{ point: [Number(question.factored.c), 0], role: 'xIntercept', name: 'the x-intercept' }];
  if (mode === 'throughPoints') return question.givenPoints.map((point) => ({ point: readPoint(point), role: 'given', name: 'the given point' }));
  if (mode === 'standardForm') {
    const { A, B, C } = standardOf(question);
    if (isZero(A)) return [{ point: [0, C / B], role: 'yIntercept', name: 'the y-intercept' }];
    if (isZero(B)) return [{ point: [C / A, 0], role: 'xIntercept', name: 'the x-intercept' }];
    if (isZero(C)) return [{ point: [0, 0], role: 'origin', name: 'the origin' }];
    return [
      { point: [C / A, 0], role: 'xIntercept', name: 'the x-intercept' },
      { point: [0, C / B], role: 'yIntercept', name: 'the y-intercept' },
    ];
  }
  if (target.kind === 'vertical') return [{ point: [target.x, 0], role: 'xIntercept', name: 'the x-intercept' }];
  return [{ point: [0, target.b], role: 'yIntercept', name: 'the y-intercept' }];
};

const standardOf = (question) => ({
  A: Number(question.standard?.A),
  B: Number(question.standard?.B),
  C: Number(question.standard?.C),
});

// The authored data each mode needs, read as Graphing2 reads it. Null when it
// is missing: the tool's fallbacks (y = 1.5x − 2, the point (0, 0)) are its
// demonstration, not a question anyone wrote.
const modeDataPresent = (mode, question) => {
  if (mode === 'slopeIntercept') return isRecord(question.line);
  if (mode === 'pointSlope') return Boolean(readPoint(question.point));
  if (mode === 'factoredLinear') return isRecord(question.factored);
  if (mode === 'throughPoints') return Array.isArray(question.givenPoints) && question.givenPoints.length === 2
    && question.givenPoints.every((point) => readPoint(point));
  if (mode === 'standardForm') return isRecord(question.standard);
  return ['vertical', 'horizontal'].includes(question.orientation);
};

/* ------------------------------------------------------------ the text */
// Every helper below is handed the EXACT target line (exactLineOf).

// The line's equation at a point's x, written in the question's own form; the
// point is on the line, so its y is the value.
const evaluationAt = (mode, question, line, [x, y]) => {
  if (mode === 'factoredLinear') {
    const a = Number(question.factored.a); const c = Number(question.factored.c);
    return `y = ${isZero(c) ? product(a, x) : `${coefficient(a)}(${difference(x, c)})`} = ${num(y)}`;
  }
  return `y = ${product(line.m, x)}${plusTerm(line.b)} = ${num(y)}`;
};

// Standard form with x = value substituted, solved for y (or the reverse).
const standardSolveAt = ({ A, B, C }, point) => {
  if (isZero(B)) return `${product(A, point[0])} = ${frac(C)}`;
  const known = product(A, point[0]);
  const rest = C - A * point[0];
  return `${known} ${B < 0 ? MINUS : '+'} ${coefficient(Math.abs(B))}y = ${frac(C)}, so ${solveText(B, 'y', rest)}`;
};

const moveText = (from, to) => {
  const run = to[0] - from[0];
  const rise = to[1] - from[1];
  const moves = [];
  if (!isZero(run)) moves.push(`${run > 0 ? 'right' : 'left'} ${dec(Math.abs(run))}`);
  if (!isZero(rise)) moves.push(`${rise > 0 ? 'up' : 'down'} ${dec(Math.abs(rise))}`);
  return `move ${moves.join(' and ')}`;
};

// One plotted step along the line, with the reason it stays on the line.
const stepText = (target, from, to) => {
  const move = `From ${pt(from)}, ${moveText(from, to)} to ${pt(to)}`;
  if (target.kind === 'vertical') return `${move} — on a vertical line x stays ${dec(to[0])}. Plot ${pt(to)}.`;
  if (isZero(target.m)) return `${move} — the slope is 0, so y stays ${dec(to[1])}. Plot ${pt(to)}.`;
  const run = to[0] - from[0];
  const rise = to[1] - from[1];
  return `${move}: a rise of ${dec(rise)} over a run of ${dec(run)} is ${frac(rise / run)}, the slope. Plot ${pt(to)}.`;
};

const ROLE_PLOT = Object.freeze({
  yIntercept: (point) => `Plot the y-intercept ${pt(point)}, where the line crosses the y-axis.`,
  xIntercept: (point) => `Plot the x-intercept ${pt(point)}, where the line crosses the x-axis.`,
  given: (point) => `Plot the given point ${pt(point)}.`,
  origin: (point) => `Plot the origin ${pt(point)}: it is both the x-intercept and the y-intercept.`,
});

// The line the question describes, in the student's words.
const introSteps = (mode, question, target) => {
  const line = lineText(target);
  if (mode === 'pointSlope') {
    const [x1, y1] = readPoint(question.point);
    const m = Number(question.slope);
    const pointSlope = `y${plusTerm(-y1)} = ${coefficient(m)}${isZero(x1) ? 'x' : `(x${plusTerm(-x1)})`}`;
    return [`The line goes through the given point ${pt([x1, y1])} with slope ${frac(m)}: ${pointSlope}, which is ${line} in slope-intercept form.`];
  }
  if (mode === 'factoredLinear') {
    const a = Number(question.factored.a); const c = Number(question.factored.c);
    const factor = isZero(c) ? 'x' : `(x${plusTerm(-c)})`;
    return [`In ${factoredText({ a, c })}, the factor ${factor} is 0 when x = ${frac(c)}, so the x-intercept is ${pt([c, 0])}; the number in front, ${frac(a)}, is the slope. In slope-intercept form the line is ${line}.`];
  }
  if (mode === 'standardForm') {
    const standard = standardOf(question);
    const { A, B, C } = standard;
    const equation = standardText(standard);
    if (isZero(A)) {
      const solved = isOne(B) ? '' : `, so dividing by ${frac(B)} gives y = ${num(C / B)}`;
      return [`${equation} has no x-term${solved}. That is a horizontal line — its y-intercept is ${pt([0, C / B])}, and every point on it has y = ${num(C / B)}.`];
    }
    if (isZero(B)) {
      const solved = isOne(A) ? '' : `, so dividing by ${frac(A)} gives x = ${num(C / A)}`;
      return [`${equation} has no y-term${solved}. That is a vertical line — its x-intercept is ${pt([C / A, 0])}, and every point on it has x = ${num(C / A)}.`];
    }
    const steps = [
      `Find the intercepts of ${equation}. For the x-intercept set y = 0: ${solveText(A, 'x', C)} — the point ${pt([C / A, 0])}.`,
      `For the y-intercept set x = 0: ${solveText(B, 'y', C)} — the point ${pt([0, C / B])}.`,
    ];
    if (isZero(C)) steps.push('Both intercepts are the origin (0, 0), so the line passes through the origin and one more point is needed.');
    return steps;
  }
  if (mode === 'throughPoints') {
    const [[x1, y1], [x2, y2]] = question.givenPoints.map(readPoint);
    const given = `The line must pass through the given points ${pt([x1, y1])} and ${pt([x2, y2])}.`;
    if (target.kind === 'vertical') return [`${given} Both have x = ${num(x1)}, so the line is the vertical line ${line}.`];
    const paren = (value) => (value < 0 ? `(${num(value)})` : num(value));
    return [`${given} Its slope is (${num(y2)} − ${paren(y1)}) ÷ (${num(x2)} − ${paren(x1)}) = ${num(y2 - y1)} ÷ ${num(x2 - x1)} = ${frac(target.m)}, so the line is ${line}.`];
  }
  if (mode === 'verticalHorizontal' || target.kind === 'vertical') {
    if (target.kind === 'vertical') return [`${line} is a vertical line: every point on it has x-coordinate ${frac(target.x)}, whatever its y-coordinate.`];
    return [`${line} is a horizontal line: every point on it has y-coordinate ${frac(target.b)}, whatever its x-coordinate.`];
  }
  return [`Compare ${line} with y = mx + b: the slope is m = ${frac(target.m)} and the y-intercept is b = ${frac(target.b)}, so the line crosses the y-axis at ${pt([0, target.b])}.`];
};

// A point reached by substituting into the equation rather than by a step.
const substituteText = (mode, question, target, point) => {
  if (target.kind === 'vertical') return `Choose y = ${dec(point[1])}: the point ${pt(point)} has x = ${dec(point[0])}. Plot ${pt(point)}.`;
  if (mode === 'standardForm') return `Set x = ${dec(point[0])} in ${standardText(standardOf(question))}: ${standardSolveAt(standardOf(question), point)}. Plot ${pt(point)}.`;
  if (isZero(target.m)) return `Choose x = ${dec(point[0])}: every point on the line has y = ${dec(point[1])}. Plot ${pt(point)}.`;
  return `Choose x = ${dec(point[0])}: ${evaluationAt(mode, question, target, point)}. Plot ${pt(point)}.`;
};

// Each stated point substituted back into the question's own equation.
const checkText = (mode, question, target, point) => {
  const [x, y] = point;
  if (target.kind === 'vertical') return `${pt(point)} has x = ${dec(x)}`;
  if (isZero(target.m) && mode !== 'standardForm') return `${pt(point)} has y = ${dec(y)}`;
  if (mode === 'standardForm') {
    const { A, B, C } = standardOf(question);
    const terms = [!isZero(A) ? product(A, x) : null, !isZero(B) ? product(Math.abs(B), y) : null];
    const left = terms[0] && terms[1] ? `${terms[0]} ${B < 0 ? MINUS : '+'} ${terms[1]}`
      : terms[0] || `${B < 0 ? MINUS : ''}${terms[1]}`;
    return `${pt(point)}: ${left} = ${frac(C)}`;
  }
  if (mode === 'pointSlope') {
    const [x1, y1] = readPoint(question.point);
    const m = Number(question.slope);
    // The point is on the line, so both sides are y − y₁.
    return `${pt(point)}: ${difference(y, y1)} = ${num(y - y1)} and ${coefficient(m)}(${difference(x, x1)}) = ${num(y - y1)}`;
  }
  if (mode === 'factoredLinear') {
    const a = Number(question.factored.a); const c = Number(question.factored.c);
    return `${pt(point)}: ${isZero(c) ? product(a, x) : `${coefficient(a)}(${difference(x, c)})`} = ${num(y)}`;
  }
  return `${pt(point)}: ${product(target.m, x)}${plusTerm(target.b)} = ${num(y)}`;
};

const equationForCheck = (mode, question, target) => {
  if (mode === 'standardForm') return standardText(standardOf(question));
  if (mode === 'factoredLinear') return factoredText({ a: Number(question.factored.a), c: Number(question.factored.c) });
  if (mode === 'pointSlope') {
    const [x1, y1] = readPoint(question.point);
    return `y${plusTerm(-y1)} = ${coefficient(Number(question.slope))}${isZero(x1) ? 'x' : `(x${plusTerm(-x1)})`}`;
  }
  return lineText(target);
};

const whyText = (mode, question, target, points) => {
  const line = lineText(target);
  const checks = points.map((point) => checkText(mode, question, target, point));
  const unique = 'two different points determine exactly one line';
  if (target.kind === 'vertical') return `Check: every point has the same x-coordinate — ${checks.join(', ')} — so the line through them is the vertical line ${line}.`;
  if (isZero(target.m) && mode !== 'standardForm') return `Check: every point has the same y-coordinate — ${checks.join(', ')} — so the line through them is the horizontal line ${line}.`;
  if (mode === 'throughPoints') {
    const given = question.givenPoints.map(readPoint);
    const usesGiven = given.every((point) => points.some((stated) => samePoint(stated, point)));
    const extra = points.filter((point) => !given.some((other) => samePoint(other, point)));
    if (usesGiven) {
      const tail = extra.length
        ? ` ${listText(extra.map(pt))} ${extra.length > 1 ? 'are' : 'is'} on it too: ${extra.map((point) => `${product(target.m, point[0])}${plusTerm(target.b)} = ${num(point[1])}`).join(', ')} in ${line}.`
        : '';
      return `Check: these are the two given points, and ${unique}, so the line through them is ${line}.${tail}`;
    }
  }
  const equation = equationForCheck(mode, question, target);
  return `Check: substitute each point into ${equation}. ${checks.join('; ')}. Every point satisfies the equation, and ${unique}, so the line through them is ${line}.`;
};

const ANCHOR_NAMES = Object.freeze({ yIntercept: 'the y-intercept', xIntercept: 'the x-intercept', givenPoint: 'the given point' });

const noteText = (legacy, count, anchors) => {
  const any = `Any ${count} different points on this line are marked correct`;
  if (legacy) return `${any}; these are one choice.`;
  const distinct = anchors.filter((anchor, index) => anchors.findIndex((other) => samePoint(other.point, anchor.point)) === index);
  if (distinct.length < anchors.length) return `${any}, as long as the origin ${pt(distinct[0].point)} — both intercepts — is one of them.`;
  const named = anchors.map((anchor) => `${ANCHOR_NAMES[anchor.id] || 'the required point'} ${pt(anchor.point)}`);
  return `${any}, as long as ${listText(named)} ${anchors.length > 1 ? 'are among them' : 'is one of them'}.`;
};

/* -------------------------------------------------------- the review */

// The target line from the authored numbers themselves, without the 8-place
// rounding targetLineFromQuestion applies: 1/3 stays 1/3, so the review can
// write it as a fraction and test grid points against it exactly.
const exactLineOf = (mode, question, target) => {
  if (mode === 'pointSlope') {
    const [x1, y1] = readPoint(question.point);
    const m = Number(question.slope);
    return { kind: 'slopeIntercept', m, b: y1 - m * x1 };
  }
  if (mode === 'factoredLinear') {
    const a = Number(question.factored.a);
    return { kind: 'slopeIntercept', m: a, b: -a * Number(question.factored.c) };
  }
  if (mode === 'standardForm') {
    const { A, B, C } = standardOf(question);
    return isZero(B) ? { kind: 'vertical', x: C / A } : { kind: 'slopeIntercept', m: -A / B, b: C / B };
  }
  if (mode === 'throughPoints') {
    const [[x1, y1], [x2, y2]] = question.givenPoints.map(readPoint);
    if (isZero(x2 - x1)) return { kind: 'vertical', x: x1 };
    const m = (y2 - y1) / (x2 - x1);
    return { kind: 'slopeIntercept', m, b: y1 - m * x1 };
  }
  return target;
};

// The exact line and the grader's line are the same line (only rounding apart).
const sameLine = (left, right) => left.kind === right.kind && (left.kind === 'vertical'
  ? Math.abs(left.x - right.x) <= 1e-6
  : Math.abs(left.m - right.m) <= 1e-6 && Math.abs(left.b - right.b) <= 1e-6);

const acceptedByGrader = (question, points) => {
  const work = { points: points.map((point) => [...point]), studentLine: points.length >= 2 ? lineFromPoints(points[0], points[1]) : null };
  const result = gradeWorkWithGrader({ grader: graphing2Grader, question, work });
  return result.graded === true && result.isCorrect === true && result.isComplete === true;
};

const buildReview = (question) => {
  if (!isRecord(question)) return null;
  const mode = graphingModeOf(question);
  if (!MODES.includes(mode) || !modeDataPresent(mode, question)) return null;
  const target = graphingTargetLine(question);
  if (!target) return null;
  if (target.kind === 'vertical' ? !Number.isFinite(target.x) : ![target.m, target.b].every(Number.isFinite)) return null;
  // The snap grid is the tool's, read from the grader's line (resolveSnapStep).
  const plane = planeOf(question, target);
  if (!plane) return null;
  const line = exactLineOf(mode, question, target);
  if (!sameLine(line, target)) return null;

  const policy = resolveConstructionPolicy(question);
  // The grader's own split (evaluateConstructionDetail): through-points and
  // vertical/horizontal are always graded as "the points determine the line".
  const legacy = policy.strategy !== 'formAware' || mode === 'throughPoints' || mode === 'verticalHorizontal';
  const count = requiredConstructionPointCount(question);
  const anchors = legacy ? [] : formAwareAnchorsForMode(mode, question, target).anchors;
  if (!legacy && !anchors.length) return null;
  if (anchors.some((anchor) => !plottable(anchor.point, plane))) return null;

  // Start from what the form gives, where it can be plotted.
  const fromForm = formPoints(mode, question, line);
  if (fromForm.some((entry) => !entry.point)) return null;
  const chosen = [];
  fromForm.forEach((entry) => {
    if (!plottable(entry.point, plane)) return;
    const point = entry.point.map((value) => snap(value, plane.step));
    if (!chosen.some((existing) => samePoint(existing.point, point))) chosen.push({ ...entry, point });
  });
  const skipped = fromForm.filter((entry) => !plottable(entry.point, plane));

  const candidates = gridPointsOnLine(line, plane);
  if (!candidates) return null;
  const vertical = line.kind === 'vertical';
  while (chosen.length < count) {
    const from = chosen.length ? chosen[chosen.length - 1].point : fromForm[0].point;
    const point = nextPoint(candidates, chosen.map((entry) => entry.point), from, vertical);
    if (!point) return null;
    // Standard form is worked by substitution; a line whose every point shares
    // one coordinate (and every other form) is worked by stepping along it.
    const bySubstitution = mode === 'standardForm' && !vertical && !isZero(line.m);
    const role = !chosen.length || bySubstitution ? 'substitute' : 'step';
    chosen.push({ point, role });
  }
  const points = chosen.map((entry) => entry.point);
  // Never more than the tool takes: a further click starts the construction over.
  if (points.length !== count) return null;
  if (!acceptedByGrader(question, points)) return null;

  const steps = [...introSteps(mode, question, line)];
  if (skipped.length) {
    const reasons = listText(skipped.map((entry) => `${entry.name} ${pt(entry.point)} ${whyNotPlottable(entry.point, plane)}`));
    steps.push(`${reasons.charAt(0).toUpperCase()}${reasons.slice(1)}, so use other points of the line that land on the grid.`);
  }
  chosen.forEach((entry, index) => {
    if (ROLE_PLOT[entry.role]) steps.push(ROLE_PLOT[entry.role](entry.point));
    else if (entry.role === 'step') steps.push(stepText(line, chosen[index - 1].point, entry.point));
    else steps.push(substituteText(mode, question, line, entry.point));
  });
  steps.push(`The line through ${listText(points.map(pt))} is ${lineText(line)} — the line the question asks for.`);

  const items = [{ label: 'Line', value: lineText(line) }];
  if (line.kind === 'vertical') items.push({ label: 'Slope', value: 'Undefined (vertical line)' });
  else items.push({ label: 'Slope', value: frac(line.m) });
  if (line.kind !== 'vertical') items.push({ label: 'y-intercept', value: pt([0, line.b]) });
  if (line.kind === 'vertical') items.push({ label: 'x-intercept', value: pt([line.x, 0]) });
  else if (!isZero(line.m) && ['factoredLinear', 'standardForm'].includes(mode)) items.push({ label: 'x-intercept', value: pt([-line.b / line.m, 0]) });
  items.push({ label: 'Points to plot', value: listText(points.map((point) => `(${dec(point[0])}, ${dec(point[1])})`)) });

  return {
    title: 'Line construction solution',
    items,
    steps,
    why: whyText(mode, question, line, points),
    note: noteText(legacy, count, anchors),
  };
};

export const buildGraphing2Review = (question) => {
  try {
    return buildReview(question);
  } catch {
    // Malformed authoring the checks above did not foresee: no review rather
    // than a crash or a half-built one.
    return null;
  }
};

export default buildGraphing2Review;
