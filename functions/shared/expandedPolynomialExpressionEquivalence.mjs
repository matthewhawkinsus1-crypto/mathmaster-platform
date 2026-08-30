// Compare two polynomial EXPRESSIONS when the requested form is expanded.
//
// This is the expression counterpart to sameExpandedPolynomialEquation.
// It accepts harmless arithmetic/order differences such as
//   3x^2 - 2x + 5
//   5 + 3x^2 - 2x
// but deliberately refuses grouped variable expressions such as
//   (3x - 5)(x + 1)
// because a prompt that asks the student to expand is assessing the form.

import { parsePolynomial, polynomialDegree, samePolynomial } from './algebraicForm.mjs';

const hasVariableGrouping = (value) => {
  const text = String(value ?? '').replace(/\\left|\\right/g, '').replace(/\s+/g, '');
  return /[\(\[][^)\]]*[A-Za-z][^)\]]*[+\-][^)\]]*[\)\]]/.test(text);
};

export const sameExpandedPolynomialExpression = (left, right, tolerance = 1e-6) => {
  const a = String(left ?? '').trim();
  const b = String(right ?? '').trim();
  if (!a || !b || a.includes('=') || b.includes('=')) return false;
  if (hasVariableGrouping(a) || hasVariableGrouping(b)) return false;

  const one = parsePolynomial(a);
  const two = parsePolynomial(b);
  if (!one || !two) return false;
  if (polynomialDegree(one) > 8 || polynomialDegree(two) > 8) return false;
  return samePolynomial(one, two, tolerance);
};

export default sameExpandedPolynomialExpression;
