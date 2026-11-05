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
import { canonicalFromEquationText, canonicalFromSlopeIntercept, linesEquivalent } from './toolMath/shared/linearEquations.mjs';
import {
  buildLinearConnectionCards,
  linearConnectionsCardKinds,
  linearConnectionsTask,
  representationSetsFor,
} from './toolMath/representationMatch/representationMath.mjs';
import { gradedContextFields, resolveRequiredCards } from './toolMath/representationBridge/linearMultipleRepresentationsCards.mjs';
import { correctFunctionChoice } from './relationFunctionChoice.mjs';

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

/**
 * The Interval Number Line work a student who solved an intervals.* version
 * would send (serverGrading/declarations/intervalNumberLine.mjs: the pieces
 * the tool built, an unbounded end as ±Infinity, and the notation typed), and
 * the same work with the first finite end's open or closed dot flipped on the
 * graph and in the notation — the mistake the question exists to catch. The
 * notation is written here from the pieces, never copied from the family's
 * own display. Null for an answer that is not a list of intervals.
 */
export const intervalNumberLineKeyWork = (answer = {}) => {
  if (answer.kind !== 'intervals' || !Array.isArray(answer.value) || !answer.value.length) return null;
  const pieces = answer.value.map((entry) => ({
    min: entry?.min === null || entry?.min === undefined ? -Infinity : Number(entry.min),
    max: entry?.max === null || entry?.max === undefined ? Infinity : Number(entry.max),
    minClosed: entry?.minClosed === true,
    maxClosed: entry?.maxClosed === true,
  }));
  if (pieces.some(({ min, max }) => Number.isNaN(min) || Number.isNaN(max))) return null;
  const notation = (list) => list.map(({ min, max, minClosed, maxClosed }) => (
    `${Number.isFinite(min) && minClosed ? '[' : '('}${Number.isFinite(min) ? min : '-∞'}, ${Number.isFinite(max) ? max : '∞'}${Number.isFinite(max) && maxClosed ? ']' : ')'}`
  )).join(' ∪ ');
  const flipped = pieces.map((entry) => ({ ...entry }));
  const target = flipped.find(({ min, max }) => Number.isFinite(min) || Number.isFinite(max));
  if (target) {
    if (Number.isFinite(target.min)) target.minClosed = !target.minClosed;
    else target.maxClosed = !target.maxClosed;
  }
  return {
    right: { intervals: pieces, notation: notation(pieces) },
    wrong: { intervals: flipped, notation: notation(flipped) },
  };
};

const clean = (value) => String(value ?? '').trim();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The Transformations Lab work a student who solved a transformations.*
 * version would send (serverGrading/tools/transformationsLab.mjs): each
 * labeled point's image in plotting order (plotTransform), the parameters
 * typed into their boxes (identify, RC01), or the mapped point (pointMap,
 * RC01) — and the same work with one image, one parameter or one coordinate
 * wrong. Null for any other answer.
 */
export const transformationsLabKeyWork = (answer = {}) => {
  if (answer.kind === 'images' && Array.isArray(answer.value)) {
    const images = answer.value.map(([x, y]) => [x, y]);
    return {
      right: { plottedPoints: images },
      wrong: { plottedPoints: images.map(([x, y], index) => (index === 0 ? [x + 1, y] : [x, y])) },
    };
  }
  if (answer.kind === 'parameters' && isObject(answer.value)) {
    const { a, h, k } = answer.value;
    if (![a, h, k].every(Number.isFinite)) return null;
    // Another a draws another graph (the lab credits any a, h, k that draws the same one).
    const boxes = (values) => ({ a: String(values.a), h: String(values.h), k: String(values.k) });
    return { right: boxes({ a, h, k }), wrong: boxes({ a: a + 1, h, k }) };
  }
  if (answer.kind === 'point' && Array.isArray(answer.value) && answer.value.length === 2) {
    const [x, y] = answer.value.map(Number);
    if (![x, y].every(Number.isFinite)) return null;
    return { right: { mappedX: String(x), mappedY: String(y) }, wrong: { mappedX: String(x), mappedY: String(y + 1) } };
  }
  return null;
};

