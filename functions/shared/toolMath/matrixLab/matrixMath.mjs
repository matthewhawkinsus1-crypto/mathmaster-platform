/*
 * MATRIX LAB MATHEMATICS — exact, React-free, shared by the browser tool, the
 * shared grader the server runs, Pre-Flight and the tests.
 *
 * Every number is an exact rational held in BigInt, { n, d } with d > 0 and
 * gcd(|n|, d) = 1. The lesson's answers are fractions such as 59/4 and 10/3
 * and decimals such as 15.75; a floating-point inverse would print 3.333333
 * where a student typed 10/3, and decide that a matrix whose determinant is a
 * rounding error away from zero is invertible. Neither can happen here: a
 * matrix is singular exactly when its determinant is exactly zero, which is
 * what the calculator's "ERR: SINGULAR MATRIX" means.
 *
 * A cell a student types is read by parseWrittenNumber (fractionAnswer.mjs),
 * the platform's one reader of a written signed number: 3/4, -3/4, \frac{3}{4},
 * a typographic minus, integers and decimals. Anything else is not a number
 * (null) and is never guessed at.
 */
import { parseWrittenNumber } from '../../fractionAnswer.mjs';

/* ---------------------------------------------------------------------------
 * Exact rationals.
 * ------------------------------------------------------------------------- */

const bigAbs = (value) => (value < 0n ? -value : value);
const bigGcd = (left, right) => {
  let a = bigAbs(left);
  let b = bigAbs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};

export const rational = (numerator, denominator = 1n) => {
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d === 0n) return null;
  if (d < 0n) { n = -n; d = -d; }
  const divisor = bigGcd(n, d) || 1n;
  return Object.freeze({ n: n / divisor, d: d / divisor });
};

export const ZERO = rational(0n);
export const ONE = rational(1n);

export const isRational = (value) => Boolean(value) && typeof value.n === 'bigint' && typeof value.d === 'bigint' && value.d > 0n;
export const add = (a, b) => rational(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rational(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rational(a.n * b.n, a.d * b.d);
export const div = (a, b) => (b.n === 0n ? null : rational(a.n * b.d, a.d * b.n));
export const neg = (a) => rational(-a.n, a.d);
export const isZero = (a) => a.n === 0n;
export const equal = (a, b) => Boolean(a && b && a.n === b.n && a.d === b.d);

/** A rational from an authored JS number (integers and terminating decimals). */
export const fromNumber = (value) => {
  if (typeof value === 'bigint') return rational(value);
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (Number.isInteger(number)) return rational(BigInt(number));
  // A terminating decimal as written: 15.75 → 1575/100. toString keeps the
  // shortest spelling that round-trips, so 0.1 is 1/10, not 0.1000000000000000055.
  const text = String(number);
  if (/e/i.test(text)) return null;
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const sign = number < 0 ? -1n : 1n;
  return rational(sign * BigInt(`${whole}${fraction}`), 10n ** BigInt(fraction.length));
};

// Thousands separators a student may type in money ("2,086.25"). Only the
// unambiguous grouping 1–3 digits then groups of exactly 3 is read as one.
const stripThousands = (text) => (/^[-−]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text.trim()) ? text.replace(/,/g, '') : text);

/**
 * A cell as written by a student or an author → exact rational, or null when
 * it is blank or is not a single signed number. Numbers pass straight through.
 */
export const parseCell = (raw) => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'bigint') return rational(raw);
  if (typeof raw === 'number') return fromNumber(raw);
  if (isRational(raw)) return raw;
  const text = stripThousands(String(raw).trim()).replace(/^\+/, '').replace(/^\$/, '');
  if (!text) return null;
  const written = parseWrittenNumber(text);
  if (!written) return null;
  return rational(BigInt(written.value.n), BigInt(written.value.d));
};

/** 59/4, -3, 0 — how the lab prints an exact value. */
export const formatRational = (value) => {
  if (!isRational(value)) return '';
  return value.d === 1n ? String(value.n) : `${value.n}/${value.d}`;
};

/** A decimal reading, rounded to `places` (the calculator's ▸Dec view). */
export const formatDecimal = (value, places = 4) => {
  if (!isRational(value)) return '';
  if (value.d === 1n) return String(value.n);
  const scale = 10n ** BigInt(places);
  const negative = value.n < 0n;
  const scaled = (bigAbs(value.n) * scale * 2n + value.d) / (value.d * 2n); // round half up
  const whole = scaled / scale;
  const fraction = String(scaled % scale).padStart(places, '0').replace(/0+$/, '');
  const body = fraction ? `${whole}.${fraction}` : String(whole);
  return negative && scaled !== 0n ? `-${body}` : body;
};

