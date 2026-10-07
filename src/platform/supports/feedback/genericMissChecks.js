/*
 * CHEAP, GENERIC CHECKS FOR A MISS NO CLASSIFIER EXPLAINS.
 *
 *   genericMissCheck({ student, expected }) → { check, message } | null
 *
 * `student` and `expected` are one answer each: a number (or numeric text,
 * fractions included) or an ordered pair. The checks, in order:
 *
 *   coordinates-swapped  (b, a) for (a, b), a ≠ b
 *   sign-flipped         −v for v ≠ 0 (or a pair with both signs flipped)
 *   reciprocal           1/v for v ∉ {0, 1, −1}
 *   not-simplified       the same value, written as an unreduced fraction
 *
 * Each message names the likely error and NEVER the answer: they are fixed
 * text, and no number from the question reaches them. DISPLAY ONLY — nothing
 * here is stored, sent with the attempt or read by grading, and a check can
 * only describe work the grader already marked wrong (the caller decides
 * that; a correct answer is never checked).
 */
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
  'coordinates-swapped': 'Check the order of your coordinates. An ordered pair is written (x, y), with the x-coordinate first.',
  'sign-flipped': 'Your answer has the right size but the opposite sign. Look for a step where a negative sign was dropped or added — especially when subtracting or moving a term.',
  reciprocal: 'Your answer looks like it is upside down — the numerator and denominator may have traded places. Check which quantity goes on top.',
  'not-simplified': 'Your value is right, but it is not in simplest form. Divide the numerator and denominator by their greatest common factor.',
});

const result = (check) => ({ check, message: GENERIC_MISS_MESSAGES[check] });

export const genericMissCheck = ({ student, expected } = {}) => {
  try {
    const studentPair = readPair(student);
    const expectedPair = readPair(expected);
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
