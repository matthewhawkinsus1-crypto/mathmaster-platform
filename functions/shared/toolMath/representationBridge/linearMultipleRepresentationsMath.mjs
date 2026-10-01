// Pure math and grading helpers for the Free-Order Linear Multiple Representations Board.
//
// Reuses the platform's canonical linear engines:
//   - shared/linearEquations.js
//   - algebraAstEngine.js
//   - graphing2/constructionPolicy.js + graphingMath.js
//   - linearTableWorkbench/linearTableWorkbenchMath.js

import { parse } from 'mathjs';
import {
  fitTableLine,
  isCollinear,
} from '../linearTableWorkbench/linearTableWorkbenchMath.mjs';
import { matchesNumericAnswer, nearlyEqual } from '../shared/toolMath.mjs';
import {
  canonicalFromEquationText,
  canonicalFromPoints,
  canonicalFromPointSlope,
  canonicalFromSlopeIntercept,
  canonicalFromStandard,
  divFractions,
  formatFraction,
  formatSlopeIntercept,
  fractionToNumber,
  linesEquivalent,
  makeFraction,
  negFraction,
  pointOnCanonicalLine,
  standardCoefficientsFromEquationText,
  toFraction,
} from '../shared/linearEquations.mjs';
import {
  isLinearStandardFormEquation,
  isSimplifiedSlopeInterceptExpression,
  latexToExpression,
} from '../../algebra/algebraAstEngine.mjs';
import { targetLineFromQuestion } from '../graphing2/graphingMath.mjs';
import { evaluateConstruction } from '../graphing2/constructionPolicy.mjs';

export const SUPPORTED_SOURCE_KINDS = Object.freeze([
  'standardForm',
  'slopeIntercept',
  'pointSlope',
  'twoPoints',
  'table',
  'graph',
  'scenario',
]);

export const DEFAULT_BOARD_CATEGORIES = Object.freeze({
  equationForms: ['standardForm', 'slopeIntercept', 'pointSlope'],
  features: ['slope', 'xIntercept', 'yIntercept', 'twoPoints'],
  table: ['table'],
  graphs: ['graphIntercepts', 'graphSlopeIntercept', 'graphPointSlope'],
});

/** Every card a student can be asked to build, in board order. */
export const BOARD_CARD_IDS = Object.freeze(Object.values(DEFAULT_BOARD_CATEGORIES).flat());

// The graded part each card produces. The graph parts keep their historical
// graph1/graph2/graph3 names so stored attempts stay readable.
export const CARD_PART_KEYS = Object.freeze({
  standardForm: 'standardForm',
  slopeIntercept: 'slopeIntercept',
  pointSlope: 'pointSlope',
  slope: 'slope',
  xIntercept: 'xIntercept',
  yIntercept: 'yIntercept',
  twoPoints: 'twoPoints',
  table: 'table',
  graphIntercepts: 'graph1',
  graphSlopeIntercept: 'graph2',
  graphPointSlope: 'graph3',
});

// Classroom names for every graded part, used wherever a student reads which
// part needs another look.
export const PART_LABELS = Object.freeze({
  standardForm: 'Standard form',
  slopeIntercept: 'Slope-intercept form',
  pointSlope: 'Point-slope form',
  slope: 'Slope',
  xIntercept: 'x-intercept',
  yIntercept: 'y-intercept',
  twoPoints: 'Two points on the line',
  table: 'Table of values',
  graph1: 'Graph 1 (intercepts)',
  graph2: 'Graph 2 (slope-intercept)',
  graph3: 'Graph 3 (point-slope)',
  contextIndependent: 'Independent quantity',
  contextDependent: 'Dependent quantity',
  contextSlopeMeaning: 'Meaning of the slope',
  contextYInterceptMeaning: 'Meaning of the y-intercept',
  contextXInterceptMeaning: 'Meaning of the x-intercept',
  contextDomain: 'Reasonable domain',
  crossRepresentationConsistency: 'Every part describes the same line',
});

// The card a source kind hands the student already built. It is GIVEN, so it
// is never asked for again and never graded.
const GIVEN_CARD_BY_KIND = Object.freeze({
  standardForm: 'standardForm',
  slopeIntercept: 'slopeIntercept',
  pointSlope: 'pointSlope',
  twoPoints: 'twoPoints',
  table: 'table',
});

export const givenCardForQuestion = (question = {}) => GIVEN_CARD_BY_KIND[question.source?.kind] || null;

const expandCardIds = (ids) => ids.flatMap((id) => DEFAULT_BOARD_CATEGORIES[id] || [id]);

/**
 * The cards this question asks the student to build, in board order.
 *
 * `requiredCards` lets an author make a shorter board (a DOL, say) from card
 * ids or whole categories (`graphs`, `features`). Absent, every card is asked
 * for. The GIVEN representation is always removed: it is the starting point,
 * not work.
 */
export const resolveRequiredCards = (question = {}) => {
  const authored = Array.isArray(question.requiredCards) && question.requiredCards.length
    ? expandCardIds(question.requiredCards.map(String))
    : BOARD_CARD_IDS;
  const given = givenCardForQuestion(question);
  return BOARD_CARD_IDS.filter((id) => authored.includes(id) && id !== given);
};

const gcd = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    [x, y] = [y, x % y];
  }
  return x || 1;
};

const lcm = (a, b) => {
  const g = gcd(a, b);
  return (Math.abs(Math.round(a)) * Math.abs(Math.round(b))) / g;
};

/**
 * Compute normalized standard form coefficients { A, B, C } for a canonical line:
 * A, B, C integers, gcd(|A|, |B|, |C|) === 1, and A > 0 (or if A === 0, B > 0).
 */
export const normalizeStandardCoefficients = (canonicalLine) => {
  if (!canonicalLine || canonicalLine.vertical) return null;
  const m = canonicalLine.m;
  const b = canonicalLine.b;
  // y = (m.n / m.d) x + (b.n / b.d)
  // L * y = (L * m.n / m.d) x + (L * b.n / b.d)
  // -(L * m.n / m.d) x + L y = (L * b.n / b.d)
  const L = lcm(m.d, b.d);
  let rawA = -(L / m.d) * m.n;
  let rawB = L;
  let rawC = (L / b.d) * b.n;

  if (rawA < 0 || (rawA === 0 && rawB < 0)) {
    rawA = -rawA;
    rawB = -rawB;
    rawC = -rawC;
  }
  const divisor = gcd(gcd(rawA, rawB), rawC);
  return {
    A: rawA / divisor,
    B: rawB / divisor,
    C: rawC / divisor,
  };
};

export const formatNormalizedStandard = ({ A, B, C }) => {
  const termA = A === 1 ? 'x' : A === -1 ? '-x' : `${A}x`;
  const signB = B >= 0 ? '+' : '-';
  const absB = Math.abs(B);
  const termB = absB === 1 ? 'y' : `${absB}y`;
  return `${termA} ${signB} ${termB} = ${C}`;
};

/**
 * Parse an arbitrary numeric or fraction string into an exact fraction / number.
 * Handles both plain numbers/slashes ("1/2") and MathLive LaTeX ("\frac{1}{2}").
 */
export const parseNumericOrFraction = (input) => {
  if (input == null) return null;
  let str = String(input).trim();
  if (!str) return null;
  if (str.includes('\\')) {
    str = latexToExpression(str).replace(/[()]/g, '').trim();
  }
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 2) {
      const n = Number(parts[0].trim());
      const d = Number(parts[1].trim());
      if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) {
        return { number: n / d, fraction: makeFraction(n, d) };
      }
    }
  }
  const num = Number(str);
  if (Number.isFinite(num)) {
    return { number: num, fraction: toFraction(num) };
  }
  return null;
};

/** A coordinate as a student writes it: 3, -2, 1/2 — never 0.3333333333. */
export const formatCoordinateText = (value) => {
  const fraction = toFraction(value);
  return fraction ? formatFraction(fraction) : String(value);
};

/*
 * WHERE A POINT CAN LAND, PER GRAPH.
 *
 * A plane snaps to multiples of one step. A graph is plottable exactly when
 * every point it REQUIRES is a multiple of that step, so each graph gets the
 * coarsest grid that contains both the author's grid and its own required
 * points:
 *
 *   Graph 1  the x- and y-intercepts
 *   Graph 2  the y-intercept (the slope step from it is a whole rise and run,
 *            so it lands on the same grid)
 *   Graph 3  the point-slope anchor — the given point, or the point the
 *            student chose. "Any valid point" stays true only if that point is
 *            reachable, so an authored snapStep of 1 must not trap a student
 *            who wrote y − 1/2 = x − 1/2.
 *
 * "Coarsest grid containing a and b" is the rational gcd: gcd(1, 1/2) = 1/2,
 * gcd(1/4, 1/2) = 1/4, gcd(1/5, 1/2) = 1/10. A slope's denominator is NOT a
 * reason to refine: slope 1/2 is rise 1, run 2, whole steps on the whole grid.
 * Whole numbers stay the default, as the plane itself promises.
 */
export const MAX_SNAP_DENOMINATOR = 20;
// Past MAX_SNAP_DENOMINATOR the exact grid is too fine to aim at. Twentieths
// put any coordinate within 0.025 of a gridline — well inside the graph
// tolerance — so the point is still plottable, just not exactly.
const FALLBACK_SNAP_STEP = 1 / MAX_SNAP_DENOMINATOR;

const fractionGcd = (left, right) => {
  const a = { n: Math.abs(left.n), d: left.d };
  const b = { n: Math.abs(right.n), d: right.d };
  if (a.n === 0) return b;
  if (b.n === 0) return a;
  return makeFraction(gcd(a.n * b.d, b.n * a.d), a.d * b.d);
};

/** The author's grid: an explicit positive snapStep (number or "1/3"), else whole numbers. */
export const resolveAuthoredSnapStep = (questionData = {}) => {
  const parsed = questionData.snapStep == null ? null : parseNumericOrFraction(questionData.snapStep);
  return parsed && Number.isFinite(parsed.number) && parsed.number > 0 ? parsed.number : 1;
};

