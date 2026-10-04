/*
 * EXACT ARITHMETIC FOR QUESTION FAMILIES — AND THE INDEPENDENT CHECK.
 *
 * Families that generate special cases (no solution, every real number) and
 * rational answers must never decide a case with floats: 1/3 + 2/3 is 1, and a
 * float that says 0.9999999999999999 turns an identity into "one solution".
 * Everything here is a reduced pair of safe integers { n, d } with d > 0.
 *
 * WHY A TERM TREE. A generated equation is built ONCE as a small tree of terms
 * (coef·x, a constant, m·(x + b)). The same tree is
 *
 *   - rendered for the student (LaTeX) and for the workspace (engine text),
 *   - and EXPANDED here, by a routine that knows nothing about how the family
 *     chose its numbers, into A·x + B = C·x + D.
 *
 * The family's rules then compare the case this expansion proves with the
 * case the family meant to build. A constructor that is wrong — a right side
 * that does not cancel, an identity with one constant off — is caught before
 * any student sees it, because the check reads the equation that is actually
 * displayed, not the generator's intent.
 *
 * Systems are classified the same way: the determinant and the two 2×2
 * minors of the augmented matrix, in exact rationals.
 *
 * Pure, and dependency-free on purpose: the family modules are on the student
 * app's startup path (tests/platform/sharedGradersStayOutOfStartupBundle).
 */

const gcdInt = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** A reduced rational, or throws: a family must never carry an inexact number. */
export const rational = (numerator, denominator = 1) => {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) {
    throw new RangeError(`Not an exact rational: ${numerator}/${denominator}`);
  }
  if (n === 0) return Object.freeze({ n: 0, d: 1 });
  const divisor = gcdInt(n, d);
  const sign = d < 0 ? -1 : 1;
  return Object.freeze({ n: (sign * n) / divisor, d: (sign * d) / divisor });
};

/** Accepts a rational, an integer, or "n/d" text. */
export const toRational = (value) => {
  if (value && typeof value === 'object' && 'n' in value && 'd' in value) return rational(value.n, value.d);
  if (typeof value === 'number') return rational(value, 1);
  const match = /^\s*(-?\d+)\s*(?:\/\s*(-?\d+))?\s*$/.exec(String(value ?? ''));
  if (!match) throw new RangeError(`Not an exact rational: ${value}`);
  return rational(Number(match[1]), match[2] === undefined ? 1 : Number(match[2]));
};

export const ZERO = rational(0);
export const ONE = rational(1);

export const add = (left, right) => {
  const a = toRational(left);
  const b = toRational(right);
  return rational(a.n * b.d + b.n * a.d, a.d * b.d);
};
export const negate = (value) => {
  const a = toRational(value);
  return rational(-a.n, a.d);
};
export const subtract = (left, right) => add(left, negate(right));
export const multiply = (left, right) => {
  const a = toRational(left);
  const b = toRational(right);
  return rational(a.n * b.n, a.d * b.d);
};
export const divide = (left, right) => {
  const a = toRational(left);
  const b = toRational(right);
  if (b.n === 0) throw new RangeError('Division by zero.');
  return rational(a.n * b.d, a.d * b.n);
};
export const equals = (left, right) => {
  const a = toRational(left);
  const b = toRational(right);
  return a.n === b.n && a.d === b.d;
};
export const isZero = (value) => toRational(value).n === 0;
export const isInteger = (value) => toRational(value).d === 1;
export const absolute = (value) => {
  const a = toRational(value);
  return rational(Math.abs(a.n), a.d);
};
/** For bounds checks only — never for deciding equality. */
export const toNumber = (value) => {
  const a = toRational(value);
  return a.n / a.d;
};