/**
 * The card sort a student who solved a linear.representationSort version
 * would send (serverGrading/tools/representationMatch.mjs: every card placed
 * in a group), placed by the KEY: each card goes with the one line of the
 * family's answer it describes — an equation by the line it is, the graph by
 * the line it draws, a slope, an intercept, a point or a table by its
 * numbers, a story by the story the answer tells for that line (RC01). The
 * grader marks the placement against the sets the question deals, so a card
 * dealt into the wrong set cannot pass. The wrong sort moves one card into
 * the other group. Null when the answer is not two lines, or a card is not on
 * exactly one of them.
 */
export const representationSortKeyWork = (question = {}, answer = {}) => {
  if (answer.kind !== 'groups' || question?.mode !== 'linearConnections' || linearConnectionsTask(question) !== 'group') return null;
  const lines = [answer.value?.first, answer.value?.second].map((line) => ({
    m: Number(line?.slope),
    b: Number(line?.yIntercept),
    context: line?.context,
  }));
  if (lines.some(({ m, b }) => !Number.isFinite(m) || !Number.isFinite(b) || m === 0)) return null;
  const on = ({ m, b }, point) => Array.isArray(point) && Math.abs(m * Number(point[0]) + b - Number(point[1])) < 1e-9;
  const describes = ({ kind, value }, line) => {
    if (['slopeIntercept', 'standard', 'pointSlope', 'factoredLinear'].includes(kind)) {
      const read = canonicalFromEquationText(String(value));
      return Boolean(read) && linesEquivalent(read, canonicalFromSlopeIntercept(line.m, line.b));
    }
    if (kind === 'graph') {
      const a = Number(value?.a ?? 1);
      return value?.type === 'linear' && a === line.m && Number(value?.k ?? 0) - a * Number(value?.h ?? 0) === line.b;
    }
    if (kind === 'slope') return Number(value) === line.m;
    if (kind === 'xIntercept') return on(line, value) && Number(value[1]) === 0;
    if (kind === 'yIntercept') return on(line, value) && Number(value[0]) === 0;
    if (kind === 'point') return on(line, value);
    if (kind === 'table') return Array.isArray(value) && value.length >= 2 && value.every((row) => on(line, row));
    if (kind === 'context') return typeof line.context === 'string' && clean(line.context) === clean(value);
    return false;
  };
  const cards = buildLinearConnectionCards(representationSetsFor(question), linearConnectionsCardKinds(question));
  const assignments = [];
  for (const card of cards) {
    const slots = lines.map((line, slot) => (describes(card, line) ? slot : null)).filter((slot) => slot !== null);
    if (slots.length !== 1) return null;
    assignments.push({ cardId: card.id, slot: slots[0] });
  }
  if (!assignments.length) return null;
  return {
    right: { assignments },
    wrong: { assignments: assignments.map((entry, index) => (index === 0 ? { ...entry, slot: 1 - entry.slot } : entry)) },
  };
};

const gcdOf = (left, right) => {
  let [a, b] = [Math.abs(left), Math.abs(right)];
  while (b) [a, b] = [b, a % b];
  return a;
};
const fractionOf = (num, den) => {
  const divisor = gcdOf(num, den) || 1;
  const sign = den < 0 ? -1 : 1;
  return { p: (sign * num) / divisor + 0, q: Math.abs(den) / divisor };
};
const fractionText = ({ p, q }) => (q === 1 ? String(p) : `${p}/${q}`);
const fractionLatex = ({ p, q }) => (q === 1 ? String(p) : `${p < 0 ? '-' : ''}\\frac{${Math.abs(p)}}{${q}}`);

