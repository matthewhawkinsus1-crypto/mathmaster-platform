import { sameValue } from '../../answerEquivalence.mjs';
import { normalizeAlgebraicText, parsePolynomial } from '../../algebraicForm.mjs';

const EPSILON = 1e-9;

const nearlyZero = (value) => Math.abs(Number(value) || 0) <= EPSILON;

const trimLeadingZeros = (coefficients = []) => {
  const values = coefficients.map(Number);
  while (values.length > 1 && nearlyZero(values[0])) values.shift();
  return values.length ? values : [0];
};

const finiteCoefficients = (coefficients) => (
  Array.isArray(coefficients)
  && coefficients.length > 0
  && coefficients.every((value) => Number.isFinite(Number(value)))
);

export const polynomialCoefficientsFromFunction = (spec = {}) => {
  if (!spec || typeof spec !== 'object') throw new Error('Function specification is required.');

  if (finiteCoefficients(spec.coefficients)) return trimLeadingZeros(spec.coefficients);

  const type = String(spec.type || spec.family || '').trim();
  const a = Number(spec.a ?? spec.m ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? spec.b ?? 0);
  if (![a, h, k].every(Number.isFinite)) throw new Error('Function parameters must be finite.');

  if (type === 'linear' || type === 'line') {
    if (nearlyZero(a)) return [k];
    return trimLeadingZeros([a, k - a * h]);
  }

  if (type === 'quadratic') {
    return trimLeadingZeros([
      a,
      -2 * a * h,
      a * h * h + k,
    ]);
  }

  if (type === 'cubic') {
    return trimLeadingZeros([
      a,
      -3 * a * h,
      3 * a * h * h,
      k - a * h * h * h,
    ]);
  }

  if (type === 'polynomial' && !finiteCoefficients(spec.coefficients)) {
    throw new Error('Polynomial functions require a finite coefficients array.');
  }

  throw new Error(`Unsupported function-operations family: ${type || '(missing)'}.`);
};

const align = (left, right) => {
  const length = Math.max(left.length, right.length);
  return [
    Array(length - left.length).fill(0).concat(left),
    Array(length - right.length).fill(0).concat(right),
  ];
};

export const addPolynomials = (left, right) => {
  const [a, b] = align(left, right);
  return trimLeadingZeros(a.map((value, index) => value + b[index]));
};

export const subtractPolynomials = (left, right) => {
  const [a, b] = align(left, right);
  return trimLeadingZeros(a.map((value, index) => value - b[index]));
};

export const multiplyPolynomials = (left, right) => {
  const out = Array(left.length + right.length - 1).fill(0);
  left.forEach((a, i) => right.forEach((b, j) => { out[i + j] += Number(a) * Number(b); }));
  return trimLeadingZeros(out);
};

export const composePolynomials = (outer, inner) => {
  let result = [0];
  outer.forEach((coefficient) => {
    result = addPolynomials(multiplyPolynomials(result, inner), [Number(coefficient)]);
  });
  return trimLeadingZeros(result);
};

const dividePolynomials = (dividend, divisor) => {
  const numerator = trimLeadingZeros(dividend);
  const denominator = trimLeadingZeros(divisor);
  if (denominator.length === 1 && nearlyZero(denominator[0])) throw new Error('Cannot divide by the zero function.');
  if (numerator.length < denominator.length) return { quotient: [0], remainder: numerator };

  const remainder = numerator.slice();
  const quotient = Array(numerator.length - denominator.length + 1).fill(0);
  for (let index = 0; index < quotient.length; index += 1) {
    const lead = remainder[index] / denominator[0];
    quotient[index] = lead;
    for (let offset = 0; offset < denominator.length; offset += 1) {
      remainder[index + offset] -= lead * denominator[offset];
      if (nearlyZero(remainder[index + offset])) remainder[index + offset] = 0;
    }
  }
  return {
    quotient: trimLeadingZeros(quotient),
    remainder: trimLeadingZeros(remainder.slice(quotient.length)),
  };
};

const linearZero = (coefficients) => {
  const values = trimLeadingZeros(coefficients);
  if (values.length !== 2 || nearlyZero(values[0])) return null;
  return -values[1] / values[0];
};

