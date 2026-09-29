// Pure math and grading helpers for the Free-Order Linear Multiple Representations Board.
//
// Reuses the platform's canonical linear engines:
//   - shared/linearEquations.js
//   - algebraAstEngine.js
//   - stepAlgebra2/rewriteLinearFormMath.js
//   - graphing2/constructionPolicy.js + graphingMath.js
//   - linearTableWorkbench/linearTableWorkbenchMath.js

import { parse } from 'mathjs';
import {
  fitTableLine,
  isCollinear,
  normalizeRows,
} from '../linearTableWorkbench/linearTableWorkbenchMath.js';
import { matchesNumericAnswer, nearlyEqual } from '../shared/toolMath.js';
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
  xInterceptOf,
  yInterceptOf,
} from '../shared/linearEquations.js';
import { isSimplifiedSlopeInterceptForm } from '../stepAlgebra2/rewriteLinearFormMath.js';
import {
  isLinearStandardFormEquation,
  isSimplifiedSlopeInterceptExpression,
  latexToExpression,
} from '../../algebraAstEngine.js';
import { lineFromPoints, targetLineFromQuestion } from '../graphing2/graphingMath.js';
import { evaluateConstruction } from '../graphing2/constructionPolicy.js';

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

const gcdInteger = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
};

const lcmInteger = (a, b) => {
  if (!a || !b) return a || b || 1;
  return Math.abs(Math.round(a * b)) / gcdInteger(a, b);
};

/**
 * Rational-aware snap step resolver:
 * Ensures fractional slopes, intercepts, authored coordinates, or student-chosen
 * point-slope anchors (e.g. 1/2, 3/4) remain accurately graphable on the CoordinatePlane.
 * Uses the LCM of coordinate denominators with a sensible cap.
 */
