// Question family: dividing polynomials in the Polynomial Workshop
// (Algebra II: Dividing Polynomials, A2.7C; the Remainder and Factor
// Theorems, A2.7D).
//
// Contract (./index.js): matches, hints, similarProblem, expectedValues,
// backUpQuestion. This family is an EXAMPLE family: it owns a question so its
// worked example can be built, and changes nothing else the question has.
//
//   matches         a `polynomialWorkshop` question in one of the three
//                   division views the replay plays (divisionReplay.js):
//                   `syntheticDivision` or `longDivision` written as text, and
//                   `synthetic` (the Remainder and Factor Theorems table).
//   hints           none: the workshop's own hints and the item's stay as they are.
//   backUpQuestion  none: the workshop's own back-up step stays.
//   expectedValues  none: the hint guard reads what it read before, so no
//                   hint a lesson shows today is dropped by this family.
//   exampleAnswers  the item's own answers (its quotient, its remainder, P(r)),
//                   for the example guard only (similarExampleIsSafe): no
//                   workshop item lists them in answer fields. A remainder of
//                   0 is a case, not a number the item states, and is left out.
//   similarProblem  the sibling divisionSiblingFor builds, worked by
//                   replayDivisionExample: every line the workshop's own key,
//                   and the work its grader marks right. Each step is
//                   { show, why }. The player plays it on the division board
//                   (examplePlayer.js); this text form is what the coverage
//                   report and "Practise one like this" read.
//
// Pure: no React, no I/O.
import { divisionItemAnswers, divisionReplayToolOf, divisionSiblingFor, replayDivisionExample } from '../workedExample/divisionReplay.js';

export const family = 'polynomialDivision';
export const implemented = true;

export const matches = (question) => Boolean(divisionReplayToolOf(question));

export const hints = () => [];

export const backUpQuestion = () => null;

export const expectedValues = () => [];

export const exampleAnswers = (question) => divisionItemAnswers(question);

export const similarProblem = (question, { seed = 0 } = {}) => {
  const sibling = divisionSiblingFor(question, { seed });
  if (!sibling) return null;
  const replay = replayDivisionExample(sibling);
  if (!replay.ok) return null;
  return {
    prompt: replay.prompt,
    steps: replay.steps.map((step) => ({ show: step.show, why: step.why })),
    answer: replay.answer,
    problems: replay.problems,
  };
};
