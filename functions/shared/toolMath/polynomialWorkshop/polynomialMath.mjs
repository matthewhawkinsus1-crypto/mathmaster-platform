import { nearlyEqual } from '../shared/toolMath.mjs';
import { UNANSWERED } from '../shared/judgmentChoices.mjs';
import { simplifiedPolynomialTerms, readTypedPolynomial, monomialSignature } from '../../simplifiedPolynomialForm.mjs';

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
  // Trial division up to |c| is unbounded in practice: a constant term of 1e12
  // is two trillion iterations, which freezes the tab. Classroom quadratics
  // factor far below this cap; beyond it, "not factorable by inspection".
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

/*
 * WHAT THE WORKSHOP SHOWS FOR AN UNAUTHORED QUESTION.
 *
 * One table, read by PolynomialWorkshop.jsx to draw each view and by the
 * shared grader to mark it, so the problem on screen and the problem graded
 * can never drift apart.
 */
export const POLYNOMIAL_WORKSHOP_DEFAULTS = Object.freeze({
  factorZero: Object.freeze({ coefficients: Object.freeze([1, -5, 6]), candidateRoot: 2 }),
  multiplyArea: Object.freeze({ leftBinomial: Object.freeze([2, 3]), rightBinomial: Object.freeze([1, -4]) }),
  factorQuadratic: Object.freeze({ coefficients: Object.freeze([1, -5, 6]) }),
  division: Object.freeze({ dividend: Object.freeze([1, -4, -7, 10]), divisor: Object.freeze([1, -2]) }),
  graphConnection: Object.freeze({
    roots: Object.freeze([Object.freeze({ root: -2, multiplicity: 2 }), Object.freeze({ root: 3, multiplicity: 1 })]),
    leadingCoefficient: 1,
  }),
  rationalFeatures: Object.freeze({ numeratorRoots: Object.freeze([2, -1]), denominatorRoots: Object.freeze([2, 4]) }),
});

/*
 * What each <select> holds before the student touches it: nothing. Every one
 * of them is a judgment the student is asked to make, so it opens on
 * "Choose…" (UNANSWERED, judgmentChoices.mjs) — PolynomialWorkshop.jsx starts
 * its selects there — and unanswered is no option, so it is neither complete
 * nor correct in the shared grader.
 */
export const POLYNOMIAL_WORKSHOP_STARTING_SELECTIONS = Object.freeze({
  factorZero: Object.freeze({ factorChoice: UNANSWERED }),
  graphConnection: Object.freeze({ behavior: UNANSWERED, end: UNANSWERED }),
  rationalFeatures: Object.freeze({ choice: UNANSWERED }),
});

/*
 * What the selects PRE-SELECTED before they opened unanswered. Work an earlier
 * client saved at that start — a draft or checkpoint revision, say after Undo
 * took a view back to it — holds exactly these without the student having
 * chosen them, so the shared grader still reads such work identical to them as
 * untouched (not complete: a deadline never submits it), exactly as it did
 * while they were the start. Work from today's workshop carries OWN_CHOICES
 * (judgmentChoices.mjs): its choices are the student's, these included. An
 * explicit Check of such work is graded as always.
 */
export const POLYNOMIAL_WORKSHOP_PRESELECTED_SELECTIONS = Object.freeze({
  factorZero: Object.freeze({ factorChoice: 'yes' }),
  graphConnection: Object.freeze({ behavior: 'crosses', end: 'both ends rise' }),
  rationalFeatures: Object.freeze({ choice: 'hole' }),
});

/*
 * A coefficient list a student typed: comma-separated numbers, highest degree
 * first. Each piece is read exactly as the workshop always read it — Number()
 * of the trimmed piece, an unreadable piece skipped, and an EMPTY piece
 * between two commas ("1,,-4") a 0 coefficient holding its degree's place —
 * with two exceptions:
 *
 *   - a blank box is NO answer, never the list [0]. `Number('')` is 0, so a
 *     blank remainder box used to read as the remainder 0 and was marked right
 *     on any exact division without the student entering anything;
 *   - a stray trailing comma ("1, -2, -11,") adds no coefficient. It used to
 *     append a 0 and turn a correct list wrong.
 */
