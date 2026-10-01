/*
 * EXACT NUMBERS FOR STUDENT-DRIVEN ALGEBRA.
 *
 * Factoring, fraction splitting and fraction reduction all ask integer
 * questions: does 15 divide 45, what is left of 6/2 after a 2 is cancelled,
 * which primes make up -45. Answering those with JavaScript floats is how 5/2
 * turns into 2.5 and 20/9 into 2.2222222222222223 — so nothing in this module
 * ever divides two numbers as floats. A rational is a reduced pair of safe
 * integers { n, d } with d > 0, read straight from the MathJS AST (a literal
 * 2.5 is read from its digits as 25/10, never through a float quotient).
 *
 * This is not a second parser: it walks the tree MathJS already built, and
 * returns null for anything that is not exactly representable — a symbol where
 * a number was required, an irrational function, an integer beyond 2^53.
 * Callers treat null as "this move does not apply here", never as zero.
 */
import { parse } from 'mathjs';

export const gcdInteger = (left, right) => {
  let a = Math.abs(Number(left));
  let b = Math.abs(Number(right));
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  while (b) [a, b] = [b, a % b];
  return a;
};

export const gcdOfIntegers = (values = []) => values.reduce((acc, value) => {
  if (acc == null) return null;
  const next = gcdInteger(acc, value);
  return next;
}, 0);

/**
 * `{ sign, primes }` for a safe integer: -45 -> { sign: -1, primes: [3, 3, 5] }.
 * 1 and -1 have no prime factors; 0 has sign 0. Anything that is not a safe
 * integer (2.5, 1e20, NaN) returns null rather than a guessed factorization.
 */
export const primeFactorization = (value) => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(n)) return null;
  if (n === 0) return { sign: 0, primes: [] };
  const sign = n < 0 ? -1 : 1;
  let rest = Math.abs(n);
  const primes = [];
  for (let p = 2; p * p <= rest; p += p === 2 ? 1 : 2) {
    while (rest % p === 0) {
      primes.push(p);
      rest /= p;
    }
  }
  if (rest > 1) primes.push(rest);
  return { sign, primes };
};

/**
 * The factors a student sees when a number is written "as primes", with the
 * sign as its own factor: -45 -> [-1, 3, 3, 5], 15 -> [3, 5], 7 -> [7],
 * 1 -> [1], -1 -> [-1], 0 -> [0].
 */
export const signedFactorList = (value) => {
  const factorization = primeFactorization(value);
  if (!factorization) return null;
  if (factorization.sign === 0) return [0];
  const list = [...(factorization.sign < 0 ? [-1] : []), ...factorization.primes];
  return list.length ? list : [1];
};

// --- Rationals -----------------------------------------------------------------

export const makeRational = (numerator, denominator = 1) => {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) return null;
  if (n === 0) return { n: 0, d: 1 };
  const g = gcdInteger(n, d);
  const sign = d < 0 ? -1 : 1;
  const reducedN = (sign * n) / g;
  const reducedD = (sign * d) / g;
  if (!Number.isSafeInteger(reducedN) || !Number.isSafeInteger(reducedD)) return null;
  return { n: reducedN, d: reducedD };
};

const safeProduct = (a, b) => {
  const product = a * b;
  return Number.isSafeInteger(product) ? product : null;
};

export const negateRational = (value) => (value ? makeRational(-value.n, value.d) : null);

export const multiplyRational = (left, right) => {
  if (!left || !right) return null;
  const n = safeProduct(left.n, right.n);
  const d = safeProduct(left.d, right.d);
  return n == null || d == null ? null : makeRational(n, d);
};

export const divideRational = (left, right) => {
  if (!left || !right || right.n === 0) return null;
  return multiplyRational(left, { n: right.d, d: right.n });
};

export const addRational = (left, right) => {
  if (!left || !right) return null;
  const a = safeProduct(left.n, right.d);
  const b = safeProduct(right.n, left.d);
  const d = safeProduct(left.d, right.d);
  if (a == null || b == null || d == null) return null;
  const n = a + b;
  return Number.isSafeInteger(n) ? makeRational(n, d) : null;
};

export const subtractRational = (left, right) => addRational(left, negateRational(right));

export const rationalEquals = (left, right) => Boolean(left && right && left.n === right.n && left.d === right.d);

export const isIntegerRational = (value) => Boolean(value && value.d === 1);

