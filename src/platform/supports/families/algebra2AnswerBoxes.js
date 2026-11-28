// Question family: Algebra II answer boxes with a built-in worked example
// (WE-I; docs/platform/WORKED_EXAMPLES.md sections 6 and 8).
//
// Contract (./index.js): matches, hints, similarProblem, expectedValues,
// backUpQuestion. This family is an EXAMPLE family: it owns a question so its
// worked example can be built, and changes nothing else the question has.
//
//   matches         an answer-box question (`multiAnswer`) on an Algebra II
//                   standard that one of the generators (./algebra2/) claims:
//                   every one of its answer fields is a part that generator
//                   can work; or a sort (`openSortBoard`) whose categories and
//                   cards a sort generator reads (./algebra2/sorts.js). An
//                   Algebra I standard (`A.`) is never read here.
//   hints           none: the item's own hints and the platform's stay as they are.
//   backUpQuestion  none: the item's own back-up step stays.
//   expectedValues  none beyond the answer fields, which the guard already reads.
//   similarProblem  the generator's sibling: the same kinds of part with other
//                   numbers, each step { show, why }, the first draw from the
//                   seed that passes the answer guard (./algebra2/shared.js).
//
// A sibling is never a question on the assignment (examplePlayer.js checks its
// prompt against every problem there), and like every example it is never
// built on a DOL, quiz or test (exampleSectionRule).
//
// Pure: no React, no I/O.
import { fieldsOf, firstSafe, standardOf, text } from './algebra2/shared.js';
import { EXPONENT_GENERATORS } from './algebra2/exponents.js';
import { POLYNOMIAL_GENERATORS } from './algebra2/polynomials.js';
import { SORT_GENERATORS } from './algebra2/sorts.js';

export const family = 'algebra2AnswerBoxes';
export const implemented = true;

export const GENERATORS = Object.freeze([...EXPONENT_GENERATORS, ...POLYNOMIAL_GENERATORS]);

/** The generator that claims the question, and its plan, or null. */
export const claimFor = (question) => {
  const type = text(question?.type);
  if (type !== 'multiAnswer' && type !== 'openSortBoard') return null;
  const standard = standardOf(question);
  if (!standard.startsWith('A2.')) return null;
  const fields = type === 'openSortBoard' ? [] : fieldsOf(question);
  if (type === 'multiAnswer' && !fields.length) return null;
  for (const generator of type === 'openSortBoard' ? SORT_GENERATORS : GENERATORS) {
    if (!generator.standards.includes(standard)) continue;
    let plan = null;
    try {
      plan = generator.claim(question, fields);
    } catch {
      plan = null;
    }
    if (plan) return { generator, plan };
  }
  return null;
};

export const matches = (question) => Boolean(claimFor(question));

export const hints = () => [];

export const backUpQuestion = () => null;

export const expectedValues = () => [];

export const similarProblem = (question, { seed = 0 } = {}) => {
  const claimed = claimFor(question);
  if (!claimed) return null;
  return firstSafe(question, (draw, ok) => claimed.generator.draw(claimed.plan, draw, ok), seed);
};