export const parseCoefficientList = (text) => {
  const pieces = String(text ?? '').split(',').map((value) => value.trim());
  while (pieces.length && pieces[pieces.length - 1] === '') pieces.pop();
  return pieces.map(Number).filter(Number.isFinite);
};

/** Two coefficient lists name the same polynomial term by term, in order. */
export const sameCoefficientList = (actual = [], expected = [], tolerance = 0.01) => actual.length === expected.length
  && actual.every((value, index) => nearlyEqual(value, expected[index], tolerance));

/** The zero the graph-connection view asks about: the authored one, else the first root. */
export const graphConnectionTargetEntry = (roots = [], targetRoot) => {
  const target = targetRoot ?? roots[0].root;
  return roots.find((entry) => nearlyEqual(entry.root, target)) || roots[0];
};

/** The x-value the rational-features view asks about: the authored one, else the smallest root. */
export const rationalFeatureTargetValue = (features = [], targetValue) => Number(targetValue ?? features[0]?.root ?? 2);

/*
 * What happens at x = targetValue: the feature listed there, or `none` when
 * neither the numerator nor the denominator vanishes at that value — the
 * function is defined and non-zero there, so "None of these" is the answer.
 */
export const rationalFeatureTypeAt = (features = [], targetValue) => (
  features.find((feature) => nearlyEqual(feature.root, targetValue))?.type ?? 'none'
);

/* ===========================================================================
 * POLYNOMIALS WRITTEN AS TEXT — the any-size area model and add & subtract.
 *
 * The coefficient-list views above are one letter, x. These read a polynomial
 * the way a teacher writes it — `a^2+3a-4`, `-y`, `4y^2+2y-3`, `x-y` — in any
 * letters, term by term in the order written, through the same simplest-form
 * reader the typed-answer grader uses (../../simplifiedPolynomialForm.mjs).
 * A term is { coefficient, powers: { letter: exponent }, signature }.
 *
 *   areaModelKey     multiplyArea with `leftFactor` / `rightFactor`: one row
 *                    per term of the left factor, one column per term of the
 *                    right, each cell the product of its row and column, and
 *                    the product in simplest form.
 *   addSubtractKey   addSubtract with `operation` ('add' | 'subtract'),
 *                    `firstPolynomial`, `secondPolynomial`: one column per
 *                    kind of term (like terms share a column), the second
 *                    polynomial's term in each column — its OPPOSITE when
 *                    subtracting — each column's sum, and the result.
 *
 * An authored polynomial must itself be in simplest form, with no zero term:
 * a factor written `2x+3x` would draw a row the student cannot reason about.
 * ======================================================================== */

// Products of authored decimals (0.022 · 1300) carry binary noise; twelve
// significant figures is far past any coefficient a lesson shows.
const tidy = (value) => (Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12)));
const sameCoefficient = (actual, expected) => Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));

/** The most terms either factor or polynomial may have, and the most cells. */
export const POLYNOMIAL_TEXT_LIMITS = Object.freeze({ terms: 6, cells: 16, columns: 8 });

const makeTerm = (coefficient, powers) => {
  const clean = Object.fromEntries(Object.entries(powers).filter(([, power]) => power !== 0));
  return { coefficient: tidy(coefficient), powers: clean, signature: monomialSignature(clean) };
};

/** An authored polynomial's terms in written order, or null when it is not one to draw. */
export const authoredPolynomialTerms = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const terms = simplifiedPolynomialTerms(value);
  if (!terms || !terms.length || terms.length > POLYNOMIAL_TEXT_LIMITS.terms) return null;
  if (terms.some((term) => term.coefficient === 0)) return null;
  return terms.map((term) => makeTerm(term.coefficient, term.powers));
};

export const termDegree = (term) => Object.values(term.powers).reduce((sum, power) => sum + power, 0);

export const multiplyTerms = (left, right) => {
  const powers = { ...left.powers };
  Object.entries(right.powers).forEach(([name, power]) => { powers[name] = (powers[name] || 0) + power; });
  return makeTerm(left.coefficient * right.coefficient, powers);
};

