/*
 * A RELATION'S DOMAIN AND RANGE AS A STUDENT TYPES THEM: ONE RULE, THREE READERS.
 *
 * A typed domain or range is a SET: any order, a value written twice is the
 * same value, and two numbers are one value within 1e-9. The Mapping Diagram's
 * Check has always read the boxes this way, and so does its registry grader
 * (../../serverGrading/tools/relationMapping.mjs, which re-exports these). My
 * Math Path's contract compared them as LISTS instead, within 1e-6, so the
 * range of {(-7, -2), (2, 1), (14, -2)} typed as its pairs give it, "-2, 1, -2",
 * was right in an assignment and wrong on the Path (MP07). The Path contract
 * now reads this rule too, so the three cannot drift apart again.
 *
 * Pure and import-free on purpose: pathToolContracts.mjs is on the student
 * app's startup path and the registry grader is not, so the Path reads the
 * rule from here rather than from the grader.
 */

export const uniqueSorted = (values) => [...new Set(values.map(Number))].sort((a, b) => a - b);

/** A typed comma- (or semicolon-) separated list; tokens that are not finite numbers are dropped. */
export const parseList = (input) => String(input || '')
  .split(/[,;]/)
  .map((part) => part.trim())
  .filter(Boolean)
  .map(Number)
  .filter((value) => Number.isFinite(value));

/** Same values once each, in any order. */
export const sameSet = (left, right) => {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-9);
};
