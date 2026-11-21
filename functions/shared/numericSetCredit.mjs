import { parseFiniteSetNotation, sameValue } from './answerEquivalence.mjs';
import { refusesTypedEntry } from './typedEntryGuard.mjs';

// Opt-in partial credit: unique correct elements / max(expected, submitted).
// Extra guesses reduce credit; duplicate roster entries do not change a set.
export const numericSetCredit = (actual, expected, tolerance = 1e-6) => {
  // An entry that is not graded earns no part of the credit either, and is
  // not read: the pairing below is quadratic in what was typed (a 2,692-
  // character entry took 15 s), and `{1, 2, 3}` with 240 spaces after it was
  // marked wrong with full credit (typedEntryGuard.mjs; #557, #558).
  if (refusesTypedEntry(actual, expected)) return 0;
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
