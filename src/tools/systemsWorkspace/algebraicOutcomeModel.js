/*
 * INTERPRETING AN EARNED IDENTITY OR CONTRADICTION (#390, #392).
 *
 * The statement comes from the student's checked work; this module holds what
 * the student is then asked about it, and how an answer is judged:
 *
 *   1. what kind of statement it is — identity, contradiction, or the
 *      "0 = 0 means (0, 0, 0)" misconception;
 *   2. what that means for the system;
 *   3. how each pair of planes meets.
 *
 * No React here, so the rules are testable in node.
 */
import { linearEquationForm } from './algebraicSystemsEngine.js';
import { planePairs, planeRelationshipTypes } from './spatialFeedback.js';

export const STATEMENT_KINDS = Object.freeze([
  // Short enough to read in a closed phone-width select (#392).
  { value: 'identity', label: 'Identity (always true)' },
  { value: 'contradiction', label: 'Contradiction (never true)' },
  { value: 'origin', label: 'True only at (0, 0, 0)' },
]);

export const SYSTEM_MEANINGS = Object.freeze([
  { value: 'unique', label: 'Exactly one solution' },
  { value: 'infinite', label: 'Infinitely many — dependent' },
  { value: 'none', label: 'No solution — inconsistent' },
]);

const KIND_FOR = Object.freeze({ infinite: 'identity', none: 'contradiction' });

/** Is the student's reading of the statement right? Only then is a classification recorded. */
export const statementKindCorrect = (outcome, kind) => Boolean(outcome && kind === KIND_FOR[outcome.type]);

/**
 * A nudge tied to what the student chose — never the classification itself.
 * The kind of statement is judged first: whether `0 = 0` is always true is the
 * idea the meaning rests on (#390: "0 = 0 means (0, 0, 0)").
 */
export const classificationFeedback = (outcome, kind, choice) => {
  if (!outcome) return null;
  if (kind === 'origin') return 'A statement with no variables does not fix any coordinate. Does its truth change when x, y, or z changes?';
  if (!statementKindCorrect(outcome, kind)) return 'Evaluate both sides of your statement. Is it true or false — and does that depend on the values of the variables?';
  if (choice === outcome.type) return null;
  if (outcome.type === 'infinite') {
    return choice === 'none'
      ? 'An identity is true for every choice of the variables, so it rules no point out. Did any part of your work produce a false statement?'
      : 'An identity places no condition on the variables. With every original equation accounted for, is the system pinned to a single ordered triple?';
  }
  return 'A contradiction is false for every choice of the variables. Can any ordered triple make all three equations true at once?';
};

export const emptyPlaneWork = () => ({ answers: {}, checked: false });

const questionVariables = (questionData) => (
  Array.isArray(questionData?.variables) && questionData.variables.length ? questionData.variables.map(String) : ['x', 'y', 'z']
);
const questionEquations = (questionData) => (Array.isArray(questionData?.equations) ? questionData.equations.map(String) : []);

/** How each pair of this question's planes meets — for judging, never for display. */
export const planeTruthFor = (questionData) => {
  const variables = questionVariables(questionData);
  return planeRelationshipTypes(questionEquations(questionData).map((equation) => linearEquationForm(equation, variables)), variables);
};

/** Are the stated plane relationships right for these equations? Re-judged, never trusted. */
export const planeWorkEarned = (planeWork, questionData) => {
  if (!planeWork?.checked || questionEquations(questionData).length !== 3) return false;
  const truth = planeTruthFor(questionData);
  return planePairs(3).every(({ id }) => planeWork.answers?.[id] === truth[id]);
};
