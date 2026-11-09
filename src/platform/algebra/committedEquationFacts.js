/*
 * WHAT STEP ALGEBRA'S BOARD READS OFF THE EQUATION ON SCREEN, ONCE PER EQUATION.
 *
 * The board draws from two readings of the committed equation: whether it is
 * solved, and each side's cancellation model (the pairs a student may strike
 * out). Both were worked out in the render. isSolvedEquation simplifies the
 * sides through mathjs (about 16 ms a call in node, four times that on a
 * throttled Chromebook) and a side's model costs about half that, while the
 * solver renders about eight times as its question opens, and again for a
 * hint, Work View or a change of connection, with the equation unchanged.
 *
 * An equation is replaced, never edited in place (setEquation in
 * StepByStepAlgebraCore.jsx), so the equation object is the key: the same
 * equation gives the same answers, worked out the first time they are asked
 * for. A failure is not kept, so it is thrown again each time, as before.
 */
import { isSolvedEquation } from '../../algebraAstEngine.js';
import { buildCancellationModel } from '../../algebraCancellationModel.js';

const solvedByEquation = new WeakMap();
const modelsByEquation = new WeakMap();
const keyed = (equation) => equation !== null && typeof equation === 'object';

export const equationIsSolved = (equation) => {
  if (!keyed(equation)) return isSolvedEquation(equation);
  if (!solvedByEquation.has(equation)) solvedByEquation.set(equation, isSolvedEquation(equation));
  return solvedByEquation.get(equation);
};

// The model a side shows while no operation is staged on it.
export const committedCancellationModel = (equation, side) => {
  if (!keyed(equation)) return buildCancellationModel(equation[side], null, equation.variable, []);
  let models = modelsByEquation.get(equation);
  if (!models) {
    models = new Map();
    modelsByEquation.set(equation, models);
  }
  if (!models.has(side)) models.set(side, buildCancellationModel(equation[side], null, equation.variable, []));
  return models.get(side);
};
