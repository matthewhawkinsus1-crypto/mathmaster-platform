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
// The misconception classifier (misconceptionClassifiers.mjs,
// `ordinary:multiAnswer`) uses it to name the reason for a miss the grader
// already made. Two grading rules read it too: a point-slope answer through
// another point of the key's line is right (answerEquivalence.mjs,
// samePointSlopeLine; the owner, 2026-10-20), so is a whole-number multiple
// of a standard-form key (sameStandardFormMultiple, wholeMultipleOfLine; the
// owner, 2026-10-23), and a field that asks for no form takes any equation of
// its line (GR03, below: asksForAForm, equationsInText, isObliqueLine;
// lineFormPolicy.mjs decides the field). Nothing else here grades.

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

/*
 * HOW MANY TIMES ONE EQUATION OF A LINE IS ANOTHER (GR29). The whole number n
 * with first = n × second term by term — 4x + 2y = 6 is 2 × (2x + y = 3), and
 * −2x − y = −3 is −1 × it — or null when they are not the same line or no
 * whole number scales one onto the other (x + 0.5y = 1.5 is ½ × it).
 */
export const wholeMultipleOfLine = (first, second) => {
  const p = lineCoefficients(first);
  const q = lineCoefficients(second);
  if (!p || !q || !sameLine(first, second)) return null;
  const index = q.findIndex((value) => Math.abs(value) > EPSILON);
  const ratio = p[index] / q[index];
  const whole = Math.round(ratio);
  return whole !== 0 && Math.abs(ratio - whole) <= 1e-9 * Math.max(1, Math.abs(ratio)) ? whole : null;
};

/** A vertical line (x = c): it has no y term, so it has no y = mx + b form. */
export const isVerticalLine = (value) => {
  const coefficients = lineCoefficients(value);
  return Boolean(coefficients) && Math.abs(coefficients[1]) < EPSILON;
};

/** Linear in x and y with at least one of them: what sameLine can compare. */
export const isLine = (value) => lineCoefficients(value) !== null;

/*
 * A line in BOTH x and y: neither horizontal nor vertical. GR03 reads only
 * these. An equation in one letter (`x = 4`, `y = 3`, `2x + 9 = 25`) is a
 * line to sameLine, but it is also every step of solving an equation ("the
 * equation after squaring", "the condition after adding 21"), where the
 * question's own equation is that same "line" and must not be an answer.
 */
export const isObliqueLine = (value) => {
  const coefficients = lineCoefficients(value);
  return Boolean(coefficients) && Math.abs(coefficients[0]) > EPSILON && Math.abs(coefficients[1]) > EPSILON;
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

/*
 * GR03 (the owner, 2026-10-24): "Yes for any question that names no form."
 * A field whose key is a line takes any equation of that line unless the
 * question asks for a form. These read the question's words for that; the
 * field-level decision is lineFormPolicy.mjs, and the comparison is
 * answerEquivalence.mjs (sameValue's `anyLineForm`).
 */

/** A field's `lineForm` when it takes any equation of its line. */
export const LINE_FORM_ANY = 'any';

/*
 * Words that ask for a written form, or for rewriting a given equation into
 * one. Deliberately wide: a wrongly read request only keeps today's
 * form-for-form grading, while a missed one would accept a form the question
 * asked the student to change. Any "form" ("slope-intercept form", "in the
 * form y = kx", "simplest form"), a form's name or template, a direct
 * variation (y = kx), and solving, isolating, rewriting or converting.
 */
const FORM_REQUESTS = [
  /\bforms?\b/i,
  /\bslope[-\s]?intercept\b/i,
  /\bpoint[-\s]?slope\b/i,
  /\bstandard\b/i,
  /\bdirect[-\s]?variation\b/i,
  /\by\s*=\s*m\s*x\s*\+\s*b\b/i,
  /\by\s*=\s*k\s*x\b/i,
  /\ba\s*x\s*\+\s*b\s*y\s*(?:\+\s*c\s*)?=\s*(?:c|0)\b/i,
  /\by\s*[-−]\s*y\s*(?:_\s*\{?\s*1\s*\}?|₁)/i,
  /\bsolved?\b[^.;:?!]*\bfor\b/i,
  /\bin\s+terms\s+of\b/i,
  /\bisolat/i,
  /\brewrit/i,
  /\bconvert/i,
  /\btransform/i,
  /\bsimplif/i,
  /\bexpand/i,
  /\bfactor/i,
  /\bas\s+a\s+function\b/i,
  /\bfunction\s+notation\b/i,
  // "Write a system with equations y= for Plan A": a blank y = to fill in.
  /(?:^|[^A-Za-z\\])y\s*=\s*(?=$|\$|[,.;:)?!]|\s+[A-Za-z]{2,})/i,
];