const safelyDerivedRealZeros = (coefficients) => {
  const values = trimLeadingZeros(coefficients);
  if (values.length === 1) return [];
  if (values.length === 2) return [linearZero(values)];
  if (values.length !== 3 || nearlyZero(values[0])) return null;

  const [a, b, c] = values;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return [];
  if (nearlyZero(discriminant)) return [-b / (2 * a)];
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
};

const formatNumber = (value) => {
  const rounded = Math.abs(value - Math.round(value)) <= EPSILON ? Math.round(value) : Number(value.toFixed(8));
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

export const formatPolynomialExpression = (coefficients = [], variable = 'x') => {
  const values = trimLeadingZeros(coefficients);
  const degree = values.length - 1;
  const pieces = [];

  values.forEach((coefficient, index) => {
    const value = nearlyZero(coefficient) ? 0 : Number(coefficient);
    if (value === 0) return;
    const power = degree - index;
    const magnitude = Math.abs(value);
    const variablePart = power === 0 ? '' : power === 1 ? variable : `${variable}^${power}`;
    const coefficientPart = variablePart && Math.abs(magnitude - 1) <= EPSILON ? '' : formatNumber(magnitude);
    const term = `${coefficientPart}${variablePart}` || '0';

    if (!pieces.length) pieces.push(value < 0 ? `-${term}` : term);
    else pieces.push(`${value < 0 ? '-' : '+'} ${term}`);
  });

  return pieces.length ? pieces.join(' ') : '0';
};

const uniqueSortedNumbers = (values = []) => {
  const out = [];
  values.map(Number).filter(Number.isFinite).sort((a, b) => a - b).forEach((value) => {
    if (!out.some((existing) => Math.abs(existing - value) <= EPSILON)) out.push(value);
  });
  return out;
};

const authoredExcludedValues = (restrictions) => {
  if (Array.isArray(restrictions)) return restrictions;
  if (!restrictions || typeof restrictions !== 'object') return [];
  return restrictions.excludedValues || restrictions.exclude || restrictions.values || [];
};

export const deriveFunctionOperations = ({
  f,
  g,
  operations = ['sum', 'difference', 'product', 'quotient'],
  composeOrder = 'fOfG',
  restrictions,
} = {}) => {
  const fCoefficients = polynomialCoefficientsFromFunction(f);
  const gCoefficients = polynomialCoefficientsFromFunction(g);
  const requested = new Set(operations);
  const out = {
    f: { coefficients: fCoefficients, expression: formatPolynomialExpression(fCoefficients) },
    g: { coefficients: gCoefficients, expression: formatPolynomialExpression(gCoefficients) },
  };

  if (requested.has('sum')) {
    const coefficients = addPolynomials(fCoefficients, gCoefficients);
    out.sum = { coefficients, expression: formatPolynomialExpression(coefficients) };
  }
  if (requested.has('difference')) {
    const coefficients = subtractPolynomials(fCoefficients, gCoefficients);
    out.difference = { coefficients, expression: formatPolynomialExpression(coefficients) };
  }
  if (requested.has('product')) {
    const coefficients = multiplyPolynomials(fCoefficients, gCoefficients);
    out.product = { coefficients, expression: formatPolynomialExpression(coefficients) };
  }
  if (requested.has('quotient')) {
    const derivedZeros = safelyDerivedRealZeros(gCoefficients);
    const authoredRestrictions = authoredExcludedValues(restrictions);
    if (derivedZeros == null && authoredRestrictions.length === 0) {
      throw new Error('A nonlinear quotient denominator with unsupported roots requires explicitly authored restrictions/excluded values.');
    }
    const excludedValues = uniqueSortedNumbers([
      ...(derivedZeros || []),
      ...authoredRestrictions,
    ]);
    const division = dividePolynomials(fCoefficients, gCoefficients);
    const dividesExactly = division.remainder.every(nearlyZero);
    const numeratorExpression = formatPolynomialExpression(fCoefficients);
    const denominatorExpression = formatPolynomialExpression(gCoefficients);
    out.quotient = {
      numerator: fCoefficients,
      denominator: gCoefficients,
      expression: dividesExactly
        ? formatPolynomialExpression(division.quotient)
        : `(${numeratorExpression})/(${denominatorExpression})`,
      excludedValues,
      simplified: dividesExactly,
    };
  }
  if (requested.has('composition')) {
    const outer = composeOrder === 'gOfF' ? gCoefficients : fCoefficients;
    const inner = composeOrder === 'gOfF' ? fCoefficients : gCoefficients;
    const coefficients = composePolynomials(outer, inner);
    out.composition = {
      coefficients,
      expression: formatPolynomialExpression(coefficients),
      composeOrder: composeOrder === 'gOfF' ? 'gOfF' : 'fOfG',
    };
  }

  return out;
};

/*
 * A quotient answer is graded as a RATIONAL FUNCTION, not as a spelling.
 *
 * The key for (x² − 1)/(x² + x) is the unreduced fraction (g does not divide f
 * exactly), and the lab asks the student to simplify. The old comparison
 * (sameRationalExpression) also required the numerator and denominator
 * degrees to match the key's, so the simplified (x − 1)/x was marked wrong.
 *
 * The comparison is symbolic — no sampling: each side is read as one
 * numerator over one denominator (the same top-level split
 * sameRationalExpression makes), and the answer is equal to the key as a
 * rational function exactly when the cross-products are the same polynomial.
 * That alone would also accept an answer with an EXTRA hole — (x − 1)(x − 5) /
 * (x(x − 5)) is undefined at 5, where the quotient is defined — so every real
 * zero of the answer's denominator must be a zero of the key's denominator or
 * one of the quotient's excluded values. Reduced or not, an answer is then
 * equal to f/g at every x in the quotient's domain. The excluded values
 * themselves are still graded separately (restrictionsMatch).
 *
 * Without the degree check two old guards had to be rebuilt: the answer is
 * rescaled before the absolute 1e-6 comparison (else 0/0.00000001 matched
 * every key), and a newly accepted shape must not lean on the slash split
 * against precedence (x − 1/x is x − (1/x), not (x − 1)/x).
 */
const MAX_RATIONAL_DEGREE = 6;
const CROSS_PRODUCT_TOLERANCE = 1e-6;

const stripOuterParens = (value) => {
  let text = String(value ?? '').trim();
  for (let pass = 0; pass < 8; pass += 1) {
    if (!(text.startsWith('(') && text.endsWith(')'))) break;
    let depth = 0;
    let closesAtEnd = false;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '(') depth += 1;
      else if (text[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          closesAtEnd = index === text.length - 1;
          break;
        }
      }
    }
    if (!closesAtEnd) break;
    text = text.slice(1, -1).trim();
  }
  return text;
};