/**
 * The coarsest grid that contains the base grid and every coordinate of
 * `points`. Returns the base unchanged when it already reaches them.
 */
export const refineSnapStep = (baseStep, points = []) => {
  const base = Number(baseStep) > 0 && Number.isFinite(Number(baseStep)) ? Number(baseStep) : 1;
  let grid = toFraction(base);
  if (!grid) return base;
  (Array.isArray(points) ? points : []).forEach((point) => {
    if (!Array.isArray(point)) return;
    point.slice(0, 2).forEach((value) => {
      const coordinate = toFraction(value);
      if (coordinate && coordinate.n !== 0) grid = fractionGcd(grid, coordinate);
    });
  });
  if (grid.d > MAX_SNAP_DENOMINATOR) return Math.min(base, FALLBACK_SNAP_STEP);
  const step = grid.n / grid.d;
  // Keep the author's exact number when nothing needed refining.
  return Math.abs(step - base) < 1e-12 ? base : step;
};

const interceptAnchors = (canonicalFacts = {}) => [canonicalFacts.xInterceptPoint, canonicalFacts.yInterceptPoint]
  .filter((point) => Array.isArray(point));

/**
 * One grid per graph workspace (see above). `graph3Anchor` is the point Graph
 * 3 must start from, or null while the student has not chosen one.
 */
export const resolveGraphSnapSteps = (questionData = {}, canonicalFacts = {}, graph3Anchor = null) => {
  const base = resolveAuthoredSnapStep(questionData);
  const intercepts = interceptAnchors(canonicalFacts);
  return {
    base,
    graph1: refineSnapStep(base, intercepts),
    graph2: refineSnapStep(base, canonicalFacts.yInterceptPoint ? [canonicalFacts.yInterceptPoint] : []),
    graph3: refineSnapStep(base, Array.isArray(graph3Anchor) ? [graph3Anchor] : intercepts),
  };
};

/**
 * Compatibility wrapper: the grid that reaches the intercepts, a given
 * point-slope anchor and any `extraPoints`, refining the authored step only
 * where those points need it.
 */
export const resolveSnapStep = (questionData = {}, canonicalFacts = {}, extraPoints = []) => {
  const base = resolveAuthoredSnapStep(questionData);
  const points = [
    ...interceptAnchors(canonicalFacts),
    ...(Array.isArray(canonicalFacts.sourcePoint) ? [canonicalFacts.sourcePoint] : []),
    ...(Array.isArray(extraPoints) ? extraPoints : []),
  ];
  return refineSnapStep(base, points);
};

/** "whole numbers", or "every 1/2 unit" — how a student is told where points land. */
export const describeSnapStep = (step) => {
  const fraction = toFraction(step);
  if (!fraction || (fraction.d === 1 && fraction.n === 1)) return 'whole numbers';
  if (fraction.d === 1) return `every ${fraction.n} units`;
  return `every ${formatFraction(fraction)} unit`;
};

// -----------------------------------------------------------------------------
// AST & Structural Checkers for Equations
// -----------------------------------------------------------------------------

const unwrapParens = (node) => {
  let curr = node;
  while (curr && curr.isParenthesisNode) curr = curr.content;
  return curr;
};

