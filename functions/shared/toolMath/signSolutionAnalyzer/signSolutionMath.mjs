import { nearlyEqual, parseNumericAnswer } from '../shared/toolMath.mjs';

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

/*
 * The relation as the chart reads it. An author (or the V5 compiler, which
 * copies `relation` through) may write the symbols themselves; the chart has
 * always SHOWN '≥' as "≥ 0", but read it by its first character — as '<' —
 * so the positive intervals were marked wrong and the negative ones right.
 * '≥' and '≤' are read as '>=' and '<='; every other value is unchanged.
 */
const RELATION_SPELLINGS = Object.freeze({ '≥': '>=', '≤': '<=' });
export const canonicalSignRelation = (relation) => (
  typeof relation === 'string' && Object.prototype.hasOwnProperty.call(RELATION_SPELLINGS, relation)
    ? RELATION_SPELLINGS[relation]
    : relation
);

export const buildSignIntervals = (spec = {}, rawRelation = '>') => {
  const relation = canonicalSignRelation(rawRelation);
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

export const solutionPiecesForRelation = (spec = {}, rawRelation = '>') => {
  const relation = canonicalSignRelation(rawRelation);
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

/*
 * SOLVING a·ⁿ√(mx + b) + c = px + q BY HAND (mode radicalSolve).
 *
 *   isolate   ⁿ√(mx + b) = (px + q − c) / a     undo what is done outside the
 *                                               radical, in reverse order
 *   raise     mx + b = ((px + q − c) / a)ⁿ      both sides to the index
 *   solve     the candidates: the real solutions of that polynomial equation
 *   check     each candidate in the ORIGINAL equation — raising both sides to
 *             an even power can add values that never solved it (extraneous)
 *
 * The radicand and the right side are linear, and the variable may appear on
 * the right only under a square root, so the raised equation is linear or
 * quadratic: one a student solves by hand. radicalSolveEquation reads an
 * authored spec and throws on anything else (the grader then reports an
 * invalid question rather than blaming the student).
 */
export const RADICAL_SOLVE_MAX_INDEX = 8;
export const RADICAL_SOLVE_MAX_CANDIDATES = 4;
// √(x − 2) − 1 = 5: isolate √(x − 2) = 6, square x − 2 = 36, x = 38, which checks.
export const RADICAL_SOLVE_DEFAULT = Object.freeze({
  variable: 'x',
  index: 2,
  coefficient: 1,
  radicand: Object.freeze({ m: 1, b: -2 }),
  outside: -1,
  rhs: Object.freeze({ m: 0, b: 5 }),
});

const tidyZero = (value) => (Object.is(value, -0) ? 0 : value);
const closeTo = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

const specNumber = (value, fallback) => {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) throw new Error('A radical equation needs numeric coefficients.');
  return number;
};

export const radicalSolveEquation = (spec = {}) => {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('A radical equation is an object.');
  const index = specNumber(spec.index, 2);
  if (!Number.isInteger(index) || index < 2 || index > RADICAL_SOLVE_MAX_INDEX) throw new Error(`The index is a whole number from 2 to ${RADICAL_SOLVE_MAX_INDEX}.`);
  const coefficient = specNumber(spec.coefficient, 1);
  if (coefficient === 0) throw new Error('The radical needs a nonzero coefficient.');
  const radicand = { m: specNumber(spec.radicand?.m, 1), b: specNumber(spec.radicand?.b, 0) };
  if (radicand.m === 0) throw new Error('The radicand must contain the variable.');
  const rhs = { m: specNumber(spec.rhs?.m, 0), b: specNumber(spec.rhs?.b, 0) };
  if (rhs.m !== 0 && index !== 2) throw new Error('The variable may appear outside the radical only under a square root.');
  const variable = typeof spec.variable === 'string' && /^[a-z]$/.test(spec.variable) ? spec.variable : 'x';
  return { variable, index, coefficient, radicand, outside: specNumber(spec.outside, 0), rhs };
};

/** The real nth root; null where there is none (an even root of a negative). */
export const realNthRoot = (value, index) => {
  if (index % 2 === 0 && value < -1e-9) return null;
  const base = index % 2 === 0 ? Math.max(0, value) : value;
  const root = Math.sign(base) * Math.abs(base) ** (1 / index);
  const whole = Math.round(root);
  return tidyZero(closeTo(whole ** index, base) ? whole : root);
};

/** Both sides of the ORIGINAL equation at x; the left side is null where its root is not real. */
export const radicalSolveSides = (equation, x) => {
  const root = realNthRoot(equation.radicand.m * x + equation.radicand.b, equation.index);
  const left = root === null ? null : tidyZero(equation.coefficient * root + equation.outside);
  const right = tidyZero(equation.rhs.m * x + equation.rhs.b);
  return { left, right, holds: left !== null && closeTo(left, right) };
};

/**
 * Every stage's answer: the isolated side { m, b } (the radical equals
 * mx + b), the raised side's coefficients (highest power first), the
 * candidates (ascending), each candidate's check in the original, and the
 * solutions — the candidates that check.
 */
export const radicalSolveKey = (spec) => {
  const equation = radicalSolveEquation(spec);
  const { index, coefficient, radicand, outside, rhs } = equation;
  const isolated = { m: tidyZero(rhs.m / coefficient), b: tidyZero((rhs.b - outside) / coefficient) };
  const raised = isolated.m === 0
    ? [tidyZero(isolated.b ** index)]
    : [isolated.m ** 2, 2 * isolated.m * isolated.b, isolated.b ** 2].map(tidyZero);
  let candidates;
  if (isolated.m === 0) {
    candidates = [tidyZero((raised[0] - radicand.b) / radicand.m)];
  } else {
    // (sx + t)² − (mx + b) = 0.
    const [a, b, c] = [raised[0], raised[1] - radicand.m, raised[2] - radicand.b];
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -1e-9) candidates = [];
    else if (Math.abs(discriminant) <= 1e-9) candidates = [tidyZero(-b / (2 * a))];
    else {
      const root = Math.sqrt(discriminant);
      candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].map(tidyZero).sort((x, y) => x - y);
    }
  }
  const checks = candidates.map((x) => ({ x, ...radicalSolveSides(equation, x) }));
  return { equation, isolated, raised, candidates, checks, solutions: checks.filter((check) => check.holds).map((check) => check.x) };
};

