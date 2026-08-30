// Compare polynomial EXPRESSIONS when the requested form is factored.
//
// This comparator is intentionally form-specific. It accepts mathematically
// harmless changes inside factored form, including swapped factor order and
// writing a repeated factor as a square, but it refuses an expanded polynomial.
// That lets Algebra I factoring tasks grade the mathematics without erasing the
// instructional requirement to leave the answer factored.

import { parsePolynomial, polynomialDegree, samePolynomial } from './algebraicForm.mjs';

const normalize = (value) => String(value ?? '')
  .trim()
  .replace(/[−–—]/g, '-')
  .replace(/\\left|\\right/g, '')
  .replace(/\\cdot|\\times/g, '*')
  .replace(/\^\{(-?\d+)\}/g, '^$1')
  .replace(/\s+/g, '');

const readGroup = (text, start) => {
  const open = text[start];
  const close = open === '(' ? ')' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === open) depth += 1;
    else if (text[i] === close) {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
};

const parseFactoredProduct = (value) => {
  const text = normalize(value);
  if (!text || text.includes('=')) return null;

  let index = 0;
  let scalar = 1;
  const scalarMatch = text.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\*?/);
  if (scalarMatch) {
    scalar = Number(scalarMatch[1]);
    if (!Number.isFinite(scalar)) return null;
    index = scalarMatch[0].length;
  } else if (text.startsWith('-')) {
    scalar = -1;
    index = 1;
  } else if (text.startsWith('+')) {
    index = 1;
  }

  const factors = [];
  while (index < text.length) {
    if (text[index] === '*') {
      index += 1;
      continue;
    }
    const group = readGroup(text, index);
    if (!group) return null;
    const polynomial = parsePolynomial(group.inner);
    if (!polynomial || polynomialDegree(polynomial) > 4) return null;
    index = group.end;

    let exponent = 1;
    if (text[index] === '^') {
      const exponentMatch = text.slice(index).match(/^\^(\d+)/);
      if (!exponentMatch) return null;
      exponent = Number(exponentMatch[1]);
      if (!Number.isInteger(exponent) || exponent < 1 || exponent > 4) return null;
      index += exponentMatch[0].length;
    }
    for (let copy = 0; copy < exponent; copy += 1) factors.push(polynomial);
  }

  // A factored-form answer must actually contain a product of factors.
  if (factors.length < 2) return null;
  return { scalar, factors };
};

export const sameFactoredPolynomialExpression = (left, right, tolerance = 1e-6) => {
  const a = parseFactoredProduct(left);
  const b = parseFactoredProduct(right);
  if (!a || !b) return false;
  if (Math.abs(a.scalar - b.scalar) > tolerance || a.factors.length !== b.factors.length) return false;

  const unmatched = [...b.factors];
  for (const factor of a.factors) {
    const index = unmatched.findIndex((candidate) => samePolynomial(factor, candidate, tolerance));
    if (index < 0) return false;
    unmatched.splice(index, 1);
  }
  return unmatched.length === 0;
};

export default sameFactoredPolynomialExpression;