const evalConstNode = (node) => {
  const unwrapped = unwrapParens(node);
  if (!unwrapped) return null;
  try {
    const val = Number(unwrapped.evaluate({}));
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
};

const parseLinearTerm = (node, varName) => {
  const unwrapped = unwrapParens(node);
  if (!unwrapped) return null;
  if (unwrapped.isSymbolNode && unwrapped.name === varName) {
    return 0;
  }
  if (unwrapped.isOperatorNode && (unwrapped.fn === 'subtract' || unwrapped.fn === 'add')) {
    const [first, second] = unwrapped.args;
    const uFirst = unwrapParens(first);
    if (uFirst.isSymbolNode && uFirst.name === varName) {
      const c = evalConstNode(second);
      if (c == null) return null;
      return unwrapped.fn === 'subtract' ? c : -c;
    }
  }
  return null;
};

/**
 * Parses point-slope form: y - y1 = m(x - x1)
 * Returns { m, x1, y1, point: [x1, y1] } or null if equation is not structurally point-slope.
 */
export const parsePointSlopeForm = (equationText) => {
  if (typeof equationText !== 'string' || !equationText.trim()) return null;
  let str = equationText.trim();
  if (str.includes('\\')) {
    str = latexToExpression(str);
  }
  try {
    const parts = str.split('=');
    if (parts.length !== 2) return null;
    const left = unwrapParens(parse(parts[0].trim()));
    const right = unwrapParens(parse(parts[1].trim()));

    const y1 = parseLinearTerm(left, 'y');
    if (y1 == null) return null;

    // Right side: m * (x - x1)
    // Case 1: (x - x1) -> m = 1
    if (
      right.isParenthesisNode
      || (right.isSymbolNode && right.name === 'x')
      || (right.isOperatorNode && ['add', 'subtract'].includes(right.fn) && right.args[0].name === 'x')
    ) {
      const x1 = parseLinearTerm(right, 'x');
      if (x1 != null) return { m: 1, x1, y1, point: [x1, y1] };
    }

    // Case 2: -(x - x1) -> m = -1
    if (right.isOperatorNode && right.fn === 'unaryMinus') {
      const x1 = parseLinearTerm(right.args[0], 'x');
      if (x1 != null) return { m: -1, x1, y1, point: [x1, y1] };
    }

    // Case 3: m * (x - x1)
    if (right.isOperatorNode && right.fn === 'multiply') {
      const [mNode, xNode] = right.args;
      const m = evalConstNode(mNode);
      const x1 = parseLinearTerm(xNode, 'x');
      if (m != null && x1 != null) return { m, x1, y1, point: [x1, y1] };
    }

    // Case 4: (x - x1) / d
    if (right.isOperatorNode && right.fn === 'divide') {
      const [xNode, dNode] = right.args;
      const d = evalConstNode(dNode);
      const x1 = parseLinearTerm(xNode, 'x');
      if (d != null && d !== 0 && x1 != null) return { m: 1 / d, x1, y1, point: [x1, y1] };
    }

    return null;
  } catch {
    return null;
  }
};

/*
 * An authored table cell or coordinate, read exactly: a number, a numeric
 * string, or a fraction string such as "1/3" (which no float can hold). The
 * raw value is kept so the GIVEN representation shows what the author wrote.
 */
const readAuthoredValue = (value) => {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = parseNumericOrFraction(String(value).replace(/−/g, '-'));
  return parsed && Number.isFinite(parsed.number) ? parsed : null;
};

/** Source table rows as exact numbers, or null when any cell is not a finite value. */
export const readSourceTableRows = (rows) => {
  if (!Array.isArray(rows)) return null;
  const read = rows.map((row) => {
    const rawX = Array.isArray(row) ? row[0] : row?.x;
    const rawY = Array.isArray(row) ? row[1] : row?.y;
    const x = readAuthoredValue(rawX);
    const y = readAuthoredValue(rawY);
    return x && y ? { x: x.number, y: y.number, rawX, rawY } : null;
  });
  return read.every(Boolean) ? read : null;
};

/*
 * An authored point, in either shape it can arrive in. Authors write
 * [x, y]; Firestore cannot store an array of arrays, so the teacher import
 * stores `points: [[x, y], …]` as `[{ x, y }, …]` (see
 * repairKnownFirestoreNestedArrays). A reader that only knows [x, y] rejects
 * every published two-points and graph question.
 */
export const authoredPointPair = (point) => {
  if (Array.isArray(point)) return point.length === 2 ? point : null;
  if (point && typeof point === 'object' && 'x' in point && 'y' in point) return [point.x, point.y];
  return null;
};

/** Source points as exact numbers, or null when any point is malformed or not finite. */
const readSourcePoints = (points) => {
  if (!Array.isArray(points)) return null;
  const read = points.map((point) => {
    const pair = authoredPointPair(point);
    if (!pair) return null;
    const x = readAuthoredValue(pair[0]);
    const y = readAuthoredValue(pair[1]);
    return x && y ? [x.number, y.number] : null;
  });
  return read.every(Boolean) ? read : null;
};

const twoPointsSourceList = (source = {}) => (Array.isArray(source.points) ? source.points : [source.first, source.second]);

/**
 * Derives the canonical mathematical relationship and key facts from any supported source kind.
 */
export const deriveLinearMultipleRepresentations = (question = {}) => {
  const source = question.source || {};
  const kind = source.kind;
  let canonicalLine = null;

  if (kind === 'standardForm') {
    if (source.equation) {
      canonicalLine = canonicalFromEquationText(source.equation);
    } else if (source.A != null && source.B != null && source.C != null) {
      canonicalLine = canonicalFromStandard(source.A, source.B, source.C);
    }
  } else if (kind === 'slopeIntercept') {
    if (source.equation) {
      canonicalLine = canonicalFromEquationText(source.equation);
    } else if (source.m != null && source.b != null) {
      canonicalLine = canonicalFromSlopeIntercept(source.m, source.b);
    }
  } else if (kind === 'pointSlope') {
    if (source.equation) {
      canonicalLine = canonicalFromEquationText(source.equation);
    } else if (authoredPointPair(source.point) && source.m != null) {
      canonicalLine = canonicalFromPointSlope(readSourcePoints([source.point])?.[0], source.m);
    }
  } else if (kind === 'twoPoints') {
    const points = readSourcePoints(twoPointsSourceList(source));
    if (points && points.length >= 2) {
      canonicalLine = canonicalFromPoints(points[0], points[1]);
    }
  } else if (kind === 'table') {
    const rows = readSourceTableRows(source.rows);
    if (rows && rows.length >= 2) {
      const { m, b } = fitTableLine(rows);
      if (Number.isFinite(m) && Number.isFinite(b)) {
        canonicalLine = canonicalFromSlopeIntercept(m, b);
      }
    }
  } else if (kind === 'graph') {
    const points = readSourcePoints(source.points);
    if (points && points.length >= 2) {
      canonicalLine = canonicalFromPoints(points[0], points[1]);
    } else if (source.line) {
      canonicalLine = canonicalFromSlopeIntercept(source.line.m, source.line.b);
    }
  } else if (kind === 'scenario') {
    if (source.m != null && source.b != null) {
      canonicalLine = canonicalFromSlopeIntercept(source.m, source.b);
    } else if (source.rate != null && source.initialValue != null) {
      canonicalLine = canonicalFromSlopeIntercept(source.rate, source.initialValue);
    } else if (source.equation) {
      canonicalLine = canonicalFromEquationText(source.equation);
    }
  }

  if (!canonicalLine || canonicalLine.vertical) {
    return {
      isValid: false,
      error: canonicalLine?.vertical ? 'Vertical lines are not supported in this mode.' : 'Could not derive canonical line from source.',
    };
  }

  const slopeNumber = fractionToNumber(canonicalLine.m);
  const yInterceptNumber = fractionToNumber(canonicalLine.b);
  const hasSlope = Math.abs(slopeNumber) > 1e-9;
  const zeroNumber = hasSlope ? -yInterceptNumber / slopeNumber : null;
  const zeroFraction = hasSlope ? negFraction(divFractions(canonicalLine.b, canonicalLine.m)) : null;

  const standard = normalizeStandardCoefficients(canonicalLine);
  const standardEquation = standard ? formatNormalizedStandard(standard) : null;
  const slopeInterceptEquation = formatSlopeIntercept(canonicalLine);

  const sourcePoints = kind === 'twoPoints'
    ? readSourcePoints(twoPointsSourceList(source))
    : kind === 'graph'
      ? readSourcePoints(source.points)
      : null;

  let sourcePoint = null;
  if (kind === 'pointSlope') {
    const authoredPoint = source.point != null ? readSourcePoints([source.point])?.[0] : null;
    if (authoredPoint) {
      sourcePoint = authoredPoint;
    } else if (source.equation) {
      const parsed = parsePointSlopeForm(source.equation);
      if (parsed && Array.isArray(parsed.point)) {
        sourcePoint = parsed.point;
      }
    }
  }

  return {
    isValid: true,
    canonicalLine,
    displayLine: { m: slopeNumber, b: yInterceptNumber },
    slopeNumber,
    yInterceptNumber,
    zeroNumber,
    slopeFraction: canonicalLine.m,
    yInterceptFraction: canonicalLine.b,
    zeroFraction,
    xInterceptPoint: zeroNumber != null ? [zeroNumber, 0] : null,
    yInterceptPoint: [0, yInterceptNumber],
    sourcePoints,
    sourcePoint,
    twoPoints: sourcePoints && sourcePoints.length >= 2 ? { point1: sourcePoints[0], point2: sourcePoints[1] } : null,
    standard,
    standardEquation,
    slopeInterceptEquation,
    source,
    context: source?.context || question.context || null,
  };
};

/**
 * Structural and semantic validation for question authoring in linearMultipleRepresentations mode.
 */
export const validateLinearMultipleRepresentationsQuestion = (question = {}) => {
  const errors = [];
  const source = question.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    errors.push('representationBridge in linearMultipleRepresentations mode requires a valid source object.');
    return errors;
  }

  if (!SUPPORTED_SOURCE_KINDS.includes(source.kind)) {
    errors.push(`representationBridge linearMultipleRepresentations source.kind must be one of: ${SUPPORTED_SOURCE_KINDS.join(', ')}.`);
    return errors;
  }

  if (source.kind === 'table') {
    const rawRows = Array.isArray(source.rows) ? source.rows : null;
    if (!rawRows || rawRows.length < 3) {
      errors.push('representationBridge table source requires at least three rows in source.rows.');
      return errors;
    }
    // Cells may be numbers or exact fraction strings ("1/3"); both are shown
    // to the student exactly as authored.
    const rows = readSourceTableRows(rawRows);
    if (!rows) {
      errors.push('representationBridge table source requires finite numerical coordinates in every row.');
      return errors;
    }
    if (new Set(rows.map((row) => Number(row.x.toFixed(9)))).size !== rows.length) {
      errors.push('representationBridge table source requires a different x-value in every row.');
      return errors;
    }
    if (!isCollinear(rows)) {
      errors.push('representationBridge requires a genuinely linear source table (constant rate of change).');
      return errors;
    }
  }

  if (source.kind === 'scenario') {
    // The story IS the given representation. Without it the student is handed
    // a board with nothing to start from.
    if (!String(source.prompt ?? source.text ?? '').trim()) {
      errors.push('representationBridge scenario source requires source.prompt: the situation the student reads.');
      return errors;
    }
  }

  if (source.kind === 'twoPoints') {
    const pts = twoPointsSourceList(source);
    if (!Array.isArray(pts) || pts.length < 2 || !pts[0] || !pts[1]) {
      errors.push('representationBridge twoPoints source requires two valid points.');
      return errors;
    }
    const read = readSourcePoints(pts.slice(0, 2));
    if (!read) {
      errors.push('representationBridge twoPoints source requires finite coordinates.');
      return errors;
    }
    const [p1, p2] = read;
    if (Math.abs(p1[0] - p2[0]) < 1e-9 && Math.abs(p1[1] - p2[1]) < 1e-9) {
      errors.push('representationBridge twoPoints source requires distinct points.');
      return errors;
    }
  }

  if (source.kind === 'graph') {
    const hasPoints = Array.isArray(source.points);
    const hasLine = Boolean(source.line && typeof source.line === 'object');
    if (!hasPoints && !hasLine) {
      errors.push('representationBridge graph source requires source.points or source.line.');
      return errors;
    }

    let lineFromPointsResult = null;
    if (hasPoints) {
      if (source.points.length < 2) {
        errors.push('representationBridge graph source requires at least two points.');
        return errors;
      }
      const graphPoints = readSourcePoints(source.points);
      if (!graphPoints) {
        errors.push('representationBridge graph source points require finite coordinates.');
        return errors;
      }
      const [p1, p2] = graphPoints;
      if (Math.abs(p1[0] - p2[0]) < 1e-9 && Math.abs(p1[1] - p2[1]) < 1e-9) {
        errors.push('representationBridge graph source requires at least two distinct points.');
        return errors;
      }
      lineFromPointsResult = canonicalFromPoints(p1, p2);
      if (!lineFromPointsResult || lineFromPointsResult.vertical) {
        errors.push('representationBridge graph source requires a non-vertical line.');
        return errors;
      }
      const allCollinear = graphPoints.every((pt) => pointOnCanonicalLine(lineFromPointsResult, pt, 1e-4));
      if (!allCollinear) {
        errors.push('representationBridge graph source points must all lie on the same line.');
        return errors;
      }
    }

    if (hasLine) {
      const { m, b } = source.line;
      if (m == null || b == null || !Number.isFinite(Number(m)) || !Number.isFinite(Number(b))) {
        errors.push('representationBridge graph source requires finite m and b in source.line.');
        return errors;
      }
      const lineFromLine = canonicalFromSlopeIntercept(Number(m), Number(b));
      if (hasPoints && lineFromPointsResult) {
        if (!linesEquivalent(lineFromPointsResult, lineFromLine, 1e-4)) {
          errors.push('representationBridge graph source points and source.line must describe the same relationship.');
          return errors;
        }
      }
    }
  }

  const derived = deriveLinearMultipleRepresentations(question);
  if (!derived.isValid) {
    errors.push(derived.error || 'Failed to derive canonical relationship from source.');
    return errors;
  }

  if (Math.abs(derived.slopeNumber) <= 1e-9) {
    errors.push('representationBridge linearMultipleRepresentations mode requires a nonzero slope so that all forms and intercepts are well-defined.');
    return errors;
  }

  if (question.requiredCards != null) {
    const known = [...BOARD_CARD_IDS, ...Object.keys(DEFAULT_BOARD_CATEGORIES)];
    if (!Array.isArray(question.requiredCards) || !question.requiredCards.length) {
      errors.push('representationBridge requiredCards must be a non-empty list of board cards.');
      return errors;
    }
    const unknown = question.requiredCards.filter((id) => !known.includes(String(id)));
    if (unknown.length) {
      errors.push(`representationBridge requiredCards has unknown card(s): ${unknown.join(', ')}. Use: ${known.join(', ')}.`);
      return errors;
    }
    if (!resolveRequiredCards(question).length) {
      errors.push('representationBridge requiredCards lists only the GIVEN representation, so the student would have nothing to build.');
      return errors;
    }
  }

  if (question.snapStep != null) {
    const snap = parseNumericOrFraction(question.snapStep);
    if (!snap || !Number.isFinite(snap.number) || snap.number <= 0) {
      errors.push('representationBridge snapStep must be a positive number or fraction when supplied.');
      return errors;
    }
  }


  if (question.graphBounds != null) {
    const bounds = question.graphBounds;
    const finite = bounds && typeof bounds === 'object' && [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax].every((v) => Number.isFinite(Number(v)));
    if (!finite) {
      errors.push('representationBridge graphBounds must supply finite xMin, xMax, yMin, and yMax.');
    } else if (Number(bounds.xMin) >= Number(bounds.xMax) || Number(bounds.yMin) >= Number(bounds.yMax)) {
      errors.push('representationBridge graphBounds must have xMin < xMax and yMin < yMax.');
    } else {
      const xMin = Number(bounds.xMin);
      const xMax = Number(bounds.xMax);
      const yMin = Number(bounds.yMin);
      const yMax = Number(bounds.yMax);

      // Check required x-intercept anchor
      if (derived.zeroNumber != null && Number.isFinite(derived.zeroNumber)) {
        if (derived.zeroNumber < xMin || derived.zeroNumber > xMax || 0 < yMin || 0 > yMax) {
          errors.push('representationBridge graphBounds does not include the derived x-intercept the graph stage requires the student to plot.');
        }
      }

      // Check required y-intercept anchor
      if (derived.yInterceptNumber != null && Number.isFinite(derived.yInterceptNumber)) {
        if (0 < xMin || 0 > xMax || derived.yInterceptNumber < yMin || derived.yInterceptNumber > yMax) {
          errors.push('representationBridge graphBounds does not include the derived y-intercept.');
        }
      }

      // Check source point-slope anchor if authored (either in source.point or source.equation)
      const ptSlopeAnchor = derived.sourcePoint;
      if (source.kind === 'pointSlope' && Array.isArray(ptSlopeAnchor)) {
        const [px, py] = ptSlopeAnchor.map(Number);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          if (px < xMin || px > xMax || py < yMin || py > yMax) {
            errors.push('representationBridge graphBounds does not include the given point-slope point.');
          }
        }
      }

      // Check source points if twoPoints or graph
      if ((source.kind === 'twoPoints' || source.kind === 'graph') && Array.isArray(derived.sourcePoints)) {
        const outside = derived.sourcePoints.some(([px, py]) => px < xMin || px > xMax || py < yMin || py > yMax);
        if (outside) errors.push('representationBridge graphBounds does not include the given source points.');
      }
    }
  }

  return errors;
};