// One polynomial in x as coefficients (highest power first), or null when the
// text is not one (another variable, a division by x, unreadable).
const polynomialInX = (text) => {
  const poly = parsePolynomial(text);
  if (!poly) return null;
  const byPower = [];
  for (const [key, value] of poly) {
    const match = /^(?:x(?:\^(\d+))?)?$/.exec(key);
    if (!match) return null;
    const power = key === '' ? 0 : Number(match[1] || 1);
    if (power > MAX_RATIONAL_DEGREE) return null;
    byPower[power] = (byPower[power] || 0) + value;
  }
  const coefficients = Array.from({ length: Math.max(1, byPower.length) }, (_, index) => byPower[index] || 0).reverse();
  return trimLeadingZeros(coefficients);
};

// A + or − joining two terms outside any brackets (not a sign after ^ * / ( or
// another sign, nor a 1e−7 exponent), with the side not bracketed as a whole.
const hasBareSum = (side) => {
  const text = String(side).trim();
  if (stripOuterParens(text) !== text) return false;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if ((char === '+' || char === '-') && depth === 0) {
      const before = text.slice(0, index).trimEnd();
      if (!before || /[\^*/(+-]$/.test(before) || /\de$/i.test(before)) continue;
      return true;
    }
  }
  return false;
};