export const toNumber = (value) => (isRational(value) ? Number(value.n) / Number(value.d) : NaN);

/* ---------------------------------------------------------------------------
 * Matrices: arrays of rows of rationals.
 * ------------------------------------------------------------------------- */

/**
 * One row's cells. A stored row may be `{ cells: [...] }`: Firestore cannot
 * hold an array inside an array, so a saved assignment keeps each matrix row
 * that way (firestoreAssignmentSafety.js), as the Systems Workspace does.
 */
export const matrixRowCells = (row) => {
  if (Array.isArray(row)) return row;
  if (row && typeof row === 'object' && Array.isArray(row.cells)) return row.cells;
  return null;
};

/** Rows of an authored matrix spec ({ rows } or a bare array), each as its cells. */
export const matrixRowsOf = (spec) => {
  const rows = Array.isArray(spec) ? spec : (spec && typeof spec === 'object' && Array.isArray(spec.rows) ? spec.rows : []);
  return rows.map((row) => matrixRowCells(row) || []);
};

/**
 * Parse a rectangular matrix. Returns null when it is empty, ragged, or any
 * cell is not a number — a matrix with a blank cell has no product.
 */
export const parseMatrix = (spec) => {
  const rows = matrixRowsOf(spec);
  if (!rows.length) return null;
  const width = rows[0].length;
  if (!width) return null;
  const parsed = [];
  for (const row of rows) {
    if (row.length !== width) return null;
    const cells = row.map(parseCell);
    if (cells.some((cell) => !cell)) return null;
    parsed.push(cells);
  }
  return parsed;
};

export const dimensionsOf = (matrix) => (Array.isArray(matrix) && matrix.length ? { rows: matrix.length, cols: matrix[0].length } : { rows: 0, cols: 0 });
export const formatDimensions = ({ rows, cols }) => `${rows} × ${cols}`;

export const identityMatrix = (size) => Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? ONE : ZERO)));

export const isIdentity = (matrix) => {
  const { rows, cols } = dimensionsOf(matrix);
  if (!rows || rows !== cols) return false;
  return matrix.every((row, i) => row.every((cell, j) => equal(cell, i === j ? ONE : ZERO)));
};

export const matricesEqual = (left, right) => {
  const a = dimensionsOf(left);
  const b = dimensionsOf(right);
  if (!a.rows || a.rows !== b.rows || a.cols !== b.cols) return false;
  return left.every((row, i) => row.every((cell, j) => equal(cell, right[i][j])));
};

export const MATRIX_ERRORS = Object.freeze({
  DIMENSION: 'dimension',
  SINGULAR: 'singular',
  NOT_SQUARE: 'notSquare',
  INVALID: 'invalid',
});

/** Whether A·B is defined: the columns of A must equal the rows of B. */
export const productDimensions = (leftDims, rightDims) => (
  leftDims.cols > 0 && leftDims.cols === rightDims.rows ? { rows: leftDims.rows, cols: rightDims.cols } : null
);

/**
 * The p,q entry of A·B: row p of A against column q of B. Also returns the
 * terms, so the lab can show "3(10) + 1(8) + …" for the cell a student is on.
 */
export const productEntry = (left, right, p, q) => {
  const terms = left[p].map((value, k) => ({ left: value, right: right[k][q] }));
  const value = terms.reduce((sum, term) => add(sum, mul(term.left, term.right)), ZERO);
  return { value, terms };
};

export const multiplyMatrices = (left, right) => {
  if (!left || !right) return { error: MATRIX_ERRORS.INVALID };
  const dims = productDimensions(dimensionsOf(left), dimensionsOf(right));
  if (!dims) return { error: MATRIX_ERRORS.DIMENSION };
  return {
    value: Array.from({ length: dims.rows }, (_, p) => Array.from({ length: dims.cols }, (_, q) => productEntry(left, right, p, q).value)),
  };
};

export const addMatrices = (left, right) => {
  if (!left || !right) return { error: MATRIX_ERRORS.INVALID };
  const a = dimensionsOf(left);
  const b = dimensionsOf(right);
  if (a.rows !== b.rows || a.cols !== b.cols) return { error: MATRIX_ERRORS.DIMENSION };
  return { value: left.map((row, i) => row.map((cell, j) => add(cell, right[i][j]))) };
};

