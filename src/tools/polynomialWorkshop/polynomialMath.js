import { nearlyEqual } from '../shared/toolMath.js';

export const trimLeadingZeros = (coefficients = []) => {
  const copy = coefficients.map(Number);
  while (copy.length > 1 && nearlyEqual(copy[0], 0)) copy.shift();
  return copy.length ? copy : [0];
};

export const polynomialDegree = (coefficients = []) => trimLeadingZeros(coefficients).length - 1;

export const polynomialMultiply = (a = [], b = []) => {
  const left = trimLeadingZeros(a);
  const right = trimLeadingZeros(b);
  const result = Array(left.length + right.length - 1).fill(0);
  left.forEach((av, i) => right.forEach((bv, j) => { result[i + j] += av * bv; }));
  return trimLeadingZeros(result);
};

export const polynomialLongDivide = (dividend = [], divisor = []) => {
  const numerator = trimLeadingZeros(dividend);
  const denominator = trimLeadingZeros(divisor);
  if (denominator.length === 1 && nearlyEqual(denominator[0], 0)) throw new Error('Polynomial divisor cannot be zero.');
  if (numerator.length < denominator.length) return { quotient: [0], remainder: numerator };

  const working = [...numerator];
  const quotientLength = numerator.length - denominator.length + 1;
  const quotient = Array(quotientLength).fill(0);

  for (let i = 0; i < quotientLength; i += 1) {
    const factor = working[i] / denominator[0];
    quotient[i] = factor;
    for (let j = 0; j < denominator.length; j += 1) working[i + j] -= factor * denominator[j];
  }

  const remainder = working.slice(quotientLength).map((value) => Math.abs(value) < 1e-10 ? 0 : value);
  return { quotient: trimLeadingZeros(quotient), remainder: trimLeadingZeros(remainder.length ? remainder : [0]) };
};

export const quadraticRoots = (coefficients = []) => {
  const [a, b, c] = trimLeadingZeros(coefficients);
  if (coefficients.length !== 3 || nearlyEqual(a, 0)) return [];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-10) return [];
  if (Math.abs(discriminant) < 1e-10) return [-b / (2 * a)];
  const sqrtD = Math.sqrt(discriminant);
  return [(-b - sqrtD) / (2 * a), (-b + sqrtD) / (2 * a)].sort((x, y) => x - y);
};

export const integerFactorPairForMonicQuadratic = (coefficients = []) => {
  const values = trimLeadingZeros(coefficients);
  if (values.length !== 3 || !nearlyEqual(values[0], 1)) return null;
  const [, b, c] = values;
  if (!Number.isInteger(b) || !Number.isInteger(c)) return null;
  // Trial division over every integer up to |c| is unbounded in practice: a
  // constant term of 1e12 is two trillion iterations, which freezes the tab.
  // Classroom quadratics factor far below this, so anything larger is treated
  // as "not factorable by inspection" rather than searched exhaustively.
  const MAX_FACTOR_SEARCH = 10000;
  const limit = Math.abs(c);
  if (!Number.isFinite(limit) || limit > MAX_FACTOR_SEARCH) return null;
  for (let p = -limit - 1; p <= limit + 1; p += 1) {
    if (p === 0 && c !== 0) continue;
    const q = c === 0 ? b - p : c / p;
    if (Number.isInteger(q) && p + q === b && p * q === c) return [p, q].sort((x, y) => x - y);
  }
  return null;
};

export const factorBehaviorAtRoot = (multiplicity = 1) => Number(multiplicity) % 2 === 0 ? 'touches' : 'crosses';

export const endBehavior = (coefficients = []) => {
  const values = trimLeadingZeros(coefficients);
  const degree = values.length - 1;
  const leading = values[0];
  const even = degree % 2 === 0;
  if (even && leading > 0) return { left: 'up', right: 'up', label: 'both ends rise' };
  if (even && leading < 0) return { left: 'down', right: 'down', label: 'both ends fall' };
  if (!even && leading > 0) return { left: 'down', right: 'up', label: 'left falls, right rises' };
  return { left: 'up', right: 'down', label: 'left rises, right falls' };
};

export const coefficientsFromRoots = (roots = [], leadingCoefficient = 1) => {
  let coefficients = [Number(leadingCoefficient)];
  roots.forEach((entry) => {
    const root = typeof entry === 'number' ? entry : Number(entry.root);
    const multiplicity = typeof entry === 'number' ? 1 : Number(entry.multiplicity ?? 1);
    for (let i = 0; i < multiplicity; i += 1) coefficients = polynomialMultiply(coefficients, [1, -root]);
  });
  return coefficients;
};

export const rationalFeatureMap = ({ numeratorRoots = [], denominatorRoots = [] } = {}) => {
  const numeratorCounts = new Map();
  const denominatorCounts = new Map();
  numeratorRoots.forEach((r) => numeratorCounts.set(Number(r), (numeratorCounts.get(Number(r)) || 0) + 1));
  denominatorRoots.forEach((r) => denominatorCounts.set(Number(r), (denominatorCounts.get(Number(r)) || 0) + 1));
  const all = [...new Set([...numeratorCounts.keys(), ...denominatorCounts.keys()])].sort((a, b) => a - b);
  return all.map((root) => {
    const n = numeratorCounts.get(root) || 0;
    const d = denominatorCounts.get(root) || 0;
    const cancelled = Math.min(n, d);
    const remainingDenominatorMultiplicity = d - cancelled;
    const remainingNumeratorMultiplicity = n - cancelled;
    let type = 'none';
    if (cancelled > 0 && remainingDenominatorMultiplicity === 0) type = 'hole';
    else if (remainingDenominatorMultiplicity > 0) type = 'verticalAsymptote';
    else if (remainingNumeratorMultiplicity > 0) type = 'zero';
    return { root, type, cancelledMultiplicity: cancelled, remainingNumeratorMultiplicity, remainingDenominatorMultiplicity };
  });
};

export const sameNumberMultiset = (a = [], b = [], tolerance = 1e-6) => {
  if (a.length !== b.length) return false;
  const left = [...a].map(Number).sort((x, y) => x - y);
  const right = [...b].map(Number).sort((x, y) => x - y);
  return left.every((value, index) => nearlyEqual(value, right[index], tolerance));
};