// numerator/denominator at the single top-level slash, as
// sameRationalExpression splits them; no slash means a denominator of 1.
const rationalInX = (value) => {
  const normalized = normalizeAlgebraicText(value);
  if (!normalized || normalized.includes('=')) return null;
  const text = stripOuterParens(normalized);
  let depth = 0;
  let slash = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth = Math.max(0, depth - 1);
    else if (char === '/' && depth === 0) {
      if (slash >= 0) return null;
      slash = index;
    }
  }
  const numeratorText = slash < 0 ? text : stripOuterParens(text.slice(0, slash));
  const denominatorText = slash < 0 ? '1' : stripOuterParens(text.slice(slash + 1));
  if (!numeratorText || !denominatorText) return null;
  const numerator = polynomialInX(numeratorText);
  const denominator = polynomialInX(denominatorText);
  if (!numerator || !denominator) return null;
  if (denominator.length === 1 && nearlyZero(denominator[0])) return null;
  // The split reads x − 1/x as (x − 1)/x; by precedence it is x − (1/x).
  const bracketed = slash < 0 || ![text.slice(0, slash), text.slice(slash + 1)].some(hasBareSum);
  return { numerator, denominator, bracketed };
};

const evaluatePolynomial = (coefficients, x) => coefficients.reduce((total, coefficient) => total * x + coefficient, 0);
// "Close to zero" is measured against the size of the terms summed at x, and
// never against less than the largest coefficient (a zero found at 1e-60
// instead of exactly 0 still counts).
const evaluationScale = (coefficients, x) => Math.max(
  ...coefficients.map(Math.abs),
  coefficients.reduce((total, coefficient) => total * Math.abs(x) + Math.abs(coefficient), 0),
);
const vanishesAt = (coefficients, x) => Math.abs(evaluatePolynomial(coefficients, x)) <= EPSILON * evaluationScale(coefficients, x);

/*
 * Every real zero of a polynomial, repeated ones included. Between two
 * neighbouring zeros of p′ the polynomial is monotonic, so it has at most one
 * zero there, found by bisection; a zero where p only touches the axis is a
 * zero of p′ too, and is caught where p vanishes at that critical point. All
 * zeros lie strictly inside the Cauchy bound.
 */
const realZeros = (coefficients) => {
  const p = trimLeadingZeros(coefficients);
  const degree = p.length - 1;
  if (degree < 1) return [];
  if (degree === 1) return [-p[1] / p[0]];
  const derivative = p.slice(0, -1).map((coefficient, index) => coefficient * (degree - index));
  const bound = 1 + Math.max(...p.slice(1).map((coefficient) => Math.abs(coefficient / p[0])));
  const points = [-bound, ...realZeros(derivative).filter((x) => x > -bound && x < bound), bound];
  const zeros = [];
  for (let index = 0; index < points.length; index += 1) {
    const right = points[index];
    if (vanishesAt(p, right)) {
      zeros.push(right);
      continue;
    }
    if (index === 0 || vanishesAt(p, points[index - 1])) continue;
    let low = points[index - 1];
    let high = right;
    if (Math.sign(evaluatePolynomial(p, low)) === Math.sign(evaluatePolynomial(p, high))) continue;
    for (let step = 0; step < 200 && low < high; step += 1) {
      const middle = (low + high) / 2;
      if (middle <= low || middle >= high) break;
      if (Math.sign(evaluatePolynomial(p, middle)) === Math.sign(evaluatePolynomial(p, low))) low = middle;
      else high = middle;
    }
    zeros.push((low + high) / 2);
  }
  return uniqueSortedNumbers(zeros);
};

// A pole is "the same x" only within 8-decimal rounding of it: x − 1.0000001
// is not x − 1, even where (x − 1)² is too flat for vanishesAt to tell them apart.
const POLE_TOLERANCE = 1e-8;
const samePole = (left, right) => Math.abs(left - right) <= POLE_TOLERANCE * Math.max(1, Math.abs(left), Math.abs(right));

