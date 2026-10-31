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

/*
 * THE REMAINDER / FACTOR THEOREM TABLE (x − r) SAYS WHICH STEP IS OFF
 * (walkthrough 2026-10-23, Remainder and Factor Theorems CW 1).
 *
 * Every miss got "Check the coefficient row first (a 0 for each missing
 * power), then each multiply-and-add", including −4 for x − 4, where the
 * coefficient row was right. A wrong box makes every later row wrong too, so
 * the first wrong part in the order the table is filled is the one to name.
 * Read from the grader's parts; no message states a value. Where the method is
 * withheld (a DOL, quiz or test, useMethodWithheld) it says only that order.
 */
export const SYNTHETIC_TABLE_RETRY = 'Check the coefficient row first (a 0 for each missing power), then each multiply-and-add.';
export const SYNTHETIC_TABLE_WITHHELD = 'Not yet. Each row depends on the box and the row before it, so check them in order.';

// For a divisor ax + b with a ≠ 1 (TL49) the table's quotient is for x − r;
// the one asked is for ax + b = a(x − r), the table's divided by a.
export const SYNTHETIC_SCALED_QUOTIENT = 'Your table is right. Its bottom row without the remainder is the quotient for x − r: divide each of those numbers by the leading coefficient of the divisor.';

export const syntheticTableMissMessage = ({ parts = [], root = null, typedRoot = '', methodWithheld = false, leading = 1 } = {}) => {
  if (methodWithheld) return SYNTHETIC_TABLE_WITHHELD;
  const wrong = new Set(parts.filter((part) => part && part.isCorrect === false).map((part) => part.id));
  if (!wrong.size) return SYNTHETIC_TABLE_RETRY;
  if (wrong.has('divisor-root')) {
    const typed = parseNumericAnswer(typedRoot);
    return Number.isFinite(root) && root !== 0 && typed !== null && Math.abs(typed + root) <= 1e-9 * Math.max(1, Math.abs(root))
      ? 'Check the sign of the number in the box: it is the value of x that makes the divisor 0, so x − c puts c in the box and x + c puts −c.'
      : 'The number in the box is the value of x that makes the divisor 0. Every later row depends on it.';
  }
  if (wrong.has('coefficients')) return 'Check the coefficient row: every power of x from the highest down, with a 0 for any missing power.';
  if (wrong.has('products')) return 'Check the middle row: each product is the box number times the bottom-row number in the column before it.';
  if (wrong.has('sums')) return 'Check the bottom row: bring down the first coefficient, then add each column.';
  if (wrong.has('value')) return 'Your table is right. P(r) is the remainder: the last number in the bottom row.';
  if (wrong.has('quotient')) {
    return Number.isFinite(Number(leading)) && Math.abs(Number(leading) - 1) > 1e-9
      ? SYNTHETIC_SCALED_QUOTIENT
      : 'Your table is right. The quotient\'s coefficients are the bottom row without the remainder, one degree lower than P(x).';
  }
  if (wrong.has('factor')) return 'Your table is right. x − r is a factor exactly when the remainder is 0.';
  return SYNTHETIC_TABLE_RETRY;
};
