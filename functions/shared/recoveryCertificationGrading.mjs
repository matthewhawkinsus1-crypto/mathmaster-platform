/*
 * THE FULL ANSWER-KEY CHECK FOR A RECOVERY CERTIFICATION — SERVER AND TESTS.
 *
 * recoveryCertification.mjs takes its grader as a parameter so the student
 * app's static import path never loads every tool's grader. This module is
 * the grader the server's recovery upgrade and the tests pass: each sampled
 * Recovery version is answered with its OWN key, in the response shape the
 * student's tool sends, and marked by the shared grading registry the server
 * marks Recovery with (serverGrading/serverResponseGrading.mjs). A wrong
 * answer must be marked wrong too, so a grader that accepts anything cannot
 * certify.
 *
 * Built from the instance's `answer` — the family computed it from the same
 * values as the question — never from the built question's own key fields, so
 * a key that disagrees with its question cannot pass by agreeing with itself.
 */
import { gradeServerResponse } from './serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from './serverGrading/toolResponseContract.mjs';

const fieldsResponse = (responses) => ({
  kind: 'fields',
  type: 'multiAnswer',
  value: '',
  fields: Object.entries(responses).map(([id, value]) => ({ id, value: String(value), isComplete: true })),
});

const wrongFieldValue = (field) => {
  if (field?.type === 'choice') return (field.options || []).find((option) => option !== field.answer) ?? '__wrong__';
  if (field?.answerFormat === 'orderedPair') return '(99, 99)';
  if (field?.answerFormat === 'expression') return 'x+999';
  return '999';
};

/** The response a student who solved this version would send, and one wrong one. */
export const recoveryKeyResponses = (question = {}, instance = {}) => {
  const answer = instance?.answer || {};
  if (question.type === 'multiAnswer' && answer.kind === 'fields' && answer.value && typeof answer.value === 'object') {
    const fields = Array.isArray(question.answerFields) ? question.answerFields : [];
    const first = fields[0];
    return {
      right: fieldsResponse(answer.value),
      wrong: first ? fieldsResponse({ ...answer.value, [first.id]: wrongFieldValue(first) }) : null,
    };
  }
  if (question.type === 'graphing2' && answer.kind === 'line') {
    const { m, b } = answer.value || {};
    // One slope step whose run makes the rise whole.
    const run = [1, 2, 3, 4, 5, 6].find((step) => Math.abs(Math.round(m * step) - m * step) < 1e-9) || 1;
    const points = [[0, b], [run, b + m * run]];
    return {
      right: buildToolResponse({ question, toolId: 'graphing2', work: { points } }),
      wrong: buildToolResponse({ question, toolId: 'graphing2', work: { points: points.map(([x, y]) => [x, y + 1]) } }),
    };
  }
  if (question.type === 'transformationsLab' && answer.kind === 'images') {
    const images = (answer.value || []).map(([x, y]) => [x, y]);
    return {
      right: buildToolResponse({ question, toolId: 'transformationsLab', work: { plottedPoints: images } }),
      wrong: buildToolResponse({
        question,
        toolId: 'transformationsLab',
        work: { plottedPoints: images.map(([x, y], index) => (index === 0 ? [x + 1, y] : [x, y])) },
      }),
    };
  }
  return null;
};

/**
 * certifyRecoveryBinding's `gradeSample`: { checked, isCorrect, wrongRejected }.
 * `checked: false` for an answer kind this module has no responder for, which
 * certification reports as unchecked rather than passed.
 */
export const serverRecoveryKeyCheck = (question, instance) => {
  const responses = recoveryKeyResponses(question, instance);
  if (!responses) return { checked: false };
  const right = gradeServerResponse({ question, response: responses.right });
  const wrong = responses.wrong ? gradeServerResponse({ question, response: responses.wrong }) : null;
  return {
    checked: true,
    isCorrect: right?.isCorrect === true,
    wrongRejected: wrong ? wrong.isCorrect !== true : true,
  };
};
