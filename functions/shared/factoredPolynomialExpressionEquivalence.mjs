// Compare polynomial EXPRESSIONS when the requested form is factored.
//
// This comparator is intentionally form-specific. It accepts mathematically
// harmless changes inside factored form, including swapped factor order and
// writing a repeated factor as a square, but it refuses an expanded polynomial.
// That lets factoring tasks grade the mathematics without erasing the
// instructional requirement to leave the answer factored.
//
// What counts as THE SAME FACTORIZATION. Both answers are read as
//
//   scalar × factor × factor × …
//
// where a monomial is split into its number and its letters (5x² is 5 · x · x)
// and every other factor is a polynomial in brackets, raised to a whole power
// or not. Two answers match when their scalars are equal and their factors
// are the same polynomials, in any order, each up to its SIGN: a minus sign
// may move between factors or out to the front, because
//
//   (−3a + 4)(b − 5) = (3a − 4)(5 − b) = −(3a − 4)(b − 5)
//
// are one factorization written three ways. A factor may NOT absorb any other
// number: (2x + 4)(x + 5) is not 2(x + 2)(x + 5), because "factor completely"
// asks for the common factor 2 to come out, and a factor that can still be
// split, (y² − 25)(y² + 25) for (y + 5)(y − 5)(y² + 25), is a different, less
// complete answer. The key decides how complete the factorization must be.

import { normalizeAlgebraicText, parsePolynomial, polynomialDegree, samePolynomial } from './algebraicForm.mjs';

const MAX_FACTOR_DEGREE = 8;
const MAX_POWER = 12;

const readGroup = (text, start) => {
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
};

// `^2`, `^(2)`: a whole exponent, or null.
const readExponent = (text, index) => {
  const match = /^\^(?:(\d+)|\((\d+)\))/.exec(text.slice(index));
  if (!match) return null;
  return { power: Number(match[1] ?? match[2]), end: index + match[0].length };
};

// The degree-ordered first term, so (4 − 3a) and (3a − 4) normalize alike and
// (y − x) and (x − y) do too.
const termDegree = (key) => [...key.matchAll(/[a-z](?:\^(\d+))?/g)]
  .reduce((total, match) => total + (match[1] ? Number(match[1]) : 1), 0);
const leadingCoefficient = (polynomial) => {
  const keys = [...polynomial.keys()].sort((a, b) => (termDegree(b) - termDegree(a)) || (a < b ? -1 : a > b ? 1 : 0));
  return keys.length ? polynomial.get(keys[0]) : 0;
};
const negate = (polynomial) => new Map([...polynomial].map(([key, value]) => [key, -value]));
const letterFactor = (name) => new Map([[name, 1]]);

// A one-term polynomial as its number and its letters: 6xy² → 6, [x, y, y].
const splitMonomial = (polynomial) => {
  const [[key, coefficient]] = [...polynomial];
  const letters = [];
  for (const [, name, exponent] of key.matchAll(/([a-z])(?:\^(\d+))?/g)) {
    for (let copy = 0; copy < (exponent ? Number(exponent) : 1); copy += 1) letters.push(letterFactor(name));
  }
  return { coefficient, letters };
};

/**
 * `scalar × factors`, or null when the answer is not written as a product.
 * Exported for the grading contract, which refuses a factoredForm key that
 * is not itself in factored form.
 */