// A literal as its digits say, not as a float: 2.5 -> 25/10 -> 5/2.
const rationalFromLiteral = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (Number.isSafeInteger(value)) return makeRational(value, 1);
  const text = String(value);
  if (/e/i.test(text)) return null;
  const match = text.match(/^(-?)(\d+)\.(\d+)$/);
  if (!match) return null;
  const [, sign, whole, fraction] = match;
  if (fraction.length > 12) return null;
  const numerator = Number(`${sign}${whole}${fraction}`);
  const denominator = 10 ** fraction.length;
  return makeRational(numerator, denominator);
};

const unwrap = (node) => {
  let current = node;
  while (current?.type === 'ParenthesisNode') current = current.content;
  return current;
};

/** The exact value of a purely numeric AST node, or null. */
export const exactRationalFromNode = (rawNode) => {
  const node = unwrap(rawNode);
  if (!node) return null;
  if (node.type === 'ConstantNode') return rationalFromLiteral(node.value);
  if (node.type !== 'OperatorNode' || !Array.isArray(node.args)) return null;
  if (node.fn === 'unaryMinus' && node.args.length === 1) return negateRational(exactRationalFromNode(node.args[0]));
  if (node.fn === 'unaryPlus' && node.args.length === 1) return exactRationalFromNode(node.args[0]);
  if (node.fn === 'pow' && node.args.length === 2) {
    const base = exactRationalFromNode(node.args[0]);
    const exponent = exactRationalFromNode(node.args[1]);
    if (!base || !exponent || exponent.d !== 1 || Math.abs(exponent.n) > 16) return null;
    let result = makeRational(1, 1);
    for (let index = 0; index < Math.abs(exponent.n); index += 1) result = multiplyRational(result, base);
    return exponent.n < 0 ? divideRational(makeRational(1, 1), result) : result;
  }
  const combine = {
    add: addRational,
    subtract: subtractRational,
    multiply: multiplyRational,
    divide: divideRational,
  }[node.fn];
  if (!combine || node.args.length < 2) return null;
  return node.args.slice(1).reduce(
    (acc, arg) => (acc ? combine(acc, exactRationalFromNode(arg)) : null),
    exactRationalFromNode(node.args[0]),
  );
};

export const exactRationalFromExpression = (expression) => {
  try {
    return exactRationalFromNode(parse(String(expression)));
  } catch {
    return null;
  }
};

/** MathJS text for an exact value: 3, -3, 5/2, -5/2. Never a decimal. */
export const rationalToExpression = (value) => {
  if (!value) return '';
  return value.d === 1 ? String(value.n) : `${value.n}/${value.d}`;
};

/** Classroom LaTeX for an exact value: a stacked fraction, sign in front. */
export const rationalToLatex = (value) => {
  if (!value) return '';
  if (value.d === 1) return String(value.n);
  return `${value.n < 0 ? '-' : ''}\\frac{${Math.abs(value.n)}}{${value.d}}`;
};

/**
 * A number WRITTEN in lowest terms: 3, -3, 2.5, 5/2, -5/2, (-5)/2. Returns its
 * exact value, or null when the written form still needs work (6/2, 10/4,
 * 5/(-2), 5/1) or is not a plain number at all. Grading "is this finished?"
 * reads the student's notation, not only its value.
 */
export const reducedNumberValue = (rawNode) => {
  const node = unwrap(rawNode);
  if (!node) return null;
  if (node.type === 'ConstantNode') return rationalFromLiteral(node.value);
  if (node.type === 'OperatorNode' && node.fn === 'unaryMinus' && node.args?.length === 1) {
    const inner = reducedNumberValue(node.args[0]);
    return inner ? negateRational(inner) : null;
  }
  if (node.type === 'OperatorNode' && node.fn === 'divide' && node.args?.length === 2) {
    const numeratorNode = unwrap(node.args[0]);
    const denominatorNode = unwrap(node.args[1]);
    const numeratorNegative = numeratorNode?.type === 'OperatorNode' && numeratorNode.fn === 'unaryMinus';
    const numeratorLiteral = unwrap(numeratorNegative ? numeratorNode.args[0] : numeratorNode);
    if (numeratorLiteral?.type !== 'ConstantNode' || denominatorNode?.type !== 'ConstantNode') return null;
    const n = numeratorLiteral.value;
    const d = denominatorNode.value;
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 1 || n === 0 || gcdInteger(n, d) !== 1) return null;
    return makeRational(numeratorNegative ? -n : n, d);
  }
  return null;
};

// --- Exact monomials -------------------------------------------------------------

/*
 * A product of a rational coefficient and symbols raised to non-negative
 * integer powers: 15x -> { coefficient: 15, powers: { x: 1 } }, -45 ->
 * { coefficient: -45 }. A symbol in a denominator, a sum, or a non-integer
 * power is not a monomial here (null), so the domain of the expression can
 * never silently change through one of these helpers.
 */
