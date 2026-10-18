// WHICH FORM A LINE IS WRITTEN IN, AND WHETHER TWO EQUATIONS ARE ONE LINE.
//
// THE MISS THIS EXPLAINS (student pass 3, R-3 / PR-11). "Equation of line B′
// in slope-intercept form", key `y=-3x+5`. A student who writes
// `y-5=-3(x-0)` has the right line and the wrong form. The grader is right to
// refuse it (algebraicForm.mjs compares side by side so that a form question
// stays a form question), but the student was told only "Focus on: Equation
// of line B′ …", which reads exactly like a wrong line.
//
// This file answers two questions about what was written, and nothing else:
//
//   sameLine(a, b)          do the two equations have the same graph?
//   writtenLineForm(eq)     is it written as y = mx + b, y − y₁ = m(x − x₁),
//                           or Ax + By = C (null when none of these)?
//
// and one about the question: requestedLineForm(texts), the form a label or
// prompt names ("slope-intercept form", "y = mx + b", …), or null.
//
// NEVER A GRADE. Nothing here is read by a grader. The misconception
// classifier (misconceptionClassifiers.mjs, `ordinary:multiAnswer`) uses it
// to name the reason for a miss the grader already made.

import { parsePolynomial, splitEquationSides, polynomialDegree } from './algebraicForm.mjs';

const EPSILON = 1e-9;
const text = (value) => String(value ?? '');

export const LINE_FORMS = Object.freeze({
  SLOPE_INTERCEPT: 'slopeIntercept',
  POINT_SLOPE: 'pointSlope',
  STANDARD: 'standard',
});

/** Only x and y, at most degree one, on both sides. */
const linearSide = (value) => {
  const poly = parsePolynomial(value);
  if (!poly || polynomialDegree(poly) > 1) return null;
  for (const key of poly.keys()) if (!['', 'x', 'y'].includes(key)) return null;
  return poly;
};

const coefficient = (poly, key) => poly.get(key) || 0;

/** `left = right` as two linear sides in x and y, or null. */
const readLinearEquation = (value) => {
  if (/[<>≤≥≠]|\\(?:leq?|geq?|neq?|ne)(?![A-Za-z])/.test(text(value))) return null;
  const sides = splitEquationSides(value);
  if (!sides) return null;
  const left = linearSide(sides.left);
  const right = linearSide(sides.right);
  if (!left || !right) return null;
  return { sides, left, right };
};

/** a·x + b·y + c = 0 for the equation, or null when it is not a line. */
const lineCoefficients = (value) => {
  const equation = readLinearEquation(value);
  if (!equation) return null;
  const { left, right } = equation;
  const a = coefficient(left, 'x') - coefficient(right, 'x');
  const b = coefficient(left, 'y') - coefficient(right, 'y');
  const c = coefficient(left, '') - coefficient(right, '');
  if (Math.abs(a) < EPSILON && Math.abs(b) < EPSILON) return null;
  return [a, b, c];
};

/** The two equations have the same graph (one is a nonzero multiple of the other). */
export const sameLine = (first, second) => {
  const p = lineCoefficients(first);
  const q = lineCoefficients(second);
  if (!p || !q) return false;
  // Cross products of every pair vanish exactly when the vectors are parallel.
  for (let i = 0; i < 3; i += 1) {
    for (let j = i + 1; j < 3; j += 1) {
      const scale = Math.max(1, Math.abs(p[i] * q[j]), Math.abs(p[j] * q[i]));
      if (Math.abs(p[i] * q[j] - p[j] * q[i]) > 1e-6 * scale) return false;
    }
  }
  return true;
};

const bareY = (side) => /^\s*y\s*$/i.test(text(side).replace(/\\left|\\right|[{}]/g, ''));
const has = (poly, key) => Math.abs(coefficient(poly, key)) > EPSILON;
const onlyConstant = (poly) => !has(poly, 'x') && !has(poly, 'y');
// A bracket that holds x — what makes m(x − x₁) point-slope rather than mx + b
// (a fraction's brackets, `\frac{1}{3}x`, hold numbers only).
const bracketsAroundX = (side) => /\([^()]*x[^()]*\)/i.test(text(side).replace(/\\left|\\right/g, ''));

const formOfSides = (sideText, sidePoly, otherText, otherPoly) => {
  if (bareY(sideText) && !has(otherPoly, 'y') && has(otherPoly, 'x') && !bracketsAroundX(otherText)) return LINE_FORMS.SLOPE_INTERCEPT;
  if (Math.abs(coefficient(sidePoly, 'y') - 1) < EPSILON && !has(sidePoly, 'x') && has(sidePoly, '')
    && !has(otherPoly, 'y') && has(otherPoly, 'x') && bracketsAroundX(otherText)) return LINE_FORMS.POINT_SLOPE;
  if (has(sidePoly, 'x') && has(sidePoly, 'y') && !has(sidePoly, '') && onlyConstant(otherPoly)) return LINE_FORMS.STANDARD;
  return null;
};

/** The form a linear equation is written in, or null. Either side may come first. */
export const writtenLineForm = (value) => {
  const equation = readLinearEquation(value);
  if (!equation) return null;
  const { sides, left, right } = equation;
  return formOfSides(sides.left, left, sides.right, right) || formOfSides(sides.right, right, sides.left, left);
};

const FORM_NAMES = [
  [LINE_FORMS.SLOPE_INTERCEPT, /\bslope[-\s]?intercept\s+form\b|\by\s*=\s*mx\s*\+\s*b\b/i],
  [LINE_FORMS.POINT_SLOPE, /\bpoint[-\s]?slope\s+form\b|\by\s*[-−]\s*y_?\{?1\}?\s*=\s*m\s*\(/i],
  [LINE_FORMS.STANDARD, /\bstandard\s+form\b|\bax\s*\+\s*by\s*=\s*c\b/i],
];

/**
 * The line form the first text that names one asks for. A text that names
 * two forms ("rewrite the point-slope equation in slope-intercept form") is
 * read by its "in … form" phrase; when that does not settle it, null.
 */
export const requestedLineForm = (texts = []) => {
  for (const value of (Array.isArray(texts) ? texts : [texts])) {
    const source = text(value);
    const named = FORM_NAMES.filter(([, pattern]) => pattern.test(source)).map(([form]) => form);
    if (named.length === 1) return named[0];
    if (named.length > 1) {
      const target = FORM_NAMES
        .filter(([, pattern]) => new RegExp(`\\b(?:in|as|into)\\s+(?:the\\s+)?(?:${pattern.source})`, 'i').test(source))
        .map(([form]) => form);
      return target.length === 1 ? target[0] : null;
    }
  }
  return null;
};
