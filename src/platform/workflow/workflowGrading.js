// Grading a composed question, stage by stage.
//
// The third of the three sections. `content` says what mathematics exists,
// `workflow` says what the student does, and this reads `grading` — which no
// renderer ever receives — and turns a set of stage responses into parts.
//
// Two rules shape everything here:
//
//   1. Partial credit is the norm. Each stage is marked on its own, because a
//      student who models the situation correctly and then misreads the domain
//      has done something different from one who did neither.
//
//   2. A stage with no key is reported as ungraded, never as wrong. Written
//      interpretation has no machine answer, and a table built from the
//      student's own function has no fixed one. Marking those incorrect would
//      punish work nobody checked.
//
// Pure: no React, no Firestore, no clock.

import { compareMathAnswer, looksLikeFiniteSetNotation, normalizeMathAnswer } from '../../answerUtils.js';
import { isAlgebraicallyEquivalent } from '../../grading/equivalence.js';
import { hasStageResponse } from './questionWorkflow.js';
import { evaluateModelAt, evaluateNumericValue, toEvaluableExpression } from './modelExpression.js';
export { evaluateModelAt, evaluateNumericValue, toEvaluableExpression } from './modelExpression.js';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);

const isWorkflowArtifact = (value, kind = null) => Boolean(
  isObject(value)
  && value.__mathmasterWorkflowArtifact
  && (!kind || value.__mathmasterWorkflowArtifact === kind)
);

const responsePayload = (value) => isWorkflowArtifact(value, 'table') ? (value.cells || {}) : value;

// Stages whose answers are mathematical expressions rather than labels, and so
// deserve equivalence rather than string comparison: 2x and x+x are one answer.
const ALGEBRAIC_KINDS = new Set([
  'equationInput', 'algebraWorkspace', 'domainInput', 'rangeInput', 'intervalInput',
]);

// Parsing and evaluation of the student's function live in modelExpression.js.
// The graph workflow imports the same implementation, so the table and graph
// can never disagree about what the student wrote.

/**
 * Is this table consistent with the function the student wrote?
 *
 * This is the check that makes a dependent stage worth having. It never asks
 * whether the function is right — only whether the student used the one they
 * wrote. A student whose function is wrong but whose table follows it has done
 * the table correctly, and should be told that rather than marked wrong twice
 * for one mistake.
 */
export const checkTableConsistency = ({
  response = {}, xValues = [], model = '', responseColumn = 'y', tolerance = 1e-6,
} = {}) => {
  const rows = [];
  xValues.forEach((x, rowIndex) => {
    const entered = response?.[`${rowIndex}:${responseColumn}`];
    if (String(entered ?? '').trim() === '') return;
    const numericX = evaluateNumericValue(x);
    const expected = numericX === null ? null : evaluateModelAt(model, numericX);
    const enteredNumber = evaluateNumericValue(entered);
    rows.push({
      x,
      entered,
      expected,
      // An unevaluable MODEL leaves `matches` null: unknown, not false. A
      // nonnumeric student entry is checkable and wrong; ignoring it would let
      // a completed table skip a bad row and still unlock the dependent graph.
      matches: expected === null
        ? null
        : (enteredNumber !== null && Math.abs(enteredNumber - expected) <= tolerance),
    });
  });

  const checked = rows.filter((row) => row.matches !== null);
  return {
    checked: checked.length,
    consistent: checked.length > 0 && checked.every((row) => row.matches),
    mismatches: checked.filter((row) => !row.matches),
    rows,
  };
};

// `f(x) = 2x`, `y = 2x` and `C(n) = 2n` are the same model under three names.
// Only a stage that asks for a function is allowed to ignore the name: an
// equation the student SOLVED (`x = 3`) is about which variable was isolated,
// so its left side is part of the answer and is never dropped.
const FUNCTION_DEFINITION = /^[a-z](?:\([a-z]\))?$/i;

const definesAFunction = (text) => {
  const parts = String(text ?? '').split('=');
  return parts.length === 2 && FUNCTION_DEFINITION.test(normalizeMathAnswer(parts[0]));
};

