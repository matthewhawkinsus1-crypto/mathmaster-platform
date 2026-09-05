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

import { compareMathAnswer, looksLikeFiniteSetNotation, normalizeMathAnswer, parseOrderedPair } from '../../answerUtils.js';
import { isAlgebraicallyEquivalent } from '../../grading/equivalence.js';
import { hasStageResponse } from './questionWorkflow.js';
import { canonicalizeFunctionExpression, evaluateModelAt, evaluateNumericValue, toEvaluableExpression } from './modelExpression.js';
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
      // A modelling prompt asks for the relationship, not a particular choice
      // of letters. Canonicalize the declared input variable before comparing:
      // W(t)=18t, f(x)=18x and g(n)=18n are the same function model.
      const student = canonicalizeFunctionExpression(response);
      const key = canonicalizeFunctionExpression(expected);
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
    credit: keys.length ? (keys.length - wrong.length) / keys.length : 0,
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
  const intersection = [...keySet].filter((entry) => studentSet.has(entry)).length;
  const denominator = Math.max(studentSet.size, keySet.size, 1);
  return {
    graded: true,
    isCorrect,
    credit: intersection / denominator,
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
  const intersection = [...wanted].filter((pair) => student.has(pair)).length;
  const denominator = Math.max(student.size, wanted.size, 1);
  return {
    graded: true,
    isCorrect,
    credit: intersection / denominator,
    detail: isCorrect
      ? 'Every value is joined to the one it maps to.'
      : 'The arrows do not match the relation — check which value each one is joined to.',
  };
};

const matchesAxisText = (response, expected) => {
  const options = Array.isArray(expected) ? expected : [expected];
  return options
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
    .some((value) => normalizeMathAnswer(response) === normalizeMathAnswer(value));
};

const matchesAxisScale = (response, expected) => {
  const actual = Number(response);
  if (!Number.isFinite(actual) || actual <= 0) return false;
  const options = (Array.isArray(expected) ? expected : [expected])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== '');
  // If the author asks the student to choose a reasonable scale but does not
  // prescribe one exact count-by value, any positive scale is a valid
  // completion. This preserves the old relationshipModel behavior and avoids
  // turning an open design choice into a hidden answer.
  if (!options.length) return true;
  return options.some((value) => {
    const target = Number(value);
    return Number.isFinite(target) && Math.abs(actual - target) <= 1e-9;
  });
};

const gradeAxes = (response, rule = {}) => {
  const answer = isObject(response) ? response : {};
  const checks = [
    ['xLabel', 'x-axis quantity', matchesAxisText],
    ['yLabel', 'y-axis quantity', matchesAxisText],
  ];
  if (rule.requireUnits !== false) {
    checks.push(
      ['xUnit', 'x-axis unit', matchesAxisText],
      ['yUnit', 'y-axis unit', matchesAxisText],
    );
  }
  if (rule.requireScale === true) {
    checks.push(
      ['xStep', 'x-axis scale', matchesAxisScale],
      ['yStep', 'y-axis scale', matchesAxisScale],
    );
  }

  const wrong = checks
    .filter(([field, , matcher]) => !matcher(answer[field], rule[field]))
    .map(([, label]) => label);

  return {
    graded: true,
    isCorrect: wrong.length === 0,
    credit: checks.length ? (checks.length - wrong.length) / checks.length : 0,
    detail: wrong.length
      ? `Check the ${wrong.join(', ')}.`
      : 'The graph axes, units, and scale are labeled correctly.',
  };
};

const gradeTableValues = (response, values) => {
  const answer = isObject(response) ? response : {};
  const keys = Object.keys(values);
  const wrong = keys.filter((key) => !compareMathAnswer(answer[key] ?? '', values[key]));
  return {
    graded: true,
    isCorrect: keys.length > 0 && wrong.length === 0,
    credit: keys.length ? (keys.length - wrong.length) / keys.length : 0,
    detail: wrong.length === 0 ? 'Every value matches.' : `${wrong.length} of ${keys.length} values do not match.`,
  };
};

/**
 * Mark one stage. Returns `graded: false` whenever this module has no basis for
 * a verdict, so the caller can tell "not checked" from "checked and wrong".
 */

