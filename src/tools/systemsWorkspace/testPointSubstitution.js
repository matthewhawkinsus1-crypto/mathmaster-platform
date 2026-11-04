/*
 * A TEST POINT IS SUBSTITUTED BEFORE IT IS JUDGED (F-SW-TEST-POINT-YESNO).
 *
 * "Does the point satisfy inequality 1?" was a Yes / No click, so a guess
 * passed it half the time, and the substitution — the skill — was never done
 * where anyone could see it. The warm-ups already ask for the value first
 * ("At (6, 4): 2x + 3y = [ ]"); the tool now does the same for the marked
 * point and for a point of the student's own: "2(6) + 3(4) = [ ]", then Yes / No.
 *
 * Which side: the inequality as the student reads it (its label), the side
 * with the arithmetic in it — the left one, unless the left is a lone
 * variable and the right has the work ("y > 4x − 6": 4(0) − 6). A lone
 * variable against a number ("x ≥ −5") asks for that coordinate: "x = [ ]".
 *
 * Its value is read from the label itself and offered only when it agrees with
 * the tool's own membership of the point, so a label the reader misreads asks
 * for nothing rather than for a wrong number. Display and step feedback only:
 * the shared grader does not read the value, so grading is unchanged.
 *
 * No React here: tests/platform/testPointSubstitution.test.mjs runs it in node.
 */
import { parsePolynomial } from '../../../functions/shared/algebraicForm.mjs';
import { matchesNumericAnswer, parseNumericAnswer } from '../shared/toolMath.js';

const RELATION_SPLIT = /\s*(≤|≥|<=|>=|<|>)\s*/;
const holds = (left, relation, right, tolerance = 1e-9) => ({
  '≤': left <= right + tolerance,
  '<=': left <= right + tolerance,
  '≥': left >= right - tolerance,
  '>=': left >= right - tolerance,
  '<': left < right - tolerance,
  '>': left > right + tolerance,
}[relation]);

const variablesOf = (poly) => [...poly.keys()].filter((key) => key !== '');
const valueAt = (poly, values) => [...poly.entries()].reduce((sum, [key, coefficient]) => sum + coefficient * (key === '' ? 1 : values[key]), 0);
// "x" or "y" alone, with coefficient 1: nothing to work out on that side.
const lone = (poly) => poly.size === 1 && variablesOf(poly).length === 1 && Math.abs(poly.get(variablesOf(poly)[0]) - 1) <= 1e-12;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A coordinate written as the platform writes numbers ("−8", "2.5"), as formatPoint does.
const coordinateText = (value) => {
  const tidy = Number(Number(value).toFixed(6));
  return String(Object.is(tidy, -0) ? 0 : tidy).replace('-', '−');
};

/**
 * "2x + 3y" at (6, 4) → "2(6) + 3(4)"; "−x + 6" at (−8, 2) → "−(−8) + 6";
 * "3/5x + 3" → "(3/5)(−4) + 3". A lone variable is left as it is: "x".
 */
export const substitutedText = (side, point, symbols = ['x', 'y']) => {
  const text = String(side ?? '').trim();
  const values = { [symbols[0]]: point[0], [symbols[1]]: point[1] };
  if (lone(parsePolynomial(text.replace(/−/g, '-')) || new Map())) return text;
  const pattern = new RegExp(`(\\(?\\d[\\d.]*\\/\\d[\\d.]*\\)?|\\([^()]*\\)|\\d[\\d.]*)?(${symbols.map(escape).join('|')})(?![A-Za-z])`, 'g');
  return text.replace(pattern, (whole, coefficient = '', symbol) => {
    const value = coordinateText(values[symbol]);
    if (coefficient) {
      // A bare fraction is grouped, so 3/5x reads (3/5)(−4), never 3/5(−4).
      const shown = /^\d[\d.]*\/\d/.test(coefficient) ? `(${coefficient})` : coefficient;
      return `${shown}(${value})`;
    }
    return values[symbol] < 0 ? `(${value})` : value;
  });
};

/**
 * What the student works out for one inequality at a point:
 * { side: '2x + 3y', text: '2(6) + 3(4)', value: 24 }, or null when the label
 * cannot be read, or when what it reads disagrees with `satisfied` (the
 * tool's own membership of the point).
 */
export const pointSubstitution = (label, point, { satisfied = null, symbols = ['x', 'y'] } = {}) => {
  if (!Array.isArray(point) || !point.every((value) => Number.isFinite(Number(value)))) return null;
  const parts = String(label ?? '').split(RELATION_SPLIT);
  if (parts.length !== 3) return null;
  const [leftText, relation, rightText] = parts;
  const left = parsePolynomial(leftText.replace(/−/g, '-'));
  const right = parsePolynomial(rightText.replace(/−/g, '-'));
  if (!left || !right) return null;
  const values = { [symbols[0]]: Number(point[0]), [symbols[1]]: Number(point[1]) };
  if ([...variablesOf(left), ...variablesOf(right)].some((key) => !(key in values))) return null;
  const leftValue = valueAt(left, values);
  const rightValue = valueAt(right, values);
  if (satisfied != null && holds(leftValue, relation, rightValue) !== Boolean(satisfied)) return null;
  const useRight = !variablesOf(left).length || (lone(left) && variablesOf(right).length > 0);
  if (useRight && !variablesOf(right).length) return null;
  const side = (useRight ? rightText : leftText).trim();
  const value = useRight ? rightValue : leftValue;
  return { side, text: substitutedText(side, [values[symbols[0]], values[symbols[1]]], symbols), value: Number(value.toFixed(9)) };
};

/**
 * What the student typed for a substitution: 'missing' (nothing a number can
 * be read from), 'off', or 'right' — within the tolerance every typed tool
 * answer has (0.01), so 4/3 and 1.33 both work out (1/3)(4). Step feedback
 * only, and asked only where outcomes are shown; where they are withheld a
 * value only has to be there (valueEntered).
 */
export const valueEntered = (typed) => parseNumericAnswer(typed) != null;
export const valueWorkedOut = (typed, substitution) => {
  if (!valueEntered(typed)) return 'missing';
  return matchesNumericAnswer(typed, substitution?.value) ? 'right' : 'off';
};
