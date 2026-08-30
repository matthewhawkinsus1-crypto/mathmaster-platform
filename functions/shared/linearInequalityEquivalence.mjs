// Algebraic equivalence for linear inequalities in one or more variables.
//
// This is deliberately separate from the existing simple-inequality parser.
// The simple parser is ideal for x <= 4, 3 < y, and chained one-variable
// bounds. Algebra I A.2H needs something different: half-planes such as
// 2x + 3y <= 120, where term order, scalar multiples, or reversing both sides
// must not change correctness.

import { normalizeAlgebraicText, parsePolynomial, polynomialDegree } from './algebraicForm.mjs';

const EPSILON = 1e-6;

const normalizeOperator = (value) => String(value ?? '')
  .replace(/\\leq?|≤/g, '<=')
  .replace(/\\geq?|≥/g, '>=')
  .trim();

const splitInequality = (value) => {
  const text = normalizeOperator(value);
  const match = /^(.*?)(<=|>=|<|>)(.*?)$/.exec(text);
  if (!match || !match[1].trim() || !match[3].trim()) return null;
  // Reject chained inequalities here. The existing simple-inequality parser
  // owns those and this helper is only for one linear boundary relation.
  if (/(<=|>=|<|>)/.test(match[1]) || /(<=|>=|<|>)/.test(match[3])) return null;
  return { left: match[1], operator: match[2], right: match[3] };
};

const subtract = (left, right) => {
  const out = new Map(left);
  for (const [key, value] of right) out.set(key, (out.get(key) || 0) - value);
  for (const [key, value] of out) if (Math.abs(value) < EPSILON) out.delete(key);
  return out;
};

const scale = (poly, factor) => new Map([...poly].map(([key, value]) => [key, value * factor]));

const canonical = (value) => {
  const split = splitInequality(value);
  if (!split) return null;

  // `normalizeAlgebraicText` is called here only as a refusal gate for unknown
  // LaTeX; parsePolynomial performs the actual parsing. Keep this explicit so
  // malformed commands cannot be partially interpreted.
  if (!normalizeAlgebraicText(split.left) || !normalizeAlgebraicText(split.right)) return null;
  const left = parsePolynomial(split.left);
  const right = parsePolynomial(split.right);
  if (!left || !right) return null;
  if (polynomialDegree(left) > 1 || polynomialDegree(right) > 1) return null;

  let relation = split.operator;
  let delta = subtract(left, right); // left - right relation 0

  // Put every relation in < or <= form. Reversing the comparison negates the
  // boundary polynomial, so y >= 2x+1 becomes 2x+1-y <= 0.
  if (relation === '>' || relation === '>=') {
    delta = scale(delta, -1);
    relation = relation === '>' ? '<' : '<=';
  }

  if (!delta.size) return null; // tautologies/contradictions are not a boundary
  return { relation, delta };
};

const proportionalByPositiveScale = (a, b, tolerance = EPSILON) => {
  const keys = new Set([...a.keys(), ...b.keys()]);
  let ratio = null;

  for (const key of keys) {
    const av = a.get(key) || 0;
    const bv = b.get(key) || 0;
    if (Math.abs(av) <= tolerance && Math.abs(bv) <= tolerance) continue;
    if (Math.abs(av) <= tolerance || Math.abs(bv) <= tolerance) return false;
    const current = bv / av;
    if (!(current > 0) || !Number.isFinite(current)) return false;
    if (ratio === null) ratio = current;
    else if (Math.abs(current - ratio) > tolerance * Math.max(1, Math.abs(ratio))) return false;
  }
  return ratio !== null;
};

export const sameLinearInequality = (left, right, tolerance = EPSILON) => {
  const a = canonical(left);
  const b = canonical(right);
  if (!a || !b || a.relation !== b.relation) return false;
  return proportionalByPositiveScale(a.delta, b.delta, tolerance);
};

export default sameLinearInequality;
