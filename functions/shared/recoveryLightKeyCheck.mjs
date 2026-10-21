/*
 * THE LIGHT ANSWER-KEY CHECK FOR A RECOVERY CERTIFICATION — PRE-FLIGHT'S.
 *
 * Pre-Flight runs on the student app's static import path, which must not
 * load the tool graders (recoveryCertificationGrading.mjs holds the full
 * check the server and the tests use). This checks what the light ordinary
 * grader can mark — a typed-and-chosen board's own key is marked correct and
 * a wrong first field is not — and reports anything else as unchecked, never
 * as passed. Every version of every family is marked with the full graders by
 * the families' property tests, and the server re-certifies with them before
 * it stores a binding on a live assignment.
 */
import { gradeOrdinaryResponse } from './ordinaryResponseGrading.mjs';

const fieldsResponse = (responses) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(responses).map(([id, value]) => ({ id, value: String(value), isComplete: true })),
});

export const lightRecoveryKeyCheck = (question = {}, instance = {}) => {
  const answer = instance?.answer || {};
  if (question?.type !== 'multiAnswer' || answer.kind !== 'fields' || !answer.value || typeof answer.value !== 'object') {
    return { checked: false };
  }
  const first = Array.isArray(question.answerFields) ? question.answerFields[0] : null;
  const right = gradeOrdinaryResponse({ question, response: fieldsResponse(answer.value) });
  let wrongRejected = true;
  if (first) {
    const wrongValue = first.type === 'choice'
      ? (first.options || []).find((option) => option !== first.answer) ?? '__wrong__'
      : first.answerFormat === 'orderedPair' ? '(99, 99)' : '999';
    wrongRejected = gradeOrdinaryResponse({ question, response: fieldsResponse({ ...answer.value, [first.id]: wrongValue }) })?.isCorrect !== true;
  }
  return { checked: true, isCorrect: right?.isCorrect === true, wrongRejected };
};