/*
 * FEATURE STAGES: marking a feature on a graph, and stating where it is.
 *
 * Both answer the same shape of question — a set of points, or the claim that
 * there are none — so both grade through here. Three rules:
 *
 *   Order never matters. A quadratic's two x-intercepts are a set; a student
 *   who names them right-to-left has named them.
 *
 *   "None" is an answer, not a blank. Saying an exponential has no x-intercept
 *   is CORRECT, and saying it when there is one is WRONG. Treating either as
 *   unanswered would silently drop the stage from the score.
 *
 *   Partial credit is per point, so finding one of two intercepts is worth
 *   more than finding neither.
 */
export const POINT_INPUT_NONE_TOKEN = '__none__';

const normalizeFeaturePoint = (point) => {
  const x = Array.isArray(point) ? Number(point[0]) : Number(point?.x);
  const y = Array.isArray(point) ? Number(point[1]) : Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

/** Every ordered pair in a typed answer: "(1, 0), (4, 0)" is two points. */
export const parsePointList = (value) => {
  const text = normalizeMathAnswer(value);
  if (!text) return [];
  const groups = text.match(/\(([^()]*)\)/g);
  if (groups && groups.length) {
    return groups.map((group) => parseOrderedPair(group)).filter(Boolean);
  }
  const single = parseOrderedPair(text);
  return single ? [single] : [];
};

/** What the student claimed, from either stage's response shape. */
const readFeatureResponse = (response) => {
  if (isWorkflowArtifact(response, 'featureSelection')) {
    return {
      none: response.none === true,
      points: list(response.selections).map(normalizeFeaturePoint).filter(Boolean),
    };
  }
  if (typeof response === 'string') {
    if (response.trim() === POINT_INPUT_NONE_TOKEN) return { none: true, points: [] };
    return { none: false, points: parsePointList(response) };
  }
  return { none: false, points: [] };
};

const samePoint = (a, b, tolerance) => (
  Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance
);

export const gradeFeaturePoints = (response, rule) => {
  const tolerance = Number.isFinite(Number(rule?.tolerance)) && Number(rule.tolerance) >= 0
    ? Number(rule.tolerance)
    : 0.5;
  const expectedNone = rule?.none === true;
  const expected = list(rule?.points).map(normalizeFeaturePoint).filter(Boolean);
  const claimed = readFeatureResponse(response);

  if (expectedNone) {
    return claimed.none
      ? { graded: true, isCorrect: true, credit: 1, detail: 'Correct — this graph has none.' }
      : { graded: true, isCorrect: false, credit: 0, detail: 'This graph does not have one.' };
  }
  if (!expected.length) {
    return { graded: false, isCorrect: false, credit: 0, detail: 'Reviewed by your teacher.' };
  }
  if (claimed.none) {
    return { graded: true, isCorrect: false, credit: 0, detail: 'This graph does have one.' };
  }

  // Each expected point may be claimed once, so naming the same intercept twice
  // does not score as having found both.
  const used = new Set();
  let matched = 0;
  claimed.points.forEach((point) => {
    const at = expected.findIndex((target, index) => !used.has(index) && samePoint(point, target, tolerance));
    if (at >= 0) { used.add(at); matched += 1; }
  });

  const extra = Math.max(0, claimed.points.length - matched);
  // A student who marks everything must not score for the ones that happen to
  // land right, so wrong marks cancel matches rather than being ignored.
  const net = Math.max(0, matched - extra);
  const isCorrect = matched === expected.length && extra === 0;
  return {
    graded: true,
    isCorrect,
    credit: expected.length ? net / expected.length : 0,
    detail: isCorrect
      ? 'Correct.'
      : (extra
        ? `${matched} of ${expected.length} correct, with ${extra} that ${extra === 1 ? 'is' : 'are'} not there.`
        : `${matched} of ${expected.length} correct.`),
  };
};

export const gradeStage = ({ stage, rule, responses = {} }) => {
  const response = responses[stage.id];
  const answered = hasStageResponse(response);
  const weight = Number.isFinite(Number(stage?.scoreWeight)) && Number(stage.scoreWeight) > 0
    ? Math.min(20, Number(stage.scoreWeight))
    : 1;
  const base = { id: stage.id, label: stage.prompt || stage.kind, isComplete: answered, weight };

  if (rule === undefined || rule === null) {
    return { ...base, graded: false, isCorrect: false, credit: 0, detail: 'Reviewed by your teacher.' };
  }
  if (isObject(rule) && (rule.manual === true || rule.rubric)) {
    return { ...base, graded: false, isCorrect: false, detail: 'Reviewed by your teacher.' };
  }
  if (!answered) {
    return { ...base, graded: true, isCorrect: false, credit: 0, detail: 'Not answered.' };
  }

  // A graph workspace grades itself: it knows which points were asked for and
  // which were placed, and its verdict is finer than anything reconstructable
  // from the response here. `consistentWith` is not required — a plot built
  // from an AUTHORED list of pairs has no upstream stage to be consistent with,
  // but its verdict is just as good.
  if (isObject(rule) && rule.useStageVerdict && !rule.consistentWith && isWorkflowArtifact(response, 'graph')) {
    const credit = Number.isFinite(Number(response.partialCreditPercent))
      ? Math.max(0, Math.min(1, Number(response.partialCreditPercent) / 100))
      : (response.isCorrect === true ? 1 : 0);
    return {
      ...base,
      graded: true,
      isCorrect: response.isCorrect === true,
      credit,
      detail: response.isCorrect ? 'Every point is plotted correctly.' : 'Some points are not where the table puts them.',
    };
  }

  if (isObject(rule) && rule.consistentWith) {
    // A graph built from an upstream table/equation is locally graded by the
    // graph workspace against the STUDENT-DERIVED function and points. Preserve
    // that verdict instead of comparing it with the authored answer key.
    if (rule.useStageVerdict && isWorkflowArtifact(response, 'graph')) {
      const graphCredit = Number.isFinite(Number(response.partialCreditPercent))
        ? Math.max(0, Math.min(1, Number(response.partialCreditPercent) / 100))
        : (response.isCorrect === true ? 1 : 0);
      return {
        ...base,
        graded: true,
        isCorrect: response.isCorrect === true,
        credit: graphCredit,
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
    const matchingRows = check.rows.filter((row) => row.matches === true).length;
    const checkedRows = check.rows.filter((row) => row.matches !== null).length;
    return {
      ...base,
      graded: true,
      isCorrect: check.consistent,
      credit: checkedRows ? matchingRows / checkedRows : 0,
      detail: check.consistent
        ? 'Every value follows the function you wrote.'
        : `${check.mismatches.length} value(s) do not follow the function you wrote.`,
    };
  }

  if (['graphFeatureSelect', 'pointInput'].includes(stage.kind) && isObject(rule)) {
    return { ...base, ...gradeFeaturePoints(response, rule) };
  }
  if (isObject(rule) && Array.isArray(rule.pairs)) return { ...base, ...gradePairs(response, rule.pairs) };
  if (isObject(rule) && Array.isArray(rule.set)) return { ...base, ...gradeSet(response, rule.set) };
  if (isObject(rule) && rule.values) return { ...base, ...gradeTableValues(responsePayload(response), rule.values) };
  if (stage.kind === 'quantityRoles' && isObject(rule)) return { ...base, ...gradeRoles(response, rule) };
  if (stage.kind === 'axisSetup' && isObject(rule)) return { ...base, ...gradeAxes(response, rule) };

  const expected = isObject(rule) ? (rule.anyOf ?? rule.equals) : rule;
  if (expected === undefined) {
    return { ...base, graded: false, isCorrect: false, detail: 'Reviewed by your teacher.' };
  }
  const isCorrect = matchesAnswer(stage, response, expected);
  return { ...base, graded: true, isCorrect, credit: isCorrect ? 1 : 0, detail: isCorrect ? 'Correct.' : 'Not correct yet.' };
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
  const isCorrect = isComplete && graded.length > 0 && correct.length === graded.length;
  const totalWeight = graded.reduce((total, part) => total + (Number(part.weight) || 1), 0);
  const earnedWeight = graded.reduce(
    (total, part) => total + (Math.max(0, Math.min(1, Number(part.credit) || 0)) * (Number(part.weight) || 1)),
    0,
  );
  const weightedPartial = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : null;

  return {
    parts,
    isComplete,
    // Full correctness still requires every graded stage. Partial work may
    // earn substantial credit, but never impersonates a complete correct task.
    isCorrect,
    partialCreditPercent: isCorrect ? 100 : (weightedPartial === null ? null : Math.min(90, weightedPartial)),
    gradedCount: graded.length,
    responseKey: JSON.stringify(responses),
    questionDetails: stages
      .map((stage, index) => `Step ${index + 1} (${stage.kind}): ${JSON.stringify(responses[stage.id] ?? null)}`)
      .join(' | '),
  };
};