const sameRationalFunctionOnDomain = (submitted, expected, excludedValues = []) => {
  const parsedAnswer = rationalInX(submitted);
  const key = rationalInX(expected);
  if (!parsedAnswer || !key) return false;
  // Shapes the old degree check refused are newly accepted; they must read
  // the same under ordinary precedence (x − 1/x is not (x − 1)/x). Shapes it
  // allowed keep their old verdict.
  const keyShape = parsedAnswer.numerator.length === key.numerator.length
    && parsedAnswer.denominator.length === key.denominator.length;
  if (!keyShape && !parsedAnswer.bracketed) return false;
  // The answer is rescaled to the key's leading denominator coefficient, so
  // the absolute tolerance means the same at any scale: 0 over 0.00000001
  // must not cross-multiply to "0 = 0.00000001·f within 1e-6".
  const rescale = key.denominator[0] / parsedAnswer.denominator[0];
  const answer = {
    numerator: parsedAnswer.numerator.map((value) => value * rescale),
    denominator: parsedAnswer.denominator.map((value) => value * rescale),
  };
  const left = multiplyPolynomials(answer.numerator, key.denominator);
  const right = multiplyPolynomials(key.numerator, answer.denominator);
  const [a, b] = align(left, right);
  if (!a.every((value, index) => Math.abs(value - b[index]) <= CROSS_PRODUCT_TOLERANCE)) return false;
  const allowed = [
    ...realZeros(key.denominator),
    ...(Array.isArray(excludedValues) ? excludedValues : []).map(Number).filter(Number.isFinite),
  ];
  return realZeros(answer.denominator).every((zero) => allowed.some((value) => samePole(value, zero)));
};

/*
 * `excludedValues` (optional) are the quotient's excluded values. Without them
 * the zeros of the key's denominator are the only poles an answer may have —
 * enough whenever the key is the unreduced f/g; when g divides f exactly the
 * key is a polynomial, and an unreduced answer such as (x² − 1)/(x − 1) is
 * accepted only when they are passed.
 */
export const functionOperationAnswerMatches = (operation, submitted, expected, { excludedValues } = {}) => {
  if (operation === 'quotient') return sameRationalFunctionOnDomain(submitted, expected, excludedValues);
  return sameValue(submitted, expected);
};

/*
 * The excluded x-values a student typed: comma-separated numbers.
 *
 * A blank entry is NO value, never zero. The lab tells the student to "leave
 * blank only when there are none", but `Number('')` is 0, so a blank box used
 * to read as "x = 0 is excluded" — marking the instructed blank wrong when
 * there are no exclusions, and right when 0 happened to be the one exclusion.
 * A stray trailing comma ("2, -5,") read as an extra 0 the same way. Blank
 * pieces are dropped, exactly as other unreadable pieces already were.
 */
export const parseExcludedValues = (submitted) => String(submitted ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value !== '')
  .map(Number)
  .filter(Number.isFinite);

export const restrictionsMatch = (submitted, expectedValues = []) => {
  const values = Array.isArray(submitted) ? submitted : parseExcludedValues(submitted);
  const actual = uniqueSortedNumbers(values);
  const expected = uniqueSortedNumbers(expectedValues);
  return actual.length === expected.length
    && actual.every((value, index) => Math.abs(value - expected[index]) <= EPSILON);
};

export const SUPPORTED_FUNCTION_OPERATIONS = Object.freeze([
  'sum',
  'difference',
  'product',
  'quotient',
  'composition',
]);

/** What the lab asks for when a question names no operations. */
export const DEFAULT_FUNCTION_OPERATIONS = Object.freeze(['sum', 'difference', 'product', 'quotient']);

/*
 * The operations the lab renders — and therefore grades — for a question:
 * the authored list (or the default four when there is none), restricted to
 * supported operations, each once, in authored order. One definition, read by
 * FunctionOperationsLab.jsx and by the shared grader.
 */
export const normalizeFunctionOperations = (value) => {
  const operations = Array.isArray(value) && value.length ? value : DEFAULT_FUNCTION_OPERATIONS;
  return [...new Set(operations.filter((operation) => SUPPORTED_FUNCTION_OPERATIONS.includes(operation)))];
};

/** Composition order: `gOfF` only when authored exactly; otherwise f∘g. */
export const normalizeComposeOrder = (value) => (value === 'gOfF' ? 'gOfF' : 'fOfG');
