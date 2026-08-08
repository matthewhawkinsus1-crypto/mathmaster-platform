import { nearlyEqual } from '../shared/toolMath.js';

const uniqueSorted = (values = []) => [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);

export const signOfFactoredExpression = ({ numeratorFactors = [], denominatorFactors = [] } = {}, x) => {
  const signFactors = (factors) => factors.reduce((sign, factor) => {
    const value = Number(x) - Number(factor.root);
    if (nearlyEqual(value, 0)) return 0;
    const multiplicity = Number(factor.multiplicity ?? 1);
    const factorSign = value < 0 && multiplicity % 2 === 1 ? -1 : 1;
    return sign * factorSign;
  }, 1);
  const numeratorSign = signFactors(numeratorFactors);
  const denominatorSign = signFactors(denominatorFactors);
  if (denominatorSign === 0) return Number.NaN;
  if (numeratorSign === 0) return 0;
  return numeratorSign * denominatorSign;
};

export const buildCriticalPoints = ({ numeratorFactors = [], denominatorFactors = [] } = {}) => {
  const numeratorRoots = uniqueSorted(numeratorFactors.map((f) => f.root));
  const denominatorRoots = uniqueSorted(denominatorFactors.map((f) => f.root));
  const roots = uniqueSorted([...numeratorRoots, ...denominatorRoots]);
  return roots.map((value) => ({
    value,
    isZero: numeratorRoots.some((root) => nearlyEqual(root, value)),
    isExcluded: denominatorRoots.some((root) => nearlyEqual(root, value)),
  }));
};

export const buildSignIntervals = (spec = {}, relation = '>') => {
  const criticalPoints = buildCriticalPoints(spec);
  const bounds = [-Infinity, ...criticalPoints.map((p) => p.value), Infinity];
  const intervals = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const left = bounds[i];
    const right = bounds[i + 1];
    const probe = !Number.isFinite(left) ? right - 1 : !Number.isFinite(right) ? left + 1 : (left + right) / 2;
    const sign = signOfFactoredExpression(spec, probe);
    const include = relation.startsWith('>') ? sign > 0 : sign < 0;
    intervals.push({ left, right, probe, sign, included: include });
  }
  return { criticalPoints, intervals };
};

export const solutionPiecesForRelation = (spec = {}, relation = '>') => {
  const { criticalPoints, intervals } = buildSignIntervals(spec, relation);
  const inclusive = relation.includes('=');
  return intervals.filter((interval) => interval.included).map((interval) => {
    const leftPoint = criticalPoints.find((p) => nearlyEqual(p.value, interval.left));
    const rightPoint = criticalPoints.find((p) => nearlyEqual(p.value, interval.right));
    return {
      left: interval.left,
      right: interval.right,
      leftClosed: inclusive && !!leftPoint?.isZero && !leftPoint?.isExcluded,
      rightClosed: inclusive && !!rightPoint?.isZero && !rightPoint?.isExcluded,
    };
  });
};

export const formatSolutionPiece = (piece) => {
  const leftSymbol = piece.leftClosed ? '[' : '(';
  const rightSymbol = piece.rightClosed ? ']' : ')';
  const left = Number.isFinite(piece.left) ? piece.left : '-∞';
  const right = Number.isFinite(piece.right) ? piece.right : '∞';
  return `${leftSymbol}${left}, ${right}${rightSymbol}`;
};

export const sameIntervalSelection = (selected = [], expected = []) => {
  const a = [...selected].sort((x, y) => x - y);
  const b = [...expected].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

export const evaluateRadicalEquationCandidate = (spec = {}, x) => {
  const radicand = Number(spec.radicand?.m ?? 1) * Number(x) + Number(spec.radicand?.b ?? 0);
  const rhs = Number(spec.rhs?.m ?? 0) * Number(x) + Number(spec.rhs?.b ?? 0);
  if (radicand < -1e-9) return { valid: false, reason: 'outsideDomain', lhs: Number.NaN, rhs };
  const lhs = Math.sqrt(Math.max(0, radicand));
  return { valid: nearlyEqual(lhs, rhs, Number(spec.tolerance ?? 1e-6)), reason: nearlyEqual(lhs, rhs, Number(spec.tolerance ?? 1e-6)) ? 'valid' : 'extraneous', lhs, rhs };
};

export const validRadicalCandidates = (spec = {}, candidates = []) => candidates.map(Number).filter((x) => evaluateRadicalEquationCandidate(spec, x).valid);
