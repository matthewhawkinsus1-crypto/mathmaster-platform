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

/**
 * The Matrix Lab work a student who solved a matrices.* version would send
 * (serverGrading/declarations/matrixLab.mjs, every cell as typed text), and
 * one wrong one; null for an answer that is not a Matrix Lab answer.
 */
export const matrixLabKeyWork = (answer = {}) => {
  if (answer.kind === 'matrixOperate' && Array.isArray(answer.value?.entries)) {
    const { rows, cols, entries } = answer.value;
    const work = (cells) => ({
      defined: 'yes',
      dimensions: { rows: String(rows), cols: String(cols) },
      entries: cells.map((row) => row.map(String)),
      inverses: '',
    });
    return { right: work(entries), wrong: work(entries.map((row, i) => row.map((cell, j) => (i === 0 && j === 0 ? cell + 1 : cell)))) };
  }
  if (answer.kind === 'matrixSolve' && Array.isArray(answer.value?.A)) {
    const { A, B, classification, values = [], singularReason = null } = answer.value;
    const work = (overrides = {}) => ({
      A: A.map((row) => row.map(String)),
      B: B.map(String),
      inverse: [],
      classification,
      values: values.map(String),
      usedTechnology: true,
      ...(singularReason ? {
        singularReason: {
          row: String(singularReason.row),
          otherRow: String(singularReason.otherRow),
          factor: String(singularReason.factor),
          constant: singularReason.constant,
        },
      } : {}),
      ...overrides,
    });
    // One solved value off by one; a singular system classified the other way.
    const wrong = classification === 'one'
      ? work({ values: values.map((value, index) => String(index === 0 ? value + 1 : value)) })
      : work({ classification: classification === 'none' ? 'many' : 'none' });
    return { right: work(), wrong };
  }
  return null;
};

/**
 * The Polynomial Workshop work a student who solved a polynomials.* version
 * would send (serverGrading/declarations/polynomialWorkshop.mjs: each cell or
 * column as a typed term, then the answer), and the same work with the answer
 * wrong; null for an answer that is not Workshop work.
 */
export const polynomialWorkshopKeyWork = (answer = {}) => {
  if (answer.kind !== 'polynomialWorkshop' || !answer.value || typeof answer.value !== 'object') return null;
  const right = answer.value;
  // The answer the work ends in: the area model's product, add & subtract's
  // result, a division's quotient.
  const finalField = ['product', 'result', 'quotient'].find((field) => typeof right[field] === 'string') || 'result';
  // 999 has the form of an answer and never its value.
  return { right, wrong: { ...right, [finalField]: '999' } };
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
  // Matrix Lab (matrices.*): the work the lab's Check sends.
  const matrixWork = question.type === 'matrixLab' ? matrixLabKeyWork(answer) : null;
  if (matrixWork) {
    return {
      right: buildToolResponse({ question, toolId: 'matrixLab', work: matrixWork.right }),
      wrong: buildToolResponse({ question, toolId: 'matrixLab', work: matrixWork.wrong }),
    };
  }
  // Polynomial Workshop (polynomials.*): the work the workshop's Check sends.
  const workshopWork = question.type === 'polynomialWorkshop' ? polynomialWorkshopKeyWork(answer) : null;
  if (workshopWork) {
    return {
      right: buildToolResponse({ question, toolId: 'polynomialWorkshop', work: workshopWork.right }),
      wrong: buildToolResponse({ question, toolId: 'polynomialWorkshop', work: workshopWork.wrong }),
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
