/*
 * CHEAP, GENERIC CHECKS FOR A MISS NO CLASSIFIER EXPLAINS.
 *
 *   genericMissCheck({ student, expected, open }) → { check, message } | null
 *
 * While `open` (the default) only `not-simplified` speaks: see below.
 *
 * `student` and `expected` are one answer each: a number (or numeric text,
 * fractions included) or an ordered pair. The checks, in order:
 *
 *   coordinates-swapped  (b, a) for (a, b), a ≠ b
 *   sign-flipped         −v for v ≠ 0 (or a pair with both signs flipped)
 *   reciprocal           1/v for v ∉ {0, 1, −1}
 *   not-simplified       the same value, written as an unreduced fraction
 *   point-for-value      an ordered pair where one number is asked, and
 *   value-for-point      the reverse ("(0, 4)" for a y-intercept of 4)
 *   interval-notation-…  an inequality where interval notation is asked,
 *   inequality-…         and the reverse; "-right-value" when it names the
 *                        same numbers, "-asked" when it does not
 *
 * Each message names the likely error and NEVER the answer: they are fixed
 * text, and no number from the question reaches them.
 *
 * ONLY ONCE THE ITEM HAS CLOSED. Every check here relates the student's own
 * answer to the key by one move — negate it, invert it, swap it, reduce it —
 * so naming the move hands over the answer: −4x + 8 = 36 with 7 typed, "the
 * opposite sign" is −7 (PR #462 review M6b). A different sentence per check
 * does the same thing more slowly: a student learns which sentence means
 * "negate it" (release-candidate QA M1). So while attempts are left a check
 * says nothing at all — the miss looks exactly like one no check explains —
 * and the caller asks with `open: false` only once the item has closed
 * (missDiagnosis.js). The one exception is `not-simplified` (OPEN_ITEM_CHECKS,
 * FB23): the value is already right, so saying the form is not in lowest
 * terms hands over no move toward a different answer.
 *
 * DISPLAY ONLY — nothing here is stored, sent with the attempt or read by
 * grading, and a check can only describe work the grader already marked
 * wrong (the caller decides that; a correct answer is never checked).
 */
import {
  parseInequalityText,
  parseIntervalNotation,
  sameIntervals,
} from '../../../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';

const EPSILON = 1e-9;
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPSILON * Math.max(1, Math.abs(a), Math.abs(b));

const stripMath = (value) => String(value ?? '')
  .replace(/\\left|\\right/g, '')
  .replace(/\\dfrac|\\tfrac/g, '\\frac')
  .replace(/−/g, '-')
  .replace(/\s+/g, '')
  .trim();

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** A number, or a fraction n/d with its parts, from typed or LaTeX text. */
export const readNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? { value, fraction: null } : null;
  // Two numbers apart are not one: a mixed number typed `3 2/5` would close
  // up into 32/5, and "Your value is right" would be said of 64/10 against it
  // — while the item is open, now that that check speaks then (FB23).
  if (/\d\s+[\d.]/.test(String(value ?? ''))) return null;
  const text = stripMath(value);
  if (!text) return null;
  const latex = text.match(/^(-?)\\frac\{(-?\d+)\}\{(-?\d+)\}$/);
  const plain = text.match(/^(-?)\(?(-?\d+)\)?\/\(?(-?\d+)\)?$/);
  const parts = latex || plain;
  if (parts) {
    const numerator = Number(parts[2]) * (parts[1] === '-' ? -1 : 1);
    const denominator = Number(parts[3]);
    if (!denominator) return null;
    return { value: numerator / denominator, fraction: { numerator, denominator } };
  }
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return null;
  return { value: Number(text), fraction: null };
};

/** An ordered pair [x, y] from [x, y], {x, y} or "(x, y)" text. */
export const readPair = (value) => {
  if (Array.isArray(value) && value.length === 2) {
    const [x, y] = value.map((entry) => readNumber(entry)?.value);
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
  }
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) return readPair([value.x, value.y]);
  const text = stripMath(value);
  const match = text.match(/^\(?([^,()]+),([^,()]+)\)?$/);
  if (!match) return null;
  return readPair([match[1], match[2]]);
};

export const GENERIC_MISS_MESSAGES = Object.freeze({
  'point-for-value': 'This asks for a single number, not an ordered pair.',
  'value-for-point': 'This asks for an ordered pair (x, y), not a single number.',
  'interval-notation-right-value': 'Your inequality describes the right numbers, but this asks for interval notation.',
  'interval-notation-asked': 'This asks for interval notation, not an inequality.',
  'inequality-right-value': 'Your interval describes the right numbers, but this asks for an inequality.',
  'inequality-asked': 'This asks for an inequality, not interval notation.',
  'coordinates-swapped': 'Check the order of your coordinates. An ordered pair is written (x, y), with the x-coordinate first.',
  'sign-flipped': 'Your answer has the right size but the opposite sign. Look for a step where a negative sign was dropped or added — especially when subtracting or moving a term.',
  reciprocal: 'Your answer looks like it is upside down — the numerator and denominator may have traded places. Check which quantity goes on top.',
  'not-simplified': 'Your value is right, but it is not in simplest form. Divide the numerator and denominator by their greatest common factor.',
});

