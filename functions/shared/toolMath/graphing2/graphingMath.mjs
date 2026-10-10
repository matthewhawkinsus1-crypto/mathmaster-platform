import { nearlyEqual, round } from '../shared/toolMath.mjs';

export const lineFromPoints = (first, second, tolerance = 1e-9) => {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== 2 || second.length !== 2) return null;
  const [x1, y1] = first.map(Number);
  const [x2, y2] = second.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  if (nearlyEqual(x1, x2, tolerance) && nearlyEqual(y1, y2, tolerance)) return null;
  if (nearlyEqual(x1, x2, tolerance)) return { kind: 'vertical', x: round((x1 + x2) / 2, 6) };
  const m = (y2 - y1) / (x2 - x1);
  return { kind: 'slopeIntercept', m: round(m, 8), b: round(y1 - m * x1, 8) };
};

export const lineFromStandard = ({ A, B, C } = {}) => {
  const a = Number(A); const b = Number(B); const c = Number(C);
  if (![a, b, c].every(Number.isFinite) || (nearlyEqual(a, 0) && nearlyEqual(b, 0))) return null;
  if (nearlyEqual(b, 0)) return { kind: 'vertical', x: round(c / a, 8) };
  return { kind: 'slopeIntercept', m: round(-a / b, 8), b: round(c / b, 8) };
};

export const targetLineFromQuestion = (question = {}) => {
  const mode = question.mode || 'slopeIntercept';
  if (mode === 'throughPoints') return lineFromPoints(question.givenPoints?.[0], question.givenPoints?.[1]);
  if (mode === 'pointSlope') {
    const point = question.point || [0, 0];
    const m = Number(question.slope);
    if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(m)) return null;
    return { kind: 'slopeIntercept', m, b: round(Number(point[1]) - m * Number(point[0]), 8) };
  }
  if (mode === 'standardForm') return lineFromStandard(question.standard);
  if (mode === 'factoredLinear') {
    const a = Number(question.factored?.a); const c = Number(question.factored?.c);
    return Number.isFinite(a) && Number.isFinite(c) ? { kind: 'slopeIntercept', m: a, b: round(-a * c, 8) } : null;
  }
  if (mode === 'verticalHorizontal') {
    const value = Number(question.value);
    if (!Number.isFinite(value)) return null;
    return question.orientation === 'vertical' ? { kind: 'vertical', x: value } : { kind: 'slopeIntercept', m: 0, b: value };
  }
  const line = question.line || {};
  if (Number.isFinite(Number(line.x))) return { kind: 'vertical', x: Number(line.x) };
  return Number.isFinite(Number(line.m)) && Number.isFinite(Number(line.b)) ? { kind: 'slopeIntercept', m: Number(line.m), b: Number(line.b) } : null;
};

/*
 * THE LINE A GRAPHING2 QUESTION ASKS FOR, AS THE TOOL ITSELF READS IT.
 *
 * Graphing2.jsx renders `question.mode || 'slopeIntercept'`, and a
 * slope-intercept question with no authored `line` shows (and grades) the
 * default y = 1.5x - 2. The browser tool and the shared server grader both
 * read the target through these helpers, so they can never disagree about
 * which line a student was asked to construct.
 */
export const DEFAULT_SLOPE_INTERCEPT_LINE = Object.freeze({ m: 1.5, b: -2 });

export const graphingModeOf = (question = {}) => question?.mode || 'slopeIntercept';

export const withDefaultTargetLine = (question = {}) => (
  graphingModeOf(question) === 'slopeIntercept' && !question?.line
    ? { ...question, line: { ...DEFAULT_SLOPE_INTERCEPT_LINE } }
    : question
);

export const graphingTargetLine = (question = {}) => targetLineFromQuestion(withDefaultTargetLine(question));

export const linesEquivalent = (left, right, tolerance = 0.08) => {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === 'vertical') return nearlyEqual(left.x, right.x, tolerance);
  return nearlyEqual(left.m, right.m, tolerance) && nearlyEqual(left.b, right.b, tolerance * 2);
};

export const pointOnLine = (line, point, tolerance = 0.12) => {
  if (!line || !Array.isArray(point) || point.length !== 2) return false;
  const [x, y] = point.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (line.kind === 'vertical') return nearlyEqual(x, line.x, tolerance);
  return nearlyEqual(y, Number(line.m) * x + Number(line.b), tolerance);
};

/*
 * The grid Graphing2 snaps plotted points to (Graphing2.jsx resolveSnapStep):
 * an authored snapStep, else 1 for a line with integer slope and intercept
 * (or an integer vertical), else 0.5.
 */
