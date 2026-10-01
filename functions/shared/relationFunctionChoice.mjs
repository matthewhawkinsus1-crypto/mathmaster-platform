/*
 * "IS THIS RELATION A FUNCTION?" — THE VERDICT AND ITS REASON.
 *
 * The mapping diagram (src/tools/relationMapping/RelationMapping.jsx) asks for
 * the verdict together with the reason, and two of the four choices are the
 * one-to-one misconception: "every output is used only once" is not what makes
 * a relation a function, and a repeated output does not stop one. Only the
 * definition earns the mark.
 *
 * The tool and the server grader (pathToolContracts.mjs, relationMapping) both
 * read this file. They used to keep separate vocabularies: the tool sent
 * "yes-definition", the server knew only yes / no, so in My Math Path and Live
 * Challenge every function was marked wrong and every non-function right,
 * whatever the student chose.
 */

export const FUNCTION_CHOICES = Object.freeze([
  Object.freeze({ value: 'yes-definition', label: 'Yes — every input has exactly one output.' }),
  Object.freeze({ value: 'yes-output-rule', label: 'Yes — every output value is used only once.' }),
  Object.freeze({ value: 'no-input-repeat', label: 'No — at least one input has more than one output.' }),
  Object.freeze({ value: 'no-output-repeat', label: 'No — at least one output value repeats.' }),
]);

/** The one choice that is right for this relation. */
export const correctFunctionChoice = (isFunction) => (isFunction ? 'yes-definition' : 'no-input-repeat');

// The verdict alone: the Yes / No select the tool had before the reasons, and
// content or older clients that send a boolean.
const LEGACY_VERDICTS = new Map([['yes', true], ['true', true], ['no', false], ['false', false]]);

/**
 * Whether an answer to "is it a function?" is right for a relation that is (or
 * is not) a function. A reason must be the definition's; a bare verdict, from
 * before the reasons, is judged on the verdict. No answer is never right.
 */
export const functionAnswerIsCorrect = (answer, isFunction) => {
  if (typeof answer === 'boolean') return answer === Boolean(isFunction);
  const value = String(answer ?? '').trim().toLowerCase();
  if (LEGACY_VERDICTS.has(value)) return LEGACY_VERDICTS.get(value) === Boolean(isFunction);
  return value === correctFunctionChoice(Boolean(isFunction));
};
