/*
 * SHOW THE STEP: THE STEP'S LINE IN A SUBMITTED RESPONSE (SP-4;
 * docs/platform/SHOWING_THE_PROCESS.md section 5).
 *
 * A part with a `checkpoint` keeps the student's step (their points, pair,
 * rows or moves) as one line of text beside the part's own answer, under the
 * name `<part id>::step`. This module carries that line into the response the
 * student submits, as one more field after the answer parts:
 *
 *   fields: [{ id: 'slope', value: '3', isComplete: true },
 *            { id: 'slope::step', value: '(0, -2) (2, 4); rise 6; run 2', isComplete: true }]
 *
 * NO GRADER READS IT. gradeMultiAnswerResponse marks the parts a question
 * authors and nothing else, so the line changes no verdict, no part grade and
 * no score. It is the student's work, kept so a teacher can see it
 * (responseInspectorView.mjs). It is never a verdict: the tool's engine reads
 * the line again wherever it is shown.
 *
 * Import-free and light: on every path that builds a response.
 */
export const STEP_FIELD_SUFFIX = '::step';
// One answer box's worth of text (typedEntryGuard.mjs MAX_TYPED_ANSWER_LENGTH).
export const MAX_STEP_LINE_LENGTH = 240;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

export const stepFieldId = (partId) => `${partId}${STEP_FIELD_SUFFIX}`;
export const isStepFieldId = (id) => typeof id === 'string' && id.length > STEP_FIELD_SUFFIX.length && id.endsWith(STEP_FIELD_SUFFIX);
export const partIdOfStepField = (id) => (isStepFieldId(id) ? id.slice(0, -STEP_FIELD_SUFFIX.length) : null);

/** The parts of a question that carry a checkpoint, by part id. */
export const checkpointParts = (question = {}) => new Map(
  list(question?.answerFields)
    .filter((field) => isObject(field) && field.id && isObject(field.checkpoint) && typeof field.checkpoint.kind === 'string')
    .map((field) => [String(field.id), field]),
);

/**
 * The step fields of a response, from the answers the boxes hold (their
 * response key is those answers as JSON). Only a part the question gives a
 * checkpoint has one; anything else under a step's name is not carried.
 */
export const stepFieldsFromAnswers = (question, responseKey) => {
  const parts = checkpointParts(question);
  if (!parts.size || typeof responseKey !== 'string' || !responseKey.startsWith('{')) return [];
  let answers;
  try {
    answers = JSON.parse(responseKey);
  } catch {
    return [];
  }
  if (!isObject(answers)) return [];
  return [...parts.keys()].flatMap((partId) => {
    const value = answers[stepFieldId(partId)];
    return typeof value === 'string' && value.trim() && value.length <= MAX_STEP_LINE_LENGTH
      ? [{ id: stepFieldId(partId), value, isComplete: true }]
      : [];
  });
};

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