/** Exact determinant by fraction-preserving elimination. */
export const determinant = (matrix) => {
  const { rows, cols } = dimensionsOf(matrix);
  if (!rows || rows !== cols) return null;
  const work = matrix.map((row) => [...row]);
  let det = ONE;
  for (let col = 0; col < rows; col += 1) {
    const pivotRow = work.findIndex((row, index) => index >= col && !isZero(row[col]));
    if (pivotRow < 0) return ZERO;
    if (pivotRow !== col) {
      [work[col], work[pivotRow]] = [work[pivotRow], work[col]];
      det = neg(det);
    }
    const pivot = work[col][col];
    det = mul(det, pivot);
    for (let row = col + 1; row < rows; row += 1) {
      const factor = div(work[row][col], pivot);
      if (isZero(factor)) continue;
      work[row] = work[row].map((value, index) => sub(value, mul(factor, work[col][index])));
    }
  }
  return det;
};

/** Reduced row-echelon form, exactly. */
export const rref = (matrix) => {
  const work = matrix.map((row) => [...row]);
  const height = work.length;
  const width = height ? work[0].length : 0;
  let pivotRow = 0;
  const pivotColumns = [];
  for (let col = 0; col < width && pivotRow < height; col += 1) {
    const found = work.findIndex((row, index) => index >= pivotRow && !isZero(row[col]));
    if (found < 0) continue;
    [work[pivotRow], work[found]] = [work[found], work[pivotRow]];
    const pivot = work[pivotRow][col];
    work[pivotRow] = work[pivotRow].map((value) => div(value, pivot));
    for (let row = 0; row < height; row += 1) {
      if (row === pivotRow || isZero(work[row][col])) continue;
      const factor = work[row][col];
      work[row] = work[row].map((value, index) => sub(value, mul(factor, work[pivotRow][index])));
    }
    pivotColumns.push(col);
    pivotRow += 1;
  }
  return { rows: work, pivotColumns };
};

export const rank = (matrix) => (Array.isArray(matrix) && matrix.length ? rref(matrix).pivotColumns.length : 0);

/** A⁻¹, or the calculator's error: a non-square or singular matrix has none. */
export const inverseMatrix = (matrix) => {
  if (!matrix) return { error: MATRIX_ERRORS.INVALID };
  const { rows, cols } = dimensionsOf(matrix);
  if (rows !== cols) return { error: MATRIX_ERRORS.NOT_SQUARE };
  const augmented = matrix.map((row, i) => [...row, ...identityMatrix(rows)[i]]);
  const reduced = rref(augmented);
  const leftIsIdentity = reduced.rows.every((row, i) => row.slice(0, rows).every((cell, j) => equal(cell, i === j ? ONE : ZERO)));
  if (!leftIsIdentity) return { error: MATRIX_ERRORS.SINGULAR };
  return { value: reduced.rows.map((row) => row.slice(rows)) };
};

/**
 * Classify A·X = B. `one` carries the solution column; a singular A is `none`
 * (inconsistent: the constants break the dependency) or `many` (dependent:
 * the constants follow it) — the two cases the calculator cannot tell apart.
 */
export const SOLUTION_TYPES = Object.freeze({ ONE: 'one', NONE: 'none', MANY: 'many' });

export const classifySystem = (coefficients, constants) => {
  const a = Array.isArray(coefficients) ? coefficients : null;
  const b = Array.isArray(constants) ? constants : null;
  if (!a || !b || a.length !== b.length || !a.length) return null;
  const augmented = a.map((row, i) => [...row, Array.isArray(b[i]) ? b[i][0] : b[i]]);
  if (augmented.some((row) => row.some((cell) => !isRational(cell)))) return null;
  const coefficientRank = rank(a);
  const augmentedRank = rank(augmented);
  const variables = a[0].length;
  if (augmentedRank > coefficientRank) return { type: SOLUTION_TYPES.NONE };
  if (coefficientRank < variables) return { type: SOLUTION_TYPES.MANY };
  const reduced = rref(augmented).rows;
  return { type: SOLUTION_TYPES.ONE, solution: reduced.slice(0, variables).map((row) => row[variables]) };
};

/** Whether row `candidate` is a nonzero multiple of row `target` (both include the constant). */
export const rowMultipleOf = (candidate, target) => {
  if (!candidate || !target || candidate.length !== target.length) return null;
  let factor = null;
  for (let k = 0; k < target.length; k += 1) {
    const t = target[k];
    const c = candidate[k];
    if (isZero(t)) {
      if (!isZero(c)) return null;
      continue;
    }
    const ratio = div(c, t);
    if (factor === null) factor = ratio;
    else if (!equal(factor, ratio)) return null;
  }
  return factor && !isZero(factor) ? factor : null;
};

/* ---------------------------------------------------------------------------
 * Linear equations in standard form.
 * ------------------------------------------------------------------------- */

const MINUS = /[−–—﹣－]/g;

