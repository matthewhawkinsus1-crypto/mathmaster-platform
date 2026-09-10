import { sameRationalExpression, sameValue } from '../../../functions/shared/answerEquivalence.mjs';

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
    const denominatorZero = linearZero(gCoefficients);
    const excludedValues = uniqueSortedNumbers([
      ...(denominatorZero == null ? [] : [denominatorZero]),
      ...authoredExcludedValues(restrictions),
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

export const functionOperationAnswerMatches = (operation, submitted, expected) => {
  if (operation === 'quotient') return sameRationalExpression(submitted, expected);
  return sameValue(submitted, expected);
};

export const restrictionsMatch = (submitted, expectedValues = []) => {
  const values = Array.isArray(submitted)
    ? submitted
    : String(submitted ?? '').split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
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