/** The words in these texts that ask for a form (or a rewrite), or null. */
export const formRequestIn = (texts = []) => {
  for (const value of (Array.isArray(texts) ? texts : [texts])) {
    for (const pattern of FORM_REQUESTS) {
      const match = pattern.exec(text(value));
      if (match) return match[0].trim() || 'y =';
    }
  }
  return null;
};

/** Does any of these texts ask for a form (or a rewrite) of an equation? */
export const asksForAForm = (texts = []) => formRequestIn(texts) !== null;

// The characters a written equation is made of. A word (two letters or more,
// not a LaTeX command) ends it, and so do sentence punctuation and another
// relation sign: "Line B is y = (1/3)x + 5." is `y=(1/3)x+5`.
const EQUATION_CHARACTER = /[0-9A-Za-z+\-*/^(){}\\\s_·⋅×²³⁰¹⁴⁵⁶⁷⁸⁹⁻√]/;
const isLetter = (character) => /[A-Za-z]/.test(character || '');

const equationSide = (source, start, step) => {
  let index = start;
  let side = '';
  while (index >= 0 && index < source.length) {
    const character = source[index];
    if (character === '.') {
      // A decimal point, never a full stop: a digit follows it.
      if (!/\d/.test(source[index + 1] || '')) break;
      side = step < 0 ? character + side : side + character;
      index += step;
      continue;
    }
    if (!EQUATION_CHARACTER.test(character)) break;
    if (isLetter(character)) {
      let first = index;
      let last = index;
      while (isLetter(source[first - 1])) first -= 1;
      while (isLetter(source[last + 1])) last += 1;
      const word = source.slice(first, last + 1);
      if (word.length > 1 && source[first - 1] !== '\\') break;
      side = step < 0 ? word + side : side + word;
      index = step < 0 ? first - 1 : last + 1;
      continue;
    }
    side = step < 0 ? character + side : side + character;
    index += step;
  }
  return side.trim();
};

/** The equations written in a sentence, each as `left=right`. */
export const equationsInText = (value) => {
  const source = text(value).replace(/\$+/g, ' ').replace(/[−–—]/g, '-');
  const found = [];
  for (let index = source.indexOf('='); index >= 0; index = source.indexOf('=', index + 1)) {
    if (/[<>!≤≥≠=]/.test(source[index - 1] || '') || source[index + 1] === '=') continue;
    const left = equationSide(source, index - 1, -1);
    const right = equationSide(source, index + 1, 1);
    if (left && right) found.push(`${left}=${right}`);
  }
  return found;
};

/*
 * Does a text show one of these keys' lines? Then a student could copy the
 * question's own equation ("For 3x + y = 7 …, write that equation solved for
 * it", key y = 7 − 3x): that field keeps form-for-form grading.
 */
export const showsLine = (texts = [], keys = []) => (Array.isArray(texts) ? texts : [texts])
  .some((value) => equationsInText(value).some((equation) => keys.some((key) => sameLine(equation, key))));