export const resolveSnapStep = (questionData = {}, canonicalFacts = {}, extraPoints = []) => {
  const explicit = Number(questionData.snapStep);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const m = canonicalFacts.slopeFraction || canonicalFacts.canonicalLine?.m;
  const b = canonicalFacts.yInterceptFraction || canonicalFacts.canonicalLine?.b;
  const zero = canonicalFacts.zeroFraction;

  const denominators = [];
  [m?.d, b?.d, zero?.d].forEach((d) => {
    if (Number.isFinite(d) && d > 1) denominators.push(d);
  });

  if (Array.isArray(extraPoints)) {
    extraPoints.forEach((pt) => {
      if (Array.isArray(pt) && pt.length >= 2) {
        const xF = toFraction(pt[0]);
        const yF = toFraction(pt[1]);
        if (xF && Number.isFinite(xF.d) && xF.d > 1) denominators.push(xF.d);
        if (yF && Number.isFinite(yF.d) && yF.d > 1) denominators.push(yF.d);
      }
    });
  }

  if (canonicalFacts.sourcePoint && Array.isArray(canonicalFacts.sourcePoint)) {
    const xF = toFraction(canonicalFacts.sourcePoint[0]);
    const yF = toFraction(canonicalFacts.sourcePoint[1]);
    if (xF && Number.isFinite(xF.d) && xF.d > 1) denominators.push(xF.d);
    if (yF && Number.isFinite(yF.d) && yF.d > 1) denominators.push(yF.d);
  }

  const validD = denominators.filter((d) => Number.isFinite(d) && d > 1 && d <= 20);
  if (!validD.length) return 1;

  const lcmVal = validD.reduce((acc, d) => lcmInteger(acc, d), 1);
  if (lcmVal <= 20) {
    return Number((1 / lcmVal).toFixed(4));
  }
  return 0.05;
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
    } else if (source.point && source.m != null) {
      canonicalLine = canonicalFromPointSlope(source.point, source.m);
    }
  } else if (kind === 'twoPoints') {
    const points = source.points || [source.first, source.second];
    if (Array.isArray(points) && points.length >= 2) {
      canonicalLine = canonicalFromPoints(points[0], points[1]);
    }
  } else if (kind === 'table') {
    const rows = normalizeRows(source.rows);
    if (rows && rows.length >= 2) {
      const { m, b } = fitTableLine(rows);
      if (Number.isFinite(m) && Number.isFinite(b)) {
        canonicalLine = canonicalFromSlopeIntercept(m, b);
      }
    }
  } else if (kind === 'graph') {
    if (Array.isArray(source.points) && source.points.length >= 2) {
      canonicalLine = canonicalFromPoints(source.points[0], source.points[1]);
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

  const sourcePoints = (kind === 'twoPoints' && Array.isArray(source.points || [source.first, source.second]))
    ? (source.points || [source.first, source.second])
    : (kind === 'graph' && Array.isArray(source.points))
      ? source.points
      : null;

  let sourcePoint = null;
  if (kind === 'pointSlope') {
    if (Array.isArray(source.point) && source.point.length >= 2) {
      sourcePoint = source.point;
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
    const hasInvalidRow = rawRows.some((r) => {
      if (!r || typeof r !== 'object') return true;
      if (r.x === null || r.x === undefined || r.y === null || r.y === undefined) return true;
      if (typeof r.x === 'boolean' || typeof r.y === 'boolean') return true;
      const xStr = String(r.x).trim();
      const yStr = String(r.y).trim();
      if (!xStr || !yStr) return true;
      const xNum = Number(xStr);
      const yNum = Number(yStr);
      return !Number.isFinite(xNum) || !Number.isFinite(yNum);
    });
    if (hasInvalidRow) {
      errors.push('representationBridge table source requires finite numerical coordinates in every row.');
      return errors;
    }
    const rows = normalizeRows(rawRows);
    if (!isCollinear(rows)) {
      errors.push('representationBridge requires a genuinely linear source table (constant rate of change).');
      return errors;
    }
  }

  if (source.kind === 'twoPoints') {
    const pts = source.points || [source.first, source.second];
    if (!Array.isArray(pts) || pts.length < 2 || !pts[0] || !pts[1]) {
      errors.push('representationBridge twoPoints source requires two valid points.');
      return errors;
    }
    const [p1, p2] = pts;
    if (![p1[0], p1[1], p2[0], p2[1]].every((v) => Number.isFinite(Number(v)))) {
      errors.push('representationBridge twoPoints source requires finite coordinates.');
      return errors;
    }
    if (Math.abs(p1[0] - p2[0]) < 1e-9 && Math.abs(p1[1] - p2[1]) < 1e-9) {
      errors.push('representationBridge twoPoints source requires distinct points.');
      return errors;
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
      const ptSlopeAnchor = derived.sourcePoint || source.point;
      if (source.kind === 'pointSlope' && Array.isArray(ptSlopeAnchor)) {
        const [px, py] = ptSlopeAnchor.map(Number);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          if (px < xMin || px > xMax || py < yMin || py > yMax) {
            errors.push('representationBridge graphBounds does not include the given point-slope point.');
          }
        }
      }

      // Check source points if twoPoints or graph
      if ((source.kind === 'twoPoints' || source.kind === 'graph') && Array.isArray(source.points)) {
        for (const pt of source.points) {
          if (Array.isArray(pt) && Number.isFinite(Number(pt[0])) && Number.isFinite(Number(pt[1]))) {
            const px = Number(pt[0]);
            const py = Number(pt[1]);
            if (px < xMin || px > xMax || py < yMin || py > yMax) {
              errors.push('representationBridge graphBounds does not include the given source points.');
              break;
            }
          }
        }
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
  if (Array.isArray(source.points)) {
    source.points.forEach((p) => {
      if (Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))) {
        xs.push(Number(p[0]));
        ys.push(Number(p[1]));
      }
    });
  }
  const ptSlopeAnchor = canonicalFacts.sourcePoint || source.point;
  if (Array.isArray(ptSlopeAnchor) && Number.isFinite(Number(ptSlopeAnchor[0])) && Number.isFinite(Number(ptSlopeAnchor[1]))) {
    xs.push(Number(ptSlopeAnchor[0]));
    ys.push(Number(ptSlopeAnchor[1]));
  }
  if (Array.isArray(source.rows)) {
    source.rows.forEach((r) => {
      if (r && Number.isFinite(Number(r.x)) && Number.isFinite(Number(r.y))) {
        xs.push(Number(r.x));
        ys.push(Number(r.y));
      }
    });
  }

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
      error: 'Write the equation in standard form: Ax + By = C with integer coefficients.',
    };
  }

  const coeffs = standardCoefficientsFromEquationText(str);
  if (!coeffs) {
    return { isCorrect: false, error: 'Could not resolve linear coefficients from equation.' };
  }

  const { A, B, C } = coeffs;
  const isIntegerCoeffs = [A, B, C].every((v) => Math.abs(v - Math.round(v)) < 1e-4);
  if (!isIntegerCoeffs) {
    return {
      isCorrect: false,
      error: 'Standard form requires integer coefficients A, B, and C with no fractions.',
    };
  }

  const intA = Math.round(A);
  const intB = Math.round(B);
  const intC = Math.round(C);

  const divisor = gcd(gcd(Math.abs(intA), Math.abs(intB)), Math.abs(intC));
  if (divisor > 1) {
    return {
      isCorrect: false,
      error: `Simplify standard form by dividing all terms by their common factor of ${divisor}.`,
    };
  }

  if (intA < 0 || (intA === 0 && intB < 0)) {
    return {
      isCorrect: false,
      error: 'Standard form requires a positive leading coefficient. Multiply both sides by -1.',
    };
  }

  const eqLine = canonicalFromStandard(intA, intB, intC);
  if (!eqLine || !linesEquivalent(eqLine, canonicalFacts.canonicalLine)) {
    return {
      isCorrect: false,
      error: 'This standard form equation does not represent the target line.',
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
    return { isCorrect: false, error: 'Slope-intercept form must have y isolated on the left: y = mx + b.' };
  }

  let rightValid = false;
  try {
    rightValid = isSimplifiedSlopeInterceptExpression(latexToExpression(right), 'x');
  } catch {
    rightValid = false;
  }

  if (!rightValid) {
    return { isCorrect: false, error: 'Write the right-hand side in simplified slope-intercept form: mx + b.' };
  }

  const eqLine = canonicalFromEquationText(str);
  if (!eqLine || !linesEquivalent(eqLine, canonicalFacts.canonicalLine)) {
    return { isCorrect: false, error: 'This equation does not represent the target line.' };
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
      error: 'Write the equation in point-slope form: y − y₁ = m(x − x₁).',
    };
  }

  const { m, x1, y1 } = parsed;

  if (!nearlyEqual(m, canonicalFacts.slopeNumber, 1e-4)) {
    return {
      isCorrect: false,
      error: `The slope m = ${formatFraction(toFraction(m))} does not match the target line slope.`,
    };
  }

  const pointOnLine = pointOnCanonicalLine(canonicalFacts.canonicalLine, [x1, y1]);
  if (!pointOnLine) {
    return {
      isCorrect: false,
      error: `The point (${x1}, ${y1}) does not lie on this line. Choose a point that satisfies the relationship.`,
    };
  }

  const eqLine = canonicalFromEquationText(str);
  if (!eqLine || !linesEquivalent(eqLine, canonicalFacts.canonicalLine)) {
    return { isCorrect: false, error: 'This point-slope equation does not represent the target line.' };
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
    error: matches ? null : 'Slope value does not match the target line.',
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
  if (!pt) return { isCorrect: false, error: 'Enter the x-intercept as an ordered pair (x, 0).' };
  const [x, y] = pt;
  if (Math.abs(y) > 1e-4) {
    return { isCorrect: false, error: 'The y-coordinate of an x-intercept must be 0.' };
  }
  if (!nearlyEqual(x, canonicalFacts.zeroNumber, 1e-4)) {
    return { isCorrect: false, error: 'The x-intercept value is incorrect for this line.' };
  }
  return { isCorrect: true, point: pt };
};

export const validateYInterceptEntry = (input, canonicalFacts) => {
  const pt = parseOrderedPair(input);
  if (!pt) return { isCorrect: false, error: 'Enter the y-intercept as an ordered pair (0, y).' };
  const [x, y] = pt;
  if (Math.abs(x) > 1e-4) {
    return { isCorrect: false, error: 'The x-coordinate of a y-intercept must be 0.' };
  }
  if (!nearlyEqual(y, canonicalFacts.yInterceptNumber, 1e-4)) {
    return { isCorrect: false, error: 'The y-intercept value is incorrect for this line.' };
  }
  return { isCorrect: true, point: pt };
};

export const validateTwoPointsEntry = (point1Input, point2Input, canonicalFacts) => {
  const p1 = parseOrderedPair(point1Input);
  const p2 = parseOrderedPair(point2Input);
  if (!p1 || !p2) {
    return { isCorrect: false, error: 'Enter two valid ordered pairs (x, y).' };
  }
  if (nearlyEqual(p1[0], p2[0], 1e-4) && nearlyEqual(p1[1], p2[1], 1e-4)) {
    return { isCorrect: false, error: 'The two points must be distinct from each other.', points: [p1, p2] };
  }
  if (!pointOnCanonicalLine(canonicalFacts.canonicalLine, p1)) {
    return { isCorrect: false, error: `Point (${p1[0]}, ${p1[1]}) is not on the target line.`, points: [p1, p2] };
  }
  if (!pointOnCanonicalLine(canonicalFacts.canonicalLine, p2)) {
    return { isCorrect: false, error: `Point (${p2[0]}, ${p2[1]}) is not on the target line.`, points: [p1, p2] };
  }
  return { isCorrect: true, points: [p1, p2] };
};

export const validateTableEntry = (rows = [], canonicalFacts, requiredCount = 4) => {
  if (!Array.isArray(rows) || rows.length < requiredCount) {
    return {
      isCorrect: false,
      error: `Table must contain at least ${requiredCount} completed rows.`,
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
    return { isCorrect: false, error: 'All table rows must contain valid numbers or fractions.' };
  }

  // Distinct x values
  const xVals = parsedRows.map((r) => Number(r.x.toFixed(6)));
  if (new Set(xVals).size !== xVals.length) {
    return { isCorrect: false, error: 'Table rows must have distinct x-values.' };
  }

  // Every row must lie on the line
  const offLine = parsedRows.find((r) => !pointOnCanonicalLine(canonicalFacts.canonicalLine, [r.x, r.y]));
  if (offLine) {
    return {
      isCorrect: false,
      error: `Row (${offLine.x}, ${offLine.y}) does not lie on the target line.`,
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
  if (!str) return null;
  let s = String(str).trim();
  if (s.includes('\\')) {
    s = s.replace(/\\le|\\leq/g, '<=')
      .replace(/\\ge|\\geq/g, '>=')
      .replace(/\\left|\\right/g, '')
      .replace(/\\text\{[^}]*\}/g, '')
      .replace(/[{}]/g, '');
  }
  s = s.replace(/≤/g, '<=').replace(/≥/g, '>=');

  const bracketMatch = s.match(/^\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]$/);
  if (bracketMatch) {
    const min = Number(bracketMatch[1]);
    const max = Number(bracketMatch[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  }

  const ineqMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:<=|<)\s*([a-zA-Z])\s*(?:<=|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (ineqMatch) {
    const min = Number(ineqMatch[1]);
    const max = Number(ineqMatch[3]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, variable: ineqMatch[2] };
  }

  const revMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:>=|>)\s*([a-zA-Z])\s*(?:>=|>)\s*(-?\d+(?:\.\d+)?)$/);
  if (revMatch) {
    const max = Number(revMatch[1]);
    const min = Number(revMatch[3]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, variable: revMatch[2] };
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
      const match = nearlyEqual(parsed.min, expMin, 1e-4) && nearlyEqual(parsed.max, expMax, 1e-4);
      return { isCorrect: match, error: match ? null : 'Domain bounds do not match the scenario.' };
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
      if (parsed && nearlyEqual(parsed.min, expectedDomain.min, 1e-4) && nearlyEqual(parsed.max, expectedDomain.max, 1e-4)) {
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
      const match = nearlyEqual(studentParsed.min, expectedParsed.min, 1e-4) && nearlyEqual(studentParsed.max, expectedParsed.max, 1e-4);
      return { isCorrect: match, error: match ? null : 'Domain bounds do not match the scenario.' };
    }
    const valRes = validateContextField(studentValue, expectedDomain);
    return { isCorrect: valRes.valid, error: valRes.valid ? null : valRes.message };
  }

  return { isCorrect: false, error: 'Unknown domain specification.' };
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
    return { isConsistent: true, disagreements: [], completedLineCount: completedLines.length };
  }

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
    completedLineCount: completedLines.length,
  };
};

