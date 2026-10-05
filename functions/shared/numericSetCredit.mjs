import { parseFiniteSetNotation, sameValue } from './answerEquivalence.mjs';

// Opt-in partial credit: unique correct elements / max(expected, submitted).
// Extra guesses reduce credit; duplicate roster entries do not change a set.
export const numericSetCredit = (actual, expected, tolerance = 1e-6) => {
  const submitted = parseFiniteSetNotation(actual);
  const key = parseFiniteSetNotation(expected);
  if (!submitted || !key) return 0;
  const unique = (values) => values.filter((value, index) => !values.slice(0, index).some((other) => sameValue(value, other, tolerance)));
  const left = unique(submitted);
  const right = unique(key);
  if (!right.length) return left.length ? 0 : 1;
  const matched = new Set();
  left.forEach((value) => {
    const index = right.findIndex((other, i) => !matched.has(i) && sameValue(value, other, tolerance));
    if (index >= 0) matched.add(index);
  });
  return matched.size / Math.max(right.length, left.length);
};