/*
 * A list of values as a student types it: "38", "−2, −7", "y = 38 or y = 4",
 * a fraction "7/2" — or a word for none. Repeats are one value. Returns
 * { kind, values }: 'blank' (nothing typed), 'none', 'values', or
 * 'unreadable' (a piece that is no number, or more pieces than a radical
 * equation of this kind can have).
 */
const NONE_WORDS = /^(?:none|no(?: real)? (?:solutions?|values?|candidates?)|∅|\{\s*\})$/i;
export const parseRadicalValueList = (text, variable = 'x') => {
  const raw = typeof text === 'string' || typeof text === 'number' ? String(text).trim() : '';
  if (!raw) return { kind: 'blank', values: [] };
  if (NONE_WORDS.test(raw)) return { kind: 'none', values: [] };
  const letter = /^[a-z]$/.test(variable) ? variable : 'x';
  const prefix = new RegExp(`^${letter}\\s*=\\s*`);
  const pieces = raw.split(/\s*(?:,|;|\bor\b|\band\b)\s*/).filter((piece) => piece !== '');
  const values = pieces.map((piece) => parseNumericAnswer(piece.replace(prefix, '')));
  if (!values.length || values.some((value) => value === null)) return { kind: 'unreadable', values: [] };
  const distinct = values.filter((value, index) => values.findIndex((other) => nearlyEqual(other, value, 1e-9)) === index);
  if (distinct.length > RADICAL_SOLVE_MAX_CANDIDATES) return { kind: 'unreadable', values: [] };
  return { kind: 'values', values: distinct.map(tidyZero) };
};

/** The same set of values, in any order, each within the tolerance. */
export const sameRadicalValueSet = (typed = [], expected = [], tolerance = 0.01) => typed.length === expected.length
  && expected.every((value) => typed.some((entry) => Math.abs(entry - value) <= tolerance))
  && typed.every((entry) => expected.some((value) => Math.abs(entry - value) <= tolerance));

// "Not real" for the left side at a value where an even root is of a negative.
const NOT_REAL_WORDS = /^(?:undefined|not real|non-?real|imaginary|no real (?:value|number)|not a real number|dne|does not exist)$/i;
export const isNotRealEntry = (text) => typeof text === 'string' && NOT_REAL_WORDS.test(text.trim());