export const scoreLinearMultipleRepresentations = (question = {}, response = {}) => {
  const canonicalFacts = deriveLinearMultipleRepresentations(question);
  if (!canonicalFacts.isValid) {
    return { isCorrect: false, score: 0, error: canonicalFacts.error, parts: {} };
  }

  const givenKind = question.source?.kind;
  const parts = {};
  const evidence = {};

  // Equation Forms
  if (givenKind !== 'standardForm') {
    const stdRes = validateStandardFormEntry(response.standardFormEquation, canonicalFacts);
    parts.standardForm = stdRes.isCorrect;
    evidence.standardForm = stdRes;
  }
  if (givenKind !== 'slopeIntercept') {
    const slRes = validateSlopeInterceptEntry(response.slopeInterceptEquation, canonicalFacts);
    parts.slopeIntercept = slRes.isCorrect;
    evidence.slopeIntercept = slRes;
  }
  if (givenKind !== 'pointSlope') {
    const psRes = validatePointSlopeEntry(response.pointSlopeEquation, canonicalFacts);
    parts.pointSlope = psRes.isCorrect;
    evidence.pointSlope = psRes;
  }

  // Features
  const slopeRes = validateSlopeEntry(response.featureSlope, canonicalFacts);
  parts.slope = slopeRes.isCorrect;
  evidence.slope = slopeRes;

  const xIntRes = validateXInterceptEntry(response.featureXIntercept, canonicalFacts);
  parts.xIntercept = xIntRes.isCorrect;
  evidence.xIntercept = xIntRes;

  const yIntRes = validateYInterceptEntry(response.featureYIntercept, canonicalFacts);
  parts.yIntercept = yIntRes.isCorrect;
  evidence.yIntercept = yIntRes;

  let ptsRes = null;
  if (givenKind !== 'twoPoints') {
    ptsRes = validateTwoPointsEntry(response.featurePoint1, response.featurePoint2, canonicalFacts);
    parts.twoPoints = ptsRes.isCorrect;
    evidence.twoPoints = ptsRes;
  }

  // Table
  if (givenKind !== 'table') {
    const tableRes = validateTableEntry(response.tableRows, canonicalFacts, 4);
    parts.table = tableRes.isCorrect;
    evidence.table = tableRes;
  }

  // Graphs (Three Independent Constructions)
  const g1Res = evaluateGraph1Intercepts(response.graph1Points || [], canonicalFacts, Number(question.tolerance ?? 0.12));
  parts.graph1 = g1Res.isCorrect;
  evidence.graph1 = g1Res;

  const g2Res = evaluateGraph2SlopeIntercept(response.graph2Points || [], canonicalFacts, Number(question.tolerance ?? 0.12));
  parts.graph2 = g2Res.isCorrect;
  evidence.graph2 = g2Res;

  let requiredPsAnchor = null;
  const isGivenPointSlope = (givenKind === 'pointSlope');
  if (isGivenPointSlope) {
    if (question.source?.point) {
      requiredPsAnchor = question.source.point;
    } else if (question.source?.equation) {
      const parsed = parsePointSlopeForm(question.source.equation);
      if (parsed?.point) requiredPsAnchor = parsed.point;
    } else if (canonicalFacts.sourcePoint) {
      requiredPsAnchor = canonicalFacts.sourcePoint;
    }
  } else {
    const parsedPs = parsePointSlopeForm(response.pointSlopeEquation);
    if (parsedPs?.point) {
      requiredPsAnchor = parsedPs.point;
    }
  }
  const g3Res = evaluateGraph3PointSlope(response.graph3Points || [], canonicalFacts, requiredPsAnchor, Number(question.tolerance ?? 0.12));
  parts.graph3 = g3Res.isCorrect;
  evidence.graph3 = g3Res;

  // Context (if authored / scenario)
  const ctx = question.source?.context || question.context;
  if (ctx && Object.keys(ctx).length > 0) {
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
