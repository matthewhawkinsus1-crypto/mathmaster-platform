import { nearlyEqual, round } from '../shared/toolMath.js';

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
  if (mode === 'verticalHorizontal') {
    const value = Number(question.value);
    if (!Number.isFinite(value)) return null;
    return question.orientation === 'vertical' ? { kind: 'vertical', x: value } : { kind: 'slopeIntercept', m: 0, b: value };
  }
  const line = question.line || {};
  if (Number.isFinite(Number(line.x))) return { kind: 'vertical', x: Number(line.x) };
  return Number.isFinite(Number(line.m)) && Number.isFinite(Number(line.b)) ? { kind: 'slopeIntercept', m: Number(line.m), b: Number(line.b) } : null;
};

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

export const constructionEvidence = (points = [], target, tolerance = 0.12) => {
  if (!points || points.length < 2) {
    return { studentLine: null, pointChecks: [false, false], score: 0, isCorrect: false };
  }

  // CRIT-01: two coincident points do not define a line. Without this guard
  // lineFromPoints returns a degenerate/NaN line that linesEquivalent could
  // score as correct, awarding full credit for dropping one point twice.
  const [p1, p2] = points;
  const isDuplicate = nearlyEqual(p1[0], p2[0], 1e-4) && nearlyEqual(p1[1], p2[1], 1e-4);
  if (isDuplicate) {
    const singlePointOnLine = pointOnLine(target, p1, tolerance);
    return {
      studentLine: null,
      pointChecks: [singlePointOnLine, false],
      score: singlePointOnLine ? 0.25 : 0,
      isCorrect: false,
    };
  }

  const studentLine = lineFromPoints(p1, p2);
  const pointChecks = points.slice(0, 2).map((point) => pointOnLine(target, point, tolerance));
  const isValidLine = studentLine !== null;
  const isCorrect = isValidLine && linesEquivalent(studentLine, target, tolerance);
  // Partial credit keeps its original scale (points-on-line / 2). The supplied
  // CRIT-01 patch also multiplied this by 0.5, which would have quietly halved
  // the score of every partially-correct construction — a grading change well
  // beyond the duplicate-point bug it was written to fix, and one the existing
  // test suite explicitly pins.
  const score = isCorrect ? 1 : (isValidLine ? pointChecks.filter(Boolean).length / 2 : 0);
  return { studentLine, pointChecks, score, isCorrect };
};

export const formatLine = (line) => {
  if (!line) return 'invalid line';
  if (line.kind === 'vertical') return 'x = ' + line.x;
  const sign = Number(line.b) >= 0 ? '+' : '−';
  return 'y = ' + line.m + 'x ' + sign + ' ' + Math.abs(Number(line.b));
};