/**
 * Resolves safe graph bounds that include all required mathematical anchors (x-intercept,
 * y-intercept, given points) with reasonable padding and clear scaling.
 */
export const resolveLinearMultipleRepresentationsGraphBounds = (questionData = {}, canonicalFacts = {}) => {
  const authored = questionData.graphBounds;
  const finite = authored && typeof authored === 'object' && [authored.xMin, authored.xMax, authored.yMin, authored.yMax].every((v) => Number.isFinite(Number(v)));
  if (finite && Number(authored.xMin) < Number(authored.xMax) && Number(authored.yMin) < Number(authored.yMax)) {
    return {
      xMin: Number(authored.xMin),
      xMax: Number(authored.xMax),
      yMin: Number(authored.yMin),
      yMax: Number(authored.yMax),
    };
  }

  const xs = [0];
  const ys = [0];

  if (canonicalFacts.zeroNumber != null && Number.isFinite(canonicalFacts.zeroNumber)) {
    xs.push(canonicalFacts.zeroNumber);
  }
  if (canonicalFacts.yInterceptNumber != null && Number.isFinite(canonicalFacts.yInterceptNumber)) {
    ys.push(canonicalFacts.yInterceptNumber);
  }

  const source = questionData.source || {};
  (readSourcePoints(source.points) || []).forEach(([x, y]) => {
    xs.push(x);
    ys.push(y);
  });
  const ptSlopeAnchor = canonicalFacts.sourcePoint || readSourcePoints(source.point != null ? [source.point] : [])?.[0];
  if (Array.isArray(ptSlopeAnchor) && Number.isFinite(Number(ptSlopeAnchor[0])) && Number.isFinite(Number(ptSlopeAnchor[1]))) {
    xs.push(Number(ptSlopeAnchor[0]));
    ys.push(Number(ptSlopeAnchor[1]));
  }
  (readSourceTableRows(source.rows) || []).forEach((row) => {
    xs.push(row.x);
    ys.push(row.y);
  });

  const xMinRaw = Math.min(...xs, -5);
  const xMaxRaw = Math.max(...xs, 5);
  const yMinRaw = Math.min(...ys, -5);
  const yMaxRaw = Math.max(...ys, 5);

  const xSpan = xMaxRaw - xMinRaw;
  const ySpan = yMaxRaw - yMinRaw;

  const xPad = Math.max(2, Math.ceil(xSpan * 0.25));
  const yPad = Math.max(2, Math.ceil(ySpan * 0.25));

  let xMin = Math.floor(xMinRaw - xPad);
  let xMax = Math.ceil(xMaxRaw + xPad);
  let yMin = Math.floor(yMinRaw - yPad);
  let yMax = Math.ceil(yMaxRaw + yPad);

  if (xMin >= -8 && xMax <= 8 && yMin >= -8 && yMax <= 8) {
    return { xMin: -8, xMax: 8, yMin: -8, yMax: 8 };
  }

  const roundTo5 = (val, roundUp) => {
    if (roundUp) return Math.ceil(val / 5) * 5;
    return Math.floor(val / 5) * 5;
  };

  if (xSpan > 15 || ySpan > 15) {
    xMin = roundTo5(xMin, false);
    xMax = roundTo5(xMax, true);
    yMin = roundTo5(yMin, false);
    yMax = roundTo5(yMax, true);
  }

  return { xMin, xMax, yMin, yMax };
};

/**
 * Expands base graph bounds to comfortably include a point-slope anchor point
 * and room to plot a second slope point.
 */
export const expandGraphBoundsForAnchor = (baseBounds, anchorPoint, canonicalFacts = null) => {
  if (!baseBounds || !Array.isArray(anchorPoint)) return baseBounds;
  const [px, py] = anchorPoint.map(Number);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return baseBounds;

  const { xMin, xMax, yMin, yMax } = baseBounds;

  let dx = 1;
  let dy = 1;
  if (canonicalFacts?.canonicalLine?.m && typeof canonicalFacts.canonicalLine.m === 'object') {
    dx = Math.abs(Number(canonicalFacts.canonicalLine.m.d)) || 1;
    dy = Math.abs(Number(canonicalFacts.canonicalLine.m.n)) || 1;
  } else if (canonicalFacts?.slopeNumber != null) {
    dy = Math.abs(canonicalFacts.slopeNumber);
    dx = 1;
  }
  const padX = Math.max(3, dx + 2, Math.ceil(Math.abs(px) * 0.05));
  const padY = Math.max(3, dy + 2, Math.ceil(Math.abs(py) * 0.05));

  const targetXMin = Math.min(xMin, px - padX);
  const targetXMax = Math.max(xMax, px + padX);
  const targetYMin = Math.min(yMin, py - padY);
  const targetYMax = Math.max(yMax, py + padY);

  if (targetXMin === xMin && targetXMax === xMax && targetYMin === yMin && targetYMax === yMax) {
    return baseBounds;
  }

  const roundBound = (val, roundUp, step = 5) => {
    if (roundUp) return Math.ceil(val / step) * step;
    return Math.floor(val / step) * step;
  };

  const xSpan = targetXMax - targetXMin;
  const ySpan = targetYMax - targetYMin;
  const step = Math.max(5, Math.pow(10, Math.floor(Math.log10(Math.max(xSpan, ySpan) / 10))));

  return {
    xMin: roundBound(targetXMin, false, step),
    xMax: roundBound(targetXMax, true, step),
    yMin: roundBound(targetYMin, false, step),
    yMax: roundBound(targetYMax, true, step),
  };
};


/**
 * Validates Standard Form equation entry:
 * - Structural check: isLinearStandardFormEquation({ left, right }, ['x', 'y'])
 * - Integer coefficients A, B, C with gcd === 1 and A > 0 (or A === 0 and B > 0)
 * - Equivalence with canonical line
 * - Explicitly rejects y = mx + b
 */
export const validateStandardFormEntry = (equationText, canonicalFacts) => {
  let str = String(equationText || '').trim();
  if (!str) return { isCorrect: false, error: 'Enter an equation in standard form.' };
  if (str.includes('\\')) str = latexToExpression(str);

  const parts = str.split('=');
  if (parts.length !== 2) return { isCorrect: false, error: 'Equation must contain exactly one = sign.' };

  const left = parts[0].trim();
  const right = parts[1].trim();

  // Structural check: Ax + By = C
  const standardStructural = isLinearStandardFormEquation({ left, right }, ['x', 'y']);
  if (!standardStructural) {
    return {
      isCorrect: false,
      error: 'Standard form is Ax + By = C: the x-term and y-term on the left, one number on the right.',
    };
  }

  const coeffs = standardCoefficientsFromEquationText(str);
  if (!coeffs) {
    return { isCorrect: false, error: 'Write a linear equation in x and y, such as Ax + By = C.' };
  }

  const { A, B, C } = coeffs;
  const isIntegerCoeffs = [A, B, C].every((v) => Math.abs(v - Math.round(v)) < 1e-4);
  if (!isIntegerCoeffs) {
    return {
      isCorrect: false,
      error: 'Standard form uses whole-number coefficients. Multiply every term to clear the fractions.',
    };
  }

  const intA = Math.round(A);
  const intB = Math.round(B);
  const intC = Math.round(C);

  const divisor = gcd(gcd(Math.abs(intA), Math.abs(intB)), Math.abs(intC));
  if (divisor > 1) {
    return {
      isCorrect: false,
      error: `Every term shares a common factor of ${divisor}. Divide every term by ${divisor}.`,
    };
  }

  if (intA < 0 || (intA === 0 && intB < 0)) {
    return {
      isCorrect: false,
      error: 'Standard form needs a positive leading coefficient (the number in front of x). Multiply every term by −1.',
    };
  }

  const eqLine = canonicalFromStandard(intA, intB, intC);
  if (!eqLine || !linesEquivalent(eqLine, canonicalFacts.canonicalLine)) {
    return {
      isCorrect: false,
      error: 'This is standard form, but it describes a different line. Recheck your rearranging.',
    };
  }

  return { isCorrect: true, standard: { A: intA, B: intB, C: intC } };
};

/**
 * Validates Slope-Intercept Form equation entry:
 * - Structural check: y = mx + b
 * - Equivalence with canonical line
 */