const matchesAnswer = (stage, response, expected) => {
  if (Array.isArray(expected)) return expected.some((option) => matchesAnswer(stage, response, option));
  // Some domain/range stages intentionally present a bounded set of authored
  // choices (for example an infinite discrete domain). In that case the
  // response is a selected label, not an algebraic expression to simplify.
  if (Array.isArray(stage?.choices) && stage.choices.length) {
    return compareMathAnswer(response, expected)
      || normalizeMathAnswer(response) === normalizeMathAnswer(expected);
  }
  // Domain/range stages can legitimately ask for roster-form sets. Set
  // membership is order-independent and MathLive serializes visible braces in
  // several equivalent ways, so use the shared semantic set comparator before
  // algebraic-expression equivalence.
  if (looksLikeFiniteSetNotation(expected)) return compareMathAnswer(response, expected);
  if (ALGEBRAIC_KINDS.has(stage.kind)) {
    if (isAlgebraicallyEquivalent(response, expected)) return true;
    if (stage.kind === 'equationInput' && definesAFunction(response) && definesAFunction(expected)) {
      const student = toEvaluableExpression(response);
      const key = toEvaluableExpression(expected);
      return Boolean(student && key) && isAlgebraicallyEquivalent(student, key);
    }
    return false;
  }
  if (typeof response === 'string' || typeof response === 'number') {
    return compareMathAnswer(response, expected)
      || normalizeMathAnswer(response) === normalizeMathAnswer(expected);
  }
  return false;
};

const gradeRoles = (response, rule) => {
  const answer = isObject(response) ? response : {};
  const keys = Object.keys(rule);
  const wrong = keys.filter((role) => normalizeMathAnswer(answer[role]) !== normalizeMathAnswer(rule[role]));
  return {
    graded: true,
    isCorrect: wrong.length === 0,
    detail: wrong.length === 0 ? 'Both roles identified.' : `Check the ${wrong.join(' and ')} quantity.`,
  };
};

/**
 * A listed set: the domain of a relation is `{-4, -2, 1, 3}` however it is
 * punctuated, and in any order. Braces, spaces and ordering are notation, not
 * mathematics, so none of them decides the mark.
 */
export const parseSetAnswer = (value) => String(value ?? '')
  .replace(/[{}]/g, '')
  .replace(/[−–—]/g, '-')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry !== '');

const gradeSet = (response, expected) => {
  const student = parseSetAnswer(response).map((entry) => normalizeMathAnswer(entry));
  const key = expected.map((entry) => normalizeMathAnswer(entry));
  const studentSet = new Set(student);
  const keySet = new Set(key);
  const isCorrect = studentSet.size === keySet.size && [...keySet].every((entry) => studentSet.has(entry));
  return {
    graded: true,
    isCorrect,
    detail: isCorrect
      ? 'Every value is listed once.'
      : 'That is not the set of values in this relation — list each one once.',
  };
};

/**
 * The arrows of a mapping diagram, compared as a set of pairs. Which arrow was
 * drawn first is not mathematics.
 */
const gradePairs = (response, expected) => {
  const key = (pair) => `${Number(pair?.[0])}->${Number(pair?.[1])}`;
  const student = new Set(list(response).map(key));
  const wanted = new Set(list(expected).map(key));
  const isCorrect = student.size === wanted.size && [...wanted].every((pair) => student.has(pair));
  return {
    graded: true,
    isCorrect,
    detail: isCorrect
      ? 'Every value is joined to the one it maps to.'
      : 'The arrows do not match the relation — check which value each one is joined to.',
  };
};

const gradeTableValues = (response, values) => {
  const answer = isObject(response) ? response : {};
  const keys = Object.keys(values);
  const wrong = keys.filter((key) => !compareMathAnswer(answer[key] ?? '', values[key]));
  return {
    graded: true,
    isCorrect: keys.length > 0 && wrong.length === 0,
    detail: wrong.length === 0 ? 'Every value matches.' : `${wrong.length} of ${keys.length} values do not match.`,
  };
};

/**
 * Mark one stage. Returns `graded: false` whenever this module has no basis for
 * a verdict, so the caller can tell "not checked" from "checked and wrong".
 */