// One side of a linear equation → { coefficients: Map(variable → rational), constant }.
// Reads terms such as 3x, -x, + 2.5y, 15.75x, (1/2)z, 1/2z, 12, -4y. Anything
// else (a product of variables, a parenthesis around a sum) is not linear
// input this reader claims to understand, so it returns null.
const parseSide = (text, variables) => {
  const source = text.replace(MINUS, '-').replace(/\s+/g, '').replace(/·|\*/g, '');
  if (!source) return null;
  const terms = source.replace(/-/g, '+-').split('+').filter((term) => term !== '');
  if (!terms.length) return null;
  const coefficients = new Map(variables.map((variable) => [variable, ZERO]));
  let constant = ZERO;
  for (const rawTerm of terms) {
    const match = rawTerm.match(/^(-?)\(?([0-9./]*)\)?([A-Za-z]?)$/);
    if (!match) return null;
    const [, sign, number, variable] = match;
    if (variable && !variables.includes(variable)) return null;
    let magnitude = ONE;
    if (number) {
      magnitude = parseCell(number);
      if (!magnitude) return null;
    } else if (!variable) {
      return null;
    }
    const value = sign ? neg(magnitude) : magnitude;
    if (variable) coefficients.set(variable, add(coefficients.get(variable), value));
    else constant = add(constant, value);
  }
  return { coefficients, constant };
};

/**
 * "5x = -4y" over [x, y, z] → { row: [5, 4, 0], constant: 0 }: every variable
 * term on the left, the constant on the right (Ax + By + Cz = D). Returns null
 * when the text is not one linear equation in those variables.
 */
export const parseLinearEquation = (equation, variables = ['x', 'y', 'z']) => {
  const parts = String(equation ?? '').split('=');
  if (parts.length !== 2) return null;
  const left = parseSide(parts[0], variables);
  const right = parseSide(parts[1], variables);
  if (!left || !right) return null;
  return {
    row: variables.map((variable) => sub(left.coefficients.get(variable), right.coefficients.get(variable))),
    constant: sub(right.constant, left.constant),
  };
};

/**
 * The "copied it as written" reading of an equation that is not in standard
 * form: each variable's coefficient taken from whichever side it appears on,
 * with its sign as printed, and the right side's constant. It is Nicky's error
 * in the lesson (2x − 4y = 5z − 1 read as [2, −4, 5 | −1]) and is used only to
 * name that mistake in feedback — never to accept it.
 */
export const asWrittenReading = (equation, variables = ['x', 'y', 'z']) => {
  const parts = String(equation ?? '').split('=');
  if (parts.length !== 2) return null;
  const left = parseSide(parts[0], variables);
  const right = parseSide(parts[1], variables);
  if (!left || !right) return null;
  return {
    row: variables.map((variable) => add(left.coefficients.get(variable), right.coefficients.get(variable))),
    constant: isZero(right.constant) ? left.constant : right.constant,
  };
};

/** A system's coefficient matrix A and constant matrix B (n × 1). */
export const systemMatrices = (equations, variables = ['x', 'y', 'z']) => {
  const parsed = (Array.isArray(equations) ? equations : []).map((equation) => parseLinearEquation(equation, variables));
  if (!parsed.length || parsed.some((entry) => !entry)) return null;
  return { A: parsed.map((entry) => entry.row), B: parsed.map((entry) => [entry.constant]) };
};

/** Is an equation already written as Ax + By + Cz = D (variables left, one constant right)? */
export const isStandardForm = (equation, variables = ['x', 'y', 'z']) => {
  const parts = String(equation ?? '').split('=');
  if (parts.length !== 2) return false;
  const left = parseSide(parts[0], variables);
  const right = parseSide(parts[1], variables);
  if (!left || !right) return false;
  return isZero(left.constant) && variables.every((variable) => isZero(right.coefficients.get(variable)));
};

/** Display text for a row: 2x − y − 2z = 3. */
export const formatEquation = (row, constant, variables = ['x', 'y', 'z']) => {
  const pieces = [];
  row.forEach((coefficient, index) => {
    if (isZero(coefficient)) return;
    const negative = coefficient.n < 0n;
    const magnitude = negative ? neg(coefficient) : coefficient;
    const body = `${equal(magnitude, ONE) ? '' : formatRational(magnitude)}${variables[index]}`;
    if (!pieces.length) pieces.push(negative ? `−${body}` : body);
    else pieces.push(negative ? `− ${body}` : `+ ${body}`);
  });
  const left = pieces.length ? pieces.join(' ') : '0';
  return `${left} = ${formatRational(constant).replace(/^-/, '−')}`;
};