export const validateSlopeInterceptEntry = (equationText, canonicalFacts) => {
  let str = String(equationText || '').trim();
  if (!str) return { isCorrect: false, error: 'Enter an equation in slope-intercept form.' };
  if (str.includes('\\')) str = latexToExpression(str);

  const parts = str.split('=');
  if (parts.length !== 2) return { isCorrect: false, error: 'Equation must contain exactly one = sign.' };

  const left = parts[0].trim();
  const right = parts[1].trim();

  let leftIsY = false;
  try {
    const leftNode = parse(left);
    leftIsY = leftNode.isSymbolNode && leftNode.name === 'y';
  } catch {
    leftIsY = false;
  }

  if (!leftIsY) {
    return { isCorrect: false, error: 'Slope-intercept form has y by itself on the left: y = mx + b.' };
  }

  let rightValid = false;
  try {
    rightValid = isSimplifiedSlopeInterceptExpression(latexToExpression(right), 'x');
  } catch {
    rightValid = false;
  }

  if (!rightValid) {
    return { isCorrect: false, error: 'Simplify the right side of your slope-intercept equation to mx + b.' };
  }

  const eqLine = canonicalFromEquationText(str);
  if (!eqLine || !linesEquivalent(eqLine, canonicalFacts.canonicalLine)) {
    return { isCorrect: false, error: 'This is slope-intercept form, but it describes a different line. Check your slope and y-intercept.' };
  }

  return { isCorrect: true };
};

/**
 * Validates Point-Slope Form equation entry:
 * - Structurally y - y1 = m(x - x1)
 * - Slope m matches canonical line
 * - Point (x1, y1) lies on canonical line
 * - Equivalence with canonical line
 * - Accepts ANY valid point on the line!
 */
export const validatePointSlopeEntry = (equationText, canonicalFacts) => {
  let str = String(equationText || '').trim();
  if (!str) return { isCorrect: false, error: 'Enter an equation in point-slope form.' };
  if (str.includes('\\')) str = latexToExpression(str);

  const parsed = parsePointSlopeForm(str);
  if (!parsed) {
    return {
      isCorrect: false,
      error: 'Write it as y − y₁ = m(x − x₁), using one point (x₁, y₁) on the line.',
    };
  }

  const { m, x1, y1 } = parsed;

  if (!nearlyEqual(m, canonicalFacts.slopeNumber, 1e-4)) {
    return {
      isCorrect: false,
      error: `Your equation uses slope ${formatCoordinateText(m)}. Check the slope of this line.`,
    };
  }

  const pointOnLine = pointOnCanonicalLine(canonicalFacts.canonicalLine, [x1, y1]);
  if (!pointOnLine) {
    return {
      isCorrect: false,
      error: `The point (${formatCoordinateText(x1)}, ${formatCoordinateText(y1)}) does not lie on this line. Choose a point that makes the equation true.`,
    };
  }

  const eqLine = canonicalFromEquationText(str);
  if (!eqLine || !linesEquivalent(eqLine, canonicalFacts.canonicalLine)) {
    return { isCorrect: false, error: 'This point-slope equation describes a different line. Recheck it.' };
  }

  return { isCorrect: true, point: [x1, y1], m };
};

// -----------------------------------------------------------------------------
// Features & Table Validation
// -----------------------------------------------------------------------------

export const validateSlopeEntry = (slopeInput, canonicalFacts) => {
  const parsed = parseNumericOrFraction(slopeInput);
  if (!parsed) return { isCorrect: false, error: 'Enter a valid number or fraction for slope.' };
  const matches = matchesNumericAnswer(parsed.number, canonicalFacts.slopeNumber, 1e-4);
  return {
    isCorrect: matches,
    value: parsed.number,
    fraction: parsed.fraction,
    error: matches ? null : 'Not this line\'s slope. Compare the rise to the run between two points.',
  };
};

export const parseOrderedPair = (input) => {
  if (Array.isArray(input) && input.length === 2) {
    const x = parseNumericOrFraction(input[0])?.number;
    const y = parseNumericOrFraction(input[1])?.number;
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
    return null;
  }
  if (input && typeof input === 'object' && input.x != null && input.y != null) {
    const x = parseNumericOrFraction(input.x)?.number;
    const y = parseNumericOrFraction(input.y)?.number;
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
    return null;
  }
  let str = String(input || '').trim();
  str = str.replace(/\\left|\\right/g, '').trim();
  if ((str.startsWith('(') && str.endsWith(')')) || (str.startsWith('[') && str.endsWith(']')) || (str.startsWith('{') && str.endsWith('}'))) {
    str = str.slice(1, -1).trim();
  }
  const parts = str.split(',');
  if (parts.length === 2) {
    const x = parseNumericOrFraction(parts[0].trim())?.number;
    const y = parseNumericOrFraction(parts[1].trim())?.number;
    if (Number.isFinite(x) && Number.isFinite(y)) return [x, y];
  }
  return null;
};

export const validateXInterceptEntry = (input, canonicalFacts) => {
  const pt = parseOrderedPair(input);
  if (!pt) return { isCorrect: false, error: 'Write the x-intercept as an ordered pair (x, 0).' };
  const [x, y] = pt;
  if (Math.abs(y) > 1e-4) {
    return { isCorrect: false, error: 'An x-intercept is on the x-axis, so its y-coordinate is 0.' };
  }
  if (!nearlyEqual(x, canonicalFacts.zeroNumber, 1e-4)) {
    return { isCorrect: false, error: 'That point is on the x-axis, but it is not where this line crosses it.' };
  }
  return { isCorrect: true, point: pt };
};

export const validateYInterceptEntry = (input, canonicalFacts) => {
  const pt = parseOrderedPair(input);
  if (!pt) return { isCorrect: false, error: 'Write the y-intercept as an ordered pair (0, y).' };
  const [x, y] = pt;
  if (Math.abs(x) > 1e-4) {
    return { isCorrect: false, error: 'A y-intercept is on the y-axis, so its x-coordinate is 0.' };
  }
  if (!nearlyEqual(y, canonicalFacts.yInterceptNumber, 1e-4)) {
    return { isCorrect: false, error: 'That point is on the y-axis, but it is not where this line crosses it.' };
  }
  return { isCorrect: true, point: pt };
};

export const validateTwoPointsEntry = (point1Input, point2Input, canonicalFacts) => {
  const p1 = parseOrderedPair(point1Input);
  const p2 = parseOrderedPair(point2Input);
  if (!p1 || !p2) {
    return { isCorrect: false, error: 'Write both points as ordered pairs (x, y).' };
  }
  if (nearlyEqual(p1[0], p2[0], 1e-4) && nearlyEqual(p1[1], p2[1], 1e-4)) {
    return { isCorrect: false, error: 'Use two different points.', points: [p1, p2] };
  }
  if (!pointOnCanonicalLine(canonicalFacts.canonicalLine, p1)) {
    return { isCorrect: false, error: `The point (${formatCoordinateText(p1[0])}, ${formatCoordinateText(p1[1])}) is not on this line.`, points: [p1, p2] };
  }
  if (!pointOnCanonicalLine(canonicalFacts.canonicalLine, p2)) {
    return { isCorrect: false, error: `The point (${formatCoordinateText(p2[0])}, ${formatCoordinateText(p2[1])}) is not on this line.`, points: [p1, p2] };
  }
  return { isCorrect: true, points: [p1, p2] };
};

export const validateTableEntry = (rows = [], canonicalFacts, requiredCount = 4) => {
  if (!Array.isArray(rows) || rows.length < requiredCount) {
    return {
      isCorrect: false,
      error: `Fill in at least ${requiredCount} complete rows.`,
    };
  }

  const parsedRows = rows.map((r, idx) => {
    const xParsed = parseNumericOrFraction(r?.x);
    const yParsed = parseNumericOrFraction(r?.y);
    return {
      index: idx,
      x: xParsed?.number,
      y: yParsed?.number,
      valid: xParsed != null && yParsed != null,
    };
  });

  if (parsedRows.some((r) => !r.valid)) {
    return { isCorrect: false, error: 'Every x and y box needs a number or a fraction.' };
  }

  // Distinct x values
  const xVals = parsedRows.map((r) => Number(r.x.toFixed(6)));
  if (new Set(xVals).size !== xVals.length) {
    return { isCorrect: false, error: 'Use a different x-value in every row.' };
  }

  // Every row must lie on the line
  const offLine = parsedRows.find((r) => !pointOnCanonicalLine(canonicalFacts.canonicalLine, [r.x, r.y]));
  if (offLine) {
    return {
      isCorrect: false,
      error: `The row (${formatCoordinateText(offLine.x)}, ${formatCoordinateText(offLine.y)}) is not on this line.`,
    };
  }

  return { isCorrect: true, rows: parsedRows };
};

// -----------------------------------------------------------------------------
// Graph Constructions (Three Independent Graphs)
// -----------------------------------------------------------------------------

export const evaluateGraph1Intercepts = (points = [], canonicalFacts, tolerance = 0.12) => {
  const questionSpec = {
    mode: 'standardForm',
    standard: canonicalFacts.standard,
    constructionPolicy: { strategy: 'formAware', requiredAnchor: 'intercepts', minimumPoints: 2 },
  };
  const target = targetLineFromQuestion(questionSpec);
  return evaluateConstruction(points, questionSpec, target, tolerance);
};

export const evaluateGraph2SlopeIntercept = (points = [], canonicalFacts, tolerance = 0.12) => {
  const questionSpec = {
    mode: 'slopeIntercept',
    line: { m: canonicalFacts.slopeNumber, b: canonicalFacts.yInterceptNumber },
    constructionPolicy: { strategy: 'formAware', requiredAnchor: 'yIntercept', minimumPoints: 2 },
  };
  const target = targetLineFromQuestion(questionSpec);
  return evaluateConstruction(points, questionSpec, target, tolerance);
};

/**
 * Semantic validator for contextual interpretations (slope/intercept meaning, quantities, domain).
 * Supports choice banks, acceptedAnswers arrays, or case/whitespace-normalized string matching.
 */
export const validateContextField = (studentValue, expected) => {
  const normalize = (s) => String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:]+$/, '')
    .replace(/\s+/g, ' ');

  const student = normalize(studentValue);
  if (!student) return { valid: false, message: 'Please provide a response.' };

  const allowed = [];
  if (Array.isArray(expected)) {
    allowed.push(...expected);
  } else if (expected && typeof expected === 'object') {
    if (Array.isArray(expected.acceptedAnswers)) allowed.push(...expected.acceptedAnswers);
    if (Array.isArray(expected.choices)) allowed.push(...expected.choices.filter((c) => c === expected.value || c === expected.answer));
    if (expected.value != null) allowed.push(expected.value);
    if (expected.answer != null) allowed.push(expected.answer);
  } else if (typeof expected === 'string') {
    allowed.push(expected);
  }

  const match = allowed.some((ans) => normalize(ans) === student);
  return {
    valid: match,
    message: match ? 'Correct interpretation' : 'Review your interpretation of this quantity.',
  };
};