/** Highest degree first; within a degree, the higher power of the earlier letter first: x³, x²y, xy², y³. */
const byDegree = (a, b) => {
  const degree = termDegree(b) - termDegree(a);
  if (degree) return degree;
  const letters = [...new Set([...Object.keys(a.powers), ...Object.keys(b.powers)])].sort();
  for (const letter of letters) {
    const difference = (b.powers[letter] || 0) - (a.powers[letter] || 0);
    if (difference) return difference;
  }
  return 0;
};

/** Like terms combined, zero terms dropped, highest degree first. */
export const combineLikeTerms = (terms = []) => {
  const bySignature = new Map();
  terms.forEach((term) => {
    const current = bySignature.get(term.signature);
    bySignature.set(term.signature, current ? makeTerm(current.coefficient + term.coefficient, term.powers) : makeTerm(term.coefficient, term.powers));
  });
  return [...bySignature.values()].filter((term) => term.coefficient !== 0).sort(byDegree);
};

/** The multiplyArea key for a question written with `leftFactor` / `rightFactor`, or null. */
export const areaModelKey = (question = {}) => {
  const rows = authoredPolynomialTerms(question.leftFactor);
  const columns = authoredPolynomialTerms(question.rightFactor);
  if (!rows || !columns || rows.length * columns.length > POLYNOMIAL_TEXT_LIMITS.cells) return null;
  const cells = rows.flatMap((row) => columns.map((column) => multiplyTerms(row, column)));
  return { rows, columns, cells, product: combineLikeTerms(cells) };
};

export const ADD_SUBTRACT_OPERATIONS = Object.freeze(['add', 'subtract']);

/** The addSubtract key, or null when the question cannot be drawn. */
export const addSubtractKey = (question = {}) => {
  const operation = question.operation;
  if (!ADD_SUBTRACT_OPERATIONS.includes(operation)) return null;
  const first = authoredPolynomialTerms(question.firstPolynomial);
  const second = authoredPolynomialTerms(question.secondPolynomial);
  if (!first || !second) return null;
  // Like terms written twice in one polynomial are not authored in simplest
  // form, so each polynomial has at most one term per column.
  const columns = combineLikeTerms([...first, ...second].map((term) => makeTerm(1, term.powers)));
  if (columns.length > POLYNOMIAL_TEXT_LIMITS.columns) return null;
  const sign = operation === 'subtract' ? -1 : 1;
  const inColumn = (terms, column) => terms.find((term) => term.signature === column.signature) || null;
  const firstByColumn = columns.map((column) => inColumn(first, column));
  const secondByColumn = columns.map((column) => inColumn(second, column));
  // What is added in each column: the second polynomial's term, or its opposite.
  const added = secondByColumn.map((term) => (term ? makeTerm(sign * term.coefficient, term.powers) : null));
  const sums = columns.map((column, index) => makeTerm(
    (firstByColumn[index]?.coefficient || 0) + (added[index]?.coefficient || 0),
    column.powers,
  ));
  return { operation, first, second, columns, firstByColumn, secondByColumn, added, sums, result: combineLikeTerms(sums) };
};

/*
 * What the student typed in one box, read as ONE term in simplest form:
 * { term } or { problem }. `0` reads as the zero term.
 */
export const readTypedTerm = (value) => {
  const read = readTypedPolynomial(value);
  if (read.problem) return { problem: read.problem };
  if (read.terms.length !== 1) return { problem: 'notOneTerm' };
  return { term: makeTerm(read.terms[0].coefficient, read.terms[0].powers) };
};

/** A typed box holds exactly the expected term (a zero term when `expected` is null or 0). */
export const typedTermMatches = (value, expected) => {
  const { term } = readTypedTerm(value);
  if (!term) return false;
  const want = expected && expected.coefficient !== 0 ? expected : null;
  if (!want) return term.coefficient === 0;
  return term.signature === want.signature && sameCoefficient(term.coefficient, want.coefficient);
};