const monomialFromNode = (rawNode) => {
  const node = unwrap(rawNode);
  if (!node) return null;
  if (node.type === 'ConstantNode') {
    const value = rationalFromLiteral(node.value);
    return value ? { coefficient: value, powers: {} } : null;
  }
  if (node.type === 'SymbolNode') {
    if (['e', 'pi', 'i', 'Infinity', 'NaN'].includes(node.name)) return null;
    return { coefficient: makeRational(1, 1), powers: { [node.name]: 1 } };
  }
  if (node.type !== 'OperatorNode' || !Array.isArray(node.args)) return null;
  if (node.fn === 'unaryMinus' && node.args.length === 1) {
    const inner = monomialFromNode(node.args[0]);
    return inner ? { ...inner, coefficient: negateRational(inner.coefficient) } : null;
  }
  if (node.fn === 'unaryPlus' && node.args.length === 1) return monomialFromNode(node.args[0]);
  if (node.fn === 'multiply') {
    return node.args.reduce((acc, arg) => {
      if (!acc) return null;
      const next = monomialFromNode(arg);
      if (!next) return null;
      const coefficient = multiplyRational(acc.coefficient, next.coefficient);
      if (!coefficient) return null;
      const powers = { ...acc.powers };
      Object.entries(next.powers).forEach(([name, power]) => { powers[name] = (powers[name] || 0) + power; });
      return { coefficient, powers };
    }, { coefficient: makeRational(1, 1), powers: {} });
  }
  if (node.fn === 'divide' && node.args.length === 2) {
    const numerator = monomialFromNode(node.args[0]);
    const denominator = exactRationalFromNode(node.args[1]);
    if (!numerator || !denominator || denominator.n === 0) return null;
    const coefficient = divideRational(numerator.coefficient, denominator);
    return coefficient ? { coefficient, powers: numerator.powers } : null;
  }
  if (node.fn === 'pow' && node.args.length === 2) {
    const base = unwrap(node.args[0]);
    const exponent = exactRationalFromNode(node.args[1]);
    if (!exponent || exponent.d !== 1 || exponent.n < 0 || exponent.n > 16) return null;
    if (base?.type === 'SymbolNode') {
      const inner = monomialFromNode(base);
      return inner ? { coefficient: inner.coefficient, powers: exponent.n ? { [base.name]: exponent.n } : {} } : null;
    }
    const value = exactRationalFromNode(node);
    return value ? { coefficient: value, powers: {} } : null;
  }
  const numeric = exactRationalFromNode(node);
  return numeric ? { coefficient: numeric, powers: {} } : null;
};

const cleanPowers = (powers = {}) => Object.fromEntries(
  Object.entries(powers).filter(([, power]) => power !== 0).sort(([a], [b]) => a.localeCompare(b)),
);

export const exactMonomial = (expression) => {
  try {
    const node = typeof expression === 'string' ? parse(expression) : expression;
    const result = monomialFromNode(node);
    return result ? { coefficient: result.coefficient, powers: cleanPowers(result.powers) } : null;
  } catch {
    return null;
  }
};

export const monomialPowersEqual = (left = {}, right = {}) => {
  const a = cleanPowers(left);
  const b = cleanPowers(right);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] || 0) === (b[key] || 0));
};

export const monomialsEqual = (left, right) => Boolean(
  left && right && rationalEquals(left.coefficient, right.coefficient) && monomialPowersEqual(left.powers, right.powers),
);

/** Exact product of two monomials (used to check factor × quotient = term). */
export const multiplyMonomials = (left, right) => {
  if (!left || !right) return null;
  const coefficient = multiplyRational(left.coefficient, right.coefficient);
  if (!coefficient) return null;
  const powers = { ...left.powers };
  Object.entries(right.powers || {}).forEach(([name, power]) => { powers[name] = (powers[name] || 0) + power; });
  return { coefficient, powers: cleanPowers(powers) };
};

/**
 * Classroom text for a monomial with an INTEGER coefficient: 15 x, -3, x,
 * -x, 3 x^2. MathJS reads it back as the same monomial. Returns null for a
 * non-integer coefficient — those are written by the student, not generated.
 */
export const integerMonomialToExpression = (monomial) => {
  if (!monomial || monomial.coefficient.d !== 1) return null;
  const variables = Object.entries(cleanPowers(monomial.powers))
    .map(([name, power]) => (power === 1 ? name : `${name}^${power}`));
  const n = monomial.coefficient.n;
  if (!variables.length) return String(n);
  const body = variables.join(' ');
  if (n === 1) return body;
  if (n === -1) return `-${body}`;
  return `${n} ${body}`;
};