export const parseFactoredProduct = (value) => {
  const raw = String(value ?? '');
  if (!raw.trim() || raw.includes('=')) return null;
  const text = normalizeAlgebraicText(raw.replace(/\[/g, '(').replace(/\]/g, ')'));
  if (!text) return null;

  let index = 0;
  let scalar = 1;
  const factors = [];
  if (text[0] === '-' || text[0] === '+') {
    if (text[0] === '-') scalar = -1;
    index = 1;
  }

  // Multiplies `scalar` and `factors` by one atom raised to `power`.
  const take = (polynomial, power) => {
    if (!polynomial || polynomialDegree(polynomial) > MAX_FACTOR_DEGREE) return false;
    if (polynomial.size === 0) {
      scalar = 0;
      return true;
    }
    if (polynomial.size === 1) {
      const { coefficient, letters } = splitMonomial(polynomial);
      scalar *= coefficient ** power;
      for (let copy = 0; copy < power; copy += 1) factors.push(...letters);
      return true;
    }
    const sign = leadingCoefficient(polynomial) < 0 ? -1 : 1;
    scalar *= sign ** power;
    const normalized = sign < 0 ? negate(polynomial) : polynomial;
    for (let copy = 0; copy < power; copy += 1) factors.push(normalized);
    return true;
  };

  let dividing = false;
  while (index < text.length) {
    const char = text[index];
    if (char === '*') {
      index += 1;
      continue;
    }
    if (char === '/') {
      if (dividing) return null;
      dividing = true;
      index += 1;
      continue;
    }
    let atom = null;
    if (char === '(') {
      const group = readGroup(text, index);
      if (!group) return null;
      atom = { polynomial: parsePolynomial(group.inner), end: group.end };
    } else if (/[a-z]/i.test(char)) {
      atom = { polynomial: letterFactor(char.toLowerCase()), end: index + 1 };
    } else {
      const number = /^\d*\.?\d+/.exec(text.slice(index));
      if (!number) return null; // a top-level + or −: a sum, not a product
      atom = { polynomial: new Map([['', Number(number[0])]]), end: index + number[0].length };
    }
    if (!atom.polynomial) return null;
    index = atom.end;
    let power = 1;
    if (text[index] === '^') {
      const exponent = readExponent(text, index);
      if (!exponent || exponent.power < 1 || exponent.power > MAX_POWER) return null;
      power = exponent.power;
      index = exponent.end;
    }
    if (dividing) {
      // Only a number divides: (1/2)(x + 4), not (x + 4)/(x − 1).
      if (atom.polynomial.size > 1 || [...atom.polynomial.keys()].some(Boolean)) return null;
      const divisor = (atom.polynomial.get('') || 0) ** power;
      if (!divisor) return null;
      scalar /= divisor;
      dividing = false;
      continue;
    }
    if (!take(atom.polynomial, power)) return null;
  }
  if (dividing || !Number.isFinite(scalar)) return null;

  // A factored-form answer must actually contain a product of factors: two
  // factors with letters, or a number other than 1 times one.
  if (!factors.length || (factors.length < 2 && scalar === 1)) return null;
  return { scalar, factors };
};

export const sameFactoredPolynomialExpression = (left, right, tolerance = 1e-6) => {
  const a = parseFactoredProduct(left);
  const b = parseFactoredProduct(right);
  if (!a || !b) return false;
  const scale = Math.max(1, Math.abs(a.scalar), Math.abs(b.scalar));
  if (Math.abs(a.scalar - b.scalar) > tolerance * scale || a.factors.length !== b.factors.length) return false;

  const unmatched = [...b.factors];
  for (const factor of a.factors) {
    const index = unmatched.findIndex((candidate) => samePolynomial(factor, candidate, tolerance));
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
};

/**
 * WHY AN ANSWER WITH THE KEY'S VALUE WAS REFUSED (walkthrough 2026-10-23,
 * Factoring Polynomials): 'notFullyFactored' when it is the key's polynomial
 * written expanded or only partly factored — 2(x² − 4) for 2(x − 2)(x + 2) —
 * so the student hears that instead of a bare "Not quite". Null when it is
 * right, or not the key's polynomial at all.
 */
export const factoredFormMiss = (student, key) => {
  if (sameFactoredPolynomialExpression(student, key)) return null;
  const typed = parsePolynomial(student);
  const expected = parsePolynomial(key);
  return typed && expected && samePolynomial(typed, expected) ? 'notFullyFactored' : null;
};

export default sameFactoredPolynomialExpression;