export const gradeStage = ({ stage, rule, responses = {} }) => {
  const response = responses[stage.id];
  const answered = hasStageResponse(response);
  const base = { id: stage.id, label: stage.prompt || stage.kind, isComplete: answered };

  if (rule === undefined || rule === null) {
    return { ...base, graded: false, isCorrect: false, detail: 'Reviewed by your teacher.' };
  }
  if (isObject(rule) && (rule.manual === true || rule.rubric)) {
    return { ...base, graded: false, isCorrect: false, detail: 'Reviewed by your teacher.' };
  }
  if (!answered) {
    return { ...base, graded: true, isCorrect: false, detail: 'Not answered.' };
  }

  if (isObject(rule) && rule.consistentWith) {
    // A graph built from an upstream table/equation is locally graded by the
    // graph workspace against the STUDENT-DERIVED function and points. Preserve
    // that verdict instead of comparing it with the authored answer key.
    if (rule.useStageVerdict && isWorkflowArtifact(response, 'graph')) {
      return {
        ...base,
        graded: true,
        isCorrect: response.isCorrect === true,
        detail: response.isCorrect
          ? 'Your graph matches the model and table you built.'
          : 'Revise the graph so it matches the model and table you built.',
      };
    }

    const model = responses[rule.consistentWith];
    const modelValue = isWorkflowArtifact(model, 'table') ? model.sourceModel : model;
    const check = checkTableConsistency({
      response: responsePayload(response),
      xValues: Array.isArray(stage.xValues) ? stage.xValues : [],
      model: typeof modelValue === 'string' ? modelValue : '',
      responseColumn: stage.responseColumn || 'y',
    });
    if (!check.checked) {
      // Nothing could be checked — an unevaluable model, or no numeric entries.
      return { ...base, graded: false, isCorrect: false, detail: 'Could not be checked against your function.' };
    }
    return {
      ...base,
      graded: true,
      isCorrect: check.consistent,
      detail: check.consistent
        ? 'Every value follows the function you wrote.'
        : `${check.mismatches.length} value(s) do not follow the function you wrote.`,
    };
  }

  if (isObject(rule) && Array.isArray(rule.pairs)) return { ...base, ...gradePairs(response, rule.pairs) };
  if (isObject(rule) && Array.isArray(rule.set)) return { ...base, ...gradeSet(response, rule.set) };
  if (isObject(rule) && rule.values) return { ...base, ...gradeTableValues(responsePayload(response), rule.values) };
  if (stage.kind === 'quantityRoles' && isObject(rule)) return { ...base, ...gradeRoles(response, rule) };

  const expected = isObject(rule) ? (rule.anyOf ?? rule.equals) : rule;
  if (expected === undefined) {
    return { ...base, graded: false, isCorrect: false, detail: 'Reviewed by your teacher.' };
  }
  const isCorrect = matchesAnswer(stage, response, expected);
  return { ...base, graded: true, isCorrect, detail: isCorrect ? 'Correct.' : 'Not correct yet.' };
};

/**
 * Mark the whole composed question.
 *
 * The shape returned is the one every other tool reports to QuestionEngine, so
 * a composed question submits, records attempts and shows feedback through the
 * same path as everything else.
 */
export const gradeWorkflow = ({ stages = [], responses = {}, grading = null } = {}) => {
  const rules = isObject(grading) ? grading : {};
  const parts = stages.map((stage) => gradeStage({ stage, rule: rules[stage.id], responses }));

  const graded = parts.filter((part) => part.graded);
  const correct = graded.filter((part) => part.isCorrect);
  const isComplete = parts.length > 0 && parts.every((part) => part.isComplete);

  return {
    parts,
    isComplete,
    // A question whose every stage is teacher-reviewed cannot be auto-marked
    // correct, and says so rather than reporting a false verdict.
    isCorrect: isComplete && graded.length > 0 && correct.length === graded.length,
    partialCreditPercent: graded.length ? Math.round((correct.length / graded.length) * 100) : null,
    gradedCount: graded.length,
    responseKey: JSON.stringify(responses),
    questionDetails: stages
      .map((stage, index) => `Step ${index + 1} (${stage.kind}): ${JSON.stringify(responses[stage.id] ?? null)}`)
      .join(' | '),
  };
};
