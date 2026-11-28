/*
 * SHOW THE STEP: A STEP'S ROW WHERE A RESPONSE IS READ (SP-4; SP-4b).
 *
 * The teacher's view of a response (responseInspectorView.mjs) and a
 * student's released Test review (SecureExamReview.jsx) show a part's step in
 * a row of its own, after its part, named for what the student did. Apart
 * from showTheStepFields.mjs, which every response builder loads (and so the
 * app's first load), so that only the screens that read a response carry
 * these.
 *
 * Marks nothing: a row is the student's work, never a verdict.
 */
import { checkpointParts, partIdOfStepField, stepFieldId } from './showTheStepFields.mjs';

const STEP_WORK_NAME = Object.freeze({
  pickPoints: 'points picked on the plane',
  stepMoves: 'moves in Step Algebra',
  factorPair: 'factor pair',
  tableRow: 'table rows',
});

/** A teacher's name for a step's row, beside the part it belongs to. */
export const stepRowLabel = (kind, partLabel) => {
  const what = Object.prototype.hasOwnProperty.call(STEP_WORK_NAME, kind) ? STEP_WORK_NAME[kind] : 'step';
  const part = String(partLabel ?? '').trim();
  return part ? `Step shown for "${part}": ${what}` : `Step shown: ${what}`;
};

/**
 * Field ids in the order a teacher reads them: each part, then its step. An
 * id under a step's name that no checkpoint asked for is not a step, and is
 * left where it was.
 */
export const withStepsAfterParts = (ids, question) => {
  const parts = checkpointParts(question);
  const steps = new Set(ids.filter((id) => parts.has(partIdOfStepField(id) ?? '')));
  return ids.filter((id) => !steps.has(id)).flatMap((id) => (steps.has(stepFieldId(id)) ? [id, stepFieldId(id)] : [id]));
};

/**
 * The rows of a recorded response, in the order a reader meets them: the
 * question's parts in their own order, each followed by its step, then
 * anything else the record holds, as stored. A step whose part has no answer
 * keeps its part's place: the part is listed too (its row says there is no
 * answer), so the step never drops out of the review.
 */
export const responseRowOrder = (responses = {}, fields = []) => {
  const held = responses && typeof responses === 'object' ? responses : {};
  const question = { answerFields: Array.isArray(fields) ? fields : [] };
  const parts = checkpointParts(question);
  const ids = new Set(Object.keys(held));
  Object.keys(held).forEach((id) => {
    const partId = partIdOfStepField(id);
    if (partId && parts.has(partId) && String(held[id] ?? '').trim()) ids.add(partId);
  });
  const fieldOrder = question.answerFields.map((field) => field?.id).filter((id) => ids.has(id));
  return withStepsAfterParts([...fieldOrder, ...[...ids].filter((id) => !fieldOrder.includes(id))], question);
};