export const parseInequalityDomain = (str) => {
  if (!str && str !== 0) return null;
  let s = String(str).trim();
  if (s.includes('\\')) {
    s = s.replace(/\\le|\\leq/g, '<=')
      .replace(/\\ge|\\geq/g, '>=')
      .replace(/\\left|\\right/g, '')
      .replace(/\\text\{[^}]*\}/g, '')
      .replace(/[{}]/g, '');
  }
  s = s.replace(/≤/g, '<=').replace(/≥/g, '>=');

  const intervalMatch = s.match(/^([\[\(])\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*([\]\)])$/);
  if (intervalMatch) {
    const min = Number(intervalMatch[2]);
    const max = Number(intervalMatch[3]);
    const minInclusive = intervalMatch[1] === '[';
    const maxInclusive = intervalMatch[4] === ']';
    if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
      return { min, max, minInclusive, maxInclusive };
    }
  }

  const ineqMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*(<=|<)\s*([a-zA-Z])\s*(<=|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (ineqMatch) {
    const min = Number(ineqMatch[1]);
    const minInclusive = ineqMatch[2] === '<=';
    const variable = ineqMatch[3];
    const maxInclusive = ineqMatch[4] === '<=';
    const max = Number(ineqMatch[5]);
    if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
      return { min, max, minInclusive, maxInclusive, variable };
    }
  }

  const revMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*(>=|>)\s*([a-zA-Z])\s*(>=|>)\s*(-?\d+(?:\.\d+)?)$/);
  if (revMatch) {
    const max = Number(revMatch[1]);
    const maxInclusive = revMatch[2] === '>=';
    const variable = revMatch[3];
    const minInclusive = revMatch[4] === '>=';
    const min = Number(revMatch[5]);
    if (Number.isFinite(min) && Number.isFinite(max) && min < max) {
      return { min, max, minInclusive, maxInclusive, variable };
    }
  }

  return null;
};

export const validateDomainField = (studentValue, expectedDomain) => {
  if (studentValue == null || studentValue === '') {
    return { isCorrect: false, error: 'Enter the reasonable domain.' };
  }

  // 1. If expected is an array [min, max]
  if (Array.isArray(expectedDomain) && expectedDomain.length === 2) {
    const [expMin, expMax] = expectedDomain.map(Number);
    if (Array.isArray(studentValue) && studentValue.length === 2) {
      const match = nearlyEqual(studentValue[0], expMin, 1e-4) && nearlyEqual(studentValue[1], expMax, 1e-4);
      return { isCorrect: match, error: match ? null : 'Domain bounds do not match the scenario.' };
    }
    const parsed = parseInequalityDomain(studentValue);
    if (parsed) {
      const boundsMatch = nearlyEqual(parsed.min, expMin, 1e-4) && nearlyEqual(parsed.max, expMax, 1e-4);
      if (!boundsMatch) {
        return { isCorrect: false, error: 'Domain bounds do not match the scenario.' };
      }
      if (!parsed.minInclusive || !parsed.maxInclusive) {
        return { isCorrect: false, error: 'Domain endpoint inclusivity does not match the scenario.' };
      }
      return { isCorrect: true, error: null };
    }
    const norm = String(studentValue).replace(/[\s()]/g, '');
    if (norm === `${expMin}<=x<=${expMax}` || norm === `[${expMin},${expMax}]`) {
      return { isCorrect: true, error: null };
    }
    return { isCorrect: false, error: 'Enter domain as an inequality, e.g. 0 ≤ x ≤ 9.' };
  }

  // 2. If expected is a choice bank or object with choices / acceptedAnswers
  if (expectedDomain && typeof expectedDomain === 'object') {
    const valRes = validateContextField(studentValue, expectedDomain);
    if (valRes.valid) return { isCorrect: true, error: null };

    if (expectedDomain.min != null && expectedDomain.max != null) {
      const parsed = parseInequalityDomain(studentValue);
      if (parsed) {
        const expMinInc = expectedDomain.minInclusive ?? true;
        const expMaxInc = expectedDomain.maxInclusive ?? true;
        const boundsMatch = nearlyEqual(parsed.min, expectedDomain.min, 1e-4) && nearlyEqual(parsed.max, expectedDomain.max, 1e-4);
        if (!boundsMatch) {
          return { isCorrect: false, error: 'Domain bounds do not match the scenario.' };
        }
        if (parsed.minInclusive !== expMinInc || parsed.maxInclusive !== expMaxInc) {
          return { isCorrect: false, error: 'Domain endpoint inclusivity does not match the scenario.' };
        }
        return { isCorrect: true, error: null };
      }
    }
    return { isCorrect: false, error: valRes.message };
  }

  // 3. If expected is a string
  if (typeof expectedDomain === 'string') {
    const expectedParsed = parseInequalityDomain(expectedDomain);
    const studentParsed = parseInequalityDomain(studentValue);
    if (expectedParsed && studentParsed) {
      const boundsMatch = nearlyEqual(studentParsed.min, expectedParsed.min, 1e-4) && nearlyEqual(studentParsed.max, expectedParsed.max, 1e-4);
      if (!boundsMatch) {
        return { isCorrect: false, error: 'Domain bounds do not match the scenario.' };
      }
      if (studentParsed.minInclusive !== expectedParsed.minInclusive || studentParsed.maxInclusive !== expectedParsed.maxInclusive) {
        return { isCorrect: false, error: 'Domain endpoint inclusivity does not match the scenario.' };
      }
      return { isCorrect: true, error: null };
    }
    const valRes = validateContextField(studentValue, expectedDomain);
    return { isCorrect: valRes.valid, error: valRes.valid ? null : valRes.message };
  }

  return { isCorrect: false, error: 'Unknown domain specification.' };
};

/**
 * The point Graph 3 must start from, decided in ONE place for the board, its
 * Check button and the final score:
 *
 *   given    the question's own point-slope point (authored point or the
 *            point inside the authored equation) — it is part of what was given
 *   student  the point from the student's own point-slope equation, but only
 *            when that point really is on the line. A wrong point would
 *            otherwise make Graph 3 "correct" for a parallel line.
 *   free     no anchor yet: any point on the line may start the construction
 */
export const resolveGraph3Anchor = (question = {}, canonicalFacts = {}, pointSlopeEquation = '') => {
  if (question.source?.kind === 'pointSlope') {
    const given = Array.isArray(canonicalFacts.sourcePoint) ? canonicalFacts.sourcePoint.map(Number) : null;
    if (given && given.every(Number.isFinite)) return { point: given, origin: 'given' };
  }
  const parsed = pointSlopeEquation ? parsePointSlopeForm(String(pointSlopeEquation)) : null;
  if (parsed?.point && canonicalFacts.canonicalLine && pointOnCanonicalLine(canonicalFacts.canonicalLine, parsed.point)) {
    return { point: parsed.point, origin: 'student' };
  }
  return { point: null, origin: 'free', offLinePoint: parsed?.point || null };
};

/*
 * What a student reads after checking a graph. Built from the construction
 * category, so it names WHAT to reconsider — the method's starting point, or
 * the slope step — without plotting anything for them.
 */
const GRAPH_FEEDBACK = {
  graph1: {
    correctLineMissingAnchor: 'Your line is right, but this method uses the intercepts. Plot where the line crosses the x-axis and where it crosses the y-axis.',
    incorrectLine: 'This is not the same line yet. Find where the line crosses each axis and plot those two points.',
  },
  graph2: {
    correctLineMissingAnchor: 'Your line is right, but this method starts at the y-intercept. Plot the y-intercept first.',
    correctAnchorWrongSlope: 'Good start at the y-intercept. Now count the rise and run of the slope to your second point.',
    incorrectLine: 'Start at the y-intercept, then use the slope (rise over run) to find a second point.',
  },
  graph3: {
    correctLineMissingAnchor: 'Your line is right, but this method starts at the point from point-slope form.',
    correctAnchorWrongSlope: 'Good start at your point. Now use the slope (rise over run) to step to a second point.',
    incorrectLine: 'Plot the point from point-slope form, then use the slope to step to a second point.',
  },
};

export const graphFeedbackMessage = (graphKey, points = [], evaluation = null) => {
  const plotted = (Array.isArray(points) ? points : []).filter((point) => Array.isArray(point));
  if (plotted.length < 2) return plotted.length ? 'Plot one more point.' : 'Plot two points.';
  if (!evaluation || evaluation.isCorrect) return null;
  if (evaluation.category === 'duplicatePoint') return 'Two of your points are in the same place. Plot two different points.';
  const messages = GRAPH_FEEDBACK[graphKey] || {};
  return messages[evaluation.category] || messages.incorrectLine || 'Check your points.';
};

export const evaluateGraph3PointSlope = (points = [], canonicalFacts, studentPoint = null, tolerance = 0.12) => {
  let anchorPoint = studentPoint;
  let isFreeChoice = false;

  // Case C: No anchor point was passed (student graphing before point-slope equation authored).
  // Find any plotted point that is on the canonical line.
  if (!anchorPoint && Array.isArray(points) && points.length > 0) {
    const firstOnLine = points.find((pt) => Array.isArray(pt) && pt.length === 2 && pointOnCanonicalLine(canonicalFacts.canonicalLine, pt, tolerance * 1.5));
    if (firstOnLine) {
      anchorPoint = firstOnLine;
      isFreeChoice = true;
    }
  }

  if (!anchorPoint) {
    anchorPoint = canonicalFacts.xInterceptPoint || [0, canonicalFacts.yInterceptNumber];
  }

  const questionSpec = {
    mode: 'pointSlope',
    point: anchorPoint,
    slope: canonicalFacts.slopeNumber,
    constructionPolicy: { strategy: 'formAware', requiredAnchor: 'givenPoint', minimumPoints: 2 },
  };
  const target = targetLineFromQuestion(questionSpec);
  const evaluation = evaluateConstruction(points, questionSpec, target, tolerance);
  return {
    ...evaluation,
    anchorPoint,
    isFreeChoice,
  };
};

