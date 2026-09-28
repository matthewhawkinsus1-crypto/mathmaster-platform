/*
 * SAY ONLY WHAT THIS QUESTION ASKS FOR.
 *
 * The "Given relation" card told every student to "build the mapping, plot,
 * domain, and range" — on a question that asked for the mapping and a
 * function decision and had no plot or domain/range parts at all (live QA,
 * Algebra I DOL #2 Warm-Up Q1, Practice Q11). The sentence is built from the
 * same `ask` list that decides which panels render.
 */
const PART_NAMES = Object.freeze([
  ['mapping', 'build the mapping'],
  ['plot', 'plot the points'],
  ['domain', 'find the domain'],
  ['range', 'find the range'],
  ['isFunction', 'decide whether it is a function'],
]);

const joinWithAnd = (items) => {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
};

export const givenRelationInstruction = (ask = []) => {
  const requested = new Set(Array.isArray(ask) ? ask : []);
  const parts = PART_NAMES.filter(([id]) => requested.has(id)).map(([, words]) => words);
  return parts.length ? `Use these ordered pairs to ${joinWithAnd(parts)}.` : 'Use these ordered pairs.';
};