/*
 * THE ONE CHECK AN OPEN ITEM HEARS (the owner, 2026-10-23; FB23). "Not in
 * lowest terms" says the value is already right and names its FORM, not a
 * move toward another value, the rule the right-line-wrong-form and
 * simplest-form messages already follow while an item is open. Without it a
 * student repeated the same unreduced fraction, told only "Focus on:
 * Fraction answer".
 */
export const OPEN_ITEM_CHECKS = Object.freeze([
  'not-simplified',
  // FB22: the same kind of sentence. Each names only the FORM the field asks
  // for (a number, a pair, interval notation, an inequality) and, at most,
  // that the student's own numbers are already right, never a move toward a
  // different value.
  'point-for-value', 'value-for-point',
  'interval-notation-right-value', 'interval-notation-asked',
  'inequality-right-value', 'inequality-asked',
]);

// What a math box gives (\le, \infty, \cup), as the interval readers' text.
// The commands go first: a space is what ends one ("\le x"), and stripMath
// takes the spaces out.
const asPlainRelation = (value) => stripMath(String(value ?? '')
  .replace(/\\leq?(?![a-zA-Z])/g, '<=')
  .replace(/\\geq?(?![a-zA-Z])/g, '>=')
  .replace(/\\lt(?![a-zA-Z])/g, '<')
  .replace(/\\gt(?![a-zA-Z])/g, '>')
  .replace(/\\infty|∞/g, 'inf')
  .replace(/\\cup(?![a-zA-Z])/g, 'U'));
const RELATION = /[<>≤≥]/;
const readRelation = (text) => {
  const letters = [...new Set(text.replace(/inf|or/g, '').match(/[a-zA-Z]/g) || [])];
  return letters.length === 1 ? parseInequalityText(text, letters[0]) : null;
};

/** An inequality typed where interval notation is asked, or the reverse (FB22). */
export const notationMiss = (student, expected) => {
  const key = asPlainRelation(expected);
  const typed = asPlainRelation(student);
  if (!key || !typed) return null;
  if (!RELATION.test(key)) {
    const intervals = parseIntervalNotation(key);
    if (!intervals || !RELATION.test(typed)) return null;
    const read = readRelation(typed);
    return read && sameIntervals(read, intervals) ? 'interval-notation-right-value' : 'interval-notation-asked';
  }
  const asked = readRelation(key);
  const intervals = RELATION.test(typed) ? null : parseIntervalNotation(typed);
  if (!asked || !intervals) return null;
  return sameIntervals(asked, intervals) ? 'inequality-right-value' : 'inequality-asked';
};

export const genericMissCheck = ({ student, expected, open = true } = {}) => {
  // Open (attempts left) unless the caller says the item has closed — and an
  // open item gets nothing but a form miss, whichever check would have fired.
  const result = (check) => (open !== false && !OPEN_ITEM_CHECKS.includes(check)
    ? null
    : { check, message: GENERIC_MISS_MESSAGES[check] });
  try {
    const notation = notationMiss(student, expected);
    if (notation) return result(notation);
    const studentPair = readPair(student);
    const expectedPair = readPair(expected);
    if (studentPair && !expectedPair && readNumber(expected)) return result('point-for-value');
    if (expectedPair && !studentPair && readNumber(student)) return result('value-for-point');
    if (studentPair && expectedPair) {
      const [ex, ey] = expectedPair;
      const [sx, sy] = studentPair;
      if (near(sx, ex) && near(sy, ey)) return null;
      if (!near(ex, ey) && near(sx, ey) && near(sy, ex)) return result('coordinates-swapped');
      if ((ex !== 0 || ey !== 0) && near(sx, -ex) && near(sy, -ey)) return result('sign-flipped');
      return null;
    }
    const s = readNumber(student);
    const e = readNumber(expected);
    if (!s || !e) return null;
    if (near(s.value, e.value)) {
      // The same value graded wrong: only an unreduced fraction is explained.
      const fraction = s.fraction;
      if (fraction && (gcd(fraction.numerator, fraction.denominator) > 1 || fraction.denominator < 0 || Math.abs(fraction.denominator) === 1)) return result('not-simplified');
      return null;
    }
    if (e.value !== 0 && near(s.value, -e.value)) return result('sign-flipped');
    if (e.value !== 0 && !near(Math.abs(e.value), 1) && near(s.value, 1 / e.value)) return result('reciprocal');
    return null;
  } catch {
    return null;
  }
};

export default genericMissCheck;