// -----------------------------------------------------------------------------
// Cross-Representation Consistency & Full Board Scoring
// -----------------------------------------------------------------------------

export const checkCrossRepresentationConsistency = (studentRepresentations = {}, canonicalFacts) => {
  const completedLines = [];

  if (studentRepresentations.standardFormEquation) {
    let eq = String(studentRepresentations.standardFormEquation).trim();
    if (eq.includes('\\')) eq = latexToExpression(eq);
    const l = canonicalFromEquationText(eq);
    if (l) completedLines.push({ name: 'Standard Form', line: l });
  }

  if (studentRepresentations.slopeInterceptEquation) {
    let eq = String(studentRepresentations.slopeInterceptEquation).trim();
    if (eq.includes('\\')) eq = latexToExpression(eq);
    const l = canonicalFromEquationText(eq);
    if (l) completedLines.push({ name: 'Slope-Intercept Form', line: l });
  }

  if (studentRepresentations.pointSlopeEquation) {
    let eq = String(studentRepresentations.pointSlopeEquation).trim();
    if (eq.includes('\\')) eq = latexToExpression(eq);
    const l = canonicalFromEquationText(eq);
    if (l) completedLines.push({ name: 'Point-Slope Form', line: l });
  }

  if (Array.isArray(studentRepresentations.tableRows) && studentRepresentations.tableRows.length >= 2) {
    const validRows = studentRepresentations.tableRows
      .map((r) => {
        const xN = parseNumericOrFraction(r?.x)?.number;
        const yN = parseNumericOrFraction(r?.y)?.number;
        return (Number.isFinite(xN) && Number.isFinite(yN)) ? { x: xN, y: yN } : null;
      })
      .filter(Boolean);
    if (validRows.length >= 2 && isCollinear(validRows)) {
      const { m, b } = fitTableLine(validRows);
      if (Number.isFinite(m) && Number.isFinite(b)) {
        completedLines.push({ name: 'Table', line: canonicalFromSlopeIntercept(m, b) });
      }
    }
  }

  const p1 = studentRepresentations.twoPoints?.[0] || parseOrderedPair(studentRepresentations.featurePoint1);
  const p2 = studentRepresentations.twoPoints?.[1] || parseOrderedPair(studentRepresentations.featurePoint2);
  if (p1 && p2 && !(nearlyEqual(p1[0], p2[0], 1e-4) && nearlyEqual(p1[1], p2[1], 1e-4))) {
    const l = canonicalFromPoints(p1, p2);
    if (l) completedLines.push({ name: 'Two Points', line: l });
  }

  ['graph1Points', 'graph2Points', 'graph3Points'].forEach((key, idx) => {
    const pts = studentRepresentations[key];
    if (Array.isArray(pts) && pts.length >= 2 && pts[0] && pts[1]) {
      const [ptA, ptB] = pts;
      if (Number.isFinite(ptA[0]) && Number.isFinite(ptA[1]) && Number.isFinite(ptB[0]) && Number.isFinite(ptB[1])) {
        if (!(nearlyEqual(ptA[0], ptB[0], 1e-4) && nearlyEqual(ptA[1], ptB[1], 1e-4))) {
          const l = canonicalFromPoints(ptA, ptB);
          if (l) completedLines.push({ name: `Graph ${idx + 1}`, line: l });
        }
      }
    }
  });

  if (completedLines.length < 2) {
    return { isConsistent: true, disagreements: [], outliers: [], completedLineCount: completedLines.length };
  }

  // The parts that disagree with the line most of the student's work
  // describes. One wrong card disagrees with every other card; naming it once
  // is feedback, listing every pair is noise. On a tie nothing is "the
  // majority", so every part is named.
  const groups = [];
  completedLines.forEach((entry) => {
    const group = groups.find((candidate) => linesEquivalent(candidate.line, entry.line));
    if (group) group.names.push(entry.name); else groups.push({ line: entry.line, names: [entry.name] });
  });
  groups.sort((left, right) => right.names.length - left.names.length);
  const majority = groups.length > 1 && groups[0].names.length > groups[1].names.length ? groups[0] : null;
  const outliers = groups.length > 1
    ? completedLines.map((entry) => entry.name).filter((name) => !majority?.names.includes(name))
    : [];

  const disagreements = [];
  for (let i = 0; i < completedLines.length; i += 1) {
    for (let j = i + 1; j < completedLines.length; j += 1) {
      const a = completedLines[i];
      const b = completedLines[j];
      if (!linesEquivalent(a.line, b.line)) {
        const msg = `${a.name} and ${b.name} define different lines.`;
        if (!disagreements.includes(msg)) {
          disagreements.push(msg);
        }
      }
    }
  }

  return {
    isConsistent: disagreements.length === 0,
    disagreements,
    outliers,
    completedLineCount: completedLines.length,
  };
};

export const scoreLinearMultipleRepresentations = (question = {}, response = {}) => {
  const canonicalFacts = deriveLinearMultipleRepresentations(question);
  if (!canonicalFacts.isValid) {
    return { isCorrect: false, score: 0, error: canonicalFacts.error, parts: {} };
  }

  const givenKind = question.source?.kind;
  const required = new Set(resolveRequiredCards(question));
  const tolerance = resolveGraphTolerance(question);
  const parts = {};
  const evidence = {};
  const record = (cardId, result) => {
    const key = CARD_PART_KEYS[cardId];
    parts[key] = Boolean(result.isCorrect);
    evidence[key] = result;
    return result;
  };

  // Only the cards this question asks for are graded. The GIVEN card is never
  // among them (resolveRequiredCards removes it).
  if (required.has('standardForm')) record('standardForm', validateStandardFormEntry(response.standardFormEquation, canonicalFacts));
  if (required.has('slopeIntercept')) record('slopeIntercept', validateSlopeInterceptEntry(response.slopeInterceptEquation, canonicalFacts));
  if (required.has('pointSlope')) record('pointSlope', validatePointSlopeEntry(response.pointSlopeEquation, canonicalFacts));
  if (required.has('slope')) record('slope', validateSlopeEntry(response.featureSlope, canonicalFacts));
  if (required.has('xIntercept')) record('xIntercept', validateXInterceptEntry(response.featureXIntercept, canonicalFacts));
  if (required.has('yIntercept')) record('yIntercept', validateYInterceptEntry(response.featureYIntercept, canonicalFacts));
  const ptsRes = required.has('twoPoints')
    ? record('twoPoints', validateTwoPointsEntry(response.featurePoint1, response.featurePoint2, canonicalFacts))
    : null;
  if (required.has('table')) record('table', validateTableEntry(response.tableRows, canonicalFacts, 4));

  // Three independent constructions.
  if (required.has('graphIntercepts')) record('graphIntercepts', evaluateGraph1Intercepts(response.graph1Points || [], canonicalFacts, tolerance));
  if (required.has('graphSlopeIntercept')) record('graphSlopeIntercept', evaluateGraph2SlopeIntercept(response.graph2Points || [], canonicalFacts, tolerance));
  if (required.has('graphPointSlope')) {
    const anchor = resolveGraph3Anchor(question, canonicalFacts, response.pointSlopeEquation);
    record('graphPointSlope', evaluateGraph3PointSlope(response.graph3Points || [], canonicalFacts, anchor.point, tolerance));
  }

  // Context (if authored / scenario / domain)
  const ctx = question.source?.context || question.context || {};
  if (ctx.independentQuantity != null) {
    const res = validateContextField(response.contextIndependent, ctx.independentQuantity);
    parts.contextIndependent = res.valid;
    evidence.contextIndependent = { isCorrect: res.valid, message: res.message };
  }
  if (ctx.dependentQuantity != null) {
    const res = validateContextField(response.contextDependent, ctx.dependentQuantity);
    parts.contextDependent = res.valid;
    evidence.contextDependent = { isCorrect: res.valid, message: res.message };
  }
  if (ctx.slopeMeaning != null) {
    const res = validateContextField(response.contextSlopeMeaning, ctx.slopeMeaning);
    parts.contextSlopeMeaning = res.valid;
    evidence.contextSlopeMeaning = { isCorrect: res.valid, message: res.message };
  }
  if (ctx.yInterceptMeaning != null) {
    const res = validateContextField(response.contextYInterceptMeaning, ctx.yInterceptMeaning);
    parts.contextYInterceptMeaning = res.valid;
    evidence.contextYInterceptMeaning = { isCorrect: res.valid, message: res.message };
  }
  if (ctx.xInterceptMeaning != null) {
    const res = validateContextField(response.contextXInterceptMeaning, ctx.xInterceptMeaning);
    parts.contextXInterceptMeaning = res.valid;
    evidence.contextXInterceptMeaning = { isCorrect: res.valid, message: res.message };
  }
  if (ctx.domain != null || question.domain != null) {
    const expectedDomain = question.domain || ctx.domain;
    const domainRes = validateDomainField(response.contextDomain, expectedDomain);
    parts.contextDomain = domainRes.isCorrect;
    evidence.contextDomain = domainRes;
  }

  const effectiveTwoPoints = (givenKind === 'twoPoints' && canonicalFacts.twoPoints)
    ? [canonicalFacts.twoPoints.point1, canonicalFacts.twoPoints.point2]
    : ptsRes?.points;

  // Cross-Representation Consistency
  const consistency = checkCrossRepresentationConsistency(
    {
      standardFormEquation: response.standardFormEquation,
      slopeInterceptEquation: response.slopeInterceptEquation,
      pointSlopeEquation: response.pointSlopeEquation,
      tableRows: response.tableRows,
      twoPoints: effectiveTwoPoints,
      featurePoint1: response.featurePoint1,
      featurePoint2: response.featurePoint2,
      graph1Points: response.graph1Points,
      graph2Points: response.graph2Points,
      graph3Points: response.graph3Points,
    },
    canonicalFacts,
  );
  parts.crossRepresentationConsistency = consistency.isConsistent;
  evidence.crossRepresentationConsistency = consistency;

  const requiredParts = Object.values(parts);
  const correctCount = requiredParts.filter(Boolean).length;
  const score = requiredParts.length ? correctCount / requiredParts.length : 0;
  const isCorrect = requiredParts.every(Boolean);

  return {
    isCorrect,
    score,
    parts,
    evidence,
    canonicalFacts,
    givenKind,
  };
};

