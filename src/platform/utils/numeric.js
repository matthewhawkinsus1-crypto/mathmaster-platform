/*
 * `Number(null)` IS 0, NOT NaN.
 *
 * That one line of JavaScript trivia has produced four separate defects in this
 * repository, all with the same shape and all invisible in testing, because the
 * guard people write looks exactly right:
 *
 *     Number.isFinite(Number(value)) ? Number(value) : null
 *
 * It rejects `undefined`, `'abc'` and `NaN` — and it accepts `null`, `''`, `[]`
 * and `false`, turning every one of them into a confident zero. So a missing
 * mastery estimate became 0% mastery, a missing activity score became a zero in
 * a composite grade, and a missing readiness threshold became a threshold of
 * zero that everybody clears.
 *
 * The distinction matters most in exactly the place it is easiest to lose: a
 * number that is absent and a number that is zero mean completely different
 * things about a student. "No evidence yet" is not "scored nothing".
 *
 * `finiteNumber` is the guard that does what the one above looks like it does.
 */

/**
 * The value as a number, or null if it is not genuinely a finite number.
 *
 * Rejects null, undefined, empty and whitespace-only strings, booleans, arrays
 * and objects — every value that `Number()` would silently coerce to 0 or 1.
 * A numeric string is accepted, because Firestore and form inputs both produce
 * them and refusing those would be pedantry rather than safety.
 */
export const finiteNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'object') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** True when the value is a real finite number rather than a coercible blank. */
export const isFiniteNumber = (value) => finiteNumber(value) !== null;

/** The value as a number, or the fallback. Never silently zero. */
export const numberOr = (value, fallback) => {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : parsed;
};

export default finiteNumber;
