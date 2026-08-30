// Narrow semantic equivalence for simplified rational expressions.
//
// This is intentionally opt-in. A2.7F asks students to determine a simplified
// rational expression while separately preserving the original denominator
// restrictions. We therefore accept harmless algebraic spellings of the same
// reduced numerator/denominator, but reject answers that introduce extra
// canceling polynomial factors and therefore extra domain holes.

import {
  normalizeAlgebraicText,
  parsePolynomial,
  polynomialDegree,
  samePolynomial,
} from './algebraicForm.mjs';

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

const splitTopLevelRatio = (value) => {
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

  if (slash < 0) return { numerator: text, denominator: '1' };
  const numerator = stripOuterParens(text.slice(0, slash));
  const denominator = stripOuterParens(text.slice(slash + 1));
  return numerator && denominator ? { numerator, denominator } : null;
};

const isZeroPolynomial = (poly, tolerance) => {
  const zero = parsePolynomial('0');
  return Boolean(poly && zero && samePolynomial(poly, zero, tolerance));
};

/**
 * Compare two reduced rational expressions by polynomial cross-products.
 *
 * Guardrails:
 * - no equations;
 * - numerator and denominator on each side must be readable polynomials;
 * - expected and submitted numerator degrees must match;
 * - expected and submitted denominator degrees must match;
 * - degree above 6 is refused;
 * - extra canceling polynomial factors are therefore rejected.
 */
export const sameRationalExpression = (left, right, tolerance = 1e-6) => {
  const a = splitTopLevelRatio(left);
  const b = splitTopLevelRatio(right);
  if (!a || !b) return false;

  const an = parsePolynomial(a.numerator);
  const ad = parsePolynomial(a.denominator);
  const bn = parsePolynomial(b.numerator);
  const bd = parsePolynomial(b.denominator);
  if (!an || !ad || !bn || !bd) return false;
  if (isZeroPolynomial(ad, tolerance) || isZeroPolynomial(bd, tolerance)) return false;

  const degrees = [
    polynomialDegree(an),
    polynomialDegree(ad),
    polynomialDegree(bn),
    polynomialDegree(bd),
  ];
  if (degrees.some((degree) => degree > 6)) return false;
  if (degrees[0] !== degrees[2] || degrees[1] !== degrees[3]) return false;

  const leftCross = parsePolynomial(`(${a.numerator})*(${b.denominator})`);
  const rightCross = parsePolynomial(`(${b.numerator})*(${a.denominator})`);
  return Boolean(leftCross && rightCross && samePolynomial(leftCross, rightCross, tolerance));
};

export default sameRationalExpression;