/**
 * The Multiple Representations board a student who solved a
 * linear.multipleRepresentations version would send — the board's own fields,
 * typed the way the board takes them (whole numbers, LaTeX for a fractional
 * slope, ordered pairs, graph points) — built from the KEY: the family's
 * slope, intercepts and standard form, and, on a board whose meanings the
 * family writes, each meaning's answer (RC01). Exactly the cards and meanings
 * the question asks for. The wrong board has its slope (or its y-intercept)
 * wrong. Null for a Process Mode board (its facts need their own process), a
 * card the key alone cannot answer, or a meaning the key does not name.
 */
export const linearBoardKeyWork = (question = {}, answer = {}) => {
  if (answer.kind !== 'line' || question?.mode !== 'linearMultipleRepresentations') return null;
  if (clean(question?.interactionMode) === 'process') return null;
  const value = answer.value || {};
  const slope = /^(-?\d+)(?:\/(\d+))?$/.exec(clean(value.slope));
  const b = Number(value.yIntercept?.[1]);
  const { A, B, C } = isObject(value.standard) ? value.standard : {};
  if (!slope || ![b, A, B, C].every(Number.isInteger)) return null;
  const m = fractionOf(Number(slope[1]), Number(slope[2] || 1));
  if (!m.p || !m.q) return null;
  const zero = fractionOf(-b * m.q, m.p);
  if (Math.abs(zero.p / zero.q - Number(value.xIntercept?.[0])) > 1e-9) return null;
  const required = new Set(resolveRequiredCards(question));
  const signed = (number) => (number === 0 ? '' : ` ${number < 0 ? '-' : '+'} ${Math.abs(number)}`);
  const slopeTerm = m.q === 1 && Math.abs(m.p) === 1 ? (m.p < 0 ? '-x' : 'x') : `${fractionLatex(m)}x`;
  const work = {};
  if (required.has('standardForm')) {
    work.standardFormEquation = `${A === 1 ? '' : A}x ${B < 0 ? '-' : '+'} ${Math.abs(B) === 1 ? '' : Math.abs(B)}y = ${C}`;
  }
  if (required.has('slopeIntercept')) work.slopeInterceptEquation = `y = ${slopeTerm}${signed(b)}`;
  // Point-slope form through the y-intercept, and the slope step from it.
  if (required.has('pointSlope')) work.pointSlopeEquation = `y${signed(-b) || ' - 0'} = ${fractionLatex(m)}\\left(x - 0\\right)`;
  if (required.has('slope')) work.featureSlope = fractionText(m);
  if (required.has('xIntercept')) work.featureXIntercept = `(${fractionText(zero)}, 0)`;
  if (required.has('yIntercept')) work.featureYIntercept = `(0, ${b})`;
  if (required.has('twoPoints')) {
    work.featurePoint1 = `(0, ${b})`;
    work.featurePoint2 = `(${m.q}, ${b + m.p})`;
  }
  if (required.has('table')) work.tableRows = [0, 1, 2, 3].map((k) => ({ x: String(k * m.q), y: String(b + k * m.p) }));
  if (required.has('graphIntercepts')) work.graph1Points = [[zero.p / zero.q, 0], [0, b]];
  if (required.has('graphSlopeIntercept')) work.graph2Points = [[0, b], [m.q, b + m.p]];
  if (required.has('graphPointSlope')) {
    // Graph 3 starts from the GIVEN's own point when the GIVEN is point-slope form.
    if (clean(question?.source?.kind) === 'pointSlope') return null;
    work.graph3Points = [[0, b], [m.q, b + m.p]];
  }
  const meanings = isObject(value.meanings) ? value.meanings : {};
  for (const { field, key } of gradedContextFields(question)) {
    if (typeof meanings[key] !== 'string') return null;
    work[field] = meanings[key];
  }
  if (!Object.keys(work).length) return null;
  const wrong = { ...work };
  if ('featureSlope' in wrong) wrong.featureSlope = fractionText({ p: m.p + 7 * m.q, q: m.q });
  else if ('featureYIntercept' in wrong) wrong.featureYIntercept = `(0, ${b + 7})`;
  else if ('slopeInterceptEquation' in wrong) wrong.slopeInterceptEquation = `y = ${m.p + 7 * m.q}x${signed(b)}`;
  else return null;
  return { right: work, wrong };
};