/** "7", "-7/3" — the exact text a key, a fingerprint or a report carries. */
export const rationalText = (value) => {
  const a = toRational(value);
  return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`;
};

/** "7", "\frac{7}{3}", "-\frac{7}{3}" — a number as a student reads it. */
export const rationalLatex = (value) => {
  const a = toRational(value);
  if (a.d === 1) return String(a.n);
  return `${a.n < 0 ? '-' : ''}\\frac{${Math.abs(a.n)}}{${a.d}}`;
};

/* ---------------------------------------------------------------------------
 * Linear term trees.
 *
 *   { kind: 'x', coef }                     coef · x
 *   { kind: 'c', value }                    a constant
 *   { kind: 'group', mult, inner: [...] }   mult · (inner terms)
 *
 * A side is a list of terms, read left to right.
 * ------------------------------------------------------------------------- */

export const xTerm = (coef) => Object.freeze({ kind: 'x', coef: toRational(coef) });
export const constTerm = (value) => Object.freeze({ kind: 'c', value: toRational(value) });
export const groupTerm = (mult, inner) => Object.freeze({ kind: 'group', mult: toRational(mult), inner: Object.freeze([...inner]) });

/**
 * A side expanded to { a, b } meaning a·x + b — by distributing every group
 * and summing like terms. This is the independent reading: it is given the
 * displayed tree, never the numbers the family meant.
 */
export const expandLinearSide = (terms, multiplier = ONE) => (Array.isArray(terms) ? terms : []).reduce((sum, term) => {
  if (term?.kind === 'x') return { a: add(sum.a, multiply(multiplier, term.coef)), b: sum.b };
  if (term?.kind === 'c') return { a: sum.a, b: add(sum.b, multiply(multiplier, term.value)) };
  if (term?.kind === 'group') {
    const inner = expandLinearSide(term.inner, multiply(multiplier, term.mult));
    return { a: add(sum.a, inner.a), b: add(sum.b, inner.b) };
  }
  throw new TypeError(`Unknown linear term ${JSON.stringify(term)}`);
}, { a: ZERO, b: ZERO });

export const LINEAR_CASE = Object.freeze({ ONE: 'one', NONE: 'none', INFINITE: 'infinite' });

/**
 * The solution set of left = right, decided exactly.
 *
 *   { case: 'one', solution }   A ≠ C: x = (D − B) / (A − C)
 *   { case: 'none' }            A = C, B ≠ D: the variable terms cancel and the constants conflict
 *   { case: 'infinite' }        A = C, B = D: both sides are the same expression
 */
export const classifyLinearEquation = (left, right) => {
  const L = expandLinearSide(left);
  const R = expandLinearSide(right);
  const simplified = Object.freeze({ A: L.a, B: L.b, C: R.a, D: R.b });
  if (!equals(L.a, R.a)) {
    return { case: LINEAR_CASE.ONE, solution: divide(subtract(R.b, L.b), subtract(L.a, R.a)), simplified };
  }
  return { case: equals(L.b, R.b) ? LINEAR_CASE.INFINITE : LINEAR_CASE.NONE, solution: null, simplified };
};

/* ---------------------------------------------------------------------------
 * Rendering a side. Two spellings of one tree: LaTeX for the student, and
 * plain engine text ("3 * (x + 2) + 1") for the Step Algebra workspaces.
 * ------------------------------------------------------------------------- */

const engineNumber = (value) => {
  const a = toRational(value);
  return a.d === 1 ? String(Math.abs(a.n)) : `(${Math.abs(a.n)}/${a.d})`;
};

/** The magnitude of a coefficient in front of x or a group: "", "3", "(1/2)". */
const engineCoefficient = (value) => (equals(absolute(value), ONE) ? '' : `${engineNumber(value)} * `);
const latexCoefficient = (value) => {
  const magnitude = absolute(value);
  if (equals(magnitude, ONE)) return '';
  return rationalLatex(magnitude);
};

const termSign = (term) => {
  if (term.kind === 'x') return toRational(term.coef).n < 0 ? -1 : 1;
  if (term.kind === 'c') return toRational(term.value).n < 0 ? -1 : 1;
  return toRational(term.mult).n < 0 ? -1 : 1;
};

const engineMagnitude = (term, variable) => {
  if (term.kind === 'x') return `${engineCoefficient(term.coef)}${variable}`;
  if (term.kind === 'c') return engineNumber(term.value);
  return `${engineCoefficient(term.mult)}(${engineSide(term.inner, variable)})`;
};

const latexMagnitude = (term, variable) => {
  if (term.kind === 'x') return `${latexCoefficient(term.coef)}${variable}`;
  if (term.kind === 'c') return rationalLatex(absolute(term.value));
  return `${latexCoefficient(term.mult)}\\left(${latexSide(term.inner, variable)}\\right)`;
};

const joinSide = (terms, magnitude) => (Array.isArray(terms) ? terms : []).map((term, index) => {
  const negative = termSign(term) < 0;
  const body = magnitude(term);
  if (index === 0) return negative ? `-${body}` : body;
  return `${negative ? ' - ' : ' + '}${body}`;
}).join('') || '0';

/** "3 * (x + 2) + 1", "(1/2) * x - 4": what the algebra engine parses. */
export const engineSide = (terms, variable = 'x') => joinSide(terms, (term) => engineMagnitude(term, variable));

/** "3\left(x + 2\right) + 1", "\frac{1}{2}x - 4": what a student reads. */
export const latexSide = (terms, variable = 'x') => joinSide(terms, (term) => latexMagnitude(term, variable));

/** A tree as stable text for a fingerprint: shape-preserving, presentation-free. */
export const sideFingerprint = (terms) => (Array.isArray(terms) ? terms : []).map((term) => {
  if (term.kind === 'x') return `${rationalText(term.coef)}x`;
  if (term.kind === 'c') return rationalText(term.value);
  return `${rationalText(term.mult)}(${sideFingerprint(term.inner)})`;
}).join(' ');

/* ---------------------------------------------------------------------------
 * 2×2 systems:  a1·x + b1·y = c1,  a2·x + b2·y = c2.
 * ------------------------------------------------------------------------- */

export const SYSTEM_CASE = LINEAR_CASE;

/**
 * The solution set of a 2×2 system, decided exactly.
 *
 *   one       det = a1·b2 − a2·b1 ≠ 0; the intersection by Cramer's rule
 *   none      det = 0 and the augmented minors are not both zero: parallel, distinct
 *   infinite  det = 0 and both augmented minors are zero: the same line twice
 *
 * A row with a = b = 0 is not a line, and is reported as `degenerate`.
 */
export const classifyLinearSystem2x2 = (rows) => {
  const [first, second] = (Array.isArray(rows) ? rows : []).map((row) => ({
    a: toRational(row.a),
    b: toRational(row.b),
    c: toRational(row.c),
  }));
  if (!first || !second) return { case: null, degenerate: true };
  if ((isZero(first.a) && isZero(first.b)) || (isZero(second.a) && isZero(second.b))) return { case: null, degenerate: true };
  const det = subtract(multiply(first.a, second.b), multiply(second.a, first.b));
  if (!isZero(det)) {
    return {
      case: SYSTEM_CASE.ONE,
      degenerate: false,
      det,
      solution: Object.freeze({
        x: divide(subtract(multiply(first.c, second.b), multiply(first.b, second.c)), det),
        y: divide(subtract(multiply(first.a, second.c), multiply(first.c, second.a)), det),
      }),
    };
  }
  const minorX = subtract(multiply(first.c, second.b), multiply(first.b, second.c));
  const minorY = subtract(multiply(first.a, second.c), multiply(first.c, second.a));
  return {
    case: isZero(minorX) && isZero(minorY) ? SYSTEM_CASE.INFINITE : SYSTEM_CASE.NONE,
    degenerate: false,
    det,
    solution: null,
  };
};

/** Does (x, y) satisfy a·x + b·y = c exactly? */
export const satisfiesRow = (row, point) => equals(
  add(multiply(row.a, point.x), multiply(row.b, point.y)),
  row.c,
);

/** "3x - 2y = 7": standard form, as the workspace reads it (implicit products). */
export const standardFormText = ({ a, b, c }, [first, second] = ['x', 'y']) => {
  const term = (value, name, leading) => {
    const coefficient = toRational(value);
    if (isZero(coefficient)) return '';
    const magnitude = absolute(coefficient);
    const body = `${equals(magnitude, ONE) ? '' : rationalText(magnitude)}${name}`;
    if (leading) return coefficient.n < 0 ? `-${body}` : body;
    return coefficient.n < 0 ? ` - ${body}` : ` + ${body}`;
  };
  const left = `${term(a, first, true)}${term(b, second, isZero(a))}` || '0';
  return `${left} = ${rationalText(c)}`;
};

/** "3x - 2y = 7" in LaTeX (the same text: integer coefficients need no markup). */
export const standardFormLatexExact = (row, variables) => {
  const text = standardFormText(row, variables);
  return text.replace(/(-?\d+)\/(\d+)/g, (_, numerator, denominator) => rationalLatex(rational(Number(numerator), Number(denominator))));
};