export const resolveGraphTolerance = (question = {}) => {
  const tolerance = Number(question.tolerance);
  return Number.isFinite(tolerance) && tolerance > 0 ? tolerance : 0.12;
};

// -----------------------------------------------------------------------------
// The GIVEN representation, exactly as authored
// -----------------------------------------------------------------------------

/** An exact fraction as display LaTeX: 3, -2, \frac{1}{2}, -\frac{3}{4}. */
export const fractionLatex = (fraction) => {
  if (!fraction) return '';
  const sign = fraction.n < 0 ? '-' : '';
  const n = Math.abs(fraction.n);
  return fraction.d === 1 ? `${sign}${n}` : `${sign}\\frac{${n}}{${fraction.d}}`;
};

const exactFraction = (value) => {
  if (value && typeof value === 'object' && Number.isFinite(value.n) && Number.isFinite(value.d)) return value;
  const parsed = readAuthoredValue(value);
  return parsed ? parsed.fraction : null;
};

/**
 * An authored table cell or coordinate as display LaTeX, keeping the form the
 * author wrote: "1/3" stays a (stacked) fraction, 0.5 stays 0.5, -9 stays -9.
 */
export const authoredValueLatex = (value) => {
  const text = String(value ?? '').trim().replace(/−/g, '-');
  const fraction = text.match(/^(-?)\s*(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return `${fraction[1]}\\frac{${fraction[2]}}{${fraction[3]}}`;
  return text;
};

// One signed term: "x", "-x", "2x", "-\frac{1}{2}y", " + 3", " - y".
const termLatex = (fraction, variable, first) => {
  if (!fraction || fraction.n === 0) return '';
  const negative = fraction.n < 0;
  const magnitude = { n: Math.abs(fraction.n), d: fraction.d };
  const coefficient = variable && magnitude.n === 1 && magnitude.d === 1 ? '' : fractionLatex(magnitude);
  const body = `${coefficient}${variable}`;
  if (first) return `${negative ? '-' : ''}${body}`;
  return ` ${negative ? '-' : '+'} ${body}`;
};

/** Ax + By = C with the author's own coefficients — 2x - 4y = 12, never the reduced x - 2y = 6. */
export const formatStandardFormLatex = (A, B, C) => {
  const a = exactFraction(A);
  const b = exactFraction(B);
  const c = exactFraction(C);
  if (!a || !b || !c) return '';
  const left = a.n === 0 ? termLatex(b, 'y', true) : `${termLatex(a, 'x', true)}${termLatex(b, 'y', false)}`;
  return `${left} = ${fractionLatex(c)}`;
};

/** y = mx + b from exact values: y = \frac{1}{2}x - 3, y = -x + 4. */
export const formatSlopeInterceptLatex = (m, b) => {
  const slope = exactFraction(m);
  const intercept = exactFraction(b);
  if (!slope || !intercept) return '';
  const right = slope.n === 0
    ? fractionLatex(intercept)
    : `${termLatex(slope, 'x', true)}${termLatex(intercept, '', false)}`;
  return `y = ${right}`;
};

// "- 2", "+ 2", "- 0": the anchor stays visible even when a coordinate is 0,
// because the point is part of what point-slope form tells the student.
const pointOffsetLatex = (value) => {
  const fraction = exactFraction(value);
  if (!fraction) return '';
  return fraction.n < 0 ? `+ ${fractionLatex({ n: -fraction.n, d: fraction.d })}` : `- ${fractionLatex(fraction)}`;
};

/** y - y₁ = m(x - x₁) around THE AUTHORED point: [2, -2], m 0.5 -> y + 2 = \frac{1}{2}(x - 2). */
export const formatPointSlopeLatex = (point, m) => {
  const slope = exactFraction(m);
  if (!Array.isArray(point) || point.length !== 2 || !slope) return '';
  return `y ${pointOffsetLatex(point[1])} = ${fractionLatex(slope)}(x ${pointOffsetLatex(point[0])})`;
};

const GIVEN_LABELS = Object.freeze({
  standardForm: 'Standard form',
  slopeIntercept: 'Slope-intercept form',
  pointSlope: 'Point-slope form',
  twoPoints: 'Two points on the line',
  table: 'Table of values',
  graph: 'Graph',
  scenario: 'Situation',
});

/**
 * What the student is GIVEN, as the author wrote it, in a shape the board can
 * render without doing any mathematics of its own:
 *
 *   equation  { latex }            the authored equation text, or one built
 *                                  from the authored coefficients/point
 *   points    { points: [{latex}] }
 *   table     { rows: [{xLatex, yLatex}] }
 *   graph     { points, line }     numeric, for a read-only plane
 *   scenario  { text }             prose (math inside it may use $…$)
 *
 * Internal normalisation (x - 2y = 6 for 2x - 4y = 12) is for grading only
 * and never reaches this description.
 */
export const describeGivenRepresentation = (question = {}, canonicalFacts = deriveLinearMultipleRepresentations(question)) => {
  const source = question.source || {};
  const kind = source.kind;
  const label = GIVEN_LABELS[kind] || 'Given';
  const authoredEquation = typeof source.equation === 'string' && source.equation.trim() ? source.equation.trim() : null;

  if (kind === 'standardForm') {
    return { kind: 'equation', sourceKind: kind, label, latex: authoredEquation || formatStandardFormLatex(source.A, source.B, source.C) };
  }
  if (kind === 'slopeIntercept') {
    return {
      kind: 'equation',
      sourceKind: kind,
      label,
      latex: authoredEquation || formatSlopeInterceptLatex(canonicalFacts.canonicalLine?.m ?? source.m, canonicalFacts.canonicalLine?.b ?? source.b),
    };
  }
  if (kind === 'pointSlope') {
    return {
      kind: 'equation',
      sourceKind: kind,
      label,
      latex: authoredEquation || formatPointSlopeLatex(authoredPointPair(source.point), source.m),
      point: canonicalFacts.sourcePoint || null,
    };
  }
  if (kind === 'twoPoints') {
    const points = twoPointsSourceList(source).map(authoredPointPair).filter(Boolean).map((point) => {
      const x = authoredValueLatex(point[0]);
      const y = authoredValueLatex(point[1]);
      return { xLatex: x, yLatex: y, latex: `(${x}, ${y})` };
    });
    return { kind: 'points', sourceKind: kind, label, points };
  }
  if (kind === 'table') {
    const rows = (Array.isArray(source.rows) ? source.rows : []).map((row) => {
      const rawX = Array.isArray(row) ? row[0] : row?.x;
      const rawY = Array.isArray(row) ? row[1] : row?.y;
      return { xLatex: authoredValueLatex(rawX), yLatex: authoredValueLatex(rawY) };
    });
    return { kind: 'table', sourceKind: kind, label, rows };
  }
  if (kind === 'graph') {
    return {
      kind: 'graph',
      sourceKind: kind,
      label,
      points: Array.isArray(canonicalFacts.sourcePoints) ? canonicalFacts.sourcePoints : [],
      line: canonicalFacts.displayLine || null,
    };
  }
  if (kind === 'scenario') {
    return { kind: 'scenario', sourceKind: kind, label, text: String(source.prompt ?? source.text ?? '').trim() };
  }
  return { kind: 'unknown', sourceKind: kind, label, latex: '' };
};

// -----------------------------------------------------------------------------
// Card responses: which fields a card's verdict depends on
// -----------------------------------------------------------------------------

const CARD_RESPONSE_FIELDS = Object.freeze({
  standardForm: ['standardFormEquation'],
  slopeIntercept: ['slopeInterceptEquation'],
  pointSlope: ['pointSlopeEquation'],
  slope: ['featureSlope'],
  xIntercept: ['featureXIntercept'],
  yIntercept: ['featureYIntercept'],
  twoPoints: ['featurePoint1', 'featurePoint2'],
  table: ['tableRows'],
  graphIntercepts: ['graph1Points'],
  graphSlopeIntercept: ['graph2Points'],
  // Graph 3 is fingerprinted on its points only. Its verdict is re-judged
  // against the CURRENT anchor, so writing point-slope form after graphing
  // keeps the check when the graph already starts at that point and turns it
  // into guidance when it does not — instead of silently discarding it.
  graphPointSlope: ['graph3Points'],
});

/**
 * A fingerprint of exactly what a card's Check looked at. A stored verdict is
 * shown only while the card still holds that work — change the answer and the
 * old "Correct" disappears instead of vouching for something it never saw.
 */
export const cardResponseKey = (cardId, response = {}) => JSON.stringify(
  (CARD_RESPONSE_FIELDS[cardId] || []).map((field) => response[field] ?? null),
);

const hasText = (value) => String(value ?? '').trim() !== '';

/** Whether the student has put anything into a card — progress, never correctness. */
export const cardHasWork = (cardId, response = {}) => {
  switch (cardId) {
    case 'twoPoints': return hasText(response.featurePoint1) && hasText(response.featurePoint2);
    case 'table': return (Array.isArray(response.tableRows) ? response.tableRows : []).filter((row) => hasText(row?.x) && hasText(row?.y)).length >= 4;
    case 'graphIntercepts': return (response.graph1Points || []).length >= 2;
    case 'graphSlopeIntercept': return (response.graph2Points || []).length >= 2;
    case 'graphPointSlope': return (response.graph3Points || []).length >= 2;
    default: return (CARD_RESPONSE_FIELDS[cardId] || []).every((field) => hasText(response[field]));
  }
};