/** A typed polynomial in simplest form with exactly the expected terms. */
export const typedPolynomialMatches = (value, expectedTerms = []) => {
  const typed = simplifiedPolynomialTerms(value);
  if (!typed) return false;
  const actual = combineLikeTerms(typed.map((term) => makeTerm(term.coefficient, term.powers)));
  return actual.length === expectedTerms.length
    && expectedTerms.every((term) => actual.some((other) => other.signature === term.signature && sameCoefficient(other.coefficient, term.coefficient)));
};

/* ---- writing terms for the student to read ---------------------------- */

const MINUS_SIGN = '−';
const SUPERSCRIPTS = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const magnitudeText = (value) => String(Number(Math.abs(value).toPrecision(10)));
const lettersText = (powers, power) => Object.entries(powers)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([name, exponent]) => (exponent === 1 ? name : `${name}${power(exponent)}`))
  .join('');

const writeTerm = (term, power, minus) => {
  if (term.coefficient === 0) return '0';
  const letters = lettersText(term.powers, power);
  const unit = letters && Math.abs(Math.abs(term.coefficient) - 1) < 1e-12;
  return `${term.coefficient < 0 ? minus : ''}${unit ? '' : magnitudeText(term.coefficient)}${letters}`;
};

/** "−4y³": one term as plain text, for labels a screen reader also reads. */
export const termPlainText = (term) => (term ? writeTerm(term, (exponent) => String(exponent).split('').map((digit) => SUPERSCRIPTS[Number(digit)]).join(''), MINUS_SIGN) : '0');

/** "-4y^{3}": one term as LaTeX. */
export const termLatex = (term) => (term ? writeTerm(term, (exponent) => `^{${exponent}}`, '-') : '0');

/** "a^{3}+8a-9": a list of terms as LaTeX, signs between them; "0" for none. */
export const polynomialTermsLatex = (terms = []) => {
  const shown = terms.filter((term) => term && term.coefficient !== 0);
  if (!shown.length) return '0';
  return shown.map((term, index) => {
    const body = termLatex({ ...term, coefficient: Math.abs(term.coefficient) });
    if (index === 0) return term.coefficient < 0 ? `-${body}` : body;
    return term.coefficient < 0 ? `-${body}` : `+${body}`;
  }).join('');
};

/** "a³ + 8a − 9": a list of terms as plain text. */
export const polynomialTermsPlainText = (terms = []) => {
  const shown = terms.filter((term) => term && term.coefficient !== 0);
  if (!shown.length) return '0';
  return shown.map((term, index) => {
    const body = termPlainText({ ...term, coefficient: Math.abs(term.coefficient) });
    if (index === 0) return term.coefficient < 0 ? `${MINUS_SIGN}${body}` : body;
    return `${term.coefficient < 0 ? MINUS_SIGN : '+'} ${body}`;
  }).join(' ');
};

/** The name of a like-terms column: its letters ("a³", "xy"), or "constant". */
export const columnPlainText = (column) => (column.signature ? lettersText(column.powers, (exponent) => String(exponent).split('').map((digit) => SUPERSCRIPTS[Number(digit)]).join('')) : 'constant');

/*
 * The printed answer key for a polynomial written as text (the teacher's
 * worksheet export): every step the workshop grades, then the answer. A
 * question in coefficient lists prints no Workshop lines, as before.
 */
export const polynomialWorkshopAnswerLines = (question = {}) => {
  if (question.mode === 'multiplyArea' && (typeof question.leftFactor === 'string' || typeof question.rightFactor === 'string')) {
    const key = areaModelKey(question);
    if (!key) return [];
    return [
      `Area model cells: ${key.cells.map(termPlainText).join(', ')}`,
      `Product: ${polynomialTermsPlainText(key.product)}`,
    ];
  }
  if (question.mode === 'addSubtract') {
    const key = addSubtractKey(question);
    if (!key) return [];
    return [
      ...(key.operation === 'subtract' ? [`Opposites: ${key.added.filter(Boolean).map(termPlainText).join(', ')}`] : []),
      `Combined columns: ${key.sums.map(termPlainText).join(', ')}`,
      `Result: ${polynomialTermsPlainText(key.result)}`,
    ];
  }
  return [];
};
