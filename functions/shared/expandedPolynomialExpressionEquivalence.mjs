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

// The text inside brackets round the whole of it, `(7x^2 - 3x - 6)`: that
// pair groups nothing, so it is no factored or vertex form's group (grader
// spellings, 2026-11). Not a pair holding a comma, or one followed by more.
const withoutWholeBrackets = (text) => {
  let body = text;
  for (let guard = 0; guard < 6 && body.startsWith('(') && body.endsWith(')'); guard += 1) {
    let depth = 0;
    let closesEarly = false;
    for (let index = 0; index < body.length - 1; index += 1) {
      if (body[index] === '(') depth += 1;
      else if (body[index] === ')') depth -= 1;
      if (depth === 0 || (depth === 1 && body[index] === ',')) { closesEarly = true; break; }
    }
    if (closesEarly) break;
    body = body.slice(1, -1);
  }
  return body;
};

const hasVariableGrouping = (value) => {
  const text = withoutWholeBrackets(String(value ?? '').replace(/\\left|\\right/g, '').replace(/\s+/g, ''));
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