/**
 * The Mapping Diagram work a student who solved a relations.* version would
 * send (serverGrading/tools/relationMapping.mjs): an arrow for every pair of
 * the key, its domain and range typed as lists, and — where the question asks
 * — the function choice the definition gives (RC01). The wrong work chooses
 * the other verdict, or, where none is asked, leaves an output out of the
 * range. Null for any other answer.
 */
export const relationMappingKeyWork = (question = {}, answer = {}) => {
  if (answer.kind !== 'relation' || !isObject(answer.value)) return null;
  const { pairs, domain, range, isFunction } = answer.value;
  if (![pairs, domain, range].every((entry) => Array.isArray(entry) && entry.length) || typeof isFunction !== 'boolean') return null;
  const ask = Array.isArray(question.ask) ? question.ask : ['mapping', 'domain', 'range'];
  const right = {
    plottedPoints: [],
    arrows: pairs.map(([x, y]) => [x, y]),
    domainText: domain.join(', '),
    rangeText: range.join(', '),
    domain: [...domain],
    range: [...range],
    isFunction: ask.includes('isFunction') ? correctFunctionChoice(isFunction) : '',
    fields: [],
  };
  const wrong = ask.includes('isFunction')
    ? { ...right, isFunction: correctFunctionChoice(!isFunction) }
    : { ...right, rangeText: range.slice(0, -1).join(', '), range: range.slice(0, -1) };
  return { right, wrong };
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
  // The Transformations Lab (transformations.*): the work the lab's Check sends.
  const labWork = question.type === 'transformationsLab' ? transformationsLabKeyWork(answer) : null;
  if (labWork) {
    return {
      right: buildToolResponse({ question, toolId: 'transformationsLab', work: labWork.right }),
      wrong: buildToolResponse({ question, toolId: 'transformationsLab', work: labWork.wrong }),
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
  // Interval Number Line (intervals.*, RC01): the graph and the notation.
  const intervalWork = question.type === 'intervalNumberLine' ? intervalNumberLineKeyWork(answer) : null;
  if (intervalWork) {
    return {
      right: buildToolResponse({ question, toolId: 'intervalNumberLine', work: intervalWork.right }),
      wrong: buildToolResponse({ question, toolId: 'intervalNumberLine', work: intervalWork.wrong }),
    };
  }
  // The two-line card sort (linear.representationSort, RC01): every card in its line's group.
  const sortWork = question.type === 'representationMatch' ? representationSortKeyWork(question, answer) : null;
  if (sortWork) {
    return {
      right: buildToolResponse({ question, toolId: 'representationMatch', work: sortWork.right }),
      wrong: buildToolResponse({ question, toolId: 'representationMatch', work: sortWork.wrong }),
    };
  }
  // The Mapping Diagram (relations.mappingDiagram, RC01).
  const relationWork = question.type === 'relationMapping' ? relationMappingKeyWork(question, answer) : null;
  if (relationWork) {
    return {
      right: buildToolResponse({ question, toolId: 'relationMapping', work: relationWork.right }),
      wrong: buildToolResponse({ question, toolId: 'relationMapping', work: relationWork.wrong }),
    };
  }
  // The Multiple Representations board (linear.multipleRepresentations, RC01).
  const boardWork = question.type === 'representationBridge' ? linearBoardKeyWork(question, answer) : null;
  if (boardWork) {
    return {
      right: buildToolResponse({ question, toolId: 'representationBridge', work: boardWork.right }),
      wrong: buildToolResponse({ question, toolId: 'representationBridge', work: boardWork.wrong }),
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
