/*
 * WHAT STEP ALGEBRA'S BOARD READS OFF THE EQUATION ON SCREEN, ONCE PER EQUATION.
 *
 * The board draws from four readings of the committed equation: whether it is
 * solved and which move would cancel a term (the solver's strategic hint),
 * each side's cancellation model (the pairs a student may strike out), and
 * each side's terms as the board draws them; Simplify, once open, from a
 * fifth, the parts it can act on. All of them were worked out in the
 * render. isSolvedEquation simplifies the sides through mathjs (about 16 ms a
 * call in node, four times that on a throttled Chromebook), a side's model
 * costs about half that, and the suggested move and the terms parse each side
 * several times, while the solver renders three or four times as its question
 * opens, and again for a hint, Work View or a change of connection, with the
 * equation unchanged.
 *
 * Keyed twice. An equation is replaced, never edited in place (setEquation in
 * StepByStepAlgebraCore.jsx), so the equation object is the first key: a
 * render that asks again of the same equation reads nothing. Behind it, each
 * reading is kept by the text it is worked out from, in a small bounded cache
 * that outlives the board: an equal equation that is a new object (a draft
 * restored when the student comes back to the question, an Undo back to an
 * earlier step, Start over) is answered without mathjs. Each reading is a pure
 * function of that text, so a kept answer is the one the engine gives; a
 * value that is not plain text or JSON is never kept, and is worked out each
 * time. A failure is not kept either, so it is thrown again each time, as
 * before.
 */
import { getSuggestedMove, isSolvedEquation, splitAdditiveTerms } from '../../algebraAstEngine.js';
import { buildCancellationModel } from '../../algebraCancellationModel.js';
import { detectSimplifyParts } from './simplify/simplifyEngine.js';

// Entries per reading: an assignment's equations and the steps a student is
// likely to come back to, and never more.
export const EQUATION_READINGS_KEPT = 64;

const boundedCache = (limit) => {
  // A Map keeps insertion order: the first key is the one read longest ago.
  const entries = new Map();
  return {
    read(key, work) {
      if (key === null) return work();
      if (entries.has(key)) {
        const kept = entries.get(key);
        entries.delete(key);
        entries.set(key, kept);
        return kept;
      }
      const value = work();
      entries.set(key, value);
      if (entries.size > limit) entries.delete(entries.keys().next().value);
      return value;
    },
    get size() { return entries.size; },
  };
};

// The exact text of a reading's inputs, or null when an input is not plain
// JSON (undefined is told apart from null, which the engine reads differently).
const UNDEFINED = '\u0000undefined';
const textKey = (inputs) => {
  try {
    return JSON.stringify(inputs, (_key, value) => {
      if (value === undefined) return UNDEFINED;
      if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('not text');
      if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new TypeError('not text');
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) throw new TypeError('not text');
      }
      return value;
    });
  } catch {
    return null;
  }
};

const keyed = (equation) => equation !== null && typeof equation === 'object';
const objectiveOf = (equation) => (keyed(equation.objective) ? equation.objective : undefined);

const solvedByText = boundedCache(EQUATION_READINGS_KEPT);
const movesByText = boundedCache(EQUATION_READINGS_KEPT);
const modelsByText = boundedCache(EQUATION_READINGS_KEPT);
const termsByText = boundedCache(EQUATION_READINGS_KEPT);
const partsByText = boundedCache(EQUATION_READINGS_KEPT);
const solvedByEquation = new WeakMap();
const movesByEquation = new WeakMap();
const modelsByEquation = new WeakMap();

const byEquation = (equations, equation, work) => {
  if (!equations.has(equation)) equations.set(equation, work());
  return equations.get(equation);
};

// isSolvedEquation reads the sides, the variable and the objective.
export const equationIsSolved = (equation) => {
  if (!keyed(equation)) return isSolvedEquation(equation);
  return byEquation(solvedByEquation, equation, () => solvedByText.read(
    textKey([equation.left, equation.right, equation.variable, equation.objective]),
    () => isSolvedEquation(equation),
  ));
};

// The move the strategic hint suggests (getSuggestedMove reads the sides and
// the variable, or the objective's variable).
export const suggestedMove = (equation) => {
  if (!keyed(equation)) return getSuggestedMove(equation);
  return byEquation(movesByEquation, equation, () => movesByText.read(
    textKey([equation.left, equation.right, equation.variable, objectiveOf(equation)?.variable]),
    () => getSuggestedMove(equation),
  ));
};

// The strategic hint's two readings, worked out only where the hint can be
// offered, since nothing else shows them: the suggested move first, as it
// needs no simplify, and with no move to suggest there is no hint, solved or
// not. A question the solver could not read has no equation and no hint:
// the board shows UnreadableEquationPanel, and these readings run before
// that return, so they must not throw on it (they used to, which crashed
// the board in place of the panel).
export const strategicHintReadings = (equation, { offered = true } = {}) => {
  if (equation == null) return { suggestedMove: null, solved: false };
  const move = offered || !keyed(equation) ? suggestedMove(equation) : null;
  return { suggestedMove: move, solved: move ? equationIsSolved(equation) : false };
};

// The model a side shows while no operation is staged on it.
export const committedCancellationModel = (equation, side) => {
  if (!keyed(equation)) return buildCancellationModel(equation[side], null, equation.variable, []);
  let models = modelsByEquation.get(equation);
  if (!models) {
    models = new Map();
    modelsByEquation.set(equation, models);
  }
  if (!models.has(side)) {
    models.set(side, modelsByText.read(
      textKey([equation[side], equation.variable]),
      () => buildCancellationModel(equation[side], null, equation.variable, []),
    ));
  }
  return models.get(side);
};

// A side's terms as the board draws them. The term splitter reads its
// expression as text (String), so that text is the whole key.
const expressionText = (expression) => {
  try {
    return String(expression);
  } catch {
    return null;
  }
};
export const boardTerms = (expression) => termsByText.read(expressionText(expression), () => splitAdditiveTerms(expression));

// Every part Simplify can act on, for the board's regions (its sides, each
// { key, label, expression, variable }: all detectSimplifyParts reads). Asked
// for when Simplify opens, and worked out ahead of that while the student
// reads (StepByStepAlgebraCore's idle steps), so opening it does not wait.
export const simplifyPartsFor = (regions) => partsByText.read(textKey(regions), () => detectSimplifyParts(regions));

/** How many readings each cache holds (tests). */
export const equationReadingsKept = () => ({
  solved: solvedByText.size,
  moves: movesByText.size,
  models: modelsByText.size,
  terms: termsByText.size,
  parts: partsByText.size,
});