export const graphing2SnapStep = (question = {}, target) => {
  const explicit = Number(question?.snapStep);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (!target) return 1;
  if (target.kind === 'vertical') return Number.isInteger(target.x) ? 1 : 0.5;
  const m = Number(target.m);
  const b = Number(target.b);
  if (!Number.isFinite(m) || !Number.isFinite(b)) return 1;
  return Number.isInteger(m) && Number.isInteger(b) ? 1 : 0.5;
};

// The window Graphing2 draws (Graphing2.jsx): the question's graphBounds, else ±7.
export const GRAPHING2_DEFAULT_BOUNDS = Object.freeze({ xMin: -7, xMax: 7, yMin: -7, yMax: 7 });

/*
 * Whether two distinct snapped points INSIDE the drawn window lie ON the
 * target line. When none do (y = 2.3 on a 0.5 grid, or y = 0.01x + 0.25 on a
 * ±10 window), no construction the student can make puts both points on the
 * line, and requiring it would leave the question with no correct answer.
 */
export const targetReachableOnGrid = (target, step = 1, tolerance = 0.12, bounds = GRAPHING2_DEFAULT_BOUNDS) => {
  if (!target || !(step > 0)) return false;
  const { xMin, xMax, yMin, yMax } = { ...GRAPHING2_DEFAULT_BOUNDS, ...(bounds || {}) };
  const snaps = (value) => Math.abs(Math.round(value / step) * step - value) <= tolerance;
  if (target.kind === 'vertical') {
    const x = Number(target.x);
    return x >= xMin - tolerance && x <= xMax + tolerance && snaps(x);
  }
  let found = 0;
  for (let i = Math.ceil(xMin / step); i * step <= xMax; i += 1) {
    const x = i * step;
    const y = Number(target.m) * x + Number(target.b);
    const gridY = Math.round(y / step) * step;
    if (gridY >= yMin && gridY <= yMax && snaps(y)) found += 1;
    if (found >= 2) return true;
  }
  return false;
};

/**
 * constructionEvidence plus the facts its score is made of, for the shared
 * grader's per-part report. `evidence` is exactly what constructionEvidence
 * returns; `coincident` says the first two points are the same spot (the
 * CRIT-01 case, where one on-line point earns a quarter, not a half).
 */
export const constructionEvidenceDetail = (points = [], target, tolerance = 0.12, { requirePointsOnLine = true } = {}) => {
  if (!points || points.length < 2) {
    return { evidence: { studentLine: null, pointChecks: [false, false], score: 0, isCorrect: false }, coincident: false };
  }

  // CRIT-01: two coincident points do not define a line. Without this guard
  // lineFromPoints returns a degenerate line that linesEquivalent could score
  // as correct, awarding full credit for dropping one point twice.
  const [p1, p2] = points;
  if (nearlyEqual(p1[0], p2[0], 1e-4) && nearlyEqual(p1[1], p2[1], 1e-4)) {
    const singlePointOnLine = pointOnLine(target, p1, tolerance);
    return {
      evidence: { studentLine: null, pointChecks: [singlePointOnLine, false], score: singlePointOnLine ? 0.25 : 0, isCorrect: false },
      coincident: true,
    };
  }

  const studentLine = lineFromPoints(p1, p2);
  const pointChecks = points.slice(0, 2).map((point) => pointOnLine(target, point, tolerance));
  // Both points must be ON the target line, not only near a line whose slope
  // and intercept are within tolerance of it: one snap step off a steep or
  // fractional line can land inside the m/b tolerance while plotting a
  // different line (its own "Point 2 is on the target line" part is false).
  // A target no snapped point reaches keeps the line rule alone (the caller
  // decides, from the question's grid: targetReachableOnGrid).
  const isCorrect = studentLine !== null
    && (!requirePointsOnLine || pointChecks.every(Boolean))
    && linesEquivalent(studentLine, target, tolerance);
  // Partial-credit scale intentionally unchanged; see the batch D test.
  return { evidence: { studentLine, pointChecks, score: isCorrect ? 1 : pointChecks.filter(Boolean).length / 2, isCorrect }, coincident: false };
};

export const constructionEvidence = (points = [], target, tolerance = 0.12) => constructionEvidenceDetail(points, target, tolerance).evidence;

export const formatLine = (line) => {
  if (!line) return 'invalid line';
  if (line.kind === 'vertical') return 'x = ' + line.x;
  const sign = Number(line.b) >= 0 ? '+' : '−';
  return 'y = ' + line.m + 'x ' + sign + ' ' + Math.abs(Number(line.b));
};
