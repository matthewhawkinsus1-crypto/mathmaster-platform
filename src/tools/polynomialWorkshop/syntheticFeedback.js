/*
 * WHAT SYNTHETIC DIVISION (ax + b) SAYS AFTER A WRONG CHECK (walkthrough
 * 2026-10-22, Dividing Polynomials CW 9 and CW 10).
 *
 * Every miss got "The boxes marked in red are not right yet." Two misses have
 * a cause the student can act on, read from their own boxes:
 *   - r with the wrong sign, the most common slip: x + 3 puts −3 in the box;
 *   - for a divisor like 2y − 1, the textbook's other method (the original
 *     coefficients with r = ½, then divide the bottom row by 2). It reaches
 *     the right quotient, but this item asks for the lesson's method — divide
 *     through by 2 first — and the red grid never said that the method, not
 *     the arithmetic, was the issue.
 * Neither message states a box's value.
 */
import { parseNumericAnswer } from '../../../functions/shared/toolMath/shared/toolMath.mjs';

const valueOf = (ratio) => (ratio && Number.isFinite(ratio.n) && Number.isFinite(ratio.d) && ratio.d !== 0 ? ratio.n / ratio.d : null);
const same = (typed, ratio) => {
  const number = parseNumericAnswer(typed);
  const expected = valueOf(ratio);
  return number !== null && expected !== null && Math.abs(number - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
};

export const SYNTHETIC_RETRY = 'The boxes marked in red are not right yet. Start with the first one: every later column depends on it.';

export const syntheticMissMessage = ({ key = null, work = {}, wrong = new Set() } = {}) => {
  if (!key) return SYNTHETIC_RETRY;
  const letter = key.letter || 'x';
  const typedCoefficients = Array.isArray(work.coefficients) ? work.coefficients : [];
  const original = Array.isArray(key.dividend?.coefficients) ? key.dividend.coefficients : [];
  if (key.scaled && original.length && typedCoefficients.length === original.length
    && typedCoefficients.every((typed, index) => same(typed, original[index]))) {
    return `This item uses the lesson's method: divide the dividend and the divisor by the leading coefficient of the divisor first, so the divisor is ${letter} − r. Then the top row holds the divided coefficients.`;
  }
  const rValue = valueOf(key.r);
  if (wrong.has('r') && rValue !== null && rValue !== 0 && same(work.r, { n: -key.r.n, d: key.r.d })) {
    return `Check the sign of r: it is the value of ${letter} that makes the divisor 0, so a divisor ${letter} + c puts −c in the box.`;
  }
  return SYNTHETIC_RETRY;
};
